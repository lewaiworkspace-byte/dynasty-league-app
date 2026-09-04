import { formatDateTime } from './formatDate';

// ONE ROSTER LOADER, TWO GATES.
//
// /restructure (League) serves an owner their own roster; /admin/restructure
// serves the commissioner every team. Those are two DIFFERENT permissions and
// they live in two different Server Action files, but the query, the
// eligibility pass and the shaping are identical -- so they live here, once.
//
// THIS FILE HOLDS NO AUTHORISATION. It takes a client and a team scope and
// answers the question asked of it. Deciding who may ask is the caller's job,
// and both callers gate before they get here:
//
//   app/restructure/actions.js        -> always the viewer's own team
//   app/admin/restructure/actions.js  -> isCommissionerOrCo, then all teams
//
// Do not add a role check in this file. A single implementation with the gate
// on the outside is what stops the two surfaces drifting apart the way two
// copies of the query would.
//
// NOTHING HERE COMPUTES MONEY. cap_charge comes from contract_year_computed
// and the cap summary comes from team_cap_summary; both are read and passed
// through untouched.

const RESTRUCTURE_CONCURRENCY = 10;

// Bounded parallelism. can_restructure() is one round trip per contract --
// about 23 for one roster, every active contract in the league for the
// commissioner. Firing them all at once buries PostgREST; firing them serially
// takes a minute.
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
 * @param {object} supabase   a session-aware client (never the service role --
 *                            can_restructure gates on auth.uid())
 * @param {string|null} teamId  one team, or null for every team
 * @param {string|null} myTeamId  the viewer's team, echoed back for the form
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function loadRosterData(supabase, teamId, myTeamId) {
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
  if (teamId) {
    contractQuery = contractQuery.eq('team_id', teamId);
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
  // eligibility refusal is informative and is shown with its reason.
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
    // Greying it would answer a question nobody asked and imply the player is
    // theirs to act on if only some condition changed.
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

  // The countdown is a plain number of days plus a pre-formatted Eastern date.
  // Never format this timestamp client-side -- a 00:01 ET boundary renders a
  // day early for anyone west of Eastern, the lesson /calendar already carries.
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
      // Drives the team filter and the row's team column. True only when the
      // caller asked for every team.
      seesAllTeams: !teamId,
      myTeamId: myTeamId || null,
    },
  };
}
