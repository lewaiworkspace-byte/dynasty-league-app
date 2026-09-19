'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  searchFreeAgents,
  previewWindow,
  resolveWindow,
} from './actions';
import { formatCost, formatRoom } from '../../lib/formatMoney';
import { formatDate, formatShortDateTime } from '../../lib/formatDate';
import PlayerLink from '../../components/PlayerLink';
import OfferForm from '../../components/OfferForm';
import { supabase } from '../../lib/supabaseClient';
import {
  POOL_GENERATED_LABEL,
  POOL_CHART_LABEL,
  POOL_PRODUCTION_SEASON,
  POOL_POSITIONS,
  POOL_SEASON,
} from '../../lib/freeAgentPool';

/**
 * IN-SEASON FREE AGENCY -- phase 2D-3, September 19 2026 (ET).
 *
 * WHAT CHANGED, AND WHAT DID NOT. This file was 1,251 lines and carried
 * poaching: a practice-squad table, pickPoach, the 5.17(c)/(d) mirrors, the
 * bar check, the roster- and option-bonus suppression. The approved artboards
 * move poaching to /poaching, and the offer form -- which both screens need --
 * moved to components/OfferForm.js rather than being copied. What is left here
 * is the free agency board, the ranked pool and the officer's resolve.
 *
 * THE SEAL IS UNCHANGED AND IS STILL THE DATABASE'S. During a window nobody
 * sees any offer's terms, who made them, or how many there are -- including
 * the commissioner (FA-3, FA-D). RLS on free_agent_offers enforces it. The
 * board shows a contested flag and never a count, because in a ten-team league
 * a count leaks who is in.
 *
 * WHO OPENED A WINDOW IS SEALED TOO, and the artboard is wrong about it. The
 * Free Agency artboard's window card reads "opened by Rise of Optimus". The
 * board view returns opened_by NULL while a window is open or
 * closed-unresolved and fills it once resolved; the column is sealed by grant.
 * So the live card prints "Sealed" and the resolved list prints the name. The
 * invariant wins over the mockup, and this comment is here so the next reader
 * does not "fix" the card to match the picture.
 *
 * R-1: THE OFFICER CONTROL STAYS ON THE BOARD, IN PORTAL DRESS. Preview and
 * Resolve are the one officer control left on an owner page, by ruling, and
 * 2D-3 is where "dressed as a portal control" became real: a brass-bordered
 * block headed COMMISSIONER inside the window card it settles, drawn only for
 * officers. Owners see nothing.
 *
 * NOTHING HERE READS THE CLOCK IN THE RENDER BODY. props.nowIso is the instant
 * the server rendered the page and seeds the clock state, so the server's HTML
 * and the first client paint are identical; a mount effect replaces it with
 * the browser's own and ticks it every thirty seconds. The 2D-2 pattern.
 */

// A free agency window is 24 hours, so hours and minutes is the readable unit
// -- unlike the waiver run, which can be six days out. Never seconds: the
// ticker runs every thirty.
function countdown(iso, nowMs) {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return 'closed';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

// How much of the window has run, 0..1, for the artboard's progress bar. Both
// ends come from the row -- opened_at and closes_at -- so a window that was
// opened early or extended draws correctly without a constant anywhere.
function elapsedFraction(openedAt, closesAt, nowMs) {
  const start = new Date(openedAt).getTime();
  const end = new Date(closesAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  const f = (nowMs - start) / (end - start);
  return Math.max(0, Math.min(1, f));
}

function ppvText(v) {
  if (v === null || v === undefined || v === '') return '—';
  return (Math.round(Number(v) * 100) / 100).toFixed(2);
}

// Rule 5.17 / 5.14 outcome vocabulary, from free_agent_windows.outcome. One
// map, used by the resolve notice and the resolved list. An unknown value
// falls through to the raw string rather than being guessed at.
const OUTCOME_NOTICES = {
  awarded: 'Resolved — contract created.',
  voided: 'Resolved — no legal offer. The player returns to the pool.',
  poached: 'Resolved — poached. The new contract is live on the winning team’s active roster, and the old contract is settled.',
  retained_by_bid: 'Resolved — the holding team kept him with a winning bid. His new contract replaces the old one.',
  retained_on_rookie_contract: 'Resolved — no bid beat his rookie contract, so he stays where he is on it.',
};

// The short form, for a row in the resolved list. Same vocabulary, same
// fall-through; a spelling the view cannot emit is not kept as a fallback.
const OUTCOME_CHIPS = {
  awarded: { label: 'SIGNED', cls: 'kit-chip kit-chip-good' },
  voided: { label: 'VOID', cls: 'kit-chip' },
  poached: { label: 'POACHED', cls: 'kit-chip kit-chip-good' },
  retained_by_bid: { label: 'RETAINED', cls: 'kit-chip kit-chip-good' },
  retained_on_rookie_contract: { label: 'RETAINED', cls: 'kit-chip' },
};

// The seal marker. An inline SVG rather than a padlock emoji, for the reason
// 2D-2 recorded: an emoji is a font question on every platform and this one
// sits inside a sentence. currentColor, so it takes the notice's ink.
function LockMark() {
  return (
    <svg
      className="mk-lock"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path
        d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

// THE AVAILABLE-PLAYERS BOARD -- the ranked pool, for an owner who wants depth
// at a position rather than a specific name. Rows arrive already joined against
// the live contract index (loadFreeAgencyState), so nothing here decides who is
// available; and nothing here decides who the first valid offer wins --
// signsInstantly is passed in and derives from the same live read the search
// results use.
//
// SORTING AND FILTERING HAPPEN IN THE CLIENT, AND THAT IS HONEST HERE.
// /transactions pushes every control to the database because it holds one page
// of a larger set, and filtering a page silently answers "filter the rows I
// happen to have". This table holds the WHOLE pool -- at most 150 rows, all in
// props -- so a client sort is a sort of everything. If the pool ever comes
// from a paged read, move the controls to the query.
//
// The header is the TeamCapSheet sortable idiom: .th-sort / .is-sorted /
// .sort-caret with aria-sort and keyboard activation. A null -- an off-chart
// player's PPV or tier -- sorts last in BOTH directions, so flipping a column
// never floats "no value" to the top.
//
// STILL A TABLE AFTER THE REDESIGN, DELIBERATELY. CLAUDE.md is explicit that
// .grid-table is the numeric primitive and .ledger is for rows a human reads;
// this is ten columns of ranks and figures with a name in one of them, which is
// what .ledger + .pool-table was built for, and it is the one shape on these
// two screens that a card list would make worse. 2D-2 kept the last-run results
// grid a table for the same reason.
//
// per_year_value and likely_years are in the data and deliberately NOT drawn: a
// "$/yr" column reads as a price, and the pool's own brief says
// chart_bid_target() is the only authority on that. The 2025 figures are
// published EDFL results, not NFL statistics.
const POOL_COLUMNS = [
  { key: 'rank', label: '#', numeric: true, rankLike: true },
  { key: 'position_rank', label: 'Pos #', numeric: true, rankLike: true },
  { key: 'full_name', label: 'Player' },
  { key: 'position', label: 'Pos' },
  { key: 'nfl_team', label: 'NFL' },
  { key: 'value_tier', label: 'Chart tier' },
  { key: 'total_ppv', label: 'Chart PPV', numeric: true },
  { key: 'fantasy_points', label: POOL_PRODUCTION_SEASON + ' pts', numeric: true },
  { key: 'fppg', label: POOL_PRODUCTION_SEASON + ' PPG', numeric: true },
];

function isBlank(v) {
  return v === null || v === undefined || v === '';
}

function comparePool(a, b, col, dir) {
  const av = a[col.key];
  const bv = b[col.key];
  if (isBlank(av) && isBlank(bv)) return a.rank - b.rank;
  if (isBlank(av)) return 1;
  if (isBlank(bv)) return -1;
  let c = col.numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
  if (dir === 'desc') c = -c;
  return c !== 0 ? c : a.rank - b.rank;
}

// SIZING LIVES IN THE .pool-table BLOCK IN globals.css, NOT HERE. Ten columns
// is more than .ledger's 640px card flip can carry: measured against the real
// stylesheet, the table's floor is 758px even with wrapped headers (320px of it
// is cell padding), so it flips to cards at 840px instead -- the .sync-table
// decision, for the .sync-table reason. The two rank columns wear .pool-rank so
// they can be narrower than the other figures.
function AvailablePlayers(props) {
  const pool = props.pool || [];
  const [position, setPosition] = useState('ALL');
  const [name, setName] = useState('');
  const [sortKey, setSortKey] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');

  // Built for one season. At the March rollover current_season_year moves on
  // and the server sends an empty pool; say why, rather than "nobody is
  // available" -- which would be wrong in the opposite direction, since after
  // the rollover nearly everyone is.
  if (props.season !== POOL_SEASON) {
    return (
      <p className="empty-note">
        The ranked pool was built for the {POOL_SEASON} season and has not been regenerated for{' '}
        {props.season}. Search by name above.
      </p>
    );
  }

  function handleSort(col) {
    if (sortKey === col.key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(col.key);
    // A figure opens high-to-low; a rank opens 1-first; text opens A-Z.
    setSortDir(col.numeric && !col.rankLike ? 'desc' : 'asc');
  }

  const col = POOL_COLUMNS.find(function (c) { return c.key === sortKey; }) || POOL_COLUMNS[0];
  const needle = name.trim().toLowerCase();
  // filter() returns a fresh array, so the sort never mutates props.
  const rows = pool
    .filter(function (p) { return position === 'ALL' || p.position === position; })
    .filter(function (p) { return !needle || p.full_name.toLowerCase().indexOf(needle) !== -1; })
    .sort(function (a, b) { return comparePool(a, b, col, sortDir); });

  return (
    <>
      <p className="row-note">
        The top {props.poolTotal} free agents by the league&apos;s blended ranking, built on{' '}
        {POOL_GENERATED_LABEL} from the {POOL_CHART_LABEL} value chart and the published{' '}
        {POOL_PRODUCTION_SEASON} results. {pool.length} of {props.poolTotal} are still
        available &mdash; anyone signed since is already gone from this list. The order is a
        discovery aid and it is subjective; for a depth question, pick a position and read{' '}
        <em>Pos #</em>. Chart PPV is the chart&apos;s view of a whole contract, not a price.
      </p>

      {/*
        THE LEGEND LIVES AND DIES WITH THE TAG. It is inside the same condition,
        so it can never explain a tag that is no longer drawn. It also carries
        the half a tag cannot: that a row WITHOUT the tag goes to a contested
        window. An absence with no legend is not readable as a fact.

        After the exemption ends both disappear and nothing replaces them,
        deliberately: a window marker on every row is the column-of-Active
        problem the roster-status tag rule exists to avoid, and the page subhead
        already says every offer opens a 24-hour window.
      */}
      {props.exemptionActive && (
        <p className="row-note">
          <span className="void-tag" style={{ marginLeft: 0 }}>FIRST OFFER WINS</span>{' '}
          marks a player who has never held an EDFL contract. Until midnight ET on{' '}
          {formatDate(props.firstOfferUntil)} the first valid offer signs him outright, with
          no window and no chance to change your mind. Every other player on this list goes
          to a contested 24-hour window.
        </p>
      )}

      <div className="admin-form">
        <div className="form-row">
          <label>
            Position
            <select value={position} onChange={function (e) { setPosition(e.target.value); }}>
              <option value="ALL">All positions</option>
              {POOL_POSITIONS.map(function (pos) {
                return <option key={pos} value={pos}>{pos}</option>;
              })}
            </select>
          </label>
          <label style={{ flex: '1 1 240px' }}>
            Name
            <input
              type="text"
              value={name}
              placeholder="Filter this list by name"
              onChange={function (e) { setName(e.target.value); }}
            />
          </label>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="empty-note">
          {pool.length === 0
            ? 'Nobody from the ranked pool is still available.'
            : 'No available player matches that filter.'}
        </p>
      )}

      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="ledger pool-table">
            <thead>
              <tr>
                {POOL_COLUMNS.map(function (c) {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      className={
                        (c.numeric ? 'col-num ' : '') +
                        (c.rankLike ? 'pool-rank ' : '') +
                        'th-sort' +
                        (active ? ' is-sorted' : '')
                      }
                      tabIndex={0}
                      role="columnheader"
                      onClick={function () { handleSort(c); }}
                      onKeyDown={function (e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSort(c);
                        }
                      }}
                      aria-sort={
                        active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                    >
                      {c.label}
                      <span className="sort-caret">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </th>
                  );
                })}
                <th className="col-status"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function (p) {
                return (
                  <tr key={p.player_id}>
                    <td className="col-num pool-rank" data-label="#">{p.rank}</td>
                    <td className="col-num pool-rank" data-label="Pos #">{p.position_rank}</td>
                    <td data-label="Player">
                      <PlayerLink playerId={p.player_id}>{p.full_name}</PlayerLink>
                      {/*
                        Drawn only while it is true, like the VOID YR and
                        PRACTICE SQUAD tags on the team page. After the 5.14(b)
                        instant it never appears.
                      */}
                      {props.signsInstantly(p) && <span className="void-tag"> FIRST OFFER WINS</span>}
                    </td>
                    <td data-label="Pos">{p.position}</td>
                    <td data-label="NFL">{p.nfl_team || '—'}</td>
                    <td data-label="Chart tier">{p.value_tier || '—'}</td>
                    <td className="col-num" data-label="Chart PPV">
                      {isBlank(p.total_ppv) ? '—' : p.total_ppv}
                    </td>
                    <td className="col-num" data-label={POOL_PRODUCTION_SEASON + ' pts'}>
                      {p.fantasy_points}
                    </td>
                    <td className="col-num" data-label={POOL_PRODUCTION_SEASON + ' PPG'}>
                      {p.fppg}
                    </td>
                    <td className="col-status" data-label="">
                      {props.isOpen && (
                        <button type="button" className="btn btn-quiet"
                          onClick={function () { props.onPick(p); }}>
                          Offer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="row-note">
        &mdash; means no current NFL team, or no entry on the value chart. Whether a player
        can actually be signed is decided by the database when you submit; this list only
        helps you find him.
      </p>
    </>
  );
}

export default function FreeAgencyBoard(props) {
  const board = props.board || [];
  const resolvedRows = props.resolved || [];
  const myOffers = props.myOffers || [];

  const [now, setNow] = useState(function () {
    return props.nowIso ? new Date(props.nowIso).getTime() : Date.now();
  });
  useEffect(function () {
    setNow(Date.now());
    const t = setInterval(function () { setNow(Date.now()); }, 30000);
    return function () { clearInterval(t); };
  }, []);

  // Rule 3.3(d)/(e). Who drops back to this team's practice squad at Tuesday
  // 00:00, and how full that squad is now. Both are database reads: the RPC is
  // granted to authenticated only, and ps_count / taxi_squad_size are the same
  // view the compliance banner prints, so the offer form's notice and the
  // banner cannot disagree about how many slots a team holds.
  const [taxiReturning, setTaxiReturning] = useState([]);
  const [taxiRoom, setTaxiRoom] = useState(null);
  useEffect(function () {
    if (!props.myTeamId) return undefined;
    let live = true;
    Promise.all([
      supabase.rpc('edfl_taxi_origin_actives', { p_team_id: props.myTeamId }),
      supabase
        .from('team_inseason_compliance')
        .select('ps_count, taxi_squad_size')
        .eq('team_id', props.myTeamId)
        .maybeSingle(),
    ]).then(function (res) {
      if (!live) return;
      if (res[0] && res[0].data) setTaxiReturning(res[0].data);
      if (res[1] && res[1].data) setTaxiRoom(res[1].data);
    });
    return function () { live = false; };
  }, [props.myTeamId]);

  // 5.14(b): until this instant, an offer on a player who has never held an
  // EDFL contract wins him outright rather than opening a 24-hour window. The
  // database decides this for real on submit; here it only shapes what the
  // owner is told before they click.
  //
  // THE DATABASE TURNS THIS ON; THE CLOCK CAN ONLY TURN IT OFF.
  // firstOfferExemptionActive is league_calendar.is_past evaluated server-side
  // at request time, so the badge and the notice render correctly on the server
  // and on the first paint. The ticker's only job is to withdraw them if the
  // page is still open when the instant passes, which is why it compares
  // against the row's own starts_at rather than any hardcoded date. Both inputs
  // come from the same calendar row, and either one missing reads as OFF.
  const firstOfferUntil = props.firstOfferUntil
    ? new Date(props.firstOfferUntil).getTime()
    : null;
  const exemptionLive = Boolean(props.firstOfferExemptionActive)
    && (firstOfferUntil !== null && now < firstOfferUntil);
  function signsInstantly(p) {
    return Boolean(exemptionLive && p && p.hasPriorContract === false);
  }

  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [detail, setDetail] = useState(null);

  // THE FINDER -- the search box and the ranked pool, behind the artboard's
  // "OPEN A WINDOW ON A PLAYER" control.
  //
  // OPEN BY DEFAULT WHEN NOTHING IS LIVE. The artboard draws it collapsed under
  // a live window, which is right when there is one to read; with an empty
  // board -- which is the state right now, every window having resolved -- a
  // collapsed panel leaves the screen with nothing on it but a heading. So the
  // default follows the board and the owner can toggle either way. This is
  // per-viewer chrome and nothing depends on it.
  const [finderOpen, setFinderOpen] = useState(board.length === 0);

  // One entry per window. myOffers arrives newest first, so a plain assignment
  // would let an older non-live offer overwrite the live one an owner submitted
  // afterwards. A live offer always wins; otherwise the newest is kept.
  // (Withdrawal is gone -- 5.14(d) -- but historical 'withdrawn' rows still
  // exist.) CLAUDE.md: do not simplify this reducer. It once read "withdrawn"
  // for an offer that was still standing, because a later re-submission was not
  // accounted for.
  const offerByWindow = {};
  myOffers.forEach(function (o) {
    const held = offerByWindow[o.window_id];
    if (!held || (held.status !== 'submitted' && o.status === 'submitted')) {
      offerByWindow[o.window_id] = o;
    }
  });

  function clearMessages() { setNotice(null); setFailure(null); }

  function toForm(player, poach) {
    clearMessages();
    setPicked({ player: player, poach: poach || null });
    setQuery('');
    setResults([]);
    // Runs in a click handler, so it is client-only by construction and never
    // touches document during render.
    const form = document.getElementById('offer-form');
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onSearch(text) {
    setQuery(text);
    setPicked(null);
    if (text.trim().length < 2) { setResults([]); return; }
    startTransition(async function () {
      const res = await searchFreeAgents(text);
      if (res.ok) setResults(res.data);
    });
  }

  // The pool's Offer button and a search result land in the same place -- the
  // form's player, in the shape searchFreeAgents returns -- so everything
  // downstream is one path.
  function pickFromPool(p) {
    toForm({
      id: p.player_id,
      full_name: p.full_name,
      position: p.position,
      nfl_team: p.nfl_team,
      hasPriorContract: p.hasPriorContract,
    });
  }

  // A board row's Offer / Raise button.
  //
  // A POACH WINDOW SENDS THE OWNER TO /poaching AND DOES NOT OPEN THE FORM
  // HERE. The bid needs the bar and the PO-17 cash floor, which live on
  // poachable_players and are read by that screen, not this one. Rebuilding
  // that read here to keep the button local would be a second source for two
  // figures a bid is judged on -- the thing CLAUDE.md's "one source" rule
  // exists to stop. The link is the honest answer and it lands on the row that
  // carries both.
  function pickFromBoard(w) {
    if (w.window_kind === 'poach') return;
    toForm({
      id: w.player_id,
      full_name: w.player_name,
      position: w.position,
      nfl_team: null,
      hasPriorContract: true,
    });
  }

  function onPreview(windowId) {
    clearMessages(); setDetail(null);
    startTransition(async function () {
      const res = await previewWindow(windowId);
      if (!res.ok) { setFailure(res.message); return; }
      setDetail(res.data);
    });
  }

  function onResolve(windowId) {
    clearMessages();
    startTransition(async function () {
      const res = await resolveWindow(windowId);
      if (!res.ok) { setFailure(res.message); return; }
      setDetail(null);
      const d = res.data || {};
      let text = OUTCOME_NOTICES[d.outcome] || ('Resolved — ' + (d.outcome || d.result) + '.');
      if (d.passed_over) text += ' ' + d.passed_over + ' offer(s) passed over.';
      if (d.fine_tx_id) text += ' The opening team’s $75 fine is posted to League Finances.';
      setNotice(text);
    });
  }

  return (
    <div>
      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

      {/* ---- OPEN NOW ----
          Every live window, of both kinds. A poach window is a free agency
          window and this is the one place the league sees them all at once. */}
      <div className="edfl-hq-block">
        <div className="mk-head mk-head-lead">
          <h2 className="section-heading">
            {'Open now · ' + board.length}
          </h2>
        </div>

        {board.length === 0 && (
          <p className="mk-empty">
            No window is open. Offer on anyone below and you will start one.
          </p>
        )}

        {/* THE SEAL, STATED ONCE. The artboard puts this sentence inside each
            window's card; with three windows open that is the same sentence
            three times down one screen, which is the call 2D-2 already made
            for the waiver wire and made the same way. The per-window half --
            whether anyone else is in -- stays per-window, as the CONTESTED
            chip on the row. A count never appears: in a ten-team league a
            count says who. */}
        {board.length > 0 && (
          <p className="kit-notice mk-notice-info mk-section-lead">
            <LockMark />
            <span>
              Offers are sealed. Nobody &mdash; including the commissioner &mdash; can see who has
              offered, or how much, until a window closes; and who opened it stays sealed until it
              resolves. A <strong>CONTESTED</strong> window has somebody else in it &mdash; how
              many is never shown, because in a ten-team league a count would say who.
            </span>
          </p>
        )}

        {board.map(function (w) {
          const mine = offerByWindow[w.window_id];
          // Before the ticker moves, the clock is the server's instant. A
          // window is treated as still open until it demonstrably is not;
          // nothing is decided here -- the database refuses a resolve before
          // closes_at anyway.
          const closed = new Date(w.closes_at).getTime() <= now;
          const isPoach = w.window_kind === 'poach';
          const holding = isPoach && w.incumbent_team_id === props.myTeamId;
          const live = mine && mine.status === 'submitted';
          const pct = Math.round(elapsedFraction(w.opened_at, w.closes_at, now) * 100);

          let bidLabel = null;
          if (!closed && w.status === 'open') {
            if (live) bidLabel = holding ? 'Raise your keep bid' : 'Raise your offer';
            else if (holding) bidLabel = 'Bid to keep him';
            else if (isPoach) bidLabel = 'Bid';
            else bidLabel = 'Make an offer';
            // A free agency offer needs the market open; the database decides
            // for real either way.
            if (!isPoach && !props.isOpen) bidLabel = null;
          }

          return (
            <div className={'mk-item ' + (closed ? '' : 'mk-window-live')} key={w.window_id}>
              <div className="kit-row">
                <div className="kit-row-main">
                  <div className="kit-row-title">
                    <PlayerLink playerId={w.player_id}>{w.player_name}</PlayerLink>
                    {w.position && <span className="kit-chip">{w.position}</span>}
                    {isPoach && <span className="kit-chip">POACH</span>}
                    {w.is_contested && <span className="kit-chip">CONTESTED</span>}
                  </div>
                  <div className="kit-row-meta">
                    {isPoach
                      ? 'From ' + (w.incumbent_team_name || '—') +
                        (w.retain_bar_ppv === null || w.retain_bar_ppv === undefined
                          ? '' : ' · bar ' + ppvText(w.retain_bar_ppv) + ' PPV') +
                        ' · opened by ' + (w.opened_by || 'Sealed')
                      : 'Free agency · opened by ' + (w.opened_by || 'Sealed')}
                  </div>
                </div>
                <div className="kit-row-right">
                  {live
                    ? 'Yours in · ' + mine.total_years + 'yr' +
                      (mine.total_ppv === null ? '' : ' · ' + ppvText(mine.total_ppv) + ' PPV')
                    : mine ? mine.status : '—'}
                </div>
              </div>

              {/* THE CLOCK. A bar and a figure, both from the row's own
                  opened_at and closes_at. Neon while it runs, because the
                  window is the thing on this card that is still moving. */}
              <div className="mk-clock">
                <div className="mk-bar">
                  <div
                    className="mk-bar-fill"
                    style={{ width: pct + '%' }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Window elapsed"
                  />
                </div>
                <span className="mk-count">
                  {closed ? 'closed' : countdown(w.closes_at, now)}
                </span>
              </div>

              {bidLabel && !isPoach && (
                <button
                  type="button"
                  className={'btn mk-cta ' + (live ? 'btn-secondary' : 'kit-cta')}
                  onClick={function () { pickFromBoard(w); }}
                  disabled={pending}
                >
                  {bidLabel}
                </button>
              )}

              {bidLabel && isPoach && (
                <a className="btn mk-cta kit-cta" href="/poaching">
                  {bidLabel + ' on Poaching'}
                </a>
              )}

              {/* R-1: the one officer control left on an owner page, dressed as
                  a portal control. Drawn only for an officer, and only once the
                  window has closed -- preview_fa_window refuses both cases
                  itself, so this is presentation, not the gate. */}
              {props.canResolve && closed && (
                <div className="mk-officer">
                  <p className="mk-officer-label">COMMISSIONER</p>
                  <p className="mk-officer-note">
                    The ranking is the sealed offers themselves, so the database refuses both of
                    these to anyone else and refuses them at all before the window closes. Preview
                    and Resolve run the same award code and cannot disagree.
                  </p>
                  <div className="mk-form-actions">
                    <button type="button" className="btn btn-secondary"
                      onClick={function () { onPreview(w.window_id); }} disabled={pending}>
                      Preview
                    </button>
                    <button type="button" className="btn"
                      onClick={function () { onResolve(w.window_id); }} disabled={pending}>
                      Resolve
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- THE PREVIEW ----
          Officer only, and the database is what makes it so. */}
      {detail && (
        <div className="edfl-hq-block">
          <p className="stat-label mk-preview-label">
            Preview &mdash; {detail.window_kind === 'poach' ? 'poach window' : 'free agency window'},
            signing week {detail.signing_week}, fraction {detail.signing_fraction}
            {detail.retain_bar_ppv !== null && detail.retain_bar_ppv !== undefined
              ? ', rookie bar ' + ppvText(detail.retain_bar_ppv) + ' PPV' : ''}
          </p>
          <div className="table-scroll">
            {/*
              A .ledger. The three money columns are numbers, but the Outcome
              column carries a whole sentence -- "passed over - Owner Cash:
              needs 600, has 347" -- and one sentence column is what decides it.
              col-num right-aligns the figures inside it, which is the part of
              .grid-table this table actually wanted.

              R-12: Season cash is a CHARGE and rounds up; Cash available is
              ROOM and rounds down. Both directions push the same way, so the
              arithmetic on screen can no longer clear a team the database would
              block. This is the last of the twelve sites the sweep was waiting
              on, and the only formatRoom among them.
            */}
            <table className="ledger">
              <thead>
                <tr>
                  <th>#</th><th>Team</th><th>Kind</th>
                  <th className="col-num">PPV</th>
                  <th className="col-num">Season cash</th>
                  <th className="col-num">Cash available</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {(detail.offers || []).map(function (o) {
                  return (
                    <tr key={o.offer_id}>
                      <td data-label="#">{o.rank}</td>
                      <td data-label="Team">{o.team}{o.is_incumbent ? ' (holding team)' : ''}</td>
                      <td data-label="Kind">{o.offer_kind}</td>
                      <td className="col-num" data-label="PPV">{o.total_ppv}</td>
                      <td className="col-num" data-label="Season cash">{formatCost(o.season_cash_charge)}</td>
                      <td className="col-num" data-label="Cash available">{formatRoom(o.cash_available)}</td>
                      <td data-label="Outcome">{o.blocked_by ? o.outcome + ' — ' + o.blocked_by : o.outcome}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="row-note mk-preview-note">
            {detail.result}{detail.outcome ? ' — outcome: ' + detail.outcome.replace(/_/g, ' ') : ''}
            {detail.outcome === 'retained_on_rookie_contract'
              ? '. Resolving posts the opening team’s $75 fine.' : ''}
          </p>
        </div>
      )}

      {/* ---- OPEN A WINDOW ---- */}
      <div className="edfl-hq-block">
        <button
          type="button"
          className="btn mk-opener"
          aria-expanded={finderOpen}
          onClick={function () { setFinderOpen(!finderOpen); }}
        >
          {finderOpen ? 'Hide the available players' : 'Open a window on a player'}
        </button>

        {finderOpen && (
          <>
            <div className="admin-form mk-finder">
              <div className="form-row">
                <label style={{ flex: '1 1 320px' }}>
                  Find a player by name
                  <input
                    type="text"
                    value={query}
                    placeholder="Type at least two letters"
                    onChange={function (e) { onSearch(e.target.value); }}
                  />
                </label>
              </div>

              {results.length > 0 && (
                <div className="page-actions mk-finder-results">
                  {results.map(function (p) {
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="btn btn-quiet"
                        onClick={function () {
                          toForm({
                            id: p.id,
                            full_name: p.full_name,
                            position: p.position,
                            nfl_team: p.nfl_team,
                            hasPriorContract: p.hasPriorContract,
                          });
                        }}
                      >
                        {p.full_name} · {p.position} · {p.nfl_team || 'FA'}
                        {signsInstantly(p) ? ' · signs instantly' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/*
              Drawn whether or not free agency is open: an owner planning for a
              gap can browse the pool while the market is shut. Only the Offer
              button is gated, because the form it feeds is not rendered until
              the market opens.
            */}
            <AvailablePlayers
              season={props.season}
              pool={props.pool}
              poolTotal={props.poolTotal}
              isOpen={props.isOpen}
              signsInstantly={signsInstantly}
              exemptionActive={exemptionLive}
              firstOfferUntil={props.firstOfferUntil}
              onPick={pickFromPool}
            />
          </>
        )}
      </div>

      {/* ---- THE OFFER ----
          The same form /poaching mounts. Keyed on the player so a second pick
          re-seeds the form rather than carrying the previous player's figures
          over. */}
      {picked && (props.isOpen || picked.poach) && (
        <OfferForm
          key={picked.player.id}
          season={props.season}
          weightRows={props.weightRows}
          wireLive={props.wireLive}
          player={picked.player}
          poach={picked.poach}
          signsInstantly={signsInstantly(picked.player)}
          firstOfferUntil={props.firstOfferUntil}
          taxiReturning={taxiReturning}
          taxiRoom={taxiRoom}
          onCancel={function () { setPicked(null); clearMessages(); }}
          onFail={function (m) { setFailure(m); }}
          onDone={function (m) { setPicked(null); setNotice(m); }}
        />
      )}

      {/* ---- RESOLVED ---- */}
      {resolvedRows.length > 0 && (
        <div className="edfl-hq-block">
          <div className="mk-head">
            <h2 className="section-heading">Recently resolved</h2>
          </div>
          <div className="kit-rows">
            {resolvedRows.map(function (r) {
              const chip = OUTCOME_CHIPS[r.outcome];
              return (
                <div className="kit-row" key={r.window_id}>
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      <PlayerLink playerId={r.player_id}>{r.player_name}</PlayerLink>
                      {r.position && <span className="kit-chip">{r.position}</span>}
                    </div>
                    <div className="kit-row-meta">
                      {(r.window_kind === 'poach'
                        ? 'Poach from ' + (r.incumbent_team_name || '—')
                        : 'Free agency') +
                        ' · opened by ' + (r.opened_by || '—') +
                        ' · window closed ' + formatShortDateTime(r.closes_at)}
                    </div>
                  </div>
                  <div className="kit-row-right">
                    {chip
                      ? <span className={chip.cls}>{chip.label}</span>
                      : <span className="kit-chip">{r.outcome || '—'}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="row-note">
            Who opened a window is sealed while it runs and named once it resolves, which is why
            these rows carry a name and the live ones above do not. The time shown is when the
            window closed; the commissioner resolves it at or after that instant.
          </p>
        </div>
      )}

      {/* ---- THE DOOR TO POACHING ----
          Teal, not neon: neon is the action colour and there is a neon action
          on this screen already. A bar and a link is what 2D-2's info notice
          settled on for the same job. */}
      <a className="mk-door" href="/poaching">
        <span className="mk-door-rule" aria-hidden="true" />
        <span className="mk-door-main">
          <span className="mk-door-title">Poaching</span>
          <span className="mk-door-meta">
            Rule 5.17 &middot; the league&apos;s practice squads, and who of yours is exposed
          </span>
        </span>
        <span className="mk-door-chev" aria-hidden="true">&rsaquo;</span>
      </a>
    </div>
  );
}
