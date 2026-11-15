import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { nextScheduledWaiverRun, waiverPriorityArgs } from '../../lib/waiverPriority';
import { formatDate, formatShortDateTime, formatKickoff } from '../../lib/formatDate';
import Breadcrumbs from '../../components/Breadcrumbs';
import { RosterFace } from '../team/[teamId]/RosterList';
import PlayersSearch from './PlayersSearch';
import WatchButton from './WatchButton';

// Owner-specific and live (windows, the wire, poach floors) -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Players' };

// THE PLAYERS SCREEN -- UI test batch 11, November 11, 2026.
//
// Lewis's pick on the Claude Design canvas "EDFL Players section (test site) --
// today and layout options" (artifact 83DaMoiCo96pt5Z3XgAtTF): Option A, "Use
// this as the Player tab", with his markup and his answers of November 11:
//   * one list with a switch: Free agents / Waivers / Poachable / All;
//   * the rules behind the (i); search; three market cards; seven position
//     pills; "Remove players on: IR · Injured · Bye" (Injured = Questionable,
//     Doubtful, Out or PUP); sorted by this week's projection by default;
//   * Roster-C rows: face ringed in the position colour, rank coloured by band,
//     this week's game, projection big over 2026 points small; injury pill and
//     tints; no value chart line and no research tiles (Value Chart,
//     Statistics and Draft Prospects stay in League Office's page index);
//   * one labelled button per row: Offer (free agent), Claim (on the wire),
//     Poach (another team's practice squad player). Rostered players get none.
//
// WHAT THE BUTTONS OPEN. The offer sheet drawn on the canvas is ON HOLD for a
// separate contract-building chat, so Offer and Poach open today's forms on
// today's pages, already on that player (/free-agency?offer=<id>,
// /poaching?bid=<id>). Claim opens the claim sheet (/players/claim/<id>, in the
// pop-up sheet), which Lewis approved.
//
// IT DECIDES NOTHING. Every status, action, rank, band, tint, floor, count and
// the order come from edfl_players_rows() and edfl_players_counts() (SECURITY
// DEFINER, `authenticated` only, read with the session client). Every control
// is a plain link that changes the URL; the server reads again. A failed list
// read shows an error and no list (L14).
//
// UI TEST BATCH 17, November 15, 2026 -- Lewis's comments on the same canvas:
//   * no page title and no (i) on the page: "Remove all of these info icons
//     that just explain what the overall page is, owners can figure that out";
//     the big title is redundant with the lit Players button and the trail
//     (an app-wide rule, Lewis: "Yes");
//   * "Move 'All' to the left and make it the default": the switch reads All /
//     Free agents / Waivers / Poachable and /players opens on All;
//   * SORT opens a sheet (?sheet=sort) with this week's projection, season
//     points and eleven season stats (completion %, passing yards, passing TD,
//     interceptions, rushing attempts, rushing yards, rushing TD, fumbles,
//     receptions, targets, receiving TD) and High to low / Low to high, "for
//     the current season or latest season if during the offseason". Snap % has
//     no source in the database and is not drawn. The list read is
//     edfl_players_rows_v2() (test migration players_a_04): the database sorts
//     and returns the chosen stat (sort_value) and its season (stat_season);
//     the row's figure column shows that stat while it is the sort.
//
// UI TEST BATCH 21, November 15, 2026 -- the WATCHLIST icon on every row, in
// every view, for a login with a team (Lewis: "Add a Watchlist icon here on
// every view in this section ... Move the Poach, Claim, Offer pills down to
// make room"; faint with no check by default, the full-colour clipboard with
// the green check once added; a watchlist page comes later). On a phone the
// icon sits above the row's button; on a laptop, to its left. The team's
// watched players are one read, edfl_watchlist_ids(); the toggle is
// app/players/WatchButton.js -> actions.js -> edfl_watchlist_toggle() (test
// migration players_a_05). An advisory read: if it fails, every icon starts
// faint and the list still draws.
//
// UI TEST BATCH 22, November 15, 2026 -- the Watchlist tab (Lewis's Watchlist
// canvas and build brief). Players left the view row for a GM's Office tile,
// so the trail is Home > GM's Office > Players. The clipboard now writes Rule
// 7.9's watchlist_markers (the same functions, re-pointed by test migration
// watchlist_01; a new marker is private) and the Watchlist tab lists what it
// adds. YOUR OWN PLAYERS SHOW NO CLIPBOARD (status 'mine'): the watchlist is
// for players on other rosters and watchlist_set refuses your own. Whether an
// own row should carry a trade-block button instead is Lewis's open question;
// "no clipboard" is the reversible default until he answers.

const VIEWS = [
  { key: 'all', label: 'All', aria: 'All players' },
  { key: 'fa', label: 'Free agents', aria: 'Free agents' },
  { key: 'waivers', label: 'Waivers', aria: 'On the waiver wire' },
  { key: 'poach', label: 'Poachable', aria: 'Poachable players' },
];
// The sort sheet's choices. The keys are edfl_players_rows_v2()'s p_sort
// vocabulary; the database refuses any other by name. `short` labels the
// figure column while the stat is the sort; `pct` draws one decimal and %.
const SORT_GROUPS = [
  {
    title: 'Fantasy',
    items: [
      { key: 'proj', label: 'Week proj' },
      { key: 'pts', label: 'Season pts' },
    ],
  },
  {
    title: 'Passing',
    items: [
      { key: 'cmp_pct', label: 'Comp %', short: 'comp %', pct: true },
      { key: 'pass_yds', label: 'Pass yds', short: 'pass yds' },
      { key: 'pass_td', label: 'Pass TD', short: 'pass TD' },
      { key: 'int', label: 'INT', short: 'INT' },
    ],
  },
  {
    title: 'Rushing',
    items: [
      { key: 'rush_att', label: 'Rush att', short: 'rush att' },
      { key: 'rush_yds', label: 'Rush yds', short: 'rush yds' },
      { key: 'rush_td', label: 'Rush TD', short: 'rush TD' },
    ],
  },
  {
    title: 'Receiving',
    items: [
      { key: 'tgt', label: 'Targets', short: 'targets' },
      { key: 'rec', label: 'Receptions', short: 'rec' },
      { key: 'rec_td', label: 'Rec TD', short: 'rec TD' },
    ],
  },
  {
    title: 'Other',
    items: [{ key: 'fumbles', label: 'Fumbles', short: 'fumbles' }],
  },
];
const SORTS = [];
SORT_GROUPS.forEach(function (g) {
  g.items.forEach(function (i) {
    SORTS.push(i);
  });
});
function sortDef(key) {
  return (
    SORTS.find(function (x) {
      return x.key === key;
    }) || SORTS[0]
  );
}
const PILLS = [
  { key: 'ALL', label: 'All' },
  { key: 'QB', label: 'QB' },
  { key: 'RB', label: 'RB' },
  { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' },
  { key: 'FLEX', label: 'Flex' },
  { key: 'K', label: 'K' },
];
const HIDES = [
  { key: 'ir', label: 'IR' },
  { key: 'inj', label: 'Injured' },
  { key: 'bye', label: 'Bye' },
];
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const TINT = { red: 'rc-warn-red', yellow: 'rc-warn-yel', bye: 'rc-warn-bye' };
const PAGE = 50;
const MAX_SHOWN = 500;
const CHUNK = 200;

function one(v) {
  return Array.isArray(v) ? v[0] : v;
}

// The URL is the state. Unknown values fall back to the defaults here; the
// database refuses anything else by name.
function readState(sp) {
  const view = one(sp.view);
  const pos = one(sp.pos);
  const sort = one(sp.sort);
  const hide = String(one(sp.hide) || '')
    .split(',')
    .filter(function (h) {
      return HIDES.some(function (x) {
        return x.key === h;
      });
    });
  const n = parseInt(one(sp.n), 10);
  const q = String(one(sp.q) || '').trim().slice(0, 60);
  return {
    view: VIEWS.some(function (v) {
      return v.key === view;
    })
      ? view
      : 'all',
    pos: PILLS.some(function (p) {
      return p.key === pos;
    })
      ? pos
      : 'ALL',
    sort: sortDef(sort).key,
    asc: one(sp.dir) === 'asc',
    sheet: one(sp.sheet) === 'sort',
    hide: hide,
    n: Number.isFinite(n) && n > PAGE ? Math.min(Math.ceil(n / PAGE) * PAGE, MAX_SHOWN) : PAGE,
    q: q,
  };
}

function hrefFor(state, change) {
  const s = Object.assign({}, state, change);
  const parts = [];
  if (s.q) parts.push('q=' + encodeURIComponent(s.q));
  if (s.view !== 'all') parts.push('view=' + s.view);
  if (s.pos !== 'ALL') parts.push('pos=' + s.pos);
  if (s.hide.length) parts.push('hide=' + s.hide.join(','));
  if (s.sort !== 'proj') parts.push('sort=' + s.sort);
  if (s.asc) parts.push('dir=asc');
  if (s.n > PAGE) parts.push('n=' + s.n);
  if (s.sheet) parts.push('sheet=sort');
  return '/players' + (parts.length ? '?' + parts.join('&') : '');
}

function toggled(list, key) {
  return list.indexOf(key) >= 0
    ? list.filter(function (k) {
        return k !== key;
      })
    : HIDES.map(function (h) {
        return h.key;
      }).filter(function (k) {
        return k === key || list.indexOf(k) >= 0;
      });
}

function pts(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

// The chosen stat as the database returned it: a whole count, or one decimal
// and % for completion %. Nothing is computed here.
function statText(v, def) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return def.pct ? n.toFixed(1) + '%' : String(Math.round(n));
}

function gameLine(r) {
  if (r.no_team) return 'No NFL team';
  if (r.on_bye) return 'Bye week';
  if (!r.opponent) return null;
  return (
    (r.kickoff_at ? formatKickoff(r.kickoff_at) + ' ' : '') +
    (r.is_away ? '@ ' : '') +
    r.opponent +
    (r.is_neutral ? ' (N)' : '')
  );
}

// Line three of an All row: who holds him, in the database's status words.
function holderLine(r) {
  switch (r.status) {
    case 'free_agent':
      return 'Free agent';
    case 'mine':
      return 'On your roster';
    case 'poachable':
      return r.poach_floor_ppv !== null && r.poach_floor_ppv !== undefined
        ? 'Poachable · floor ' + Number(r.poach_floor_ppv).toFixed(2) + ' PPV'
        : 'Poachable · no floor';
    case 'waivers':
      return 'On waivers' + (r.waived_by_team_name ? ' · waived by ' + r.waived_by_team_name : '');
    case 'waivers_later':
      return (
        'On waivers for the Week ' +
        r.run_week +
        ' run' +
        (r.waived_by_team_name ? ' · waived by ' + r.waived_by_team_name : '')
      );
    case 'rostered':
      return r.holder_team_name || 'On a roster';
    default:
      return r.status || null;
  }
}

const ACTIONS = {
  offer: { label: 'Offer', verb: 'Make an offer on ' },
  claim: { label: 'Claim', verb: 'Place a claim on ' },
  poach: { label: 'Poach', verb: 'Make a bid on ' },
};

function actionHref(r) {
  if (r.action === 'offer') return '/free-agency?offer=' + r.player_id;
  if (r.action === 'poach') return '/poaching?bid=' + r.player_id;
  if (r.action === 'claim' && r.placement_id) return '/players/claim/' + r.placement_id;
  return null;
}

async function readList(supabase, season, state) {
  const rows = [];
  let total = 0;
  for (let offset = 0; offset < state.n; offset += CHUNK) {
    const { data, error } = await supabase.rpc('edfl_players_rows_v2', {
      p_season: season,
      p_view: state.view,
      p_position: state.pos,
      p_hide_ir: state.hide.indexOf('ir') >= 0,
      p_hide_injured: state.hide.indexOf('inj') >= 0,
      p_hide_bye: state.hide.indexOf('bye') >= 0,
      p_search: state.q || null,
      p_sort: state.sort,
      p_limit: Math.min(CHUNK, state.n - offset),
      p_offset: offset,
      p_desc: !state.asc,
    });
    if (error) return { ok: false, message: error.message };
    const got = data || [];
    got.forEach(function (r) {
      rows.push(r);
    });
    if (got.length) total = Number(got[0].total_count) || 0;
    if (got.length < Math.min(CHUNK, state.n - offset)) break;
  }
  return { ok: true, rows: rows, total: total };
}

export default async function PlayersPage({ searchParams }) {
  // READ-ONLY OBSERVER: may read this page. The database gives an observer no
  // buttons (no team, no action), and every write still refuses him.
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/players');

  const state = readState(searchParams || {});
  const supabase = await createSupabaseServerClient();
  const { data: config } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .single();
  const season = config?.current_season_year || 2026;

  const [list, countsRes, runRes] = await Promise.all([
    readList(supabase, season, state),
    supabase.rpc('edfl_players_counts', { p_season: season }),
    nextScheduledWaiverRun(supabase),
  ]);

  // The team's watchlist (batch 21). Only a login with a team keeps one.
  const canWatch = Boolean(viewer.owner && viewer.owner.team_id);
  let watched = new Set();
  if (canWatch) {
    const { data: wl, error: wlErr } = await supabase.rpc('edfl_watchlist_ids');
    if (!wlErr && Array.isArray(wl)) {
      watched = new Set(
        wl.map(function (x) {
          return typeof x === 'string' ? x : x && (x.edfl_watchlist_ids || x.player_id);
        })
      );
    }
  }

  const counts = countsRes.error ? null : (countsRes.data || [])[0] || null;
  const nextRun = runRes.error ? null : runRes.data || null;

  // The owner's seat in the order the run will use (lib/waiverPriority.js, the
  // same call the Waiver Wire page makes). Advisory: a failed read drops the
  // number, never the page.
  let priority = null;
  let myClaimCount = null;
  if (viewer.owner && nextRun) {
    const [{ data: order }, { data: claims, error: claimErr }] = await Promise.all([
      supabase.rpc('waiver_priority_order', waiverPriorityArgs(nextRun)),
      supabase
        .from('waiver_claims')
        .select('id')
        .eq('run_id', nextRun.id)
        .eq('team_id', viewer.owner.team_id)
        .eq('status', 'pending'),
    ]);
    const seat = (order || []).find(function (r) {
      return r.team_id === viewer.owner.team_id;
    });
    if (seat) priority = { rank: seat.priority, of: (order || []).length };
    if (!claimErr) myClaimCount = (claims || []).length;
  }

  const week = counts ? counts.list_week : list.ok && list.rows.length ? list.rows[0].list_week : null;
  const searching = Boolean(state.q);
  const shownView = searching ? 'all' : state.view;

  function countText(c) {
    return c === null || c === undefined ? null : String(c);
  }

  const cards = [
    {
      key: 'fa',
      title: 'Free agency',
      text: counts
        ? counts.fa_windows_open + (counts.fa_windows_open === 1 ? ' window open' : ' windows open')
        : 'Status unknown',
    },
    {
      key: 'waivers',
      title: 'Waiver wire',
      text: counts
        ? counts.waivers_count +
          ' on the wire' +
          (priority ? ' · you are ' + priority.rank + ' of ' + priority.of : '')
        : 'Status unknown',
    },
    {
      key: 'poach',
      title: 'Poaching',
      text: counts
        ? counts.poaching_open
          ? 'Open' + (counts.poaching_closes_at ? ' · closes ' + formatDate(counts.poaching_closes_at) : '')
          : 'Closed'
        : 'Status unknown',
    },
  ];

  const viewCount = {
    waivers: counts ? countText(counts.waivers_count) : null,
    poach: counts ? countText(counts.poachable_count) : null,
  };

  const rows = list.ok ? list.rows : [];
  const total = list.ok ? list.total : 0;
  const sdef = sortDef(state.sort);
  const statSort = Boolean(sdef.short);
  const statSeason = list.ok && rows.length && rows[0].stat_season ? rows[0].stat_season : season;
  const sortLabel =
    (state.sort === 'pts'
      ? season + ' PTS'
      : state.sort === 'proj'
      ? 'WK ' + (week || '') + ' PROJ'
      : sdef.label.toUpperCase() + (statSeason !== season ? ' · ' + statSeason : '')) +
    (state.asc ? ' · LOW TO HIGH' : '');
  const closeHref = hrefFor(state, { sheet: false });

  return (
    <main className="page pl-page">
      <Breadcrumbs trail={[{ label: 'GM’s Office', href: '/gm' }, { label: 'Players' }]} />

      <div className="pl-wrap">
        <aside className="pl-side">
          <PlayersSearch value={state.q} clearHref={hrefFor(state, { q: '', n: PAGE })} />

          <div className="pl-market">
            {cards.map(function (c) {
              return (
                <a key={c.key} className="pl-mcard" href={hrefFor(state, { view: c.key, q: '', n: PAGE })}>
                  <b>
                    <i aria-hidden="true" />
                    {c.title}
                  </b>
                  <span>{c.text}</span>
                </a>
              );
            })}
          </div>
          {countsRes.error ? (
            <div className="form-error">The market status could not be read: {countsRes.error.message}</div>
          ) : null}

          <nav className="pl-seg" aria-label="Show">
            {VIEWS.map(function (v) {
              const on = shownView === v.key;
              const c = viewCount[v.key];
              return (
                <a
                  key={v.key}
                  href={hrefFor(state, { view: v.key, q: '', n: PAGE })}
                  className={on ? 'is-on' : ''}
                  aria-current={on ? 'page' : undefined}
                  aria-label={v.aria + (c !== null && c !== undefined ? ', ' + c : '')}
                >
                  {v.label}
                  {c !== null && c !== undefined ? <span>{c}</span> : null}
                </a>
              );
            })}
          </nav>
        </aside>

        <section className="pl-main">
          <nav className="pl-pills" aria-label="Position">
            {PILLS.map(function (p) {
              const on = state.pos === p.key;
              return (
                <a
                  key={p.key}
                  href={hrefFor(state, { pos: p.key, n: PAGE })}
                  className={'edfl-rr-pill' + (on ? ' is-on' : '')}
                  aria-current={on ? 'true' : undefined}
                >
                  {p.label}
                </a>
              );
            })}
          </nav>

          <nav className="pl-rm" aria-label="Remove players on">
            <span>Remove players on:</span>
            {HIDES.map(function (h) {
              const on = state.hide.indexOf(h.key) >= 0;
              return (
                <a
                  key={h.key}
                  href={hrefFor(state, { hide: toggled(state.hide, h.key), n: PAGE })}
                  className={on ? 'is-on' : ''}
                  aria-pressed={on ? 'true' : 'false'}
                  role="button"
                >
                  {h.label}
                </a>
              );
            })}
          </nav>

          {shownView === 'waivers' && nextRun ? (
            <div className="pl-runcard">
              <div className="pl-eyb">
                Week {nextRun.week_number} run · {formatShortDateTime(nextRun.runs_at)}
              </div>
              <div className="pl-sm">
                {priority ? (
                  <>
                    You are{' '}
                    <b>
                      {priority.rank} of {priority.of}
                    </b>{' '}
                    in priority.{' '}
                  </>
                ) : null}
                Claims are sealed until the run.
              </div>
            </div>
          ) : null}

          {searching ? (
            <p className="pl-searchnote">
              Every player matching &ldquo;{state.q}&rdquo;. <a href={hrefFor(state, { q: '', n: PAGE })}>Clear the search</a>
            </p>
          ) : null}

          <div className="pl-sortbar">
            <a href={hrefFor(state, { sheet: true })} aria-haspopup="dialog">
              SORT · {sortLabel}
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 8l5 5 5-5" />
              </svg>
            </a>
            <span className="pl-colh">
              {statSort ? sdef.label.toUpperCase() + ' · ' + statSeason : 'WK ' + (week || '–') + ' PROJ / ' + season + ' PTS'}
            </span>
          </div>

          {!list.ok ? (
            <div className="form-error">The player list could not be read: {list.message}</div>
          ) : (
            <>
              <div className={'pl-th' + (canWatch ? ' has-watch' : '')} aria-hidden="true">
                <span />
                <span>Player</span>
                <span>{statSort ? sdef.label : 'Wk ' + (week || '–') + ' proj'}</span>
                <span>{statSort ? statSeason : season + ' pts'}</span>
                <span />
              </div>
              <ul className="rc-list pl-list" aria-label={VIEWS.find((v) => v.key === shownView).aria}>
                {rows.map(function (r) {
                  const tint = r.row_tint ? TINT[r.row_tint] || '' : '';
                  const hasInj = Boolean(r.injury_flagged);
                  const posKey = POSITIONS.indexOf(r.player_position) >= 0 ? r.player_position : '';
                  const proj = pts(r.week_proj);
                  const season_ = pts(r.season_points);
                  const game = gameLine(r);
                  const act = r.action ? ACTIONS[r.action] : null;
                  const href = act ? actionHref(r) : null;
                  return (
                    <li
                      key={r.player_id}
                      className={'rc-row pl-row' + (tint ? ' ' + tint : '') + (hasInj ? ' has-inj' : '')}
                    >
                      <a className="rc-rowlink pl-rowlink" href={'/player/' + r.player_id} aria-label={r.full_name}>
                        <span className={'rc-pos pl-pos' + (posKey ? ' is-' + posKey : '')} aria-hidden="true">
                          {r.player_position}
                        </span>
                        <span className={'pl-ring' + (posKey ? ' is-' + posKey : '')}>
                          <RosterFace sleeperId={r.sleeper_player_id} name={r.full_name} />
                        </span>
                        <span className="rc-id">
                          <span className="rc-name" style={{ display: 'block' }}>
                            {r.full_name}
                          </span>
                          <span className="rc-line" style={{ display: 'block' }}>
                            {r.player_position} &bull; {r.nfl_team || 'FA'}
                            {r.bye_week ? ' (' + r.bye_week + ')' : ''}
                            {' · '}
                            {r.pos_rank ? (
                              <span className={'rc-rank is-' + (r.rank_band || 'r')}>
                                {r.rank_position}
                                {r.pos_rank}
                              </span>
                            ) : (
                              'no ' + season + ' pts'
                            )}
                          </span>
                          {shownView === 'poach' ? (
                            <>
                              <span className="rc-line pl-strong" style={{ display: 'block' }}>
                                {r.poach_floor_ppv !== null && r.poach_floor_ppv !== undefined
                                  ? 'Floor ' + Number(r.poach_floor_ppv).toFixed(2) + ' PPV'
                                  : 'No floor'}
                              </span>
                              <span className="rc-line pl-wrapline" style={{ display: 'block' }}>
                                From {r.holder_team_name} · {r.deal_label}
                              </span>
                            </>
                          ) : null}
                          {shownView === 'waivers' ? (
                            <span className="rc-line pl-strong pl-wrapline" style={{ display: 'block' }}>
                              Waived by {r.waived_by_team_name || 'unknown'}
                            </span>
                          ) : null}
                          {shownView === 'all' ? (
                            <span className="rc-line pl-wrapline" style={{ display: 'block' }}>
                              {holderLine(r)}
                            </span>
                          ) : null}
                          {game ? (
                            <span className="rc-line" style={{ display: 'block' }}>
                              {game}
                            </span>
                          ) : null}
                        </span>
                        {statSort ? (
                          <span className="pl-nums">
                            <b>{statText(r.sort_value, sdef) || '–'}</b>
                            <span>{sdef.short}</span>
                          </span>
                        ) : (
                          <span className="pl-nums">
                            <b>{proj || '–'}</b>
                            <span>{season_ ? season_ + ' pts' : 'no pts'}</span>
                          </span>
                        )}
                      </a>
                      <span className={'pl-acts' + (canWatch ? ' has-watch' : '')}>
                        {canWatch && r.status !== 'mine' ? (
                          <WatchButton playerId={r.player_id} name={r.full_name} initial={watched.has(r.player_id)} />
                        ) : canWatch ? (
                          <span className="pl-watch-none" aria-hidden="true" />
                        ) : null}
                        {act && href ? (
                          <a className="pl-act" href={href} aria-label={act.verb + r.full_name}>
                            {act.label}
                          </a>
                        ) : (
                          <span className="pl-act-none" aria-hidden="true" />
                        )}
                      </span>
                      {hasInj ? (
                        <a
                          className={'rc-injpill' + (r.injury_qualifies ? ' is-severe' : '')}
                          href={'/player/' + r.player_id + '/injury'}
                          aria-label={'Injury report: ' + r.full_name + ', ' + (r.injury_status || r.injury_short)}
                        >
                          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                            <path d="M4.6 0.6h2.8v3.2h3.2v2.8H7.4v3.2H4.6V6.6H1.4V3.8h3.2z" fill="currentColor" />
                          </svg>
                          <span>{r.injury_short}</span>
                        </a>
                      ) : null}
                    </li>
                  );
                })}
                {rows.length === 0 ? (
                  <li className="rc-empty">
                    {shownView === 'waivers'
                      ? 'Nobody is on the wire for the next run.'
                      : shownView === 'poach'
                      ? 'Nobody can be poached right now.'
                      : 'No players match.'}
                  </li>
                ) : null}
              </ul>

              {rows.length < total && state.n < MAX_SHOWN ? (
                <a className="pl-more" href={hrefFor(state, { n: state.n + PAGE })}>
                  Show more ({rows.length} of {total})
                </a>
              ) : rows.length < total ? (
                <p className="pl-searchnote">
                  Showing the first {rows.length} of {total}. Narrow the list with the pills or the search.
                </p>
              ) : null}

              {shownView === 'waivers' && viewer.owner ? (
                <a className="pl-more" href="/waivers">
                  Your claims this run{myClaimCount !== null ? ' (' + myClaimCount + ')' : ''}
                </a>
              ) : null}
            </>
          )}
        </section>
      </div>

      {state.sheet ? (
        <>
          <a className="pl-sort-scrim" href={closeHref} aria-label="Close the sort" />
          <section className="pl-sort-sheet" role="dialog" aria-modal="true" aria-labelledby="pl-sort-title">
            <div className="pl-sort-grab" aria-hidden="true">
              <span />
            </div>
            <div className="pl-sort-head">
              <h2 id="pl-sort-title">Sort by</h2>
              <span>{statSeason} season</span>
            </div>
            <div className="pl-sort-body">
              <span className="pl-sort-fl">Order</span>
              <nav className="pl-sort-dir" aria-label="Order">
                <a href={hrefFor(state, { asc: false })} className={!state.asc ? 'is-on' : ''} aria-current={!state.asc ? 'true' : undefined}>
                  High to low
                </a>
                <a href={hrefFor(state, { asc: true })} className={state.asc ? 'is-on' : ''} aria-current={state.asc ? 'true' : undefined}>
                  Low to high
                </a>
              </nav>
              {SORT_GROUPS.map(function (g) {
                return (
                  <div key={g.title}>
                    <span className="pl-sort-fl">{g.title}</span>
                    <nav className="pl-sort-opts" aria-label={g.title}>
                      {g.items.map(function (i) {
                        const on = state.sort === i.key;
                        const label =
                          i.key === 'proj' ? 'Wk ' + (week || '–') + ' proj' : i.key === 'pts' ? season + ' pts' : i.label;
                        return (
                          <a
                            key={i.key}
                            href={hrefFor(state, { sort: i.key, sheet: false, n: PAGE })}
                            className={on ? 'is-on' : ''}
                            aria-current={on ? 'true' : undefined}
                          >
                            {label}
                          </a>
                        );
                      })}
                    </nav>
                  </div>
                );
              })}
            </div>
            <div className="pl-sort-foot">
              <a className="pl-sort-reset" href={hrefFor(state, { sort: 'proj', asc: false, sheet: false, n: PAGE })}>
                Reset
              </a>
              <a className="pl-sort-done" href={closeHref}>
                Done
              </a>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
