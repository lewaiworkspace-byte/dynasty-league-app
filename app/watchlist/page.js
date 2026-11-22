import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { nextScheduledWaiverRun, waiverPriorityArgs } from '../../lib/waiverPriority';
import { formatShortDateTime, formatMonthDay, formatKickoff } from '../../lib/formatDate';
import { formatCost } from '../../lib/formatMoney';
import Breadcrumbs from '../../components/Breadcrumbs';
import TeamDisc from '../../components/TeamDisc';
import PlayersBar, { FiltersTab, FiltersSheet } from '../../components/PlayersBar';
import { RosterFace } from '../team/[teamId]/RosterList';
import { RemoveButton, UndoBar, TierChoices, TierIcon, WatchlistSearch } from './WatchControls';

// Owner-specific and live (the wire, poach floors, who holds whom) -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Watchlist' };

// THE WATCHLIST -- UI test batch 22, November 15, 2026.
//
// Lewis's canvas "EDFL Watchlist (main tab) -- layout options" (artifact
// 3d508129-a249-4a92-9da3-34dcaf203171): the board Combined-390 is the build,
// States-390 the doors, the tier sheet, the Undo bar and the empty state. His
// decisions (build brief, Build Records > EDFL_Watchlist_Build_Brief_2026-11-15):
//   * Watchlist takes Players' place in the view row (Roster · Watchlist ·
//     League · Matchups); Players is a GM's Office tile (navigation.md).
//   * At the top, "Add players to your watchlist" opens Players. Then search
//     ("Search your watchlist"), the status pills All · Trade · Free agents ·
//     Poachable · Waivers (one row, never scrolls sideways, NO counts), the
//     position pills, and the sort bar: "SORT · <label>" on the left and a
//     Filter button on the right.
//   * The sort sheet is the Players tab's, exactly (this week's projection,
//     season points and the eleven stat keys, High to low / Low to high). No
//     extra watchlist sorts. While a stat is the sort, the card's figure shows
//     that stat, as Players does.
//   * The filter sheet: team (the other teams by logo, plus Free agents),
//     contract runs through (Any / this season only / one, two seasons on or
//     sooner / three on or later), and leave out injured or IR.
//   * ACT NOW first (Poachable, Free agents, On waivers, each with a one-line
//     empty state), then TRADE TARGETS. Option C's scout cards for Act now;
//     option A's row with C's year-by-year cap strip for a trade target (A's
//     contract text is dropped). NO PPV anywhere but the poach floor.
//   * A who-sees-it chip on every card opens the tier sheet (WL-2/3/4/5/8).
//     Shared is disabled when there is no owner to share with.
//   * The clipboard removes the player, with an Undo bar that restores him at
//     the same tier.
//
// WHAT THE BUTTONS OPEN (as Players): Trade -> the trade builder with him on
// his team's side (/trades/new?with=<contract>); Make an offer ->
// /free-agency?offer=<id>; Poach -> /poaching?bid=<id> (today's forms; the
// offer sheet waits for the contract-building chat); Claim ->
// /players/claim/<placement>, the pop-up with the 5.15(i) wording; the player
// card -> /player/<id> (the Mini Player Card, through the sheet).
//
// IT DECIDES NOTHING AND COMPUTES NOTHING. One read, edfl_watchlist_rows()
// (SECURITY DEFINER, authenticated only, read with the SESSION client: it
// finds the viewer's team through auth.uid(); test migration watchlist_01),
// returns every row's status, group, action, rank, band, tint, floor, tier,
// cap strip and claim figures, filtered and in order. The page groups the rows
// by the group the database named and never re-sorts them. The viewer's own
// players never come back. The store is Rule 7.9's watchlist_markers. Every
// control is a plain link that changes the URL; the server reads again. A
// failed read shows its error and no list (a content read fails closed); the
// poaching close, the claim order and the team list only inform, so they fail
// open.
//
// UI TEST BATCH 33, November 21, 2026 -- ONE PLAYERS TAB (Lewis's canvas "EDFL
// compact top bar options", page "Round 3", Option 6). The Watchlist is a
// source of the Players tab: its search, status pills, position pills, Sort /
// Filter row and "Add players" button are components/PlayersBar.js's (the filter
// line, the title line with the view menu, search, "+" and sort, and the
// Filters tab). The Filters sheet (?sheet=filters; ?sheet=filter still opens it)
// holds what the old Filter sheet held (team, contract runs through, leave out
// injured), plus which list to show. The cards below are unchanged: Act now
// first, then Trade targets, and the who-sees-it sheet.

const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'trade', label: 'Trade' },
  { key: 'fa', label: 'Free agents' },
  { key: 'poach', label: 'Poachable' },
  { key: 'waivers', label: 'Waivers' },
];
const PILLS = [
  { key: 'ALL', label: 'All' },
  { key: 'QB', label: 'QB' },
  { key: 'RB', label: 'RB' },
  { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' },
  { key: 'FLEX', label: 'Flex' },
  { key: 'K', label: 'K' },
];
// The Players tab's sort sheet, key for key (app/players/page.js). The keys are
// edfl_players_rows_v3()'s p_sort vocabulary; the database refuses any other.
const SORT_GROUPS = [
  { title: 'Fantasy', items: [{ key: 'proj', label: 'Week proj' }, { key: 'pts', label: 'Season pts' }] },
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
  { title: 'Other', items: [{ key: 'fumbles', label: 'Fumbles', short: 'fumbles' }] },
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
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const TINT = { red: 'rc-warn-red', yellow: 'rc-warn-yel', bye: 'rc-warn-bye' };
const CARD_TINT = { red: 'is-red', yellow: 'is-yel', bye: 'is-bye' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(v) {
  return Array.isArray(v) ? v[0] : v;
}

// "Contract runs through": the seasons come from league_config, never a
// literal year (ui-patterns.md).
function thruOptions(season) {
  return [
    { key: 'any', label: 'Any' },
    { key: String(season), label: season + ' only', max: season },
    { key: String(season + 1), label: season + 1 + ' or sooner', max: season + 1 },
    { key: String(season + 2), label: season + 2 + ' or sooner', max: season + 2 },
    { key: season + 3 + '-up', label: season + 3 + ' or later', min: season + 3 },
  ];
}

function readState(sp, season) {
  const view = one(sp.view);
  const pos = one(sp.pos);
  const sheet = one(sp.sheet);
  const thru = String(one(sp.thru) || 'any');
  const team = String(one(sp.team) || '')
    .trim()
    .toUpperCase()
    .slice(0, 5);
  const p = String(one(sp.p) || '');
  return {
    view: VIEWS.some(function (v) {
      return v.key === view;
    })
      ? view
      : 'all',
    pos: PILLS.some(function (x) {
      return x.key === pos;
    })
      ? pos
      : 'ALL',
    sort: sortDef(one(sp.sort)).key,
    asc: one(sp.dir) === 'asc',
    team: /^[A-Z0-9]{2,5}$/.test(team) ? team : '',
    thru: thruOptions(season).some(function (t) {
      return t.key === thru;
    })
      ? thru
      : 'any',
    noinj: one(sp.noinj) === '1',
    q: String(one(sp.q) || '')
      .trim()
      .slice(0, 60),
    sheet: sheet === 'sort' || sheet === 'tier' ? sheet : sheet === 'filters' || sheet === 'filter' ? 'filters' : '',
    find: one(sp.find) === '1',
    p: UUID.test(p) ? p : '',
  };
}

function query(s, opts) {
  const parts = [];
  if (!(opts && opts.noQ) && s.q) parts.push('q=' + encodeURIComponent(s.q));
  if (s.view !== 'all') parts.push('view=' + s.view);
  if (s.pos !== 'ALL') parts.push('pos=' + s.pos);
  if (s.sort !== 'proj') parts.push('sort=' + s.sort);
  if (s.asc) parts.push('dir=asc');
  if (s.team) parts.push('team=' + s.team);
  if (s.thru !== 'any') parts.push('thru=' + s.thru);
  if (s.noinj) parts.push('noinj=1');
  if (s.find) parts.push('find=1');
  if (s.sheet) parts.push('sheet=' + s.sheet);
  if (s.sheet === 'tier' && s.p) parts.push('p=' + s.p);
  return parts.join('&');
}

function hrefFor(state, change) {
  const s = Object.assign({}, state, change);
  const q = query(s);
  return '/watchlist' + (q ? '?' + q : '');
}

function pts(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

// The chosen stat as the database returned it: a whole count, or one decimal
// and % for completion % (as Players). Nothing is computed here.
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

function tierLabel(r) {
  const t = r.effective_visibility || r.visibility;
  if (t === 'league') return 'League';
  if (t === 'shared') return 'Shared with ' + (r.shared_with_team_abbrev || 'his owner');
  return 'Private';
}

function PosLine({ r, season }) {
  return (
    <>
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
    </>
  );
}

function Face({ r }) {
  const posKey = POSITIONS.indexOf(r.player_position) >= 0 ? r.player_position : '';
  return (
    <span className={'pl-ring' + (posKey ? ' is-' + posKey : '')}>
      <RosterFace sleeperId={r.sleeper_player_id} name={r.full_name} />
    </span>
  );
}

function TierRow({ r, state }) {
  const t = r.effective_visibility || r.visibility || 'private';
  const label = tierLabel(r);
  return (
    <div className="wl-cf">
      <a
        className={'wl-tier is-' + t}
        href={hrefFor(state, { sheet: 'tier', p: r.player_id })}
        aria-haspopup="dialog"
        aria-label={'Who sees this: ' + label + '. Change'}
        data-sheet="off"
      >
        <TierIcon tier={t} />
        {label}
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 8l5 5 5-5" />
        </svg>
      </a>
      <span className="wl-added">Added {formatMonthDay(r.watched_at)}</span>
    </div>
  );
}

function Tiles({ r, sdef, statSort, week, season }) {
  return (
    <div className="wl-tiles">
      <div>
        <span>{statSort ? sdef.label : 'Wk ' + (week || '–') + ' proj'}</span>
        <b>{(statSort ? statText(r.sort_value, sdef) : pts(r.week_proj)) || '–'}</b>
      </div>
      <div>
        <span>{season} pts</span>
        <b>{pts(r.season_points) || '–'}</b>
      </div>
    </div>
  );
}

// An Act now card: Poachable, Free agent or On waivers (option C's scout card).
function ActCard({ r, state, sdef, statSort, week, season, poachCloses, claimOrder }) {
  const tint = r.row_tint ? CARD_TINT[r.row_tint] || '' : '';
  const isPoach = r.watch_group === 'poach';
  const isFa = r.watch_group === 'fa';
  const isClaim = r.watch_group === 'waivers';
  const actHref =
    r.action === 'poach'
      ? '/poaching?bid=' + r.player_id
      : r.action === 'offer'
      ? '/free-agency?offer=' + r.player_id
      : r.action === 'claim' && r.placement_id
      ? '/players/claim/' + r.placement_id
      : null;
  const actLabel = isPoach ? 'Poach' : isFa ? 'Make an offer' : 'Claim';
  const bonus = r.signing_bonus_total;
  return (
    <article className={'wl-card wl-act' + (tint ? ' ' + tint : '')} data-wl-card="">
      <header className="wl-head">
        <Face r={r} />
        <div className="wl-id">
          <a className="wl-nm" href={'/player/' + r.player_id}>
            {r.full_name}
          </a>
          <div className="wl-ln">
            <PosLine r={r} season={season} />
            {r.injury_flagged ? <span className={'wl-ij' + (r.injury_qualifies ? ' is-severe' : '')}>{r.injury_short}</span> : null}
          </div>
          <div className="wl-who">
            {isPoach ? (
              <>
                <TeamDisc className="wl-disc" abbrev={r.holder_team_abbrev} />
                <span>
                  {r.holder_team_name} · {r.deal_label}
                </span>
              </>
            ) : null}
            {isFa ? <span>Free agent · no contract</span> : null}
            {isClaim ? (
              <>
                <TeamDisc className="wl-disc" abbrev={r.waived_by_team_abbrev} />
                <span>On waivers · waived by {r.waived_by_team_name || 'unknown'}</span>
              </>
            ) : null}
          </div>
        </div>
        <RemoveButton playerId={r.player_id} name={r.full_name} />
      </header>
      <Tiles r={r} sdef={sdef} statSort={statSort} week={week} season={season} />
      {isPoach ? (
        <div className="wl-pz">
          <div>
            <span className="wl-eyb">Poach floor</span>
            {r.poach_floor_ppv !== null && r.poach_floor_ppv !== undefined ? (
              <b className="v-ppv">
                {Number(r.poach_floor_ppv).toFixed(2)} <i>PPV</i>
              </b>
            ) : (
              <b>No floor</b>
            )}
          </div>
          {poachCloses ? (
            <div className="wl-pzwhen">
              Poaching closes
              <br />
              {formatShortDateTime(poachCloses)}
            </div>
          ) : null}
        </div>
      ) : null}
      {isClaim ? (
        <div className="wl-wz">
          <div className="wl-two">
            <div>
              <span>{(r.claim_season || season) + ' salary you’d take on'}</span>
              <b className="v-cap">{r.claim_season_total !== null && r.claim_season_total !== undefined ? formatCost(r.claim_season_total) : '–'}</b>
            </div>
            <div>
              <span>
                {bonus !== null && bonus !== undefined && Number(bonus) !== 0
                  ? 'His ' + formatCost(bonus) + ' signing bonus stays with ' + (r.waived_by_team_name || 'his old team')
                  : 'He has no signing bonus to leave behind'}
              </span>
            </div>
          </div>
          <div className="wl-run">
            Wire runs {formatShortDateTime(r.claim_run_at)}
            {claimOrder ? ' · you are ' + claimOrder.rank + ' of ' + claimOrder.of : ''}
          </div>
        </div>
      ) : null}
      <TierRow r={r} state={state} />
      <div className="wl-ab">
        {actHref ? (
          <a className="wl-go" href={actHref}>
            {actLabel}
          </a>
        ) : (
          <span className="wl-go-none">{isClaim ? 'On a later run' : ''}</span>
        )}
        <a className="wl-pc" href={'/player/' + r.player_id}>
          Player card
        </a>
      </div>
    </article>
  );
}

// A trade target: option A's row (no contract text) and C's cap strip.
function TradeCard({ r, state, sdef, statSort, season }) {
  const tint = r.row_tint ? TINT[r.row_tint] || '' : '';
  const hasInj = Boolean(r.injury_flagged);
  const game = gameLine(r);
  const proj = pts(r.week_proj);
  const sp = pts(r.season_points);
  const years = Array.isArray(r.cap_years) ? r.cap_years : [];
  return (
    <article className="wl-card wl-trade" data-wl-card="">
      <div className={'rc-row pl-row wl-trow' + (tint ? ' ' + tint : '') + (hasInj ? ' has-inj' : '')}>
        <a className="rc-rowlink pl-rowlink" href={'/player/' + r.player_id} aria-label={r.full_name}>
          <Face r={r} />
          <span className="rc-id">
            <span className="rc-name" style={{ display: 'block' }}>
              {r.full_name}
            </span>
            <span className="rc-line" style={{ display: 'block' }}>
              <PosLine r={r} season={season} />
            </span>
            <span className="rc-line pl-strong pl-wrapline" style={{ display: 'block' }}>
              {r.holder_team_name}
            </span>
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
              <span>{sp ? sp + ' pts' : 'no pts'}</span>
            </span>
          )}
        </a>
        <span className="pl-acts has-watch wl-tacts">
          <RemoveButton playerId={r.player_id} name={r.full_name} />
          {r.contract_id ? (
            <a className="pl-act" href={'/trades/new?with=' + r.contract_id} aria-label={'Trade for ' + r.full_name}>
              Trade
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
      </div>
      <div className="wl-cin">
        <div className="wl-ys" aria-label="Cap charge by season">
          {years.map(function (y) {
            const has = y.cap_charge !== null && y.cap_charge !== undefined;
            return (
              <div key={y.season} className={'wl-yc' + (has ? '' : ' is-none')}>
                <span>{y.season}</span>
                <b>{has ? formatCost(y.cap_charge) : '—'}</b>
              </div>
            );
          })}
        </div>
        <TierRow r={r} state={state} />
      </div>
    </article>
  );
}

export default async function WatchlistPage({ searchParams }) {
  // READ-ONLY OBSERVER: may open the page; he keeps no watchlist (no team), so
  // the database returns him no rows and he is told why.
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/watchlist');

  const supabase = await createSupabaseServerClient();
  const { data: config } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .single();
  const season = config?.current_season_year || 2026;
  const state = readState(searchParams || {}, season);
  const thru = thruOptions(season).find(function (t) {
    return t.key === state.thru;
  });
  const myTeamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  if (!myTeamId) {
    return (
      <main className="page wl-page">
        <Breadcrumbs trail={[{ label: 'Watchlist' }]} />
        <p className="empty-note">Only a team owner keeps a watchlist. This login is not linked to a team.</p>
        <a className="wl-addp" href="/players">
          Open Players
        </a>
      </main>
    );
  }

  const [listRes, countsRes, runRes, teamsRes] = await Promise.all([
    supabase.rpc('edfl_watchlist_rows', {
      p_season: season,
      p_view: state.view,
      p_position: state.pos,
      p_team: state.team || null,
      p_thru_max: thru && thru.max ? thru.max : null,
      p_thru_min: thru && thru.min ? thru.min : null,
      p_hide_injured: state.noinj,
      p_search: state.q || null,
      p_sort: state.sort,
      p_desc: !state.asc,
    }),
    supabase.rpc('edfl_players_counts', { p_season: season }),
    nextScheduledWaiverRun(supabase),
    supabase.from('teams').select('id, name, abbrev').order('abbrev'),
  ]);

  const rows = listRes.error ? [] : listRes.data || [];
  const counts = countsRes.error ? null : (countsRes.data || [])[0] || null;
  const nextRun = runRes.error ? null : runRes.data || null;
  const teams = teamsRes.error ? [] : teamsRes.data || [];
  const myTeam = teams.find(function (t) {
    return t.id === myTeamId;
  });
  const myName = myTeam ? myTeam.name : 'your team';

  // The owner's seat in the claim order the next run will use (the same call
  // Players and the Waiver Wire make). Advisory: a failed read drops it.
  let claimOrder = null;
  if (
    nextRun &&
    rows.some(function (r) {
      return r.watch_group === 'waivers';
    })
  ) {
    const { data: order } = await supabase.rpc('waiver_priority_order', waiverPriorityArgs(nextRun));
    const seat = (order || []).find(function (o) {
      return o.team_id === myTeamId;
    });
    if (seat) claimOrder = { rank: seat.priority, of: (order || []).length };
  }

  const week = counts ? counts.list_week : rows.length ? rows[0].list_week : null;
  const sdef = sortDef(state.sort);
  const statSort = Boolean(sdef.short);
  const statSeason = rows.length && rows[0].stat_season ? rows[0].stat_season : season;
  const filterCount = (state.team ? 1 : 0) + (state.thru !== 'any' ? 1 : 0) + (state.noinj ? 1 : 0);
  const narrowed = filterCount > 0 || state.q || state.pos !== 'ALL' || state.view !== 'all';
  const closeHref = hrefFor(state, { sheet: '', p: '' });
  const otherTeams = teams.filter(function (t) {
    return t.id !== myTeamId;
  });

  // THE PLAYERS TAB'S CONTROLS (batch 33): wording and links only.
  const viewLabel = VIEWS.find(function (v) {
    return v.key === state.view;
  }).label;
  const sortShort = state.sort === 'proj' ? 'Proj' : state.sort === 'pts' ? 'Pts' : sdef.label;
  const posChips = PILLS.filter(function (x) {
    return x.key !== 'ALL';
  }).map(function (x) {
    const on = state.pos === x.key;
    return { key: x.key, label: x.label, on: on, aria: x.label, href: hrefFor(state, { pos: on ? 'ALL' : x.key }) };
  });
  const searchOpen = state.find || Boolean(state.q);
  const filterGroups = [
    {
      title: 'Show',
      cols: 1,
      items: [
        { key: 'roster', label: 'My roster', href: '/team/' + myTeamId + '?tab=roster' },
        { key: 'watch', label: 'Watchlist', on: true, href: hrefFor(state, { sheet: '' }) },
        { key: 'all', label: 'All players', href: '/players' },
        { key: 'fa', label: 'Free agents', href: '/players?view=fa' },
        { key: 'waivers', label: 'Waivers', href: '/players?view=waivers' },
        { key: 'poach', label: 'Poachable', href: '/players?view=poach' },
      ],
    },
    {
      title: 'Of the players you watch',
      cols: 3,
      items: VIEWS.map(function (v) {
        return { key: v.key, label: v.label, on: state.view === v.key, href: hrefFor(state, { view: v.key, sheet: 'filters' }) };
      }),
    },
    {
      title: 'Team: who holds him now',
      cols: 3,
      items: otherTeams
        .map(function (t) {
          const on = state.team === t.abbrev;
          return { key: t.id, label: t.abbrev, aria: t.name, on: on, href: hrefFor(state, { team: on ? '' : t.abbrev, sheet: 'filters' }) };
        })
        .concat([
          {
            key: 'FA',
            label: 'Free agents',
            on: state.team === 'FA',
            href: hrefFor(state, { team: state.team === 'FA' ? '' : 'FA', sheet: 'filters' }),
          },
        ]),
    },
    {
      title: 'Contract runs through',
      cols: 3,
      items: thruOptions(season).map(function (t) {
        return { key: t.key, label: t.label, on: state.thru === t.key, href: hrefFor(state, { thru: t.key, sheet: 'filters' }) };
      }),
    },
    {
      title: 'Leave out',
      cols: 3,
      items: [{ key: 'noinj', label: 'Injured or on IR', on: state.noinj, href: hrefFor(state, { noinj: !state.noinj, sheet: 'filters' }) }],
    },
  ];

  function group(key) {
    return rows.filter(function (r) {
      return r.watch_group === key;
    });
  }
  const poach = group('poach');
  const fa = group('fa');
  const wire = group('waivers');
  const trade = group('trade');
  const actN = poach.length + fa.length + wire.length;
  const showAct = state.view !== 'trade';
  const actGroups = [
    { key: 'poach', title: 'Poachable', items: poach, empty: 'Nobody you’re watching is poachable.' },
    { key: 'fa', title: 'Free agents', items: fa, empty: 'Nobody you’re watching is a free agent.' },
    { key: 'waivers', title: 'On waivers', items: wire, empty: 'Nobody you’re watching is on the wire.' },
  ].filter(function (g) {
    return state.view === 'all' || state.view === g.key;
  });
  const poachCloses = counts && counts.poaching_open ? counts.poaching_closes_at : null;
  const cardProps = { state: state, sdef: sdef, statSort: statSort, week: week, season: season };
  const tierRow =
    state.sheet === 'tier' && state.p
      ? rows.find(function (r) {
          return r.player_id === state.p;
        }) || null
      : null;

  return (
    <main className="page wl-page pb-page">
      <Breadcrumbs trail={[{ label: 'Watchlist' }]} />

      <PlayersBar
        source="watch"
        roster={{ href: '/team/' + myTeamId + '?tab=roster' }}
        watch={{ href: hrefFor(state, { view: 'all', pos: 'ALL', team: '', thru: 'any', noinj: false, q: '', find: false, sheet: '' }) }}
        positions={posChips}
        title={{
          label: 'Watchlist',
          count: (listRes.error ? viewLabel : viewLabel + ' · ' + rows.length),
          menu: VIEWS.map(function (v) {
            return { key: v.key, label: v.label, on: state.view === v.key, href: hrefFor(state, { view: v.key }) };
          }),
        }}
        search={{ href: hrefFor(state, searchOpen ? { q: '', find: false } : { find: true }), on: searchOpen }}
        add={{ href: '/players?find=1' }}
        sort={{ label: sortShort, href: hrefFor(state, { sheet: 'sort' }) }}
      />

      {searchOpen ? (
        <div className="pb-find">
          <WatchlistSearch value={state.q} base={query(Object.assign({}, state, { sheet: '' }), { noQ: true })} />
        </div>
      ) : null}

      {listRes.error ? (
        <div className="form-error">Your watchlist could not be read: {listRes.error.message}</div>
      ) : rows.length === 0 && !narrowed ? (
        <div className="wl-emp">
          <img src="/brand/watchlist-off.webp" width="56" height="56" alt="" />
          <b>Nobody on your watchlist yet</b>
          <p>Tap the clipboard on any player in Players and he’ll show up here with the right button.</p>
          <a href="/players">Add players to your watchlist</a>
        </div>
      ) : rows.length === 0 ? (
        <div className="wl-nobody wl-none">
          Nobody on your watchlist matches these filters.{' '}
          <a href="/watchlist">Clear filters</a>
        </div>
      ) : (
        <>
          {showAct ? (
            <section aria-label="Act now">
              <h2 className="wl-big">
                Act now <span>{actN === 1 ? '1 player' : actN + ' players'}</span>
              </h2>
              {actGroups.map(function (g) {
                return (
                  <div key={g.key}>
                    <h3 className="wl-eyb2">{g.title}</h3>
                    {g.items.length === 0 ? <div className="wl-nobody">{g.empty}</div> : null}
                    {g.items.map(function (r) {
                      return (
                        <ActCard
                          key={r.player_id}
                          r={r}
                          {...cardProps}
                          poachCloses={poachCloses}
                          claimOrder={claimOrder}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </section>
          ) : null}
          {trade.length ? (
            <section aria-label="Trade targets">
              <h2 className="wl-big">
                Trade targets <span>{trade.length === 1 ? '1 player' : trade.length + ' players'}</span>
              </h2>
              {trade.map(function (r) {
                return <TradeCard key={r.player_id} r={r} {...cardProps} />;
              })}
            </section>
          ) : state.view === 'trade' ? (
            <div className="wl-nobody wl-none">Nobody you’re watching is on another roster.</div>
          ) : null}
        </>
      )}

      {countsRes.error ? (
        <p className="pl-searchnote">When poaching closes could not be read: {countsRes.error.message}</p>
      ) : null}

      <UndoBar />

      {state.sheet === 'sort' ? (
        <>
          <a className="pl-sort-scrim" href={closeHref} aria-label="Close the sort" />
          <section className="pl-sort-sheet" role="dialog" aria-modal="true" aria-labelledby="wl-sort-title">
            <div className="pl-sort-grab" aria-hidden="true">
              <span />
            </div>
            <div className="pl-sort-head">
              <h2 id="wl-sort-title">Sort by</h2>
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
                        const label = i.key === 'proj' ? 'Wk ' + (week || '–') + ' proj' : i.key === 'pts' ? season + ' pts' : i.label;
                        return (
                          <a key={i.key} href={hrefFor(state, { sort: i.key, sheet: '' })} className={on ? 'is-on' : ''} aria-current={on ? 'true' : undefined}>
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
              <a className="pl-sort-reset" href={hrefFor(state, { sort: 'proj', asc: false, sheet: '' })}>
                Reset
              </a>
              <a className="pl-sort-done" href={closeHref}>
                Done
              </a>
            </div>
          </section>
        </>
      ) : null}

      {state.sheet === 'filters' ? (
        <FiltersSheet
          closeHref={closeHref}
          groups={filterGroups}
          reset={hrefFor(state, { team: '', thru: 'any', noinj: false, sheet: 'filters' })}
          doneLabel={listRes.error ? 'Done' : 'Show ' + rows.length + (rows.length === 1 ? ' player' : ' players')}
        />
      ) : state.sheet === '' ? (
        <FiltersTab href={hrefFor(state, { sheet: 'filters' })} count={filterCount || null} />
      ) : null}

      {tierRow ? (
        <>
          <a className="pl-sort-scrim" href={closeHref} aria-label="Close" />
          <section className="pl-sort-sheet" role="dialog" aria-modal="true" aria-labelledby="wl-tier-title">
            <div className="pl-sort-grab" aria-hidden="true">
              <span />
            </div>
            <div className="pl-sort-head">
              <h2 id="wl-tier-title">Who sees you’re watching {tierRow.full_name}?</h2>
            </div>
            <div className="pl-sort-body">
              <TierChoices
                playerId={tierRow.player_id}
                current={tierRow.effective_visibility || tierRow.visibility || 'private'}
                closeHref={closeHref}
                options={[
                  {
                    key: 'private',
                    label: 'Private',
                    desc: 'Your name is not shown to anyone. It still counts in league-wide interest, and a sharp owner may guess.',
                  },
                  tierRow.holder_team_id
                    ? {
                        key: 'shared',
                        label: 'Shared with ' + tierRow.holder_team_name,
                        desc:
                          tierRow.holder_team_name +
                          ' sees that ' +
                          myName +
                          ' is watching him. If he changes teams, this goes back to private.',
                      }
                    : {
                        key: 'shared',
                        label: 'Shared with his owner',
                        desc:
                          tierRow.watch_group === 'waivers'
                            ? 'He’s on waivers, so there’s no owner to share with.'
                            : 'He’s a free agent, so there’s no owner to share with.',
                        disabled: true,
                      },
                  { key: 'league', label: 'League', desc: 'Every owner sees that ' + myName + ' is watching him.' },
                ]}
              />
              <p className="wl-fine">
                You can change this any time. Changes count from now on: anyone who already saw that you were watching has seen it.
              </p>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
