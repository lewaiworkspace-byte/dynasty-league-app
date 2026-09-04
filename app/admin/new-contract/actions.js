'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { adminClient } from '../../../lib/supabaseAdmin';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { formatDateTime } from '../../../lib/formatDate';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';
export async function createContract(payload) {
  // Server Actions are callable endpoints regardless of what the UI
  // renders -- the page's redirect alone doesn't protect this write path.
  //
  // Widened to co-commissioners August 25, 2026. Like createTier, the writes
  // below use adminClient() and bypass RLS, so this check is the only gate.
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    throw new Error(COMMISSIONER_OR_CO_REFUSAL);
  }
  const supabase = adminClient();
  // 1. Find an existing player by name, or create a new one
  let playerId;
  const { data: existingPlayer, error: findErr } = await supabase
    .from('players')
    .select('id')
    .ilike('full_name', payload.playerName.trim())
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (existingPlayer) {
    playerId = existingPlayer.id;
  } else {
    const { data: newPlayer, error: playerErr } = await supabase
      .from('players')
      .insert({
        full_name: payload.playerName.trim(),
        position: payload.position || null,
        nfl_team: payload.nflTeam || null,
      })
      .select('id')
      .single();
    if (playerErr) throw new Error(playerErr.message);
    playerId = newPlayer.id;
  }
  // 2. Create the contract
  const isFreeAgent = payload.contractType === 'veteran_free_agent';
  const voidYears = isFreeAgent ? Number(payload.voidYears) || 0 : 0;
  const totalYears = Number(payload.totalYears);
  const signingBonusTotal = Number(payload.signingBonusTotal) || 0;
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .insert({
      player_id: playerId,
      team_id: payload.teamId,
      contract_type: payload.contractType,
      start_year: Number(payload.startYear),
      total_years: totalYears,
      void_years: voidYears,
      draft_year: payload.draftYear ? Number(payload.draftYear) : null,
      draft_round: payload.draftRound ? Number(payload.draftRound) : null,
      draft_pick: payload.draftPick ? Number(payload.draftPick) : null,
      signing_bonus_total: signingBonusTotal,
    })
    .select('id')
    .single();
  if (contractErr) throw new Error(contractErr.message);
  // 3. Create one contract_years row per season (real years + owner-elected
  // void years). Signing bonus is split evenly unless a year carries an
  // exact proration (e.g. loaded from the rookie wage scale, which isn't an
  // even split). Every void row here is owner-elected, so it carries
  // void_reason 'signing_bonus' -- required by the void_reason_matches_flag
  // constraint (Aug 2026). Automatic option void years are NOT created
  // here: the database's rebuild_option_void_years trigger adds them (with
  // void_reason 'option_bonus') when the option bonuses are inserted in
  // step 4.
  //
  // contract_years.option_bonus is the LEGACY flat column: always written
  // as 0. Real option bonuses live in contract_option_bonuses (step 4);
  // writing the legacy column as well would double-charge the cap and hide
  // the money from the 30% Rule trigger, which reads only the real table.
  const totalRows = totalYears + voidYears;
  const proratedBonus = totalRows > 0 ? signingBonusTotal / totalRows : 0;
  const yearRows = payload.years.slice(0, totalRows).map((y, idx) => {
    const yearNumber = idx + 1;
    const isVoid = yearNumber > totalYears;
    const hasExactProration =
      y.proratedSigningBonus !== null && y.proratedSigningBonus !== undefined && y.proratedSigningBonus !== '';
    return {
      contract_id: contract.id,
      contract_year_number: yearNumber,
      league_season_year: Number(payload.startYear) + idx,
      prorated_signing_bonus: hasExactProration ? Number(y.proratedSigningBonus) : proratedBonus,
      guaranteed_salary: isVoid ? 0 : Number(y.guaranteedSalary) || 0,
      non_guaranteed_salary: isVoid ? 0 : Number(y.nonGuaranteedSalary) || 0,
      option_bonus: 0,
      roster_bonus: isVoid ? 0 : Number(y.rosterBonus) || 0,
      is_void_year: isVoid,
      void_reason: isVoid ? 'signing_bonus' : null,
    };
  });
  const { error: yearsErr } = await supabase.from('contract_years').insert(yearRows);
  if (yearsErr) throw new Error(yearsErr.message);
  // 4. Create the REAL option bonuses in contract_option_bonuses -- the
  // same table a winning bid's options land in. Year 2+ of real years
  // only; the database refuses Year 1 and void-season scheduling. This
  // insert is what fires rebuild_option_void_years (adding the automatic
  // option void seasons to contract_years) and the 30% Rule trigger.
  //
  // PostgREST calls are separate transactions: if this insert is rejected
  // (e.g. a 30% violation the client pre-check should have caught), the
  // contract and its years are already saved WITHOUT the option bonuses.
  // The error below says so explicitly rather than leaving the partial
  // state silent -- the commissioner can delete the contract via
  // commissioner_delete_contract and re-enter it.
  const optionRows = payload.years
    .slice(1, totalYears)
    .map((y, idx) => ({
      contract_id: contract.id,
      exercise_season_year: Number(payload.startYear) + idx + 1,
      bonus_amount: Number(y.optionBonus) || 0,
    }))
    .filter((r) => r.bonus_amount > 0);
  if (optionRows.length > 0) {
    const { error: obErr } = await supabase.from('contract_option_bonuses').insert(optionRows);
    if (obErr) {
      throw new Error(
        'Contract saved, but its option bonuses were REJECTED and are not attached: ' +
          obErr.message +
          ' — delete this contract from Fix Contracts and re-enter it once the issue is fixed.'
      );
    }
  }
  redirect('/cap-sheet');
}

// ---------------------------------------------------------------------------
// CONTRACT RESTRUCTURE (September 4, 2026)
//
// A restructure converts unpaid current-season salary into a NEW signing bonus
// with its own proration window, leaving the original signing bonus alone.
//
// NOTHING BELOW COMPUTES MONEY. Every figure the form shows comes back from
// max_restructure() or compute_restructure_charges(). There is deliberately no
// JS mirror of the cap-saving formula, the Deion Rule, the minimum salary or
// the PPV test -- the database owns all four and a client copy would drift.
// Same rule as compute_cut_charges and trade_impact.
//
// THESE USE THE SESSION CLIENT, NOT adminClient(). The restructure functions
// are SECURITY DEFINER and gate themselves on auth.uid(); through the
// service-role client auth.uid() is NULL and they would correctly refuse.
// createContract above uses adminClient for its direct table writes, which is
// a different situation -- do not copy that choice down here.
//
// All four RETURN their refusals. createContract above still throws; it
// predates the rule and its caller is written to catch, so converting it means
// changing both together and is not this batch.

const RESTRUCTURE_CONCURRENCY = 10;

// Bounded parallelism. restructure_ineligible_reason() is one round trip per
// contract and the league has roughly 233 active ones; firing them all at once
// buries PostgREST, and firing them serially takes a minute.
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
 * Everything the restructure picker needs, in one call.
 *
 * Deliberately a Server Action rather than page data: the New Contract page is
 * usually opened to enter a contract, and this does one eligibility round trip
 * per active contract. Paying that on every page load to serve a mode most
 * visits never use would be wasteful, so it runs only on the mode switch.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function loadRestructureRoster() {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  }

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

  const { data: contracts, error: contractsError } = await supabase
    .from('contracts')
    .select('id, team_id, contract_type, start_year, total_years, players(id, full_name, position)')
    .eq('status', 'active');
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

  // The eligibility pass. A refused RPC is reported as its own message rather
  // than silently marking the player eligible -- an unexplained enabled row
  // that then refuses on submit is worse than a greyed one that says why.
  const reasons = await mapWithConcurrency(ids, RESTRUCTURE_CONCURRENCY, async function (id) {
    const { data, error } = await supabase.rpc('restructure_ineligible_reason', {
      p_contract_id: id,
    });
    if (error) return 'Eligibility could not be checked: ' + error.message;
    return data === null || data === undefined || data === '' ? null : String(data);
  });

  const reasonById = {};
  ids.forEach(function (id, i) { reasonById[id] = reasons[i]; });

  const players = rows.map(function (c) {
    return {
      contractId: c.id,
      playerId: c.players ? c.players.id : null,
      name: (c.players && c.players.full_name) || 'Unknown player',
      position: (c.players && c.players.position) || '',
      teamId: c.team_id,
      teamName: teamNames[c.team_id] || 'Unknown team',
      contractType: c.contract_type,
      capCharge: capByContract[c.id] === undefined ? null : capByContract[c.id],
      ineligibleReason: reasonById[c.id] || null,
    };
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
    },
  };
}

/** The slider bound and the reason it sits where it does. */
export async function loadMaxRestructure(contractId, prorationYears) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
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
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
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
 * Execute. Commissioner or co-commissioner only -- restructure_contract()
 * enforces that itself, and this check exists to produce the refusal one step
 * earlier rather than as the gate.
 *
 * The database's refusals name the rule they enforce and are written to be read
 * by owners, so they are passed through verbatim.
 */
export async function submitRestructure(contractId, amount, fromGuaranteed, prorationYears, note) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
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
  revalidatePath('/cap-sheet');
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/player/[playerId]', 'page');
  revalidatePath('/cash');
  revalidatePath('/actions');

  return { ok: true, data: data };
}
