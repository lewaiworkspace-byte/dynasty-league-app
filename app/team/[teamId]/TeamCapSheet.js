'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
import CutPlayerDialog from './CutPlayerDialog';
import RosterMoveDialog from './RosterMoveDialog';
import TeamOverview from './TeamOverview';
import { formatExactMoney } from '../../../lib/formatMoney';

// THE THREE TABS ARE OVERVIEW, ROSTER AND MONEY -- ruling R-9, phase 2B.
//
// What used to be the Overview tab is now MONEY, unchanged line for line: the
// same grid, the same growth selector, the same footnotes, the same formatter.
// Overview is a new tab and lives in TeamOverview.js.
//
// TWO TABS WERE REMOVED AND NEITHER CAPABILITY WAS:
//   Draft Picks  R-9 keeps Draft a league-level page. /draft-picks is the same
//                board for every team, already carries the picks-held and
//                picks-traded-away halves, and the Overview links to it. The
//                read that fed the old tab went with it.
//   Owner Info   moved to the foot of the Overview tab, because an ordinary
//                owner has nowhere else to edit their own card. Same panel,
//                same default self-only editScope.
//
// This file keeps its name deliberately. It is imported by exactly one page and
// a rename would mean a delete plus an add in a batch that is otherwise
// replacements only -- which is a worse trade than a filename that now
// describes one of three tabs instead of the whole component.

// NO ROUNDING ON THE MONEY TAB. Cash Over Cap's 2026 cap hit carries cents and
// eight of ten teams do; rule 1.9 is still open. Rounding here would make the
// Money grid disagree with the roster rows beneath it and with the Cap Sheet,
// and would hide a real overage at the ceiling. Same formatter the restructure
// screens use.
//
// R-12 DID NOT CHANGE THIS, and must not. R-12 governs figures that are a
// GLANCE -- the hero stat rail and the Overview cap bar, where a cost rounds up
// and room rounds down so nothing reads in the owner's favour. SR-22 governs
// the money screen, which is this tab, and exact is exact. The cap bar's own
// footnote sends a reader here for the figure to the cent.
function money(v) {
  return formatExactMoney(v);
}

// THE CAP CEILING ROW IS READ, NOT MULTIPLIED (September 16, 2026).
//
// This row used to be CEILING_MULTIPLIER = 1.11 applied to every season -- a
// figure the rule book abolished, computed in JavaScript, under a footnote
// calling it an approximation. It now shows the ceiling the league actually
// enforces: officialCeilings[yr], which the page takes from
// league_cap_settings exactly as team_cap_compliance does (the set ceiling, or
// the base cap where none is set). A season with no cap row shows the
// projected base cap, marked projected like the Salary Cap row above it.
//
// Rule 5.5 makes a team's ceiling its base cap plus its own rollover. Rollover
// is not calculated yet, so no season here includes it, and the footnote says
// so. When the rollover close is built, the per-team figure belongs in the
// database and this row reads it -- do not rebuild it here from Cap Space.
//
// This is NOT the 1.25 in auction_tier_team_flags, which is the
// auction-specific allowance. Do not reconcile them.

const GROWTH_RATES = [];
for (let r = -5; r <= 10; r += 1) GROWTH_RATES.push(r);

// Rule 3.3(i) state, read from taxi_eligibility_status. `locked` and
// `last_demotion_available` are the view's own columns (September 15, 2026);
// the fallbacks keep a row from an older read meaningful rather than blank.
function taxiIsLocked(row) {
  if (!row) return false;
  if (row.locked !== undefined && row.locked !== null) return Boolean(row.locked);
  return Boolean(row.eligibility_spent);
}

function taxiLastDemotion(row) {
  if (!row || taxiIsLocked(row)) return false;
  if (row.last_demotion_available !== undefined && row.last_demotion_available !== null) {
    return Boolean(row.last_demotion_available);
  }
  return Number(row.weeks_used) >= 3;
}

export default function TeamCapSheet(props) {
  const seasons = props.seasons;
  const currentSeasonYear = props.currentSeasonYear || seasons[0];
  const officialCaps = props.officialCaps;
  const officialCeilings = props.officialCeilings || {};
  const provisionalCaps = props.provisionalCaps || {};
  const minSpendPct = props.minSpendPct;
  // EVERY MONEY-TAB FIGURE COMES FROM team_cap_by_season. Cap Hit, Cap Space,
  // Min Spend, Cash Committed and both dead-money sub-rows are read, never
  // derived. The page previously computed Cap Hit and Cash Committed in JS and
  // Cap Space as (cap - capHit); that arithmetic is what silently reported
  // dead money alone as the whole cap hit. If a figure is missing, show a dash
  // -- do not reconstruct it.
  const capBySeason = props.capBySeason || {};
  const capRowsError = props.capRowsError;
  const yearRowsError = props.yearRowsError;

  function capRow(yr) {
    return capBySeason[yr] || {};
  }
  const cashAvailable = props.cashAvailable;
  const rosterBySeason = props.rosterBySeason;
  const canCut = Boolean(props.canCut);
  const canMove = Boolean(props.canMove);

  // OWNER INFO IS LOGIN-GATED, NOT COMMISSIONER-GATED.
  //
  // showOwnerInfo is true for any signed-in owner and false for a signed-out
  // visitor, who never sees the block at all. It is NOT the gate --
  // owner_directory() refuses the read on its own for a caller with no
  // auth.uid(), and the per-field masking is entirely database-side. This
  // flag only decides whether the block is drawn. Forwarded straight to the
  // Overview tab, which is where the panel lives now.
  const showOwnerInfo = Boolean(props.showOwnerInfo);
  const ownerDirectory = props.ownerDirectory || [];
  const ownerDirectoryError = props.ownerDirectoryError;
  const teamId = props.teamId;

  const router = useRouter();

  // Whether to draw the dead-money rows at all. Checked across the whole
  // horizon rather than per season, so the row either exists for every
  // column or for none -- a row that appears and disappears between seasons
  // would break the grid's alignment.
  const anyDeadCap = seasons.some(function (yr) {
    return (Number(capRow(yr).deadCap) || 0) > 0;
  });
  const anyDeadCash = seasons.some(function (yr) {
    return (Number(capRow(yr).deadCash) || 0) > 0;
  });

  const [tab, setTab] = useState('overview');
  const [growth, setGrowth] = useState(0);
  const [rosterSeason, setRosterSeason] = useState(seasons[0]);
  const [sortKey, setSortKey] = useState('capCharge');
  const [sortDir, setSortDir] = useState('desc');
  const [cutTarget, setCutTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);

  // Cutting is a present-tense action: you can only cut a player today, not
  // in a future season. The column appears only on the current season.
  const showCut = canCut && rosterSeason === currentSeasonYear;
  // A roster move is present-tense for the same reason -- you move a player
  // to the practice squad today, not in 2029.
  const showMove = canMove && rosterSeason === currentSeasonYear;

  // Rule 3.3(i) is a count within ONE season, so the badge belongs only on the
  // current season's view. On 2027 or 2028 it would be a figure about a season
  // that has not happened -- the same reason Cut and Move are hidden there.
  const showTaxiBadge = rosterSeason === currentSeasonYear;
  const taxiByContract = props.taxiByContract || {};
  const showActions = showCut || showMove;

  const officialYears = Object.keys(officialCaps)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });
  const lastOfficialYear = officialYears.length
    ? officialYears[officialYears.length - 1]
    : null;

  // Projected caps are display-only and are never written back to
  // league_cap_settings, which is load-bearing for auction cap flags.
  function capFor(year) {
    if (officialCaps[year] !== undefined) {
      return { value: officialCaps[year], projected: false };
    }
    if (lastOfficialYear === null) return { value: null, projected: true };
    const base = officialCaps[lastOfficialYear];
    const steps = year - lastOfficialYear;
    // Rule book 1.9 rounds up.
    const value = Math.ceil(base * Math.pow(1 + growth / 100, steps));
    return { value: value, projected: true };
  }

  const capByYear = {};
  seasons.forEach(function (yr) {
    capByYear[yr] = capFor(yr);
  });

  function projClass(yr) {
    return capByYear[yr].projected ? ' is-projected-val' : '';
  }

  function derived(yr, fn) {
    const c = capByYear[yr];
    if (c.value === null) return '—';
    return money(fn(c.value));
  }

  // Numeric columns open descending (biggest first); text columns open
  // ascending (A-Z). One shared default makes half the columns feel
  // backwards on the first click.
  const SORT_COLUMNS = [
    { key: 'name', label: 'Player', numeric: false },
    { key: 'position', label: 'Pos', numeric: false },
    { key: 'typeLabel', label: 'Type', numeric: false },
    { key: 'contract', label: 'Contract', numeric: false },
    { key: 'ppv', label: 'PPV', numeric: true },
    { key: 'capCharge', label: 'Cap Hit', numeric: true },
    { key: 'cashValue', label: 'Cash', numeric: true },
    { key: 'deadCap', label: 'Dead If Cut', numeric: true },
  ];

  function handleSort(col) {
    if (sortKey === col.key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(col.key);
    setSortDir(col.numeric ? 'desc' : 'asc');
  }

  function sortedRoster() {
    const col = SORT_COLUMNS.find(function (c) {
      return c.key === sortKey;
    });
    const rows = rosterBySeason[rosterSeason].slice();
    const dir = sortDir === 'asc' ? 1 : -1;

    rows.sort(function (a, b) {
      if (sortKey === 'contract') {
        const diff = a.startYear - b.startYear;
        if (diff !== 0) return diff * dir;
        return (a.totalSpan - b.totalSpan) * dir;
      }

      if (col && col.numeric) {
        const av = a[sortKey];
        const bv = b[sortKey];
        // Nulls sink to the bottom in both directions -- sorting them as
        // zero would bury real zeros among missing data.
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      }

      const as = String(a[sortKey] || '');
      const bs = String(b[sortKey] || '');
      return as.localeCompare(bs) * dir;
    });

    return rows;
  }

  // R-10's key. Drawn once above the table and never repeated, and only for the
  // markers this season's rows actually carry -- a legend for a colour nobody
  // can see is noise. Veteran free agency is deliberately absent: it is the
  // unmarked majority, and listing it would imply a swatch exists for it.
  const markersShown = {};
  (rosterBySeason[rosterSeason] || []).forEach(function (c) {
    if (c.markerClass) markersShown[c.markerClass] = true;
  });

  function TabButton(props2) {
    return (
      <button
        type="button"
        className={'edfl-tab' + (tab === props2.id ? ' is-on' : '')}
        aria-current={tab === props2.id ? 'page' : undefined}
        onClick={function () {
          setTab(props2.id);
        }}
      >
        {props2.label}
      </button>
    );
  }

  return (
    <div>
      {/*
        A FAILED READ SAYS SO. The bug this page carried was not that a query
        failed -- it was that the failure was invisible, and the totals fell
        back to a subset that looked like a real answer. Neither of these
        should ever render silently.
      */}
      {capRowsError && (
        <div className="form-error">
          Cap and cash totals could not be loaded: {capRowsError}. The figures below are
          incomplete &mdash; do not rely on them.
        </div>
      )}
      {yearRowsError && (
        <div className="form-error">
          Per-season contract detail could not be loaded: {yearRowsError}. The roster table is
          incomplete.
        </div>
      )}

      <div className="edfl-tabs edfl-hq-tabs" role="tablist" aria-label="Team sections">
        <TabButton id="overview" label="Overview" />
        <TabButton id="roster" label="Roster" />
        <TabButton id="money" label="Money" />
      </div>

      {tab === 'overview' && (
        <TeamOverview
          currentSeasonYear={currentSeasonYear}
          complianceRow={props.complianceRow}
          complianceError={props.complianceError}
          minSpend={capRow(currentSeasonYear).minSpend}
          capSpace={capRow(currentSeasonYear).capSpace}
          matchup={props.matchup}
          scoreError={props.scoreError}
          comingUp={props.comingUp || []}
          recentMoves={props.recentMoves || []}
          recentMovesError={props.recentMovesError}
          recentMovesGated={Boolean(props.recentMovesGated)}
          isMine={Boolean(props.isMine)}
          showOwnerInfo={showOwnerInfo}
          ownerDirectory={ownerDirectory}
          ownerDirectoryError={ownerDirectoryError}
          teamId={teamId}
        />
      )}

      {tab === 'money' && (
        <div>
          <div className="control-row">
            <label htmlFor="growth">Assumed annual cap growth</label>
            <select
              id="growth"
              value={growth}
              onChange={function (e) {
                setGrowth(Number(e.target.value));
              }}
            >
              {GROWTH_RATES.map(function (r) {
                return (
                  <option key={r} value={r}>
                    {(r > 0 ? '+' : '') + r + '%'}
                  </option>
                );
              })}
            </select>
            <span>
              Applies to projected seasons only. Cap Hit and Cash Committed are
              contract facts and do not move.
            </span>
          </div>

          <div className="table-scroll">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>&nbsp;</th>
                  {seasons.map(function (yr) {
                    return (
                      <th key={yr}>
                        <span className="year-head">
                          <span>{yr}</span>
                          {/* PROJ: no cap row for the season. PROV: a cap row
                              the commissioner marked provisional -- a
                              placeholder, not the official figure. SET: the
                              official cap. PROV borrows the projected style. */}
                          <span
                            className={
                              'year-tag ' +
                              (capByYear[yr].projected || provisionalCaps[yr]
                                ? 'is-projected'
                                : 'is-official')
                            }
                          >
                            {capByYear[yr].projected
                              ? 'PROJ'
                              : provisionalCaps[yr]
                              ? 'PROV'
                              : 'SET'}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Salary Cap</th>
                  {seasons.map(function (yr) {
                    return (
                      <td key={yr} className={projClass(yr)}>
                        {money(capByYear[yr].value)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="grid-rule">
                  <th scope="row">Cap Ceiling</th>
                  {seasons.map(function (yr) {
                    // Read where a cap row exists; the projected base cap
                    // otherwise, styled as projected. Never a multiplier.
                    if (!capByYear[yr].projected) {
                      const ceiling = officialCeilings[yr];
                      return (
                        <td key={yr}>
                          {ceiling === null || ceiling === undefined ? '—' : money(ceiling)}
                        </td>
                      );
                    }
                    return (
                      <td key={yr} className={projClass(yr)}>
                        {money(capByYear[yr].value)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">Cap Hit</th>
                  {seasons.map(function (yr) {
                    // A cap hit is a contract fact, never a projection: it is
                    // read for every season, including those with no cap set.
                    return (
                      <td key={yr} className="v-cap">
                        {money(capRow(yr).capHit)}
                      </td>
                    );
                  })}
                </tr>
                {/* Only rendered when this team actually carries dead money
                    in one of the five seasons shown. Nine of ten teams see
                    no extra row. Sits directly beneath Cap Hit because it is
                    a COMPONENT of that figure, not an addition to it -- the
                    roster table below lists live contracts only, so this is
                    the line that explains why the two do not tie out. */}
                {anyDeadCap && (
                  <tr>
                    <th scope="row">&nbsp;&nbsp;of which dead money</th>
                    {seasons.map(function (yr) {
                      const d = Number(capRow(yr).deadCap) || 0;
                      return (
                        <td key={yr} className={d > 0 ? 'v-dead' : ''}>
                          {d > 0 ? money(capRow(yr).deadCap) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr>
                  <th scope="row">Cap Space</th>
                  {seasons.map(function (yr) {
                    // READ, NOT DERIVED. This used to be cap minus capHit,
                    // which inherited whatever was wrong with capHit -- that
                    // is how a team 200 over the cap showed a full $1,500 of
                    // room. NULL where no cap is set; a dash, never a zero.
                    const space = capRow(yr).capSpace;
                    if (space === null || space === undefined) {
                      return <td key={yr}>&mdash;</td>;
                    }
                    return (
                      <td
                        key={yr}
                        className={Number(space) < 0 ? 'num negative' : 'num positive'}
                      >
                        {money(space)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="grid-rule">
                  <th scope="row">
                    Min Spend ({Math.round(minSpendPct * 100)}%)
                  </th>
                  {seasons.map(function (yr) {
                    // Read where the cap is set; projected from the growth
                    // selector only where it is not, and marked as such.
                    const ms = capRow(yr).minSpend;
                    if (ms !== null && ms !== undefined) {
                      return <td key={yr}>{money(ms)}</td>;
                    }
                    return (
                      <td key={yr} className={projClass(yr)}>
                        {derived(yr, function (v) {
                          return Math.ceil(v * minSpendPct);
                        })}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row">Cash Committed</th>
                  {seasons.map(function (yr) {
                    return (
                      <td key={yr} className="v-cash">
                        {money(capRow(yr).cashCommitted)}
                      </td>
                    );
                  })}
                </tr>
                {anyDeadCash && (
                  <tr>
                    <th scope="row">&nbsp;&nbsp;of which dead cash</th>
                    {seasons.map(function (yr) {
                      const d = Number(capRow(yr).deadCash) || 0;
                      return (
                        <td key={yr} className={d > 0 ? 'v-dead' : ''}>
                          {d > 0 ? money(capRow(yr).deadCash) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr>
                  <th scope="row">Cash Available</th>
                  {seasons.map(function (yr) {
                    const v = cashAvailable[yr];
                    return (
                      <td key={yr} className={v === undefined ? '' : 'v-cash'}>
                        {v === undefined ? '—' : money(v)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="empty-note">
            Cap Ceiling is the ceiling the league enforces for the season: the
            ceiling the Commissioner has set, or the base cap where none is
            set. Under rule 5.5 a team&rsquo;s ceiling also includes its own
            rollover from the previous season; rollover has not been
            calculated yet, so no season shown here includes it. It is a
            different figure from the 125% allowance used in auction cap flags.
          </p>
          <p className="empty-note">
            SET seasons use the cap entered by the Commissioner. PROV marks a
            cap the Commissioner has entered as a placeholder; the official
            figure is set by March 1 of that league year. PROJ seasons are
            estimates only. Cash Available shows a dash for seasons with no
            budget set yet. Dead money from a cut is charged to the team and
            appears in Cap Hit and Cash Committed once a cut is made. Every
            figure on this tab is exact, to the cent &mdash; the headline
            figures on Overview and in the bar above are rounded so that a cost
            never reads low and room never reads high.
          </p>
        </div>
      )}

      {tab === 'roster' && (
        <div>
          <div className="control-row">
            <label htmlFor="rseason">Season</label>
            <select
              id="rseason"
              value={rosterSeason}
              onChange={function (e) {
                setRosterSeason(Number(e.target.value));
              }}
            >
              {seasons.map(function (yr) {
                return (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                );
              })}
            </select>

            <label htmlFor="rsort">Sort by</label>
            <select
              id="rsort"
              value={sortKey + ':' + sortDir}
              onChange={function (e) {
                const parts = e.target.value.split(':');
                setSortKey(parts[0]);
                setSortDir(parts[1]);
              }}
            >
              {SORT_COLUMNS.map(function (col) {
                const first = col.numeric ? 'desc' : 'asc';
                const second = col.numeric ? 'asc' : 'desc';
                return [
                  <option key={col.key + first} value={col.key + ':' + first}>
                    {col.label + (col.numeric ? ' (high-low)' : ' (A-Z)')}
                  </option>,
                  <option key={col.key + second} value={col.key + ':' + second}>
                    {col.label + (col.numeric ? ' (low-high)' : ' (Z-A)')}
                  </option>,
                ];
              })}
            </select>
          </div>

          {/* R-10. Colour on a row says what KIND of contract it is, and it
              marks the exceptions: a rookie deal is teal, a practice-squad deal
              is dimmed with a dashed edge, and veteran free agency -- most of
              every roster -- is unmarked. Position labels stay neutral. */}
          {(markersShown['ct-rookie'] || markersShown['ct-practice']) && (
            <div className="ct-key edfl-hq-key">
              {markersShown['ct-rookie'] && (
                <span className="ct-key-item">
                  <span
                    className="ct-key-swatch"
                    style={{ background: 'var(--ct-rookie)' }}
                    aria-hidden="true"
                  />
                  Rookie deal
                </span>
              )}
              {markersShown['ct-practice'] && (
                <span className="ct-key-item">
                  <span
                    className="ct-key-swatch"
                    style={{ background: 'var(--ct-practice)' }}
                    aria-hidden="true"
                  />
                  Practice squad deal
                </span>
              )}
              <span className="ct-key-item">Everything else is veteran free agency.</span>
            </div>
          )}

          {/* WRAPPED IN .table-scroll IN PHASE 2B. Nine columns with nowrap
              headers need about 1,080px and the page column is 992px, so on any
              window between 640px (where globals.css flips .ledger to cards)
              and roughly 1,120px the table was pushing the WHOLE PAGE sideways
              -- the hero, the banner and the tabs with it. The wrapper confines
              the scroll to the table and, through the kit's own rule, draws it
              as a card like every other table in the app. */}
          <div className="table-scroll">
            <table className="ledger">
            <thead>
              <tr>
                {SORT_COLUMNS.map(function (col) {
                  const active = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className={
                        (col.numeric ? 'col-num ' : '') +
                        'th-sort' +
                        (active ? ' is-sorted' : '')
                      }
                      tabIndex={0}
                      role="columnheader"
                      onClick={function () {
                        handleSort(col);
                      }}
                      onKeyDown={function (e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSort(col);
                        }
                      }}
                      aria-sort={
                        active
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {col.label}
                      <span className="sort-caret">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </th>
                  );
                })}
                {showActions && <th>&nbsp;</th>}
              </tr>
            </thead>
            <tbody>
              {sortedRoster().map(function (c) {
                return (
                  <tr key={c.id} className={c.markerClass || undefined}>
                    <td className="team-name" data-label="Player">
                      {/* The marker colour is carried by the NAME, across the
                          whole of it, not by a stripe beside it -- the
                          commissioner's own correction after the first cut had
                          too little contrast to read. */}
                      <span className={c.markerClass ? 'ct-name' : undefined}>
                        <PlayerLink playerId={c.playerId}>{c.name}</PlayerLink>
                      </span>
                      {c.isVoidYear && <span className="void-tag"> VOID YR</span>}
                      {/*
                        Shown only when the player is NOT on the active roster.
                        A "Squad" column would be a column of "Active" for every
                        row on almost every team -- same reasoning as the VOID YR
                        tag beside it, which also only appears when it is true.

                        This is roster_status, which is where the player sits
                        THIS WEEK. The row's colour is contract_type, which is
                        what kind of deal he is on. They are different facts and
                        a player can be one without the other.
                      */}
                      {c.rosterStatus === 'taxi' && <span className="void-tag"> PRACTICE SQUAD</span>}
                      {c.rosterStatus === 'ir' && <span className="void-tag"> IR</span>}
                      {/*
                        Rule 3.3(i). The badge is the count; the sentence the
                        database composed is the tooltip, so the table stays
                        scannable and the full wording is still one hover away
                        -- and is still never composed here. The same row is
                        rendered in full by the Move dialog and the player card.

                        Since September 15, 2026 three weeks no longer END
                        eligibility: they buy one last demotion, and the player
                        is LOCKED onto the active roster on his fourth promotion
                        or fourth counted week. The view's `locked` is that
                        state (eligibility_spent is the old name for the same
                        column); `last_demotion_available` is the three-week
                        state where the owner still has a choice, and that --
                        not two weeks -- is when the badge turns urgent.
                      */}
                      {showTaxiBadge && taxiByContract[c.id] && (
                        <span
                          className={
                            'void-tag ps-tag' +
                            (taxiIsLocked(taxiByContract[c.id])
                              ? ' spent'
                              : taxiLastDemotion(taxiByContract[c.id])
                                ? ' urgent'
                                : '')
                          }
                          title={taxiByContract[c.id].warning}
                        >
                          {' '}
                          {taxiIsLocked(taxiByContract[c.id])
                            ? 'LOCKED TO ACTIVE ROSTER'
                            : taxiByContract[c.id].weeks_used +
                              ' OF ' +
                              taxiByContract[c.id].weeks_max +
                              ' WEEKS' +
                              (taxiLastDemotion(taxiByContract[c.id])
                                ? ' · LAST DEMOTION'
                                : '')}
                        </span>
                      )}
                    </td>
                    <td data-label="Pos">{c.position}</td>
                    <td data-label="Type">{c.typeLabel}</td>
                    <td data-label="Contract">
                      {c.span}
                      <span className="empty-note" style={{ marginLeft: 6 }}>
                        (Yr {c.yearInDeal}/{c.totalSpan})
                      </span>
                    </td>
                    <td className="num v-ppv col-num" data-label="PPV">
                      {money(c.ppv)}
                    </td>
                    <td className="num v-cap col-num" data-label="Cap Hit">
                      {money(c.capCharge)}
                    </td>
                    <td className="num v-cash col-num" data-label="Cash">
                      {money(c.cashValue)}
                    </td>
                    <td className="num v-dead col-num" data-label="Dead If Cut">
                      {money(c.deadCap)}
                      {c.deadCapLive && c.deadCapNext > 0 && (
                        <span className="empty-note" style={{ marginLeft: 6 }}>
                          +{money(c.deadCapNext)} next yr
                        </span>
                      )}
                      {!c.deadCapLive && (
                        <span className="empty-note" style={{ marginLeft: 6 }}>
                          est.
                        </span>
                      )}
                    </td>
                    {showActions && (
                      <td data-label="Actions">
                        {showMove && (
                          <button
                            type="button"
                            className="btn btn-quiet"
                            onClick={function () {
                              setMoveTarget(c);
                            }}
                          >
                            Move
                          </button>
                        )}
                        {showCut && (
                          <button
                            type="button"
                            className="btn btn-quiet"
                            onClick={function () {
                              setCutTarget(c);
                            }}
                          >
                            Cut
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>

          {rosterBySeason[rosterSeason].length === 0 && (
            <p className="empty-note">
              No contracts on the books for {rosterSeason}.
            </p>
          )}

          {rosterSeason === currentSeasonYear ? (
            <p className="empty-note">
              Dead If Cut is the live settlement from the dead-money engine
              for a cut made today, including any June 1st split. Open the Cut
              dialog for the full breakdown before committing to anything.
            </p>
          ) : (
            <p className="empty-note">
              Dead If Cut is marked &ldquo;est.&rdquo; for future seasons: it
              is a static projection that cannot know how many weeks will have
              been charged or whether a June 1st split will apply. Only the
              current season shows the live figure.
            </p>
          )}
        </div>
      )}

      {cutTarget && (
        <CutPlayerDialog
          player={cutTarget}
          onClose={function () {
            setCutTarget(null);
          }}
          onDone={function () {
            setCutTarget(null);
            router.refresh();
          }}
        />
      )}

      {moveTarget && (
        <RosterMoveDialog
          player={moveTarget}
          onClose={function () {
            setMoveTarget(null);
          }}
          onDone={function () {
            setMoveTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
