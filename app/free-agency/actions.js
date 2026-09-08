'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../lib/getCurrentTeamOwner';
import { FREE_AGENT_POOL, POOL_SEASON } from '../../lib/freeAgentPool';

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

// Every contract row, paged until exhausted, folded into two sets: who holds an ACTIVE
// contract now, and who has EVER held one. Both consumers need the second set because
// 5.14(b) asks whether a player has ever been under contract, so a status filter on the
// query would answer a different question -- this is the one read where SR-29's
// filter-every-select does not apply.
//
// PAGE-UNTIL-EXHAUSTED, NOT A LIMIT. This read decides who is TAKEN: a truncated answer
// shows a rostered player as a free agent, silently. It was .limit(5000) until Sep 8 2026,
// which CLAUDE.md names as neither row-ceiling pattern -- it only relocates the invisible
// 1,000-row ceiling. Ordered on the primary key so pages are stable and unique.
async function fetchContractIndex(supabase) {
  const pageSize = 1000;
  let from = 0;
  const taken = new Set();
  const everContracted = new Set();
  for (;;) {
    const { data, error } = await supabase
      .from('contracts')
      .select('id, player_id, status')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) return { ok: false, message: error.message };
    (data || []).forEach(function (r) {
      everContracted.add(r.player_id);
      if (r.status === 'active') taken.add(r.player_id);
    });
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { ok: true, taken: taken, everContracted: everContracted };
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

  // THE RANKED POOL, JOINED LIVE. lib/freeAgentPool.js carries only the slow-moving facts
  // -- rank, chart tier, 2025 production. Who is still available is decided here, now,
  // against the contract index, so a player signed since the list was generated is gone
  // on the next render; and whether the first valid offer wins him is derived from the
  // same read the search uses. Neither is ever rendered from the file. The pool is empty
  // for any season it was not built for, so the March rollover cannot show last year's
  // board under this year's heading.
  //
  // This is a convenience, not the gate: submit_fa_offer re-checks eligibility through
  // edfl_free_agent_eligible() on every offer, exactly as it does for the search below.
  const index = await fetchContractIndex(supabase);
  if (!index.ok) return index;

  const pool = season === POOL_SEASON
    ? FREE_AGENT_POOL
      .filter(function (p) { return !index.taken.has(p.player_id); })
      .map(function (p) {
        return Object.assign({}, p, {
          hasPriorContract: index.everContracted.has(p.player_id),
        });
      })
    : [];

  return {
    ok: true,
    data: {
      season: season,
      board: board || [],
      myOffers: mine || [],
      firstOfferUntil: exemptRow?.starts_at || null,
      teamId: me.team_id,
      canResolve: isCommissionerOrCo(me),
      pool: pool,
      poolTotal: FREE_AGENT_POOL.length,
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

  const index = await fetchContractIndex(supabase);
  if (!index.ok) return index;

  // sleeper_player_id MUST be non-null, and this filter is load-bearing. Player identity
  // is split across two rows for 62 skill-position players (found building the Sep 8
  // 2026 pool): the Sleeper sync writes the row the contract hangs off, and the stats
  // loader writes a second row under a suffixed name with no Sleeper id and no contract.
  // Without this filter the second row passes the taken test, and "Marvin Harrison Jr."
  // is offered as a free agent while Marvin Harrison is under contract. A player the app
  // cannot sync to Sleeper could not be signed anyway. The real fix is a gsis_id-keyed
  // identity merge, which is a migration and lives chat-side.
  const { data, error } = await supabase
    .from('players')
    .select('id, full_name, position, nfl_team')
    .not('sleeper_player_id', 'is', null)
    .ilike('full_name', '%' + text + '%')
    .order('full_name')
    .limit(40);
  if (error) return { ok: false, message: error.message };

  // hasPriorContract drives a label only. edfl_fa_first_offer_exempt() in the database is
  // what actually decides, and it decides again on submit -- so a label that ever drifted
  // could mislead an owner for one click, never award or withhold a player.
  const free = (data || [])
    .filter(function (p) { return !index.taken.has(p.id); })
    .slice(0, 12)
    .map(function (p) {
      return {
        id: p.id,
        full_name: p.full_name,
        position: p.position,
        nfl_team: p.nfl_team,
        hasPriorContract: index.everContracted.has(p.id),
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
