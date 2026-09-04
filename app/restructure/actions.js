'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { formatDateTime } from '../../lib/formatDate';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../lib/getCurrentTeamOwner';
import { RESTRUCTURE_ENABLED, RESTRUCTURE_DISABLED_MESSAGE } from '../../lib/featureFlags';

// CONTRACT RESTRUCTURE. Converts unpaid current-season salary into a NEW
// signing bonus with its own proration window, leaving the original signing
// bonus alone.
//
// OPEN TO EVERY OWNER ON THEIR OWN ROSTER (rule change, September 4, 2026).
// Commissioner and co-commissioner may act for any team, exactly as
// cut_player already works. There is deliberately NO commissioner check in
// this file: the database is the gate, and it distinguishes "not your roster"
// from "not eligible" with different messages that an owner needs to be able
// to tell apart. Adding an app-layer commissioner check back would collapse
// both into one refusal and lock out the people the rule change is for.
//
// These actions moved here from app/admin/new-contract/actions.js when the
// feature stopped being commissioner-only. That page keeps its commissioner
// gate; new contracts are still commissioner-only.
//
// NOTHING BELOW COMPUTES MONEY. Every figure the form shows comes back from
// max_restructure() or compute_restructure_charges(). There is deliberately no
// JS mirror of the cap-saving formula, the Deion Rule, the minimum salary or
// the PPV test -- the database owns all four and a client copy would drift.
//
// THE SESSION CLIENT, NEVER adminClient(). The restructure functions gate
// themselves on auth.uid(). Through the service-role client auth.uid() is
// NULL, and now that ordinary owners call these directly every single call
// would fail with "No owner record is linked to this login."
//
// All four RETURN their refusals rather than throwing.

// THE KILL SWITCH IS CHECKED HERE, NOT ONLY ON THE PAGE. Every action below
// starts with this. A Server Action is a callable endpoint regardless of what
// the page renders, so hiding the link and bouncing the route would still
// leave a live path to restructure_contract() -- which knows nothing about the
// flag and would run happily. This is the check that actually switches the
// feature off; the page and the home-page link are presentation.
function disabledRefusal() {
  return { ok: false, message: RESTRUCTURE_DISABLED_MESSAGE };
}

const RESTRUCTURE_CONCURRENCY = 10;

// Bounded parallelism. can_restructure() is one round trip per contract. For
// an ordinary owner that is ~23; for the commissioner it is every active
// contract in the league. Firing them all at once buries PostgREST and firing
// them serially takes a minute.
async function mapWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function runner() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  const runners = [];
  const width = Math.min(limit, items.length);
  for (let i = 0; i < width; i += 1) runners.push(runner());
  await Promise.all(runners);
  return out;
}

/**
 * Everything the picker needs, in one call.
 *
 * SCOPED TO THE VIEWER. An ordinary owner is shown only their own team's
 * active contracts -- not other teams' greyed out, but absent. There is
 * nothing they can do with another roster's players, and rendering them
 * invites the question of why they are refused. The commissioner and
 * co-commissioner see every team and keep the team filter.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function loadRestructureRoster() {
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to restructure.' };
  }
  const seesAllTeams = isCommissionerOrCo(me);

  const supabase = await createSupabaseServerClient();

  const { data: config, error: configError } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .single();
  if (configError) {
    return { ok: false, message: 'Could not read the league season: ' + configError.message };
  }
  const seasonYear = Number(config.current_season_year);

  let contractQuery = supabase
    .from('contracts')
    .select('id, team_id, contract_type, start_year, total_years, players(id, full_name, position)')
    .eq('status', 'active');
  if (!seesAllTeams) {
    contractQuery = contractQuery.eq('team_id', me.team_id);
  }

  const { data: contracts, error: contractsError } = await contractQuery;
  if (contractsError) {
    return { ok: false, message: 'Could not load contracts: ' + contractsError.message };
  }

  const rows = contracts || [];
  const ids = rows.map(function (c) { return c.id; });

  const [{ data: teams }, { data: capYears }, { data: capSummary }, { data: calendar }] =
    await Promise.all([
      supabase.from('teams').select('id, name').order('name'),
      // Filtered to the current season AND to these contracts: the view is one
      // row per contract per season and would otherwise run past the 1,000-row
      // ceiling without saying so.
      ids.length > 0
        ? supabase
            .from('contract_year_computed')
            .select('contract_id, cap_charge')
            .eq('league_season_year', seasonYear)
            .in('contract_id', ids)
        : Promise.resolve({ data: [] }),
      supabase
        .from('team_cap_summary')
        .select('team_id, fantasy_salary_cap, cap_used, cap_space_remaining')
        .eq('league_season_year', seasonYear),
      // Keyed on rule_ref, never on the event title -- titles get edited.
      // 5.5(f) is the in-season cap hard block.
      supabase
        .from('league_calendar_events')
        .select('starts_at, rule_ref')
        .eq('season_year', seasonYear)
        .like('rule_ref', '5.5(f)%')
        .order('starts_at'),
    ]);

  const capByContract = {};
  (capYears || []).forEach(function (r) { capByContract[r.contract_id] = r.cap_charge; });

  const teamNames = {};
  (teams || []).forEach(function (t) { teamNames[t.id] = t.name; });

  const capByTeam = {};
  (capSummary || []).forEach(function (r) { capByTeam[r.team_id] = r; });

  // ONE CALL RETURNS BOTH ANSWERS. can_restructure() separates a permission
  // refusal from an eligibility refusal, and the difference drives the UI:
  // a permission refusal means the row should not be offered at all, while an
  // eligibility refusal is informative and is shown with its reason. It
  // replaces the older restructure_ineligible_reason call, which still exists.
  const verdicts = await mapWithConcurrency(ids, RESTRUCTURE_CONCURRENCY, async function (id) {
    const { data, error } = await supabase.rpc('can_restructure', { p_contract_id: id });
    if (error) {
      return {
        permission_denied: null,
        ineligible_reason: 'Eligibility could not be checked: ' + error.message,
        allowed: false,
      };
    }
    return data || { permission_denied: null, ineligible_reason: null, allowed: false };
  });

  const verdictById = {};
  ids.forEach(function (id, i) { verdictById[id] = verdicts[i]; });

  const players = [];
  rows.forEach(function (c) {
    const v = verdictById[c.id] || {};
    // A permission refusal removes the row entirely rather than greying it.
    // Greying it would answer a question the owner never asked and imply the
    // player is theirs to act on if only some condition changed.
    if (v.permission_denied) return;
    players.push({
      contractId: c.id,
      playerId: c.players ? c.players.id : null,
      name: (c.players && c.players.full_name) || 'Unknown player',
      position: (c.players && c.players.position) || '',
      teamId: c.team_id,
      teamName: teamNames[c.team_id] || 'Unknown team',
      contractType: c.contract_type,
      capCharge: capByContract[c.id] === undefined ? null : capByContract[c.id],
      ineligibleReason: v.ineligible_reason || null,
      allowed: Boolean(v.allowed),
    });
  });

  players.sort(function (a, b) {
    if (a.teamName !== b.teamName) return a.teamName.localeCompare(b.teamName);
    return a.name.localeCompare(b.name);
  });

  // The countdown is computed here and passed as a plain number of days plus a
  // pre-formatted Eastern date. Never format this timestamp client-side -- a
  // 00:01 ET boundary renders a day early for anyone west of Eastern, which is
  // the lesson /calendar already carries.
  let blockDate = null;
  let blockDaysLeft = null;
  const blockRow = (calendar || [])[0];
  if (blockRow && blockRow.starts_at) {
    blockDate = formatDateTime(blockRow.starts_at);
    const ms = new Date(blockRow.starts_at).getTime();
    if (Number.isFinite(ms)) {
      blockDaysLeft = Math.ceil((ms - Date.now()) / 86400000);
    }
  }

  return {
    ok: true,
    data: {
      seasonYear: seasonYear,
      players: players,
      capByTeam: capByTeam,
      blockDate: blockDate,
      blockDaysLeft: blockDaysLeft,
      seesAllTeams: seesAllTeams,
      myTeamId: me.team_id,
    },
  };
}

/** The slider bound and the reason it sits where it does. */
export async function loadMaxRestructure(contractId, prorationYears) {
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('max_restructure', {
    p_contract_id: contractId,
    p_proration_years: Number(prorationYears),
  });

  if (error) {
    return { ok: false, message: error.message || 'The maximum could not be calculated.' };
  }
  return { ok: true, data: data };
}

/**
 * The live preview. Read-only and safe to call on every keystroke; the form
 * debounces it. Every number on screen comes from here.
 */
export async function previewRestructure(contractId, amount, fromGuaranteed, prorationYears) {
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('compute_restructure_charges', {
    p_contract_id: contractId,
    p_amount: Number(amount),
    p_from_guaranteed: Number(fromGuaranteed),
    p_proration_years: Number(prorationYears),
  });

  if (error) {
    return { ok: false, message: error.message || 'The preview could not be calculated.' };
  }
  return { ok: true, data: data };
}

/**
 * Execute.
 *
 * NO COMMISSIONER CHECK, DELIBERATELY. Every owner may restructure on their
 * own roster; restructure_contract() enforces that and names the owning team
 * when it refuses. An app-layer commissioner check here would turn "this
 * contract belongs to Awful Lot" into a generic access refusal and would lock
 * out the owners this route exists for.
 *
 * The database's refusals name the rule they enforce and are written to be
 * read by owners, so they are passed through verbatim.
 */
export async function submitRestructure(contractId, amount, fromGuaranteed, prorationYears, note) {
  // The one that matters. Everything above this only shows numbers; this
  // writes, and restructure_contract() would execute it.
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to restructure.' };
  }
  if (!contractId) {
    return { ok: false, message: 'Pick a player to restructure.' };
  }
  if (!(Number(amount) > 0)) {
    return { ok: false, message: 'Enter an amount to convert.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('restructure_contract', {
    p_contract_id: contractId,
    p_amount: Number(amount),
    p_from_guaranteed: Number(fromGuaranteed),
    p_proration_years: Number(prorationYears),
    p_note: note && note.trim() ? note.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      message: error.message || 'The restructure was refused and nothing was changed.',
    };
  }

  // A restructure moves cap and cash on every surface that reads
  // contract_year_computed, which folds the new bonus in already.
  revalidatePath('/restructure');
  revalidatePath('/cap-sheet');
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/player/[playerId]', 'page');
  revalidatePath('/cash');
  revalidatePath('/actions');

  return { ok: true, data: data };
}
