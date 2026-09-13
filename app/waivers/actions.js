'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// THE WAIVER WIRE -- the owner side.
//
// A LEAGUE SURFACE. Every logged-in owner can claim off the wire, order their own claims
// and withdraw them. Nothing here is officer-gated; the run itself is scheduled work, not
// a button.
//
// SEALED, AND THE DATABASE IS THE GATE. Until a run is executed, an owner sees only their
// own claims on it -- nobody knows who else is in on a player. That is enforced by RLS on
// waiver_claims, not by anything here, so an owner reading the table directly through
// PostgREST sees exactly what this page shows them and nothing more. Once the run has
// executed, every claim on it is readable and the last-run panel below names every team.
//
// createSupabaseServerClient, never adminClient: every submit_waiver_claim /
// withdraw_waiver_claim / reorder_waiver_claims / withdraw_pending_cut call resolves the
// caller through auth.uid(), so a service-role client would be refused no matter who is
// signed in -- and the sealed read above depends on the same identity. Same reasoning as
// /free-agency and /admin/sleeper-sync.
//
// NOTHING HERE DECIDES A RULE. The page never computes cap room, never checks a roster
// count, never validates a claim. Each RPC raises a plain-English message on refusal and
// that message is what the owner reads, verbatim.
//
// Every function returns { ok, ... } and never throws for a database refusal. Next.js
// masks every error thrown out of a Server Action in a production build, replacing the
// real message with a generic "an error occurred in the Server Components render" string
// -- so a thrown refusal would reach the owner as noise. Returned VALUES are not masked.
// The caller checks .ok; .catch is reserved for genuine transport failures.

function refusal() {
  return { ok: false, message: 'Sign in as a team owner to use the waiver wire.' };
}

// Both surfaces that draw waiver state: the wire itself, and the designated-cuts block on
// the owner's own team page.
function revalidateWaivers() {
  revalidatePath('/waivers');
  revalidatePath('/team/[teamId]', 'page');
}

// Players by id, chunked at 100 so the request URL stays short. Bounded by construction:
// a week's wire is a handful of rows, never a thousand. Never a bare select on players --
// CLAUDE.md forbids reading that whole table on a user-facing surface.
async function fetchPlayersById(supabase, playerIds) {
  const byId = new Map();
  const size = 100;
  for (let i = 0; i < playerIds.length; i += size) {
    const chunk = playerIds.slice(i, i + size);
    const { data, error } = await supabase
      .from('players')
      .select('id, full_name, position, nfl_team')
      .in('id', chunk);
    if (error) return { ok: false, message: error.message };
    (data || []).forEach(function (p) { byId.set(p.id, p); });
  }
  return { ok: true, byId: byId };
}

// Every team, keyed by id. Ten rows. Read here rather than embedded through a foreign
// key: waiver_placements carries two team columns (waived_by and awarded_to) and naming
// the right constraint for each embed is a schema guess this file does not need to make.
async function fetchTeams(supabase) {
  const { data, error } = await supabase.from('teams').select('id, name');
  if (error) return { ok: false, message: error.message };
  const byId = new Map();
  (data || []).forEach(function (t) { byId.set(t.id, t.name); });
  return { ok: true, byId: byId };
}

// The player behind a contract id, for a claim's conditional cut. The contracts ->
// players embed is the one the team page already relies on.
async function fetchContractPlayers(supabase, contractIds) {
  const byId = new Map();
  if (contractIds.length === 0) return { ok: true, byId: byId };
  const { data, error } = await supabase
    .from('contracts')
    .select('id, players(id, full_name, position)')
    .in('id', contractIds);
  if (error) return { ok: false, message: error.message };
  (data || []).forEach(function (c) { byId.set(c.id, c.players || null); });
  return { ok: true, byId: byId };
}

function unique(list) {
  const seen = new Set();
  const out = [];
  list.forEach(function (v) {
    if (v === null || v === undefined || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  });
  return out;
}

function playerFields(p) {
  return {
    player_name: p ? p.full_name : 'Unknown Player',
    position: p ? p.position : null,
    nfl_team: p ? p.nfl_team : null,
  };
}

// Everything the page draws, in one read, for a signed-in owner OR a signed-out reader.
// A signed-out reader gets the wire and the last run; the claim-side reads are simply
// skipped for them rather than attempted and refused.
export async function loadWaiverState() {
  const me = await getCurrentTeamOwner();
  const supabase = await createSupabaseServerClient();

  // The database decides whether the wire exists yet. A failed call is an error, not a
  // closed wire -- "not open" must never be the rendering of a read that did not happen.
  const { data: live, error: liveErr } = await supabase.rpc('edfl_wire_live');
  if (liveErr) return { ok: false, message: liveErr.message };
  if (live !== true) {
    return { ok: true, data: { live: false, signedIn: Boolean(me) } };
  }

  // The next run: the earliest still-scheduled one. The last run: the most recent
  // executed one. Both maybeSingle -- a season with no run yet in either state is a
  // legitimate page, not an exception.
  const { data: nextRun, error: nextErr } = await supabase
    .from('waiver_runs')
    .select('id, season_year, week_number, runs_at, status')
    .eq('status', 'scheduled')
    .order('runs_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextErr) return { ok: false, message: nextErr.message };

  const { data: lastRun, error: lastErr } = await supabase
    .from('waiver_runs')
    .select('id, season_year, week_number, runs_at, status, executed_at')
    .eq('status', 'executed')
    .order('runs_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) return { ok: false, message: lastErr.message };

  // THE WIRE: what is still pending on the next run, oldest waiver first. Filtered by
  // run, so the 1,000-row PostgREST ceiling cannot bite: ten teams cannot waive a
  // thousand players in one week.
  let wireRows = [];
  if (nextRun) {
    const { data, error } = await supabase
      .from('waiver_placements')
      .select('id, contract_id, player_id, waived_by_team_id, waived_at, run_id, outcome')
      .eq('run_id', nextRun.id)
      .eq('outcome', 'pending')
      .order('waived_at', { ascending: true });
    if (error) return { ok: false, message: error.message };
    wireRows = data || [];
  }

  // THE LAST RUN: every placement on it, whatever happened to it.
  let lastRows = [];
  if (lastRun) {
    const { data, error } = await supabase
      .from('waiver_placements')
      .select(
        'id, contract_id, player_id, waived_by_team_id, waived_at, run_id, outcome,' +
          ' awarded_to_team_id, resolved_at'
      )
      .eq('run_id', lastRun.id)
      .order('waived_at', { ascending: true });
    if (error) return { ok: false, message: error.message };
    lastRows = data || [];
  }

  // MY CLAIMS on the next run. RLS shows an owner only their own rows while the run is
  // scheduled; the team filter here is the same fact stated on this side, not a second
  // gate. Ordered by team_rank because that order IS the claim priority the owner set.
  let myClaims = [];
  if (me && nextRun) {
    const { data, error } = await supabase
      .from('waiver_claims')
      .select('id, run_id, placement_id, team_id, team_rank, conditional_cut_contract_id, status, submitted_at')
      .eq('run_id', nextRun.id)
      .eq('team_id', me.team_id)
      .eq('status', 'pending')
      .order('team_rank', { ascending: true });
    if (error) return { ok: false, message: error.message };
    myClaims = data || [];
  }

  // EVERY TEAM'S CLAIMS on the last run -- readable once it has executed. This read is
  // captured rather than failing the page: the placements are the panel's content and
  // are already in hand, so a refused claims read renders as a named notice under that
  // panel instead of taking the whole page down with it.
  let lastClaims = [];
  let lastClaimsError = null;
  if (lastRun) {
    const { data, error } = await supabase
      .from('waiver_claims')
      .select('id, run_id, placement_id, team_id, team_rank, conditional_cut_contract_id, status, submitted_at')
      .eq('run_id', lastRun.id)
      .order('submitted_at', { ascending: true });
    if (error) lastClaimsError = error.message;
    else lastClaims = data || [];
  }

  // The owner's own active roster, for the "cut this player if I win" select. A list of
  // OPTIONS only -- whether the chosen cut is legal, or needed, is submit_waiver_claim's
  // question and it answers it on submit.
  let roster = [];
  if (me) {
    const { data, error } = await supabase
      .from('contracts')
      .select('id, players(id, full_name, position)')
      .eq('team_id', me.team_id)
      .eq('status', 'active')
      .eq('roster_status', 'active');
    if (error) return { ok: false, message: error.message };
    roster = (data || [])
      .map(function (c) {
        return {
          id: c.id,
          name: c.players ? c.players.full_name : 'Unknown Player',
          position: c.players ? c.players.position : null,
        };
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  // Lookups: players and teams for every placement drawn, and the player behind every
  // conditional cut named on a claim.
  const playerIds = unique(
    wireRows.map(function (r) { return r.player_id; })
      .concat(lastRows.map(function (r) { return r.player_id; }))
  );
  const players = await fetchPlayersById(supabase, playerIds);
  if (!players.ok) return players;

  const teams = await fetchTeams(supabase);
  if (!teams.ok) return teams;

  const cutIds = unique(
    myClaims.map(function (c) { return c.conditional_cut_contract_id; })
      .concat(lastClaims.map(function (c) { return c.conditional_cut_contract_id; }))
  );
  const cutPlayers = await fetchContractPlayers(supabase, cutIds);
  if (!cutPlayers.ok) return cutPlayers;

  function teamName(id) {
    if (!id) return null;
    return teams.byId.has(id) ? teams.byId.get(id) : 'Unknown';
  }
  function cutName(contractId) {
    if (!contractId) return null;
    const p = cutPlayers.byId.get(contractId);
    return p ? p.full_name : 'Unknown Player';
  }

  const wire = wireRows.map(function (r) {
    return Object.assign(
      {
        placement_id: r.id,
        player_id: r.player_id,
        waived_by: teamName(r.waived_by_team_id),
        waived_at: r.waived_at,
      },
      playerFields(players.byId.get(r.player_id))
    );
  });

  const wireById = new Map();
  wire.forEach(function (w) { wireById.set(w.placement_id, w); });

  const mine = myClaims.map(function (c) {
    const w = wireById.get(c.placement_id);
    return {
      id: c.id,
      placement_id: c.placement_id,
      team_rank: c.team_rank,
      player_id: w ? w.player_id : null,
      player_name: w ? w.player_name : 'Unknown Player',
      position: w ? w.position : null,
      cut_contract_id: c.conditional_cut_contract_id,
      cut_player_name: cutName(c.conditional_cut_contract_id),
    };
  });

  const claimsByPlacement = new Map();
  lastClaims.forEach(function (c) {
    const list = claimsByPlacement.get(c.placement_id) || [];
    list.push({
      id: c.id,
      team_name: teamName(c.team_id),
      status: c.status,
      cut_player_name: cutName(c.conditional_cut_contract_id),
    });
    claimsByPlacement.set(c.placement_id, list);
  });

  const last = lastRun
    ? {
        id: lastRun.id,
        week_number: lastRun.week_number,
        runs_at: lastRun.runs_at,
        executed_at: lastRun.executed_at,
        claimsError: lastClaimsError,
        placements: lastRows.map(function (r) {
          return Object.assign(
            {
              placement_id: r.id,
              player_id: r.player_id,
              waived_by: teamName(r.waived_by_team_id),
              waived_at: r.waived_at,
              outcome: r.outcome,
              awarded_to: teamName(r.awarded_to_team_id),
              claims: claimsByPlacement.get(r.id) || [],
            },
            playerFields(players.byId.get(r.player_id))
          );
        }),
      }
    : null;

  return {
    ok: true,
    data: {
      live: true,
      signedIn: Boolean(me),
      teamId: me ? me.team_id : null,
      nextRun: nextRun
        ? { id: nextRun.id, week_number: nextRun.week_number, runs_at: nextRun.runs_at }
        : null,
      wire: wire,
      myClaims: mine,
      roster: roster,
      lastRun: last,
    },
  };
}

// Upserts: re-submitting the same player updates the rank and the conditional cut. Rank
// is always null from this form -- a new claim lands at the bottom and the owner orders
// it from the My Claims list.
export async function submitClaim(placementId, conditionalCutContractId) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('submit_waiver_claim', {
    p_placement_id: placementId,
    p_team_rank: null,
    p_conditional_cut_contract_id: conditionalCutContractId || null,
  });
  if (error) return { ok: false, message: error.message };

  revalidateWaivers();
  return { ok: true, data: data };
}

export async function withdrawClaim(claimId) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('withdraw_waiver_claim', { p_claim_id: claimId });
  if (error) return { ok: false, message: error.message };

  revalidateWaivers();
  return { ok: true, data: data };
}

// The array order becomes team_rank 1..n. The client always sends the FULL ordered list of
// its pending claims on the run, never a partial one.
export async function reorderClaims(runId, claimIds) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('reorder_waiver_claims', {
    p_run_id: runId,
    p_claim_ids: claimIds || [],
  });
  if (error) return { ok: false, message: error.message };

  revalidateWaivers();
  return { ok: true, data: data };
}

// An end-of-week cut the owner designated and has not yet fired. Withdrawing it keeps the
// player; the database decides whether it is still withdrawable.
export async function withdrawPendingCut(pendingCutId) {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('withdraw_pending_cut', {
    p_pending_cut_id: pendingCutId,
  });
  if (error) return { ok: false, message: error.message };

  revalidateWaivers();
  return { ok: true, data: data };
}
