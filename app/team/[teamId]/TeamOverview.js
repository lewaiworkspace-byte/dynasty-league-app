'use client';

import PositionRankings from './PositionRankings';
import { formatCost, formatRoom, formatMoney } from '../../../lib/formatMoney';

/**
 * THE TEAM HQ OVERVIEW -- "Home" -- five blocks, in this order since November
 * 11, 2026 (UI test batch 7, Lewis's notes on the Team HQ design canvas):
 *
 *   1. Salary cap         used against the ceiling, minimum-spend floor marked;
 *                         its footnote links to this team's Money view
 *   2. This week          live score, last week's result underneath
 *   3. Position rankings  production by position against the league, the
 *                         projections line and the FLEX blurb
 *                         (PositionRankings.js)
 *   4. Roster             counts against their limits; the heading opens
 *                         this team's Roster view
 *   5. Coming up          the next instants that affect this owner
 *
 * TWO BLOCKS LEFT IN BATCH 7. "Your recent moves" (Lewis: "Drop 'Your recent
 * moves' from the Home Page"), with its All Transactions and Draft Picks
 * buttons: /transactions is in League Office, /draft-picks in Analyst's
 * Office. The OWNER DIRECTORY ("drop this from the home page"): every owner's
 * card is on /office/owners, and an owner edits his own in Settings. Do not
 * bring either back here.
 *
 * NO RULE NUMBERS ON THIS VIEW (Lewis: "Drop this rule reference"). The roster
 * note and the nine boxes' hover text say what a figure means, not which
 * clause it comes from; the Rule Book is in League Office.
 *
 * THIS COMPONENT DECIDES NOTHING ABOUT COMPLIANCE. Every count and every limit
 * is a column of team_inseason_compliance, the same row the banner above the
 * tabs reads, so the strip and the banner cannot disagree and neither of them
 * counts a roster in JavaScript. A limit reached is gold (attention, and legal);
 * a limit exceeded is rust. Being UNDER a limit is never a failure -- that is
 * the September 8 ruling, and two teams were legally at 20 and 17 when the
 * banner shipped.
 *
 * MONEY HERE FOLLOWS R-12, NOT SR-22. This is a glance, not a money screen: a
 * cost rounds up and room rounds down, so nothing on it reads in the owner's
 * favour. The exact figures, to the cent, are on the Money view, and the
 * bar's own footnote links there.
 */

// A percentage for a BAR WIDTH, which is not money arithmetic -- it is a
// geometry. Clamped so a team 300 over the cap draws a full bar rather than
// one that overflows its track.
function pct(part, whole) {
  const p = Number(part);
  const w = Number(whole);
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) return null;
  const v = (p / w) * 100;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * THE ROSTER BAR -- commissioner's picture of September 21, 2026. Nine boxes:
 * the four squads against their limits, then the five positions as
 * Active/IR/Practice Squad. Every box is a LINK to the Roster tab filtered to
 * just the players in that section (?tab=roster&show=...), and a number is red
 * only when the compliance view says that section is out of compliance.
 *
 * WHAT MAKES A NUMBER RED, and it is the view's verdict every time:
 *   Active / Practice Sq / PS Non-Rookie / IR   the view's *_over_by > 0
 *   IR                                            also ir_no_designation_count > 0
 *                                                  (rule 3.4(b): a player there
 *                                                  with no qualifying designation)
 *   QB / K                                        qb_over_by / k_over_by > 0
 *                                                  (rule 3.5), or *_short > 0
 *   RB / WR / TE                                  *_short > 0, or flex_short > 0
 *                                                  (rule 3.1: the lineup cannot
 *                                                  be filled from these three)
 * A limit REACHED is gold -- attention, and legal -- exactly as before. Being
 * under a limit is never a failure (September 8 ruling). Every one of those
 * columns is team_inseason_compliance's own (psx_04 appended them); this file
 * compares integers it was handed and counts nothing.
 */
function CountCell(props) {
  const used = num(props.used);
  const limit = num(props.limit);
  let state = '';
  if (props.over) state = ' is-over';
  else if (used !== null && limit !== null && used === limit) state = ' is-full';
  // OCTOBER 17, 2026 (UI test batch 1): A METER UNDER THE FIGURE. Lewis,
  // October 12, on the nine boxes: "find a cleaner way to present these
  // buttons" -- and, of the meters-and-table version on the canvas, "that
  // is better". The bar's width is used over limit, a ratio of two integers
  // the view handed us, drawn once; nothing is counted or decided here, and
  // over the limit the bar is full and red like the figure.
  let pct = null;
  if (used !== null && limit !== null && limit > 0) {
    pct = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  }
  const body = (
    <>
      <div className="edfl-count-top">
        <div className="edfl-count-label">{props.label}</div>
        <div className="edfl-count-value">
          {used === null ? '—' : used}
          {limit === null ? '' : ' / ' + limit}
        </div>
      </div>
      {pct !== null ? (
        <div className="edfl-meter" aria-hidden="true">
          <div className="edfl-meter-fill" style={{ width: pct + '%' }} />
        </div>
      ) : null}
      {props.sub && <div className="edfl-count-sub">{props.sub}</div>}
    </>
  );
  if (props.href) {
    return (
      <a className={'edfl-count edfl-count-link edfl-count-meter' + state} href={props.href} title={props.title}>
        {body}
      </a>
    );
  }
  return (
    <div className={'edfl-count edfl-count-meter' + state} title={props.title}>
      {body}
    </div>
  );
}

/**
 * A position row: Active / IR / Practice Squad, straight from the view's three
 * count columns for that position. No limit is printed -- RB, WR and TE have
 * none, and QB and K show theirs by turning red under 3.5 rather than by a
 * "/ 3" that would read as a target.
 *
 * OCTOBER 17, 2026 (UI test batch 1): A ROW IN A SMALL TABLE, not a box. The
 * five positions sit under one header that names the columns (Active · IR ·
 * PS), so "2 / 0 / 2" is read under headings instead of as a code. Still an
 * <a> to the filtered roster, still the view's figures.
 */
function PositionCell(props) {
  const a = num(props.active);
  const i = num(props.ir);
  const t = num(props.taxi);
  const show = function (v) {
    return v === null ? '—' : v;
  };
  return (
    <a
      className={'edfl-posrow' + (props.over ? ' is-over' : '')}
      href={props.href}
      title={props.title}
    >
      <span className="edfl-posrow-label">{props.label}</span>
      <span className="edfl-posrow-num">{show(a)}</span>
      <span className={'edfl-posrow-num' + (i === 0 ? ' is-zero' : '')}>{show(i)}</span>
      <span className={'edfl-posrow-num' + (t === 0 ? ' is-zero' : '')}>{show(t)}</span>
    </a>
  );
}

function gt0(v) {
  const n = num(v);
  return n !== null && n > 0;
}

function ListBlock(props) {
  return (
    <div className="edfl-list">
      {props.rows.map(function (row) {
        return (
          <div
            className={'edfl-list-item' + (row.flag ? ' is-flag' : '')}
            key={row.key}
          >
            <div className="edfl-list-when">{row.when}</div>
            <div className="edfl-list-what">
              <div className="edfl-list-title">{row.title}</div>
              {row.note && <div className="edfl-list-note">{row.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TeamOverview(props) {
  const row = props.complianceRow;
  const currentSeasonYear = props.currentSeasonYear;
  const matchup = props.matchup;
  const isMine = Boolean(props.isMine);

  // Where a roster-bar box goes: this team's Roster tab, filtered to that
  // section. Plain anchors, like every other link on this tab -- the page is
  // dynamic, so the server re-renders with the query and TeamCapSheet opens on
  // the tab and filter it names. The vocabulary (active, taxi, taxi-nonrookie,
  // ir, QB, RB, WR, TE, K) is TeamCapSheet's ROSTER_FILTERS and lives there.
  function rosterHref(show) {
    return '/team/' + props.teamId + '?tab=roster&show=' + encodeURIComponent(show);
  }

  // ---- 1. The cap bar ----------------------------------------------------
  //
  // used and ceiling both come from team_inseason_compliance, so the bar's two
  // ends are measured against each other rather than against two views that
  // could drift. The minimum-spend floor comes from team_cap_by_season's
  // min_required_spend, which is the figure the database enforces -- it is not
  // the percentage multiplied by the cap here.
  const capUsed = row ? num(row.cap_used) : null;
  const capCeiling = row ? num(row.cap_ceiling) : null;
  const capOverBy = row ? num(row.cap_over_by) : null;
  const capRowFound = row ? Boolean(row.cap_row_found) : false;
  const minSpend = num(props.minSpend);
  const capSpace = num(props.capSpace);

  const usedPct = pct(capUsed, capCeiling);
  const floorPct = pct(minSpend, capCeiling);
  const isOver = capOverBy !== null && capOverBy > 0;
  const belowFloor =
    minSpend !== null && capUsed !== null ? capUsed < minSpend : false;

  return (
    <div>
      {/* ---- 1. CAP BAR --------------------------------------------------- */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">Salary cap</h2>
        {!row || !capRowFound || capCeiling === null ? (
          <p className="empty-note">
            No salary cap is set for {currentSeasonYear}, so there is nothing to measure this
            team against yet.
          </p>
        ) : (
          <div className={'edfl-capbar' + (isOver ? ' is-over' : '')}>
            <div className="edfl-capbar-head">
              <div>
                <span className="edfl-capbar-used">{formatCost(capUsed)}</span>{' '}
                <span className="edfl-capbar-of">
                  of {formatMoney(capCeiling)} ceiling
                </span>
              </div>
              <div className="edfl-capbar-room">
                {isOver
                  ? formatCost(capOverBy) + ' over'
                  : capSpace === null
                  ? 'room not reported'
                  : formatRoom(capSpace) + ' room'}
              </div>
            </div>

            <div className="edfl-capbar-track">
              <div
                className="edfl-capbar-fill"
                style={{ width: (usedPct === null ? 0 : usedPct) + '%' }}
              />
              {floorPct !== null && (
                <span
                  className="edfl-capbar-floor"
                  style={{ left: floorPct + '%' }}
                  aria-hidden="true"
                />
              )}
            </div>

            <div className="edfl-capbar-foot">
              <span className={belowFloor ? 'is-floor' : ''}>
                {minSpend === null
                  ? 'No minimum spend set for this season.'
                  : 'Minimum spend ' +
                    formatCost(minSpend) +
                    (belowFloor ? ' — below it' : ' — cleared')}
              </span>
              <a href={'/team/' + props.teamId + '?tab=money'}>Exact figures on Money</a>
            </div>
          </div>
        )}
      </div>

      {/* ---- 2. THIS WEEK ------------------------------------------------- */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">This week</h2>
        {props.scoreError ? (
          <div className="form-error">
            The scoreboard could not be loaded: {props.scoreError}.
          </div>
        ) : !matchup ? (
          <p className="empty-note">
            No {currentSeasonYear} fixture has been loaded for this team yet. The Scoreboard
            pulls the schedule from Sleeper.
          </p>
        ) : (
          <div className="edfl-matchup">
            <div className="edfl-matchup-head">
              <span>WEEK {matchup.weekNumber}</span>
              <span
                className={
                  matchup.hasScores && !matchup.isFinal && !matchup.notStarted
                    ? 'is-live'
                    : ''
                }
              >
                {matchup.notStarted
                  ? 'NOT STARTED'
                  : !matchup.hasScores
                  ? 'NO SCORES YET'
                  : matchup.isFinal
                  ? 'FINAL'
                  : 'IN PROGRESS'}
              </span>
            </div>

            <div
              className={
                'edfl-mt-row is-me' + (matchup.iLead === true ? ' is-lead' : '')
              }
            >
              <span className="edfl-mt-name">{matchup.myName}</span>
              <span className="edfl-mt-you">YOU</span>
              <span className="edfl-mt-score">
                {matchup.myPoints === null ? '—' : matchup.myPoints}
              </span>
            </div>
            <div
              className={'edfl-mt-row' + (matchup.iLead === false ? ' is-lead' : '')}
            >
              <span className="edfl-mt-name">{matchup.oppName}</span>
              <span className="edfl-mt-score">
                {matchup.oppPoints === null ? '—' : matchup.oppPoints}
              </span>
            </div>

            <div className="edfl-matchup-foot">
              {matchup.previous && matchup.previous.hasScores ? (
                <>
                  Week {matchup.previous.weekNumber}:{' '}
                  {matchup.previous.iWon === null
                    ? 'tied'
                    : matchup.previous.iWon
                    ? 'won'
                    : 'lost'}{' '}
                  {matchup.previous.myPoints}&ndash;{matchup.previous.oppPoints} against{' '}
                  {matchup.previous.oppName}.
                </>
              ) : (
                <>No earlier result this season.</>
              )}{' '}
              {/* Phase 2G-2. The matchup link goes FIRST because it is the one
                  that concerns this team; the Scoreboard is the way out to the
                  other four games. matchupId can be null for a fixture loaded
                  before 2G-2 added it to the select, so the link is
                  conditional rather than a route built from undefined. */}
              {matchup.matchupId !== null && matchup.matchupId !== undefined && (
                <>
                  <a href={'/matchup/' + matchup.weekNumber + '/' + matchup.matchupId}>
                    Full matchup
                  </a>
                  {' \u00b7 '}
                </>
              )}
              <a href="/scoreboard">Scoreboard</a>
            </div>
          </div>
        )}
      </div>

      {/* ---- 3. POSITION RANKINGS ----------------------------------------- */}
      <PositionRankings
        data={props.positionRankings}
        error={props.positionRankingsError}
        gated={Boolean(props.positionRankingsGated)}
        isMine={isMine}
        teamName={props.teamName}
        season={currentSeasonYear}
      />

      {/* ---- 4. ROSTER (compliance state) -------------------------------- */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">
          <a className="edfl-headlink" href={'/team/' + props.teamId + '?tab=roster'}>
            Roster
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 5l5 5-5 5" />
            </svg>
          </a>
        </h2>
        {props.complianceError ? (
          <div className="form-error">
            Roster counts could not be loaded: {props.complianceError}. This block is not
            telling you whether this roster is legal.
          </div>
        ) : !row ? (
          <div className="form-notice">
            No compliance row exists for this team in the current season, so there are no
            roster counts to show.
          </div>
        ) : (
          <div className="edfl-counts edfl-rosterbar">
            <CountCell
              label="ACTIVE"
              used={row.active_count}
              limit={row.active_roster_size}
              over={gt0(row.active_over_by)}
              href={rosterHref('active')}
              title="Click to list the active roster."
            />
            <CountCell
              label="PRACTICE SQ"
              used={row.ps_count}
              limit={row.taxi_squad_size}
              over={gt0(row.ps_over_by)}
              href={rosterHref('taxi')}
              title="Click to list the practice squad."
            />
            <CountCell
              label="PS NON-ROOKIE"
              used={row.ps_non_rookie_count}
              limit={row.taxi_non_rookie_slots}
              over={gt0(row.ps_non_rookie_over_by)}
              href={rosterHref('taxi-nonrookie')}
              title="Click to list the practice squad players not on rookie contracts."
            />
            <CountCell
              label="IR"
              used={row.ir_count}
              limit={row.ir_slots}
              over={gt0(row.ir_over_by) || gt0(row.ir_no_designation_count)}
              href={rosterHref('ir')}
              title={
                gt0(row.ir_no_designation_count)
                  ? 'A player on injured reserve carries no qualifying designation. Click to list injured reserve.'
                  : 'Click to list injured reserve.'
              }
            />
          </div>
        )}
        {row && (
          <div className="edfl-posgrid" role="list" aria-label="Roster by position">
            <div className="edfl-posrow edfl-posrow-head" aria-hidden="true">
              <span className="edfl-posrow-label">By position</span>
              <span className="edfl-posrow-num">Active</span>
              <span className="edfl-posrow-num">IR</span>
              <span className="edfl-posrow-num">PS</span>
            </div>
            <PositionCell
              label="QB"
              active={row.qb_count}
              ir={row.qb_ir_count}
              taxi={row.qb_taxi_count}
              over={gt0(row.qb_over_by) || gt0(row.qb_short)}
              href={rosterHref('QB')}
              title="At most three on the active roster. Click to list the quarterbacks."
            />
            <PositionCell
              label="RB"
              active={row.rb_count}
              ir={row.rb_ir_count}
              taxi={row.rb_taxi_count}
              over={gt0(row.rb_short) || gt0(row.flex_short)}
              href={rosterHref('RB')}
              title="Click to list the running backs."
            />
            <PositionCell
              label="WR"
              active={row.wr_count}
              ir={row.wr_ir_count}
              taxi={row.wr_taxi_count}
              over={gt0(row.wr_short) || gt0(row.flex_short)}
              href={rosterHref('WR')}
              title="Click to list the wide receivers."
            />
            <PositionCell
              label="TE"
              active={row.te_count}
              ir={row.te_ir_count}
              taxi={row.te_taxi_count}
              over={gt0(row.te_short) || gt0(row.flex_short)}
              href={rosterHref('TE')}
              title="Click to list the tight ends."
            />
            <PositionCell
              label="K"
              active={row.k_count}
              ir={row.k_ir_count}
              taxi={row.k_taxi_count}
              over={gt0(row.k_over_by) || gt0(row.k_short)}
              href={rosterHref('K')}
              title="At most three on the active roster. Click to list the kickers."
            />
          </div>
        )}
        {row && (
          <p className="empty-note">
            A count at its limit is marked; a count under its limit is not a failure. A red
            figure is out of compliance, and the compliance pill at the top says why. Click any
            limit or position to list those players.
          </p>
        )}
      </div>

      {/* ---- 5. COMING UP -------------------------------------------------- */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">Coming up</h2>
        {props.comingUp.length === 0 ? (
          <p className="empty-note">
            Nothing further is on the {currentSeasonYear} calendar.
          </p>
        ) : (
          <ListBlock rows={props.comingUp} />
        )}
        <p className="page-actions edfl-hq-links">
          <a className="btn" href="/calendar">
            League Calendar
          </a>
          <a className="btn" href="/waivers">
            Waiver Wire
          </a>
        </p>
      </div>
    </div>
  );
}
