'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../lib/getCurrentTeamOwner';

// IN-SEASON FREE AGENCY -- the owner side and the commissioner's resolve.
//
// A LEAGUE SURFACE. Every logged-in owner can open a window and offer into one. The only
// officer-gated calls are previewWindow and resolveWindow, matching FA-8.
//
// SEALED, AND THE DATABASE IS THE GATE. During a window nobody sees any offer's terms or
// who made them -- including the commissioner (FA-3, SR-31). That is enforced by RLS on
// free_agent_offers, not by anything here, so an owner reading the table directly through
// PostgREST sees exactly what this page shows them and nothing more.
//
// createSupabaseServerClient, never adminClient: every submit_fa_offer / resolve_fa_window
// call resolves the caller through auth.uid(), so a service-role client would be refused
// no matter who is signed in. Same reasoning as /admin/sleeper-sync.
//
// Every function returns { ok, ... } and never throws.

function refusal() {
  return { ok: false, message: 'Sign in as a team owner to use free agency.' };
}

export async function loadFreeAgencyState() {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .single();
  const season = config?.current_season_year || 2026;

  // Filtered by season: ten teams cannot generate a thousand windows, but SR-29 says
  // filter every select and a stale season's windows are not this page's business.
  const { data: board, error: boardErr } = await supabase
    .from('free_agent_window_board')
    .select(
      'window_id, player_id, player_name, position, season_year, opened_at,' +
        ' closes_at, status, opened_by, is_contested'
    )
    .eq('season_year', season)
    .in('status', ['open', 'closed'])
    .order('closes_at', { ascending: true });
  if (boardErr) return { ok: false, message: boardErr.message };

  // RLS shows an owner only their own team's offers while a window is live.
  const { data: mine, error: mineErr } = await supabase
    .from('free_agent_offers')
    .select('id, window_id, player_id, offer_kind, total_years, signing_bonus_total, status, submitted_at')
    .eq('team_id', me.team_id)
    .order('submitted_at', { ascending: false })
    .limit(200);
  if (mineErr) return { ok: false, message: mineErr.message };

  // 5.14(b), the 2026 first-offer exemption. Until this instant, an offer on a player who
  // has never held an EDFL contract wins him outright instead of opening an eight-hour
  // window. Read from the calendar, never hardcoded -- the same row submit_fa_offer reads,
  // so moving the date moves both.
  const { data: exemptRow } = await supabase
    .from('league_calendar_events')
    .select('starts_at')
    .eq('season_year', season)
    .eq('rule_ref', '5.14(b)')
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    data: {
      season: season,
      board: board || [],
      myOffers: mine || [],
      firstOfferUntil: exemptRow?.starts_at || null,
      teamId: me.team_id,
      canResolve: isCommissionerOrCo(me),
    },
  };
}

// Players nobody holds an EDFL contract on. The database re-checks eligibility on submit
// through edfl_free_agent_eligible(), which also excludes anyone released in-season who
// has not cleared waivers -- this search is a convenience, not the gate.
export async function searchFreeAgents(query) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const text = (query || '').trim();
  if (text.length < 2) return { ok: true, data: [] };

  const supabase = await createSupabaseServerClient();

  // Deliberately unfiltered on status, which is the one place SR-29 does not apply: the
  // question 5.14(b) asks is whether the player has EVER held an EDFL contract, so a
  // status filter would answer a different question. Two sets come out of the one read --
  // who is rostered now, and who has a history.
  const { data: rostered, error: rErr } = await supabase
    .from('contracts')
    .select('player_id, status')
    .limit(5000);
  if (rErr) return { ok: false, message: rErr.message };

  const taken = new Set(
    (rostered || []).filter(function (r) { return r.status === 'active'; })
      .map(function (r) { return r.player_id; })
  );
  const everContracted = new Set((rostered || []).map(function (r) { return r.player_id; }));

  const { data, error } = await supabase
    .from('players')
    .select('id, full_name, position, nfl_team')
    .ilike('full_name', '%' + text + '%')
    .order('full_name')
    .limit(40);
  if (error) return { ok: false, message: error.message };

  // hasPriorContract drives a label only. edfl_fa_first_offer_exempt() in the database is
  // what actually decides, and it decides again on submit -- so a label that ever drifted
  // could mislead an owner for one click, never award or withhold a player.
  const free = (data || [])
    .filter(function (p) { return !taken.has(p.id); })
    .slice(0, 12)
    .map(function (p) {
      return {
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        nfl_team: p.nfl_team,
        hasPriorContract: everContracted.has(p.id),
      };
    });
  return { ok: true, data: free };
}

export async function submitOffer(input) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('submit_fa_offer', {
    p_player_id: input.playerId,
    p_offer_kind: input.offerKind,
    p_total_years: input.totalYears,
    p_void_years: input.voidYears || 0,
    p_signing_bonus_total: input.signingBonusTotal,
    p_years: input.years,
    // Its own array, not a key inside a contract year. The database defaults it to [] so
    // an older client that omits it still works.
    p_option_bonuses: input.optionBonuses || [],
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/free-agency');
  return { ok: true, data: data };
}

export async function withdrawOffer(offerId) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('withdraw_fa_offer', { p_offer_id: offerId });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/free-agency');
  return { ok: true, data: data };
}

// FA-8. Read-only: shows the full ranking and the reason each offer fails, and creates
// nothing. Officer-gated in the database too.
export async function previewWindow(windowId) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('preview_fa_window', { p_window_id: windowId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data };
}

export async function resolveWindow(windowId) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('resolve_fa_window', { p_window_id: windowId });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/free-agency');
  revalidatePath('/transactions');
  revalidatePath('/cap-sheet');
  return { ok: true, data: data };
}
