// THE CLAUDE CONNECTOR'S TOOLS -- October 5, 2026.
//
// What an owner's Claude can call through /api/mcp. Every tool is read-only
// and every one is a thin layer over lib/dataExports.js: a tool never has a
// query that the Data Center's downloads do not also run, so the connector
// cannot see anything a download cannot.
//
// The route (app/api/mcp/[[...key]]/route.js) owns the protocol and the key;
// this file owns what the tools say. Tool results are TEXT (CSV or Markdown),
// because that is what Claude reads best and it keeps responses small.

import {
  DATASETS,
  POSITIONS,
  UNITS_NOTE,
  getDataset,
  loadDataset,
  resolveTeam,
  searchPlayers,
  loadPlayerProfile,
  cents,
} from './dataExports';
import { toCsv, mdTable, mdDictionary, metaLines } from './dataFormats';
import { formatDateTime } from './formatDate';

export const SERVER_INFO = { name: 'edfl-data', title: 'EDFL Data', version: '1.0.0' };

export const INSTRUCTIONS =
  'Read-only access to the EDFL dynasty fantasy football league (10 teams, run alongside Sleeper). ' +
  'The league app is the system of record for contracts, salary cap and Owner Cash. ' +
  UNITS_NOTE +
  ' Start with league_overview, then list_datasets / get_dataset for tables, get_team for one franchise, and search_players + get_player for one player. ' +
  'Only league-wide data is exposed: sealed bids, open free agency offers, waiver claims and watchlists are never available here. ' +
  'The league rules (cap ceiling, minimum salary, the 30% Rule, Deion Rule) are enforced by the app itself; treat any rule reasoning you do as advisory.';

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const FILTER_PROPS = {
  season: { type: 'integer', description: 'League season year, e.g. 2026. Omit for every season (some datasets default to the current one).' },
  team: { type: 'string', description: 'Team name, abbreviation or id. Omit for every team.' },
  position: { type: 'string', enum: POSITIONS, description: 'Player position. Omit for every position.' },
};

export const TOOLS = [
  {
    name: 'league_overview',
    title: 'League overview',
    description:
      'The league at a glance: current season, the ten teams (name, abbreviation, owner, division), salary cap settings by season, and the current standings. Call this first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'list_datasets',
    title: 'List datasets',
    description:
      'Every dataset available through get_dataset, with what each holds, which filters it accepts, and its columns.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'get_dataset',
    title: 'Get a dataset',
    description:
      'Rows from one dataset (rosters, contracts, contract_years, team_cap, team_cash, draft_picks, free_agents, player_values, injury_report, stats_weekly, stats_season, stats_games, standings, scoreboard, transactions, trades, fines, dead_money, auction_results, fa_results). ' +
      'Returns CSV (default) or a Markdown table, with a header saying what the rows are, the filters applied, and how many rows exist. Page with offset/limit when total_rows exceeds what was returned.',
    inputSchema: {
      type: 'object',
      properties: {
        dataset: {
          type: 'string',
          enum: DATASETS.map(function (d) {
            return d.key;
          }),
          description: 'Dataset key (see list_datasets).',
        },
        season: FILTER_PROPS.season,
        team: FILTER_PROPS.team,
        position: FILTER_PROPS.position,
        offset: { type: 'integer', minimum: 0, description: 'Rows to skip. Default 0.' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Rows to return. Default 250, maximum 1000.' },
        format: { type: 'string', enum: ['csv', 'markdown'], description: 'csv (default, compact) or markdown.' },
      },
      required: ['dataset'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'get_team',
    title: 'Get a team',
    description:
      'One franchise in full: its roster with this season\'s cap/cash/PPV per player, its cap and cash position for every season, its Owner Cash account, its draft picks, and its standings line.',
    inputSchema: {
      type: 'object',
      properties: { team: { type: 'string', description: 'Team name, abbreviation or id.' } },
      required: ['team'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'search_players',
    title: 'Search players',
    description:
      'Find players by name (any part of it). Returns up to 25 matches with NFL team, EDFL team and contract type if rostered, and the player_id to pass to get_player.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'At least two letters of the name.' },
        position: FILTER_PROPS.position,
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'get_player',
    title: 'Get a player',
    description:
      'One player in full: injury status, every EDFL contract (current and past) with lifetime cap and cash, the current contract year by year, historic season stats with EDFL points, this season\'s weekly EDFL scores, Player Value Chart history, and his transaction log. Pass player_id from search_players, or a name that matches exactly one player.',
    inputSchema: {
      type: 'object',
      properties: {
        player_id: { type: 'string', description: 'Player id from search_players.' },
        name: { type: 'string', description: 'Player name, used when player_id is not given.' },
      },
      additionalProperties: false,
    },
    annotations: RO,
  },
];

// ---------------------------------------------------------------------------

function text(t) {
  return { content: [{ type: 'text', text: t }] };
}

function fail(t) {
  return { content: [{ type: 'text', text: t }], isError: true };
}

function table(columns, rows) {
  // A small ad-hoc Markdown table for get_team / get_player sections.
  const ds = {
    columns: columns.map(function (k) {
      return { key: k, label: k, about: '' };
    }),
  };
  const clean = rows.map(function (r) {
    const o = {};
    columns.forEach(function (k) {
      o[k] = cents(r[k] === undefined ? null : r[k]);
    });
    return o;
  });
  return clean.length ? mdTable(ds, clean) : '_None._';
}

async function overview(client, ctx) {
  const [caps, standings] = await Promise.all([
    client.from('league_cap_settings').select('season_year, fantasy_salary_cap, cap_ceiling, is_provisional, in_season_starts_at').order('season_year'),
    loadDataset(client, 'standings', { season: ctx.season }, ctx),
  ]);
  const out = [];
  out.push('# ' + ctx.leagueName);
  out.push('');
  out.push('- As of: ' + formatDateTime(new Date().toISOString()));
  out.push('- Current league season: ' + ctx.season);
  out.push('- ' + UNITS_NOTE);
  out.push('');
  out.push('## Teams');
  out.push('');
  out.push(
    table(
      ['name', 'abbrev', 'owner_display_name', 'division', 'id'],
      ctx.teams
    )
  );
  out.push('');
  out.push('## Salary cap by season');
  out.push('');
  if (caps.error) out.push('_Could not read cap settings: ' + caps.error.message + '_');
  else out.push(table(['season_year', 'fantasy_salary_cap', 'cap_ceiling', 'is_provisional', 'in_season_starts_at'], caps.data || []));
  out.push('');
  out.push('## Standings, ' + ctx.season);
  out.push('');
  if (!standings.ok) out.push('_' + standings.message + '_');
  else
    out.push(
      table(
        ['league_rank', 'team_name', 'wins', 'losses', 'ties', 'points_for', 'points_against', 'streak'],
        standings.rows
      )
    );
  out.push('');
  out.push('Datasets: ' + DATASETS.map(function (d) { return d.key; }).join(', ') + '. Call list_datasets for details.');
  return text(out.join('\n'));
}

function listDatasets() {
  const out = ['# EDFL datasets', '', UNITS_NOTE, ''];
  DATASETS.forEach(function (d) {
    out.push('## `' + d.key + '` -- ' + d.title);
    out.push('');
    out.push(d.about);
    out.push('');
    out.push('Filters: ' + (d.filters.length ? d.filters.join(', ') : 'none') + (d.requiresSeason ? ' (season required; defaults to the latest completed season)' : d.defaultSeason ? ' (season defaults to the current one)' : ''));
    out.push('');
    out.push(mdDictionary(d));
    out.push('');
  });
  return text(out.join('\n'));
}

async function getDatasetTool(client, ctx, args) {
  const ds = getDataset(args.dataset);
  if (!ds) return fail('Unknown dataset "' + args.dataset + '". Call list_datasets.');
  const loaded = await loadDataset(client, ds.key, { season: args.season, team: args.team, position: args.position }, ctx);
  if (!loaded.ok) return fail(loaded.message);
  const total = loaded.rows.length;
  const offset = Math.max(0, parseInt(args.offset, 10) || 0);
  const limit = Math.min(1000, Math.max(1, parseInt(args.limit, 10) || 250));
  const page = loaded.rows.slice(offset, offset + limit);
  const head = metaLines(ds, loaded).concat([
    '- total_rows: ' + total,
    '- returned: rows ' + (page.length ? offset + 1 : 0) + ' to ' + (offset + page.length),
  ]);
  if (offset + page.length < total) head.push('- more: call again with offset ' + (offset + page.length));
  const body = args.format === 'markdown' ? mdTable(ds, page) : toCsv(ds, page);
  return text(head.join('\n') + '\n\n' + body);
}

async function getTeam(client, ctx, args) {
  const t = resolveTeam(ctx, args.team);
  if (t.error) return fail(t.error);
  if (!t.id) return fail('Name a team.');
  const team = ctx.teamById.get(t.id);
  const f = { team: t.id };
  const [roster, cap, cash, picks, standings] = await Promise.all([
    loadDataset(client, 'rosters', f, ctx),
    loadDataset(client, 'team_cap', f, ctx),
    loadDataset(client, 'team_cash', f, ctx),
    loadDataset(client, 'draft_picks', f, ctx),
    loadDataset(client, 'standings', { season: ctx.season }, ctx),
  ]);
  const out = ['# ' + team.name + (team.abbrev ? ' (' + team.abbrev + ')' : ''), ''];
  out.push('- Owner: ' + (team.owner_display_name || 'unknown'));
  out.push('- Division: ' + (team.division ?? 'unknown'));
  out.push('- As of: ' + formatDateTime(new Date().toISOString()));
  out.push('- ' + UNITS_NOTE);
  out.push('');
  function section(title, loaded, cols) {
    out.push('## ' + title);
    out.push('');
    if (!loaded.ok) out.push('_' + loaded.message + '_');
    else out.push(table(cols, loaded.rows));
    out.push('');
  }
  if (standings.ok) {
    const row = standings.rows.filter(function (r) {
      return r.team_id === t.id;
    });
    section('Standings ' + ctx.season, { ok: true, rows: row }, ['league_rank', 'wins', 'losses', 'ties', 'points_for', 'points_against', 'streak', 'division_rank']);
  }
  section('Roster (cap, cash and PPV for ' + ctx.season + ')', roster, [
    'player', 'position', 'nfl_team', 'roster_status', 'contract_type', 'start_year', 'total_years', 'void_years', 'final_season', 'season_cap', 'season_cash', 'season_ppv', 'injury_status', 'player_id',
  ]);
  section('Cap and cash by season', cap, [
    'league_season_year', 'fantasy_salary_cap', 'cap_used', 'cap_space_remaining', 'dead_cap', 'min_required_spend', 'cash_used', 'dead_cash', 'cap_is_provisional',
  ]);
  section('Owner Cash', cash, ['season_year', 'starting_cash', 'total_adjustments', 'cash_spent', 'cash_available']);
  section('Draft picks held', picks, ['season_year', 'pick_label', 'original_team_name', 'player_name']);
  return text(out.join('\n'));
}

async function searchTool(client, ctx, args) {
  const r = await searchPlayers(client, ctx, args.query, args.position);
  if (!r.ok) return fail(r.message);
  if (!r.rows.length) return text('No players match "' + args.query + '".');
  return text(table(['player', 'position', 'nfl_team', 'nfl_status', 'edfl_team', 'contract_type', 'roster_status', 'player_id'], r.rows));
}

async function getPlayer(client, ctx, args) {
  let id = args.player_id ? String(args.player_id) : null;
  if (!id) {
    if (!args.name) return fail('Give a player_id or a name.');
    const r = await searchPlayers(client, ctx, args.name, null);
    if (!r.ok) return fail(r.message);
    const exact = r.rows.filter(function (p) {
      return String(p.player).toLowerCase() === String(args.name).trim().toLowerCase();
    });
    const pick = exact.length === 1 ? exact : r.rows;
    if (pick.length !== 1) {
      if (!pick.length) return fail('No player matches "' + args.name + '".');
      return fail(
        'More than one player matches "' +
          args.name +
          '". Call get_player again with one of these player_ids:\n\n' +
          table(['player', 'position', 'nfl_team', 'edfl_team', 'player_id'], pick)
      );
    }
    id = pick[0].player_id;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('That is not a player_id. Use search_players to find one.');
  const p = await loadPlayerProfile(client, ctx, id);
  if (!p.ok) return fail(p.message);
  const pl = p.player;
  const out = ['# ' + pl.full_name, ''];
  out.push('- Position: ' + (pl.position || 'unknown') + ' · NFL team: ' + (pl.nfl_team || 'none') + ' · NFL status: ' + (pl.status || 'unknown'));
  out.push('- Injury: ' + (pl.injury_status ? pl.injury_status + (pl.injury_body_part ? ' (' + pl.injury_body_part + ')' : '') + (pl.injury_notes ? ' -- ' + pl.injury_notes : '') : 'none'));
  const active = p.contracts.find(function (c) {
    return c.contract_status === 'active';
  });
  out.push('- EDFL: ' + (active ? active.team_name + ', ' + active.contract_type + ', ' + active.roster_status : 'free agent (no active contract)'));
  out.push('- player_id: ' + pl.id);
  out.push('- ' + UNITS_NOTE);
  out.push('');
  out.push('## EDFL contracts');
  out.push('');
  out.push(
    table(
      ['team_name', 'contract_type', 'contract_status', 'start_year', 'total_years', 'void_years', 'signing_bonus_total', 'total_cap', 'total_cash', 'current_season_cap', 'current_season_cash', 'signed_in_tier', 'ended_by', 'ended_at', 'contract_id'],
      p.contracts
    )
  );
  out.push('');
  if (p.years.length) {
    out.push('## Current contract, year by year');
    out.push('');
    out.push(
      table(
        ['league_season_year', 'contract_year_number', 'is_void_year', 'prorated_signing_bonus', 'guaranteed_salary', 'non_guaranteed_salary', 'option_bonus', 'roster_bonus', 'cap_charge', 'cash_value', 'ppv', 'dead_cap_if_cut'],
        p.years
      )
    );
    out.push('');
  }
  out.push('## ' + ctx.season + ' weekly EDFL scores');
  out.push('');
  out.push(table(['week_number', 'team', 'roster_status_at_sync', 'points'], p.weeks));
  out.push('');
  out.push('## Season stats (historic, EDFL scoring)');
  out.push('');
  out.push(
    table(
      ['season_year', 'games', 'fantasy_points', 'fppg', 'passing_yards', 'passing_tds', 'interceptions', 'rushing_yards', 'rushing_tds', 'targets', 'receptions', 'receiving_yards', 'receiving_tds', 'fg_made', 'fg_att', 'xp_made'],
      p.seasons
    )
  );
  out.push('');
  out.push('## Player Value Chart history (published snapshots, newest first)');
  out.push('');
  out.push(table(['snapshot_label', 'snapshot_as_of', 'chart_rank', 'value_tier', 'per_year_value', 'likely_years', 'total_ppv', 'total_ppv_delta'], p.chart));
  out.push('');
  out.push('## Transactions (newest first)');
  out.push('');
  out.push(table(['occurred_at', 'title', 'description', 'team_from', 'team_to'], p.log));
  return text(out.join('\n'));
}

/**
 * Runs one tool. Never throws: a failure is an isError result, which Claude
 * reads and can act on, rather than a protocol error.
 */
export async function callTool(client, ctx, name, args) {
  const a = args || {};
  try {
    if (name === 'league_overview') return await overview(client, ctx);
    if (name === 'list_datasets') return listDatasets();
    if (name === 'get_dataset') return await getDatasetTool(client, ctx, a);
    if (name === 'get_team') return await getTeam(client, ctx, a);
    if (name === 'search_players') return await searchTool(client, ctx, a);
    if (name === 'get_player') return await getPlayer(client, ctx, a);
    return fail('Unknown tool "' + name + '".');
  } catch (e) {
    return fail('The league database could not answer: ' + (e && e.message ? e.message : String(e)));
  }
}

