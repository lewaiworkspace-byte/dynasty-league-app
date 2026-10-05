// THE DATA CENTER'S DATASETS -- October 5, 2026.
//
// ONE LIST, TWO DOORS. Every dataset an owner can download from /data, and
// every dataset the Claude connector (/api/mcp) can read, is defined here and
// nowhere else. The download route and the MCP route both call loadDataset();
// neither has a query of its own. Two copies of "what is a roster" would drift
// the way the money formatters once did.
//
// THE RULE FOR WHAT BELONGS HERE: a dataset must be the SAME for every owner.
// Nothing sealed, nothing own-team-only, nothing an officer sees that an owner
// does not. That rule is what lets the MCP route read through the service-role
// client (it has no session -- see app/api/mcp/[[...key]]/route.js) without
// handing anybody more than the league already shows them. It is enforced in
// two ways, and both are load-bearing:
//
//   1. Only views/tables whose read policy is `true` for every signed-in owner
//      are read, or definer views that already filter themselves
//      (auction_tier_results: verified tiers only; published_value_snapshots:
//      published only).
//   2. Where a table's policy has an "everyone" branch and an "own team"
//      branch, the everyone branch is applied HERE as an explicit filter, so a
//      service-role read and a session read return the same rows:
//        trades            status in TRADE_PUBLIC_STATUSES (can_view_trade)
//        free_agent_offers window status = 'resolved'     ("own team or resolved")
//
// DELIBERATELY ABSENT, and never to be added: open-tier bids, Auto-Bid
// delegations, bid hides, unresolved free agency offers, waiver claims,
// watchlists, Insider submissions, team_cash_transactions (own team only),
// trades still in draft/proposed, owner emails and contact cards
// (owner_directory() applies per-field toggles), and cut_history's two email
// columns. SR-31: a sealed table is not read through this file at all.
//
// MONEY IS TO THE CENT, NOT TO THE DOLLAR. Exports carry the database's
// values with only binary-fraction noise trimmed (cents() below) -- the same
// stance as the injury report and tier results exports, whose CSV/XLSX carry
// raw values. The display rounding rules (formatCost/formatRoom) are for
// screens, not for files someone will add up.
//
// ROW CEILING. Every multi-row read pages until exhausted (fetchAll) with a
// unique order -- a file someone keeps must never be bound-and-warn.
// stats_games is the one dataset that REQUIRES a season: ~6,800 rows x 48
// columns per season, and Vercel caps a function response at 4.5 MB.

const PAGE = 1000;
const IN_CHUNK = 150;

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
export const TRADE_PUBLIC_STATUSES = ['accepted', 'approved', 'executed', 'vetoed', 'reversed'];

// ---------------------------------------------------------------------------
// Plumbing

async function fetchAll(build, orderCols) {
  let from = 0;
  let all = [];
  for (;;) {
    let q = build();
    orderCols.forEach(function (c) {
      q = q.order(c);
    });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchIn(client, table, select, col, ids, extra) {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  let out = [];
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const chunk = uniq.slice(i, i + IN_CHUNK);
    const rows = await fetchAll(function () {
      let q = client.from(table).select(select).in(col, chunk);
      if (extra) q = extra(q);
      return q;
    }, [col]);
    out = out.concat(rows);
  }
  return out;
}

async function playerMap(client, ids) {
  const rows = await fetchIn(client, 'players', 'id, full_name, position, nfl_team', 'id', ids);
  const m = new Map();
  rows.forEach(function (p) {
    m.set(p.id, p);
  });
  return m;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Pro-rated figures arrive as binary fractions (23.785714285714285 is
// 333/14 -- a salary charged for some of fourteen weeks). Files carry them to
// the cent: exact enough to add up, and readable. Integers pass untouched,
// and so does anything that is not a number.
export function cents(v) {
  if (typeof v !== 'number' || Number.isInteger(v) || !Number.isFinite(v)) return v;
  return Math.round(v * 100) / 100;
}

function teamName(ctx, id) {
  const t = id ? ctx.teamById.get(id) : null;
  return t ? t.name : null;
}

function teamAbbrev(ctx, id) {
  const t = id ? ctx.teamById.get(id) : null;
  return t ? t.abbrev : null;
}

function byPosition(f) {
  return function (r) {
    return !f.position || r.position === f.position;
  };
}

function yearsText(rows) {
  // "2026: SB 12 / G 40 / NG 8 / RB 0; 2027: ..." -- a whole contract shape in
  // one cell, so a bid or offer stays one row in a spreadsheet and one line
  // for Claude. Void years are marked.
  return rows
    .slice()
    .sort(function (a, b) {
      return Number(a.league_season_year) - Number(b.league_season_year);
    })
    .map(function (y) {
      const parts = [
        'SB ' + (num(y.prorated_signing_bonus) || 0),
        'G ' + (num(y.guaranteed_salary) || 0),
        'NG ' + (num(y.non_guaranteed_salary) || 0),
        'RB ' + (num(y.roster_bonus) || 0),
      ];
      if (num(y.option_bonus)) parts.push('OB ' + num(y.option_bonus));
      return y.league_season_year + (y.is_void_year ? ' (void)' : '') + ': ' + parts.join(' / ');
    })
    .join('; ');
}

const STATUS_ORDER = { active: 0, ir: 1, taxi: 2 };
const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4 };

// ---------------------------------------------------------------------------
// Context: the current season and the ten teams, read once per request.

export async function loadContext(client) {
  const [cfgRes, teamsRes] = await Promise.all([
    client.from('league_config').select('current_season_year, league_name').eq('id', true).maybeSingle(),
    client.from('teams').select('id, name, abbrev, owner_display_name, division').order('name'),
  ]);
  if (cfgRes.error) throw new Error(cfgRes.error.message);
  if (teamsRes.error) throw new Error(teamsRes.error.message);
  if (!cfgRes.data || !cfgRes.data.current_season_year) {
    throw new Error('league_config has no current season.');
  }
  const teams = teamsRes.data || [];
  const teamById = new Map();
  teams.forEach(function (t) {
    teamById.set(t.id, t);
  });
  return {
    season: Number(cfgRes.data.current_season_year),
    leagueName: cfgRes.data.league_name || 'EDFL',
    teams: teams,
    teamById: teamById,
  };
}

// Accepts a team id, abbreviation, exact name, or a unique fragment of a name.
// Returns { id } or { error }.
export function resolveTeam(ctx, input) {
  const s = String(input || '').trim();
  if (!s || s.toUpperCase() === 'ALL') return { id: null };
  const lower = s.toLowerCase();
  const exact = ctx.teams.find(function (t) {
    return (
      t.id === s ||
      (t.abbrev && t.abbrev.toLowerCase() === lower) ||
      (t.name && t.name.toLowerCase() === lower)
    );
  });
  if (exact) return { id: exact.id };
  const partial = ctx.teams.filter(function (t) {
    return t.name && t.name.toLowerCase().indexOf(lower) !== -1;
  });
  if (partial.length === 1) return { id: partial[0].id };
  return {
    error:
      'No single team matches "' +
      s +
      '". Use one of: ' +
      ctx.teams
        .map(function (t) {
          return t.abbrev ? t.abbrev + ' (' + t.name + ')' : t.name;
        })
        .join(', ') +
      '.',
  };
}

// Normalises raw filter input (query string or MCP arguments) against a
// dataset's allowed filters. Returns { filters } or { error }.
export function normaliseFilters(ds, ctx, raw) {
  const r = raw || {};
  const f = { season: null, team: null, position: null };
  const allowed = ds.filters || [];

  if (allowed.indexOf('season') !== -1 && r.season !== undefined && r.season !== null && String(r.season).trim() !== '' && String(r.season).toUpperCase() !== 'ALL') {
    const s = parseInt(String(r.season), 10);
    if (!Number.isFinite(s) || s < 2000 || s > 2100) return { error: 'Season must be a year, like ' + ctx.season + '.' };
    f.season = s;
  }
  if (allowed.indexOf('team') !== -1 && r.team) {
    const t = resolveTeam(ctx, r.team);
    if (t.error) return { error: t.error };
    f.team = t.id;
  }
  if (allowed.indexOf('position') !== -1 && r.position && String(r.position).toUpperCase() !== 'ALL') {
    const p = String(r.position).toUpperCase();
    if (POSITIONS.indexOf(p) === -1) return { error: 'Position must be one of ' + POSITIONS.join(', ') + '.' };
    f.position = p;
  }
  if (ds.defaultSeason && f.season === null) f.season = ds.defaultSeason(ctx);
  return { filters: f };
}

export function filterSentence(ctx, f) {
  const bits = [];
  if (f.season) bits.push('Season ' + f.season);
  if (f.team) bits.push(teamName(ctx, f.team) || 'Unknown team');
  if (f.position) bits.push(f.position + ' only');
  return bits.length ? bits.join(' · ') : 'No filters (everything)';
}

// ---------------------------------------------------------------------------
// The datasets. Order here is the order on /data and in list_datasets.
//
// Each: key, group, title, about (one paragraph, shown on /data and in the
// markdown export), filters, columns [{ key, label, about }], load(client, f,
// ctx) -> rows. A column's `about` is what lets Claude read the file without
// guessing; keep it exact.

const C = function (key, label, about) {
  return { key: key, label: label, about: about || '' };
};

const UNITS =
  'Cap and Cash are EDFL dollars ($1 = $100,000 of real NFL money). PPV is Player Perceived Value, the league\'s own unit for comparing contracts -- it is not money.';

export const DATASETS = [
  // ---- Teams and rosters --------------------------------------------------
  {
    key: 'rosters',
    group: 'Teams and rosters',
    title: 'Rosters',
    about:
      'Every player under an active EDFL contract, one row per contract, with this season\'s cap charge, cash and PPV from the contract engine.',
    filters: ['team', 'position'],
    columns: [
      C('team', 'Team'),
      C('team_abbrev', 'Abbrev'),
      C('player', 'Player'),
      C('position', 'Pos'),
      C('nfl_team', 'NFL team'),
      C('roster_status', 'Roster status', 'active, ir (injured reserve) or taxi (practice squad)'),
      C('contract_type', 'Contract type'),
      C('start_year', 'Start season'),
      C('total_years', 'Years', 'Real (non-void) seasons on the deal'),
      C('void_years', 'Void years', 'Owner-elected void years only'),
      C('final_season', 'Final season', 'Last real season: start + years - 1'),
      C('draft_year', 'Draft class', 'Rookie contracts: the draft class, which governs taxi eligibility'),
      C('season_cap', 'Cap this season', 'Cap charge for the current season (EDFL $)'),
      C('season_cash', 'Cash this season', 'Cash value for the current season (EDFL $)'),
      C('season_ppv', 'PPV this season'),
      C('season_dead_cap_if_cut', 'Dead cap if cut (static)', 'contract_year_computed.dead_cap_if_cut -- a static projection, not the cut engine'),
      C('injury_status', 'Injury', 'Sleeper designation, reference only'),
      C('contract_id', 'Contract id'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f, ctx) {
      const contracts = await fetchAll(function () {
        let q = client
          .from('contracts')
          .select(
            'id, team_id, player_id, contract_type, roster_status, start_year, total_years, void_years, draft_year, players(full_name, position, nfl_team, injury_status)'
          )
          .eq('status', 'active');
        if (f.team) q = q.eq('team_id', f.team);
        return q;
      }, ['id']);
      const years = await fetchIn(
        client,
        'contract_year_computed',
        'contract_id, cap_charge, cash_value, ppv, dead_cap_if_cut',
        'contract_id',
        contracts.map(function (c) {
          return c.id;
        }),
        function (q) {
          return q.eq('league_season_year', ctx.season);
        }
      );
      const yr = new Map();
      years.forEach(function (y) {
        yr.set(y.contract_id, y);
      });
      return contracts
        .map(function (c) {
          const p = c.players || {};
          const y = yr.get(c.id) || {};
          return {
            team: teamName(ctx, c.team_id),
            team_abbrev: teamAbbrev(ctx, c.team_id),
            player: p.full_name || null,
            position: p.position || null,
            nfl_team: p.nfl_team || null,
            roster_status: c.roster_status,
            contract_type: c.contract_type,
            start_year: c.start_year,
            total_years: c.total_years,
            void_years: c.void_years,
            final_season: c.start_year && c.total_years ? c.start_year + c.total_years - 1 : null,
            draft_year: c.draft_year,
            season_cap: num(y.cap_charge),
            season_cash: num(y.cash_value),
            season_ppv: num(y.ppv),
            season_dead_cap_if_cut: num(y.dead_cap_if_cut),
            injury_status: p.injury_status || null,
            contract_id: c.id,
            player_id: c.player_id,
          };
        })
        .filter(byPosition(f))
        .sort(function (a, b) {
          return (
            String(a.team).localeCompare(String(b.team)) ||
            (STATUS_ORDER[a.roster_status] ?? 9) - (STATUS_ORDER[b.roster_status] ?? 9) ||
            (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) ||
            (b.season_cap || 0) - (a.season_cap || 0)
          );
        });
    },
  },
  {
    key: 'team_cap',
    group: 'Teams and rosters',
    title: 'Team cap by season',
    about:
      'Each team\'s cap and cash position for every season any contract or dead money touches -- the same view the Cap Sheet and Team HQ read.',
    filters: ['season', 'team'],
    columns: [
      C('team_name', 'Team'),
      C('league_season_year', 'Season'),
      C('fantasy_salary_cap', 'Salary cap', 'Null when the season has no cap row yet'),
      C('cap_is_set', 'Cap set'),
      C('cap_is_provisional', 'Cap provisional'),
      C('active_cap', 'Active cap'),
      C('pre_event_cap', 'Pre-event cap'),
      C('dead_cap', 'Dead cap'),
      C('cap_used', 'Cap used'),
      C('cap_space_remaining', 'Cap space'),
      C('min_required_spend', 'Spend floor', 'Minimum spend (min_spend_pct of the cap)'),
      C('active_cash', 'Active cash'),
      C('pre_event_cash', 'Pre-event cash'),
      C('dead_cash', 'Dead cash'),
      C('cash_used', 'Cash used'),
      C('team_id', 'Team id'),
    ],
    load: async function (client, f) {
      const rows = await fetchAll(function () {
        let q = client.from('team_cap_by_season').select('*');
        if (f.season) q = q.eq('league_season_year', f.season);
        if (f.team) q = q.eq('team_id', f.team);
        return q;
      }, ['team_id', 'league_season_year']);
      return rows.sort(function (a, b) {
        return String(a.team_name).localeCompare(String(b.team_name)) || a.league_season_year - b.league_season_year;
      });
    },
  },
  {
    key: 'team_cash',
    group: 'Teams and rosters',
    title: 'Owner Cash accounts',
    about:
      'Each team\'s Owner Cash for a season: starting cash, commissioner adjustments (fines, purchases), cash spent and cash available. The itemised ledger is own-team only and is not included.',
    filters: ['season', 'team'],
    columns: [
      C('team', 'Team'),
      C('season_year', 'Season'),
      C('starting_cash', 'Starting cash'),
      C('total_adjustments', 'Adjustments'),
      C('cash_spent', 'Cash spent'),
      C('cash_available', 'Cash available'),
      C('team_id', 'Team id'),
    ],
    load: async function (client, f, ctx) {
      const rows = await fetchAll(function () {
        let q = client.from('team_cash_available').select('*');
        if (f.season) q = q.eq('season_year', f.season);
        if (f.team) q = q.eq('team_id', f.team);
        return q;
      }, ['team_id', 'season_year']);
      return rows
        .map(function (r) {
          return Object.assign({ team: teamName(ctx, r.team_id) }, r);
        })
        .sort(function (a, b) {
          return String(a.team).localeCompare(String(b.team)) || a.season_year - b.season_year;
        });
    },
  },
  {
    key: 'draft_picks',
    group: 'Teams and rosters',
    title: 'Draft picks',
    about: 'Every rookie draft pick in the database: who it originally belonged to, who holds it now, and who was taken with it.',
    filters: ['season', 'team'],
    columns: [
      C('season_year', 'Draft'),
      C('pick_label', 'Pick'),
      C('round', 'Round'),
      C('pick_number', 'Pick in round', 'Null until the order is set'),
      C('overall_pick', 'Overall'),
      C('current_team_name', 'Held by'),
      C('original_team_name', 'Originally'),
      C('pick_changed_hands', 'Traded'),
      C('player_name', 'Player taken'),
      C('player_position', 'Pos'),
      C('draft_completed', 'Draft done'),
      C('pick_id', 'Pick id'),
    ],
    load: async function (client, f) {
      const rows = await fetchAll(function () {
        let q = client
          .from('draft_pick_board')
          .select(
            'pick_id, season_year, round, pick_number, overall_pick, pick_label, draft_completed, current_team_id, current_team_name, original_team_name, pick_changed_hands, player_name, player_position, sort_key'
          );
        if (f.season) q = q.eq('season_year', f.season);
        if (f.team) q = q.eq('current_team_id', f.team);
        return q;
      }, ['pick_id']);
      return rows.sort(function (a, b) {
        return a.season_year - b.season_year || String(a.sort_key).localeCompare(String(b.sort_key));
      });
    },
  },

  // ---- Contracts ------------------------------------------------------------
  {
    key: 'contracts',
    group: 'Contracts',
    title: 'Contracts (every deal, past and present)',
    about:
      'One row per EDFL contract ever signed, active or ended, with lifetime cap and cash totals, the auction tier it was won in, and how it ended.',
    filters: ['team', 'position'],
    columns: [
      C('team_name', 'Team'),
      C('player', 'Player'),
      C('position', 'Pos'),
      C('contract_type', 'Type'),
      C('contract_status', 'Status', 'active, cut, cut_june1, traded_away, expired, retired or extended'),
      C('roster_status', 'Roster status', 'Blank once the contract has ended'),
      C('start_year', 'Start'),
      C('total_years', 'Years'),
      C('void_years', 'Void years'),
      C('option_void_years', 'Option void years', 'Created automatically by option bonuses'),
      C('signing_bonus_total', 'Signing bonus'),
      C('first_season', 'First season with money'),
      C('last_season', 'Last season with money'),
      C('total_cap', 'Total cap', 'Sum of every season\'s cap charge'),
      C('total_cash', 'Total cash', 'Sum of every season\'s cash value'),
      C('current_season_cap', 'Cap this season'),
      C('current_season_cash', 'Cash this season'),
      C('signed_in_tier', 'Auction tier'),
      C('draft_year', 'Draft class'),
      C('draft_round', 'Draft round'),
      C('draft_pick', 'Draft pick'),
      C('ended_by', 'Ended by', 'The latest non-reversed contract event'),
      C('ended_at', 'Ended at'),
      C('dead_cap_current_year', 'Dead cap (yr of event)'),
      C('dead_cap_next_year', 'Dead cap (next yr)'),
      C('dead_cash_current_year', 'Dead cash (yr of event)'),
      C('dead_cash_next_year', 'Dead cash (next yr)'),
      C('created_at', 'Signed at'),
      C('contract_id', 'Contract id'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f) {
      const rows = await fetchAll(function () {
        let q = client.from('player_contract_history').select('*');
        if (f.team) q = q.eq('team_id', f.team);
        return q;
      }, ['contract_id']);
      const pm = await playerMap(
        client,
        rows.map(function (r) {
          return r.player_id;
        })
      );
      return rows
        .map(function (r) {
          const p = pm.get(r.player_id) || {};
          const out = Object.assign({}, r, { player: p.full_name || null, position: p.position || null });
          // The latest event on an ACTIVE contract (a restructure, say) did
          // not end it. Say nothing rather than something wrong.
          if (r.contract_status === 'active') {
            out.ended_by = null;
            out.ended_at = null;
          } else {
            // roster_status is where the player sat on THIS contract while it
            // was live; on an ended contract it is a leftover, not a fact.
            out.roster_status = null;
          }
          return out;
        })
        .filter(byPosition(f))
        .sort(function (a, b) {
          return (
            String(a.team_name).localeCompare(String(b.team_name)) ||
            String(a.player).localeCompare(String(b.player)) ||
            (a.start_year || 0) - (b.start_year || 0)
          );
        });
    },
  },
  {
    key: 'contract_years',
    group: 'Contracts',
    title: 'Contract years (season by season)',
    about:
      'Every contract broken out by season: prorated signing bonus, guaranteed and non-guaranteed salary, option and roster bonuses, and the resulting cap charge, cash and PPV. Folds in restructures, void acceleration and in-season pro-ration.',
    filters: ['season', 'team', 'position'],
    columns: [
      C('team', 'Team'),
      C('player', 'Player'),
      C('position', 'Pos'),
      C('contract_status', 'Contract status'),
      C('contract_year_number', 'Contract year'),
      C('league_season_year', 'Season'),
      C('is_void_year', 'Void year'),
      C('is_void_acceleration_season', 'Void acceleration season'),
      C('prorated_signing_bonus', 'Signing bonus (prorated)'),
      C('guaranteed_salary', 'Guaranteed salary'),
      C('non_guaranteed_salary', 'Non-guaranteed salary'),
      C('option_bonus', 'Option bonus'),
      C('roster_bonus', 'Roster bonus'),
      C('roster_bonus_converted', 'Roster bonus converted', 'Roster bonuses count against the cap from September 2'),
      C('cap_charge', 'Cap charge'),
      C('cash_value', 'Cash'),
      C('ppv', 'PPV'),
      C('dead_cap_if_cut', 'Dead cap if cut (static)'),
      C('contract_id', 'Contract id'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f, ctx) {
      const rows = await fetchAll(function () {
        let q = client
          .from('contract_year_computed')
          .select(
            'id, contract_id, player_id, team_id, contract_status, contract_year_number, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, option_bonus, roster_bonus, ppv, cap_charge, cash_value, dead_cap_if_cut, is_void_year, roster_bonus_converted, is_void_acceleration_season'
          );
        if (f.season) q = q.eq('league_season_year', f.season);
        if (f.team) q = q.eq('team_id', f.team);
        return q;
      }, ['id']);
      const pm = await playerMap(
        client,
        rows.map(function (r) {
          return r.player_id;
        })
      );
      return rows
        .map(function (r) {
          const p = pm.get(r.player_id) || {};
          const out = Object.assign({ team: teamName(ctx, r.team_id), player: p.full_name || null, position: p.position || null }, r);
          delete out.id;
          delete out.team_id;
          return out;
        })
        .filter(byPosition(f))
        .sort(function (a, b) {
          return (
            String(a.team).localeCompare(String(b.team)) ||
            String(a.player).localeCompare(String(b.player)) ||
            String(a.contract_id).localeCompare(String(b.contract_id)) ||
            a.league_season_year - b.league_season_year
          );
        });
    },
  },
  {
    key: 'dead_money',
    group: 'Contracts',
    title: 'Cuts and dead money',
    about:
      'Every cut, with the dead cap and dead cash it charged and whether it was reversed. Reversed cuts are included and flagged; they charge nothing.',
    filters: ['season', 'team', 'position'],
    columns: [
      C('team_name', 'Team'),
      C('player_name', 'Player'),
      C('position', 'Pos'),
      C('event_type', 'Event'),
      C('event_season_year', 'Season'),
      C('contract_type', 'Contract type'),
      C('dead_cap_current_year', 'Dead cap (this yr)'),
      C('dead_cap_next_year', 'Dead cap (next yr)'),
      C('dead_cash_current_year', 'Dead cash (this yr)'),
      C('dead_cash_next_year', 'Dead cash (next yr)'),
      C('weeks_charged', 'Weeks charged'),
      C('june1_split', 'June 1 split'),
      C('june1_designated', 'June 1 designation'),
      C('is_active_cut', 'In force', 'False once reversed'),
      C('reversed_at', 'Reversed at'),
      C('reversal_reason', 'Reversal reason'),
      C('notes', 'Notes'),
      C('created_at', 'Cut at'),
      C('contract_id', 'Contract id'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f) {
      // NOT select('*'): cut_history carries created_by_email and
      // reversed_by_email, and an email is not league data.
      const rows = await fetchAll(function () {
        let q = client
          .from('cut_history')
          .select(
            'event_id, contract_id, event_type, event_season_year, from_team_id, team_name, player_id, player_name, position, contract_type, dead_cap_current_year, dead_cap_next_year, dead_cash_current_year, dead_cash_next_year, weeks_charged, june1_split, june1_designated, notes, created_at, reversed_at, reversal_reason, is_active_cut'
          );
        if (f.season) q = q.eq('event_season_year', f.season);
        if (f.team) q = q.eq('from_team_id', f.team);
        if (f.position) q = q.eq('position', f.position);
        return q;
      }, ['event_id']);
      return rows
        .map(function (r) {
          const out = Object.assign({}, r);
          delete out.event_id;
          delete out.from_team_id;
          return out;
        })
        .sort(function (a, b) {
          return String(b.created_at).localeCompare(String(a.created_at));
        });
    },
  },

  // ---- Players and free agency ---------------------------------------------
  {
    key: 'free_agents',
    group: 'Players and free agency',
    title: 'Free agents',
    about:
      'Every QB/RB/WR/TE/K in the Sleeper player pool with no active EDFL contract, with the latest published Player Value Chart figures and last completed season\'s EDFL production. Whether a given player can be signed right now (waivers, in-season releases, open windows) is decided by the database when an offer is made.',
    filters: ['position'],
    columns: [
      C('player', 'Player'),
      C('position', 'Pos'),
      C('nfl_team', 'NFL team'),
      C('nfl_status', 'NFL status'),
      C('injury_status', 'Injury'),
      C('chart_rank', 'Chart rank', 'Rank within position on the latest published Player Value Chart'),
      C('chart_tier', 'Chart tier'),
      C('chart_total_ppv', 'Chart total PPV'),
      C('chart_per_year_value', 'Chart PPV / year'),
      C('chart_likely_years', 'Chart likely years'),
      C('chart_snapshot', 'Chart snapshot'),
      C('prev_season', 'Prior season'),
      C('prev_games', 'Games'),
      C('prev_points', 'EDFL points'),
      C('prev_fppg', 'EDFL pts/game'),
      C('had_edfl_contract', 'Had an EDFL contract'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f, ctx) {
      const taken = new Set();
      const ever = new Set();
      const cIdx = await fetchAll(function () {
        return client.from('contracts').select('id, player_id, status');
      }, ['id']);
      cIdx.forEach(function (c) {
        ever.add(c.player_id);
        if (c.status === 'active') taken.add(c.player_id);
      });

      // sleeper_player_id NOT NULL is load-bearing -- the same filter as
      // searchFreeAgents() in app/free-agency/actions.js: a stats-loader
      // duplicate row has no Sleeper id and no contract, and would otherwise
      // list a rostered player as free.
      const players = await fetchAll(function () {
        let q = client
          .from('players')
          .select('id, full_name, position, nfl_team, status, injury_status')
          .not('sleeper_player_id', 'is', null)
          .in('position', f.position ? [f.position] : POSITIONS);
        return q;
      }, ['id']);

      const chart = await fetchAll(function () {
        let q = client
          .from('player_value_history')
          .select('id, player_id, chart_rank, value_tier, total_ppv, per_year_value, likely_years, snapshot_label')
          .eq('recency_rank', 1)
          .not('player_id', 'is', null);
        return q;
      }, ['id']);
      const chartBy = new Map();
      chart.forEach(function (c) {
        chartBy.set(c.player_id, c);
      });

      const prevSeason = ctx.season - 1;
      const stats = await fetchAll(function () {
        return client
          .from('edfl_player_season_stats')
          .select('player_id, games, fantasy_points, fppg')
          .eq('season_year', prevSeason);
      }, ['player_id']);
      const statBy = new Map();
      stats.forEach(function (s) {
        statBy.set(s.player_id, s);
      });

      return players
        .filter(function (p) {
          return !taken.has(p.id);
        })
        .map(function (p) {
          const c = chartBy.get(p.id) || {};
          const s = statBy.get(p.id) || {};
          return {
            player: p.full_name,
            position: p.position,
            nfl_team: p.nfl_team,
            nfl_status: p.status,
            injury_status: p.injury_status,
            chart_rank: c.chart_rank ?? null,
            chart_tier: c.value_tier ?? null,
            chart_total_ppv: num(c.total_ppv),
            chart_per_year_value: num(c.per_year_value),
            chart_likely_years: c.likely_years ?? null,
            chart_snapshot: c.snapshot_label ?? null,
            prev_season: prevSeason,
            prev_games: s.games ?? null,
            prev_points: num(s.fantasy_points),
            prev_fppg: num(s.fppg),
            had_edfl_contract: ever.has(p.id),
            player_id: p.id,
          };
        })
        .sort(function (a, b) {
          const av = a.chart_total_ppv === null ? -1 : a.chart_total_ppv;
          const bv = b.chart_total_ppv === null ? -1 : b.chart_total_ppv;
          return bv - av || (b.prev_points || 0) - (a.prev_points || 0) || String(a.player).localeCompare(String(b.player));
        });
    },
  },
  {
    key: 'player_values',
    group: 'Players and free agency',
    title: 'Player Value Chart (latest published)',
    about:
      'The most recently published Player Value Chart: rank, tier, per-year and total PPV, likely contract length, and the change since the previous snapshot. Unpublished snapshots are never included.',
    filters: ['team', 'position'],
    columns: [
      C('chart_position', 'Pos'),
      C('chart_rank', 'Rank'),
      C('chart_name', 'Player'),
      C('chart_nfl_team', 'NFL team'),
      C('value_tier', 'Tier'),
      C('per_year_value', 'PPV / year'),
      C('likely_years', 'Likely years'),
      C('total_ppv', 'Total PPV'),
      C('total_ppv_delta', 'Change in total PPV'),
      C('is_new_this_snapshot', 'New this snapshot'),
      C('edfl_team', 'EDFL team', 'Current holder, if under contract'),
      C('notes', 'Notes'),
      C('snapshot_label', 'Snapshot'),
      C('snapshot_as_of', 'As of'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f, ctx) {
      const rows = await fetchAll(function () {
        let q = client
          .from('player_value_history')
          .select(
            'id, snapshot_label, snapshot_as_of, chart_position, chart_rank, chart_name, chart_nfl_team, per_year_value, likely_years, total_ppv, value_tier, notes, player_id, total_ppv_delta, is_new_this_snapshot'
          )
          .eq('recency_rank', 1);
        if (f.position) q = q.eq('chart_position', f.position);
        return q;
      }, ['id']);
      const active = await fetchAll(function () {
        return client.from('contracts').select('id, player_id, team_id').eq('status', 'active');
      }, ['id']);
      const holder = new Map();
      active.forEach(function (c) {
        holder.set(c.player_id, c.team_id);
      });
      return rows
        .map(function (r) {
          const out = Object.assign({}, r, {
            edfl_team: r.player_id ? teamName(ctx, holder.get(r.player_id)) : null,
            _team_id: r.player_id ? holder.get(r.player_id) || null : null,
          });
          delete out.id;
          return out;
        })
        .filter(function (r) {
          return !f.team || r._team_id === f.team;
        })
        .map(function (r) {
          delete r._team_id;
          return r;
        })
        .sort(function (a, b) {
          return (POS_ORDER[a.chart_position] ?? 9) - (POS_ORDER[b.chart_position] ?? 9) || (a.chart_rank || 0) - (b.chart_rank || 0);
        });
    },
  },
  {
    key: 'injury_report',
    group: 'Players and free agency',
    title: 'Injury report',
    about: 'Every player with a current Sleeper injury designation, rostered or not. Reference only: a designation has no effect on the cap or roster counts.',
    filters: ['team', 'position'],
    columns: [
      C('full_name', 'Player'),
      C('position', 'Pos'),
      C('nfl_team', 'NFL team'),
      C('injury_status', 'Designation'),
      C('injury_body_part', 'Body part'),
      C('injury_notes', 'Note'),
      C('injury_start_date', 'Since'),
      C('prev_injury_status', 'Previous designation'),
      C('change_flag', 'Recent change'),
      C('edfl_team', 'EDFL team'),
      C('edfl_roster_status', 'EDFL roster status'),
      C('is_rostered', 'Rostered'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f) {
      const rows = await fetchAll(function () {
        let q = client
          .from('league_injury_report')
          .select(
            'player_id, full_name, position, nfl_team, injury_status, injury_body_part, injury_notes, injury_start_date, prev_injury_status, change_flag, edfl_team_id, edfl_team, edfl_roster_status, is_rostered'
          );
        if (f.team) q = q.eq('edfl_team_id', f.team);
        if (f.position) q = q.eq('position', f.position);
        return q;
      }, ['player_id']);
      return rows
        .map(function (r) {
          const out = Object.assign({}, r);
          delete out.edfl_team_id;
          return out;
        })
        .sort(function (a, b) {
          return (b.is_rostered === true) - (a.is_rostered === true) || String(a.full_name).localeCompare(String(b.full_name));
        });
    },
  },

  // ---- Statistics -------------------------------------------------------------
  {
    key: 'stats_weekly',
    group: 'Statistics',
    title: 'Weekly EDFL scores (current season)',
    about:
      'Each rostered player\'s official EDFL fantasy points by week, as synced from Sleeper and scored under EDFL rules. This is the season in progress; raw stat lines (yards, touchdowns) for it are not stored. Defaults to the current season.',
    filters: ['season', 'team', 'position'],
    defaultSeason: function (ctx) {
      return ctx.season;
    },
    columns: [
      C('season_year', 'Season'),
      C('week_number', 'Week'),
      C('player', 'Player'),
      C('position', 'Pos'),
      C('nfl_team', 'NFL team'),
      C('team', 'EDFL team'),
      C('roster_status_at_sync', 'Roster status', 'Where the player sat when the week was scored; taxi players do not score for the team'),
      C('was_sleeper_starter', 'Sleeper starter', 'Best ball counts the best lineup regardless'),
      C('points', 'EDFL points'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f, ctx) {
      const rows = await fetchAll(function () {
        let q = client
          .from('player_week_scores')
          .select('season_year, week_number, player_id, team_id, points, roster_status_at_sync, was_sleeper_starter');
        if (f.season) q = q.eq('season_year', f.season);
        if (f.team) q = q.eq('team_id', f.team);
        return q;
      }, ['season_year', 'week_number', 'player_id', 'team_id']);
      const pm = await playerMap(
        client,
        rows.map(function (r) {
          return r.player_id;
        })
      );
      return rows
        .map(function (r) {
          const p = pm.get(r.player_id) || {};
          return {
            season_year: r.season_year,
            week_number: r.week_number,
            player: p.full_name || null,
            position: p.position || null,
            nfl_team: p.nfl_team || null,
            team: teamName(ctx, r.team_id),
            roster_status_at_sync: r.roster_status_at_sync,
            was_sleeper_starter: r.was_sleeper_starter,
            points: num(r.points),
            player_id: r.player_id,
          };
        })
        .filter(byPosition(f))
        .sort(function (a, b) {
          return a.week_number - b.week_number || String(a.team).localeCompare(String(b.team)) || (b.points || 0) - (a.points || 0);
        });
    },
  },
  {
    key: 'stats_season',
    group: 'Statistics',
    title: 'Season stats (historic)',
    about:
      'Season totals for every QB/RB/WR/TE/K in the historical stats import, with EDFL fantasy points computed retroactively under league scoring. Covers every completed season that has been imported.',
    filters: ['season', 'position'],
    columns: [
      C('season_year', 'Season'),
      C('full_name', 'Player'),
      C('position', 'Pos'),
      C('games', 'Games'),
      C('fantasy_points', 'EDFL points'),
      C('fppg', 'EDFL pts/game'),
      C('pass_attempts', 'Pass att'),
      C('completions', 'Cmp'),
      C('passing_yards', 'Pass yds'),
      C('passing_tds', 'Pass TD'),
      C('interceptions', 'INT'),
      C('rush_attempts', 'Rush att'),
      C('rushing_yards', 'Rush yds'),
      C('ypc', 'YPC'),
      C('rushing_tds', 'Rush TD'),
      C('targets', 'Tgt'),
      C('receptions', 'Rec'),
      C('receiving_yards', 'Rec yds'),
      C('receiving_tds', 'Rec TD'),
      C('kick_returns', 'KR'),
      C('kick_return_yards', 'KR yds'),
      C('kick_return_tds', 'KR TD'),
      C('punt_returns', 'PR'),
      C('punt_return_yards', 'PR yds'),
      C('punt_return_tds', 'PR TD'),
      C('xp_att', 'XP att'),
      C('xp_made', 'XP made'),
      C('fg_att', 'FG att'),
      C('fg_made', 'FG made'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f) {
      const rows = await fetchAll(function () {
        let q = client.from('edfl_player_season_stats').select('*');
        if (f.season) q = q.eq('season_year', f.season);
        if (f.position) q = q.eq('position', f.position);
        return q;
      }, ['player_id', 'season_year']);
      return rows
        .map(function (r) {
          const out = Object.assign({}, r);
          delete out.last_name;
          return out;
        })
        .sort(function (a, b) {
          return b.season_year - a.season_year || (num(b.fantasy_points) || 0) - (num(a.fantasy_points) || 0);
        });
    },
  },
  {
    key: 'stats_games',
    group: 'Statistics',
    title: 'Game-by-game stats (historic)',
    about:
      'Every player\'s real NFL stat line for every game of one season, with the EDFL fantasy points that game scored. One season per file (about 6,800 rows); defaults to the most recent completed season.',
    filters: ['season', 'position'],
    requiresSeason: true,
    defaultSeason: function (ctx) {
      return ctx.season - 1;
    },
    columns: [
      C('season_year', 'Season'),
      C('week', 'Week'),
      C('season_type', 'Type', 'REG or POST'),
      C('player', 'Player'),
      C('position', 'Pos'),
      C('fantasy_points', 'EDFL points'),
      C('completions', 'Cmp'),
      C('attempts', 'Att'),
      C('passing_yards', 'Pass yds'),
      C('passing_tds', 'Pass TD'),
      C('passing_first_downs', 'Pass 1D'),
      C('passing_2pt_conversions', 'Pass 2PT'),
      C('interceptions_thrown', 'INT'),
      C('times_sacked', 'Sacked'),
      C('carries', 'Car'),
      C('rushing_yards', 'Rush yds'),
      C('rushing_tds', 'Rush TD'),
      C('rushing_first_downs', 'Rush 1D'),
      C('rushing_2pt_conversions', 'Rush 2PT'),
      C('targets', 'Tgt'),
      C('receptions', 'Rec'),
      C('receiving_yards', 'Rec yds'),
      C('receiving_tds', 'Rec TD'),
      C('receiving_first_downs', 'Rec 1D'),
      C('receiving_2pt_conversions', 'Rec 2PT'),
      C('fumbles', 'Fum'),
      C('fumbles_lost', 'Fum lost'),
      C('kick_returns', 'KR'),
      C('kick_return_yards', 'KR yds'),
      C('kick_return_tds', 'KR TD'),
      C('punt_returns', 'PR'),
      C('punt_return_yards', 'PR yds'),
      C('punt_return_tds', 'PR TD'),
      C('fg_made_0_19', 'FG 0-19'),
      C('fg_made_20_29', 'FG 20-29'),
      C('fg_made_30_39', 'FG 30-39'),
      C('fg_made_40_49', 'FG 40-49'),
      C('fg_made_50_59', 'FG 50-59'),
      C('fg_made_60_plus', 'FG 60+'),
      C('fg_missed_0_19', 'FG miss 0-19'),
      C('fg_missed_20_29', 'FG miss 20-29'),
      C('fg_missed_30_39', 'FG miss 30-39'),
      C('fg_missed_40_plus', 'FG miss 40+'),
      C('pat_made', 'XP made'),
      C('pat_missed', 'XP missed'),
      C('game_id', 'Game id'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f) {
      if (!f.season) throw new Error('Choose a season for game-by-game stats.');
      const rows = await fetchAll(function () {
        let q = client.from('edfl_game_fantasy_points').select('*').eq('season_year', f.season);
        if (f.position) q = q.eq('position', f.position);
        return q;
      }, ['player_id', 'game_id']);
      // Names from the season-stats view (same population, already paged),
      // falling back to players for anyone it does not carry.
      const names = new Map();
      const ss = await fetchAll(function () {
        return client.from('edfl_player_season_stats').select('player_id, full_name').eq('season_year', f.season);
      }, ['player_id']);
      ss.forEach(function (s) {
        names.set(s.player_id, s.full_name);
      });
      const missing = rows
        .map(function (r) {
          return r.player_id;
        })
        .filter(function (id) {
          return !names.has(id);
        });
      if (missing.length) {
        const pm = await playerMap(client, missing);
        pm.forEach(function (p, id) {
          names.set(id, p.full_name);
        });
      }
      return rows
        .map(function (r) {
          return Object.assign({ player: names.get(r.player_id) || null }, r);
        })
        .sort(function (a, b) {
          return (
            a.week - b.week ||
            String(a.season_type).localeCompare(String(b.season_type)) ||
            (num(b.fantasy_points) || 0) - (num(a.fantasy_points) || 0)
          );
        });
    },
  },

  // ---- League ---------------------------------------------------------------------
  {
    key: 'standings',
    group: 'League',
    title: 'Standings',
    about: 'The standings table. Counts only weeks the league calls final. Defaults to the current season.',
    filters: ['season'],
    defaultSeason: function (ctx) {
      return ctx.season;
    },
    columns: [
      C('league_rank', 'Rank'),
      C('team_name', 'Team'),
      C('owner_display_name', 'Owner'),
      C('division', 'Division'),
      C('division_rank', 'Div rank'),
      C('games', 'Games'),
      C('wins', 'W'),
      C('losses', 'L'),
      C('ties', 'T'),
      C('win_pct', 'Win %'),
      C('points_for', 'PF'),
      C('points_against', 'PA'),
      C('point_differential', 'Diff'),
      C('points_per_game', 'PF/game'),
      C('streak', 'Streak'),
      C('season_year', 'Season'),
      C('team_id', 'Team id'),
    ],
    load: async function (client, f) {
      const rows = await fetchAll(function () {
        let q = client.from('league_standings').select('*');
        if (f.season) q = q.eq('season_year', f.season);
        return q;
      }, ['season_year', 'team_id']);
      return rows.sort(function (a, b) {
        return b.season_year - a.season_year || (a.league_rank || 99) - (b.league_rank || 99);
      });
    },
  },
  {
    key: 'scoreboard',
    group: 'League',
    title: 'Weekly results',
    about:
      'Every head-to-head matchup by week with both scores. A week that is not final shows the score as of the last sync. Defaults to the current season.',
    filters: ['season', 'team'],
    defaultSeason: function (ctx) {
      return ctx.season;
    },
    columns: [
      C('season_year', 'Season'),
      C('week_number', 'Week'),
      C('week_is_final', 'Final'),
      C('home_team', 'Home'),
      C('home_points', 'Home pts'),
      C('away_team', 'Away'),
      C('away_points', 'Away pts'),
      C('winner', 'Winner', 'Null for an unplayed or tied week'),
      C('margin', 'Margin'),
      C('has_scores', 'Has scores'),
      C('matchup_id', 'Matchup'),
    ],
    load: async function (client, f, ctx) {
      const rows = await fetchAll(function () {
        let q = client
          .from('league_scoreboard')
          .select(
            'season_year, week_number, matchup_id, home_team_id, home_team, home_points, away_team_id, away_team, away_points, has_scores, winner_team_id, margin, week_is_final'
          );
        if (f.season) q = q.eq('season_year', f.season);
        if (f.team) q = q.or('home_team_id.eq.' + f.team + ',away_team_id.eq.' + f.team);
        return q;
      }, ['season_year', 'week_number', 'matchup_id']);
      return rows.map(function (r) {
        return {
          season_year: r.season_year,
          week_number: r.week_number,
          week_is_final: r.week_is_final,
          home_team: r.home_team,
          home_points: num(r.home_points),
          away_team: r.away_team,
          away_points: num(r.away_points),
          winner: teamName(ctx, r.winner_team_id),
          margin: num(r.margin),
          has_scores: r.has_scores,
          matchup_id: r.matchup_id,
        };
      });
    },
  },
  {
    key: 'transactions',
    group: 'League',
    title: 'Transaction log',
    about:
      'The league transaction log: signings, cuts, trades, restructures, roster moves, waivers and poaching, newest first, with the same wording the app shows.',
    filters: ['season', 'team', 'position'],
    columns: [
      C('occurred_at', 'When'),
      C('kind', 'Kind'),
      C('title', 'Title'),
      C('description', 'Description'),
      C('player_name', 'Player'),
      C('player_position', 'Pos'),
      C('team_from', 'From'),
      C('team_to', 'To'),
      C('season_year', 'Season'),
      C('is_admin_action', 'Officer action'),
      C('player_id', 'Player id'),
      C('log_id', 'Log id'),
    ],
    load: async function (client, f) {
      // Paged on log_id: occurred_at is not unique (Database Reference §3).
      const rows = await fetchAll(function () {
        let q = client
          .from('league_transaction_log')
          .select(
            'log_id, occurred_at, kind, title, description, player_id, player_name, player_position, team_from, team_to, season_year, is_admin_action, team_from_id, team_to_id'
          );
        if (f.season) q = q.eq('season_year', f.season);
        if (f.team) q = q.or('team_from_id.eq.' + f.team + ',team_to_id.eq.' + f.team);
        if (f.position) q = q.eq('player_position', f.position);
        return q;
      }, ['log_id']);
      return rows
        .map(function (r) {
          const out = Object.assign({}, r);
          delete out.team_from_id;
          delete out.team_to_id;
          return out;
        })
        .sort(function (a, b) {
          return String(b.occurred_at).localeCompare(String(a.occurred_at)) || String(a.log_id).localeCompare(String(b.log_id));
        });
    },
  },
  {
    key: 'trades',
    group: 'League',
    title: 'Trades',
    about:
      'Every trade the whole league can see (accepted, approved, executed, vetoed or reversed), one row per asset that moved. Drafts and proposals still awaiting the other side are private to their parties and are not included.',
    filters: ['season', 'team', 'position'],
    columns: [
      C('trade_id', 'Trade id'),
      C('status', 'Status'),
      C('season_year', 'Season'),
      C('trade_window', 'Window'),
      C('teams', 'Teams'),
      C('proposed_at', 'Proposed'),
      C('approved_at', 'Approved'),
      C('executed_at', 'Executed'),
      C('reversed_at', 'Reversed'),
      C('asset_type', 'Asset type'),
      C('asset', 'Asset', 'Player name or pick label'),
      C('position', 'Pos'),
      C('from_team', 'From'),
      C('to_team', 'To'),
      C('condition_text', 'Condition'),
      C('note', 'Trade note'),
      C('resolution_reason', 'Resolution reason'),
    ],
    load: async function (client, f, ctx) {
      const trades = await fetchAll(function () {
        let q = client
          .from('trades')
          .select('id, season_year, status, trade_window, note, proposed_at, approved_at, executed_at, reversed_at, resolution_reason')
          .in('status', TRADE_PUBLIC_STATUSES);
        if (f.season) q = q.eq('season_year', f.season);
        return q;
      }, ['id']);
      const ids = trades.map(function (t) {
        return t.id;
      });
      const parties = await fetchIn(client, 'trade_parties', 'id, trade_id, team_id', 'trade_id', ids, function (q) {
        return q.order('id');
      });
      const assets = await fetchIn(
        client,
        'trade_assets',
        'id, trade_id, asset_type, player_id, draft_pick_id, from_team_id, to_team_id, condition_text',
        'trade_id',
        ids,
        function (q) {
          return q.order('id');
        }
      );
      const pm = await playerMap(
        client,
        assets.map(function (a) {
          return a.player_id;
        })
      );
      const picks = await fetchIn(
        client,
        'draft_pick_board',
        'pick_id, pick_label, season_year, round',
        'pick_id',
        assets.map(function (a) {
          return a.draft_pick_id;
        })
      );
      const pickBy = new Map();
      picks.forEach(function (p) {
        pickBy.set(p.pick_id, p);
      });
      const teamsBy = new Map();
      parties.forEach(function (p) {
        if (!teamsBy.has(p.trade_id)) teamsBy.set(p.trade_id, []);
        teamsBy.get(p.trade_id).push(p.team_id);
      });
      const tradeBy = new Map();
      trades.forEach(function (t) {
        tradeBy.set(t.id, t);
      });

      return assets
        .filter(function (a) {
          if (!f.team) return true;
          return (teamsBy.get(a.trade_id) || []).indexOf(f.team) !== -1;
        })
        .map(function (a) {
          const t = tradeBy.get(a.trade_id) || {};
          const p = a.player_id ? pm.get(a.player_id) || {} : {};
          const pk = a.draft_pick_id ? pickBy.get(a.draft_pick_id) : null;
          return {
            trade_id: a.trade_id,
            status: t.status,
            season_year: t.season_year,
            trade_window: t.trade_window,
            teams: (teamsBy.get(a.trade_id) || [])
              .map(function (id) {
                return teamName(ctx, id);
              })
              .sort()
              .join(' / '),
            proposed_at: t.proposed_at,
            approved_at: t.approved_at,
            executed_at: t.executed_at,
            reversed_at: t.reversed_at,
            asset_type: a.asset_type,
            asset: a.asset_type === 'pick' ? (pk ? pk.pick_label || pk.season_year + ' round ' + pk.round : 'Draft pick') : p.full_name || null,
            position: p.position || null,
            from_team: teamName(ctx, a.from_team_id),
            to_team: teamName(ctx, a.to_team_id),
            condition_text: a.condition_text,
            note: t.note,
            resolution_reason: t.resolution_reason,
          };
        })
        .filter(function (r) {
          return !f.position || r.position === f.position;
        })
        .sort(function (a, b) {
          return (
            String(b.executed_at || b.approved_at || b.proposed_at).localeCompare(String(a.executed_at || a.approved_at || a.proposed_at)) ||
            String(a.trade_id).localeCompare(String(b.trade_id)) ||
            String(a.from_team).localeCompare(String(b.from_team))
          );
        });
    },
  },
  {
    key: 'fines',
    group: 'League',
    title: 'Fines',
    about: 'Every fine the league has posted, itemised by team -- the same list as League Finances.',
    filters: ['season', 'team'],
    columns: [
      C('created_at', 'When'),
      C('season_year', 'Season'),
      C('team_name', 'Team'),
      C('fine_amount', 'Amount', 'Owner Cash (EDFL $)'),
      C('fine_kind', 'Kind'),
      C('note', 'Note'),
    ],
    load: async function (client, f) {
      const rows = await fetchAll(function () {
        let q = client.from('league_fines').select('id, season_year, created_at, team_id, team_name, fine_amount, fine_kind, note');
        if (f.season) q = q.eq('season_year', f.season);
        if (f.team) q = q.eq('team_id', f.team);
        return q;
      }, ['id']);
      return rows
        .map(function (r) {
          const out = Object.assign({}, r);
          delete out.id;
          delete out.team_id;
          return out;
        })
        .sort(function (a, b) {
          return String(b.created_at).localeCompare(String(a.created_at));
        });
    },
  },

  // ---- Bids and offers (settled only) ---------------------------------------------
  {
    key: 'auction_results',
    group: 'Bids and offers (settled only)',
    title: 'Auction bids (verified tiers)',
    about:
      'Every bid on a verified Blind Bid Auction tier -- winners, losing bids and passed-over winners, each naming its team, with the full year-by-year shape. Bids on a tier that is open or not yet verified are sealed and never included.',
    filters: ['season', 'team', 'position'],
    columns: [
      C('tier_season', 'Season'),
      C('tier_name', 'Tier'),
      C('player_name', 'Player'),
      C('position', 'Pos'),
      C('team_name', 'Team'),
      C('status', 'Result', 'winner, lost or passed_over'),
      C('is_winner', 'Won'),
      C('total_ppv', 'Total PPV'),
      C('start_year', 'Start'),
      C('total_years', 'Years'),
      C('void_years', 'Void years'),
      C('signing_bonus_total', 'Signing bonus'),
      C('option_bonus_total', 'Option bonuses'),
      C('year_by_year', 'Year by year', 'SB prorated signing bonus, G guaranteed, NG non-guaranteed, RB roster bonus, OB option bonus'),
      C('tier_verified_at', 'Verified at'),
      C('bid_id', 'Bid id'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f) {
      const tiers = await fetchAll(function () {
        let q = client.from('auction_tiers').select('id, season_year, tier_number, name, verified_at').not('verified_at', 'is', null);
        if (f.season) q = q.eq('season_year', f.season);
        return q;
      }, ['id']);
      const tierBy = new Map();
      tiers.forEach(function (t) {
        tierBy.set(t.id, t);
      });
      const tierIds = tiers.map(function (t) {
        return t.id;
      });
      // auction_tier_results filters itself to verified tiers and settled
      // statuses; the tier list above is a second, explicit statement of it.
      const bids = await fetchIn(
        client,
        'auction_tier_results',
        'bid_id, tier_id, player_id, player_name, position, status, is_winner, team_id, team_name, total_ppv, total_years, void_years, signing_bonus_total, start_year, option_bonus_total',
        'tier_id',
        tierIds,
        function (q) {
          if (f.team) q = q.eq('team_id', f.team);
          if (f.position) q = q.eq('position', f.position);
          return q.order('bid_id');
        }
      );
      const years = await fetchIn(
        client,
        'auction_tier_result_years',
        'bid_id, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, roster_bonus, is_void_year, option_bonus',
        'bid_id',
        bids.map(function (b) {
          return b.bid_id;
        }),
        function (q) {
          return q.order('league_season_year');
        }
      );
      const yearsBy = new Map();
      years.forEach(function (y) {
        if (!yearsBy.has(y.bid_id)) yearsBy.set(y.bid_id, []);
        yearsBy.get(y.bid_id).push(y);
      });
      return bids
        .map(function (b) {
          const t = tierBy.get(b.tier_id) || {};
          return {
            tier_season: t.season_year,
            tier_name: t.name || (t.tier_number ? 'Tier ' + t.tier_number : null),
            player_name: b.player_name,
            position: b.position,
            team_name: b.team_name,
            status: b.status,
            is_winner: b.is_winner,
            total_ppv: num(b.total_ppv),
            start_year: b.start_year,
            total_years: b.total_years,
            void_years: b.void_years,
            signing_bonus_total: num(b.signing_bonus_total),
            option_bonus_total: num(b.option_bonus_total),
            year_by_year: yearsText(yearsBy.get(b.bid_id) || []),
            tier_verified_at: t.verified_at,
            bid_id: b.bid_id,
            player_id: b.player_id,
            _tier_number: t.tier_number || 0,
          };
        })
        .sort(function (a, b) {
          return (
            (a.tier_season || 0) - (b.tier_season || 0) ||
            a._tier_number - b._tier_number ||
            String(a.player_name).localeCompare(String(b.player_name)) ||
            (b.total_ppv || 0) - (a.total_ppv || 0)
          );
        })
        .map(function (r) {
          delete r._tier_number;
          return r;
        });
    },
  },
  {
    key: 'fa_results',
    group: 'Bids and offers (settled only)',
    title: 'Free agency and poaching offers (resolved windows)',
    about:
      'Every offer made in an in-season free agency or poaching window that has RESOLVED, each naming its team, with its total PPV, result and year-by-year shape. Offers in an open window are sealed from everyone, the commissioner included, and are never included.',
    filters: ['season', 'team', 'position'],
    columns: [
      C('season_year', 'Season'),
      C('player_name', 'Player'),
      C('position', 'Pos'),
      C('window_kind', 'Window', 'free_agency or poach'),
      C('window_outcome', 'Window outcome', 'awarded, voided, poached, retained_by_bid or retained_on_rookie_contract'),
      C('opened_by', 'Opened by'),
      C('incumbent_team_name', 'Incumbent (poach)'),
      C('opened_at', 'Opened'),
      C('closes_at', 'Closed'),
      C('team_name', 'Offering team'),
      C('offer_status', 'Offer status'),
      C('total_ppv', 'Total PPV'),
      C('contract_type', 'Contract type'),
      C('start_year', 'Start'),
      C('total_years', 'Years'),
      C('void_years', 'Void years'),
      C('signing_bonus_total', 'Signing bonus'),
      C('year_by_year', 'Year by year', 'SB prorated signing bonus, G guaranteed, NG non-guaranteed, RB roster bonus'),
      C('submitted_at', 'Submitted'),
      C('offer_id', 'Offer id'),
      C('window_id', 'Window id'),
      C('player_id', 'Player id'),
    ],
    load: async function (client, f, ctx) {
      // THE "OR RESOLVED" BRANCH OF free_agent_offers' policy, stated here as
      // a filter. A session read would add the caller's own sealed offers; a
      // service-role read would add everybody's. Neither belongs in a
      // league-wide dataset.
      const windows = await fetchAll(function () {
        let q = client
          .from('free_agent_window_board')
          .select('window_id, player_id, player_name, position, season_year, opened_at, closes_at, status, opened_by, window_kind, incumbent_team_name, outcome')
          .eq('status', 'resolved');
        if (f.season) q = q.eq('season_year', f.season);
        if (f.position) q = q.eq('position', f.position);
        return q;
      }, ['window_id']);
      const winBy = new Map();
      windows.forEach(function (w) {
        winBy.set(w.window_id, w);
      });
      const wIds = windows.map(function (w) {
        return w.window_id;
      });
      const offers = await fetchIn(
        client,
        'free_agent_offers',
        'id, window_id, player_id, team_id, contract_type, start_year, total_years, void_years, signing_bonus_total, submitted_at, status',
        'window_id',
        wIds,
        function (q) {
          if (f.team) q = q.eq('team_id', f.team);
          return q.order('id');
        }
      );
      const ppv = await fetchIn(client, 'free_agent_offer_ppv', 'offer_id, total_ppv', 'window_id', wIds, function (q) {
        return q.order('offer_id');
      });
      const ppvBy = new Map();
      ppv.forEach(function (p) {
        ppvBy.set(p.offer_id, p.total_ppv);
      });
      const years = await fetchIn(
        client,
        'free_agent_offer_years',
        'id, offer_id, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, roster_bonus, is_void_year',
        'offer_id',
        offers.map(function (o) {
          return o.id;
        }),
        function (q) {
          return q.order('id');
        }
      );
      const yearsBy = new Map();
      years.forEach(function (y) {
        if (!yearsBy.has(y.offer_id)) yearsBy.set(y.offer_id, []);
        yearsBy.get(y.offer_id).push(y);
      });
      return offers
        .map(function (o) {
          const w = winBy.get(o.window_id) || {};
          return {
            season_year: w.season_year,
            player_name: w.player_name,
            position: w.position,
            window_kind: w.window_kind,
            window_outcome: w.outcome,
            opened_by: w.opened_by,
            incumbent_team_name: w.incumbent_team_name,
            opened_at: w.opened_at,
            closes_at: w.closes_at,
            team_name: teamName(ctx, o.team_id),
            offer_status: o.status,
            total_ppv: num(ppvBy.get(o.id)),
            contract_type: o.contract_type,
            start_year: o.start_year,
            total_years: o.total_years,
            void_years: o.void_years,
            signing_bonus_total: num(o.signing_bonus_total),
            year_by_year: yearsText(yearsBy.get(o.id) || []),
            submitted_at: o.submitted_at,
            offer_id: o.id,
            window_id: o.window_id,
            player_id: o.player_id,
          };
        })
        .sort(function (a, b) {
          return String(b.closes_at).localeCompare(String(a.closes_at)) || String(a.window_id).localeCompare(String(b.window_id)) || (b.total_ppv || 0) - (a.total_ppv || 0);
        });
    },
  },
];

const BY_KEY = new Map();
DATASETS.forEach(function (d) {
  BY_KEY.set(d.key, d);
});

export function getDataset(key) {
  return BY_KEY.get(String(key || '')) || null;
}

export const UNITS_NOTE = UNITS;

/**
 * Loads one dataset. Returns { ok: true, ds, filters, rows, ctx, asOf } or
 * { ok: false, status, message }. Never throws -- both callers turn the
 * refusal into their own response shape.
 */
export async function loadDataset(client, key, rawFilters, ctxIn) {
  const ds = getDataset(key);
  if (!ds) {
    return {
      ok: false,
      status: 404,
      message:
        'Unknown dataset "' +
        key +
        '". Available: ' +
        DATASETS.map(function (d) {
          return d.key;
        }).join(', ') +
        '.',
    };
  }
  try {
    const ctx = ctxIn || (await loadContext(client));
    const nf = normaliseFilters(ds, ctx, rawFilters);
    if (nf.error) return { ok: false, status: 400, message: nf.error };
    if (ds.requiresSeason && !nf.filters.season) {
      return { ok: false, status: 400, message: ds.title + ' needs a season.' };
    }
    const raw = await ds.load(client, nf.filters, ctx);
    // Project every row onto the declared columns, in order. A view that
    // gains a column must not leak it into a file by accident; adding a
    // column to an export is an edit to its `columns` list, on purpose.
    const keys = ds.columns.map(function (c) {
      return c.key;
    });
    const rows = raw.map(function (r) {
      const o = {};
      keys.forEach(function (k) {
        o[k] = cents(r[k] === undefined ? null : r[k]);
      });
      return o;
    });
    return { ok: true, ds: ds, filters: nf.filters, rows: rows, ctx: ctx, asOf: new Date().toISOString() };
  } catch (e) {
    return { ok: false, status: 500, message: 'Could not load ' + ds.title + ': ' + (e && e.message ? e.message : String(e)) };
  }
}

// ---------------------------------------------------------------------------
// Player lookups for the Claude connector. Same rule as the datasets: only
// what every owner sees. The player card itself (/player/[playerId]) reads
// security_invoker views that can differ by viewer; these do not use them.

export async function searchPlayers(client, ctx, query, position) {
  const text = String(query || '').trim();
  if (text.length < 2) return { ok: false, message: 'Give at least two letters of the player\'s name.' };
  let q = client
    .from('players')
    .select('id, full_name, position, nfl_team, status')
    .not('sleeper_player_id', 'is', null)
    .ilike('full_name', '%' + text.replace(/[%_]/g, '') + '%')
    .order('full_name')
    .order('id')
    .limit(25);
  if (position) q = q.eq('position', String(position).toUpperCase());
  else q = q.in('position', POSITIONS);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  const players = data || [];
  const contracts = await fetchIn(
    client,
    'contracts',
    'id, player_id, team_id, contract_type, roster_status',
    'player_id',
    players.map(function (p) {
      return p.id;
    }),
    function (q2) {
      return q2.eq('status', 'active').order('id');
    }
  );
  const by = new Map();
  contracts.forEach(function (c) {
    by.set(c.player_id, c);
  });
  return {
    ok: true,
    rows: players.map(function (p) {
      const c = by.get(p.id);
      return {
        player: p.full_name,
        position: p.position,
        nfl_team: p.nfl_team,
        nfl_status: p.status,
        edfl_team: c ? teamName(ctx, c.team_id) : null,
        contract_type: c ? c.contract_type : null,
        roster_status: c ? c.roster_status : null,
        player_id: p.id,
      };
    }),
  };
}

export async function loadPlayerProfile(client, ctx, playerId) {
  const { data: player, error } = await client
    .from('players')
    .select('id, full_name, position, nfl_team, status, injury_status, injury_body_part, injury_notes')
    .eq('id', playerId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!player) return { ok: false, message: 'No player with that id.' };

  const contracts = await fetchAll(function () {
    return client.from('player_contract_history').select('*').eq('player_id', playerId);
  }, ['contract_id']);
  const activeIds = contracts
    .filter(function (c) {
      return c.contract_status === 'active';
    })
    .map(function (c) {
      return c.contract_id;
    });
  const years = activeIds.length
    ? await fetchIn(
        client,
        'contract_year_computed',
        'id, contract_id, contract_year_number, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, option_bonus, roster_bonus, cap_charge, cash_value, ppv, dead_cap_if_cut, is_void_year',
        'contract_id',
        activeIds,
        function (q) {
          return q.order('league_season_year').order('id');
        }
      )
    : [];
  const seasons = await fetchAll(function () {
    return client.from('edfl_player_season_stats').select('*').eq('player_id', playerId);
  }, ['season_year']);
  const weeks = await fetchAll(function () {
    return client
      .from('player_week_scores')
      .select('season_year, week_number, team_id, points, roster_status_at_sync')
      .eq('player_id', playerId)
      .eq('season_year', ctx.season);
  }, ['week_number', 'team_id']);
  const chart = await fetchAll(function () {
    return client
      .from('player_value_history')
      .select('id, snapshot_label, snapshot_as_of, recency_rank, chart_position, chart_rank, value_tier, per_year_value, likely_years, total_ppv, total_ppv_delta')
      .eq('player_id', playerId);
  }, ['id']);
  const log = await fetchAll(function () {
    return client
      .from('league_transaction_log')
      .select('log_id, occurred_at, kind, title, description, team_from, team_to, season_year')
      .eq('player_id', playerId);
  }, ['log_id']);

  return {
    ok: true,
    player: player,
    contracts: contracts
      .map(function (c) {
        return Object.assign({}, c, c.contract_status === 'active' ? { ended_by: null, ended_at: null } : {});
      })
      .sort(function (a, b) {
        return String(b.created_at).localeCompare(String(a.created_at));
      }),
    years: years.sort(function (a, b) {
      return a.league_season_year - b.league_season_year;
    }),
    seasons: seasons
      .map(function (s) {
        const o = Object.assign({}, s);
        delete o.last_name;
        return o;
      })
      .sort(function (a, b) {
        return a.season_year - b.season_year;
      }),
    weeks: weeks
      .map(function (w) {
        return Object.assign({}, w, { team: teamName(ctx, w.team_id) });
      })
      .sort(function (a, b) {
        return a.week_number - b.week_number;
      }),
    chart: chart.sort(function (a, b) {
      return a.recency_rank - b.recency_rank;
    }),
    log: log.sort(function (a, b) {
      return String(b.occurred_at).localeCompare(String(a.occurred_at));
    }),
  };
}
