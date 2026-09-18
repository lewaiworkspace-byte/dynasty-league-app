'use client';

import OwnerInfoPanel from '../../../components/OwnerInfoPanel';
import PlayerLink from '../../../components/PlayerLink';
import { formatCost, formatRoom, formatMoney } from '../../../lib/formatMoney';

/**
 * THE TEAM HQ OVERVIEW TAB -- ruling R-11, five blocks, in this order:
 *
 *   1. Compliance state   roster counts against their limits
 *   2. Cap bar            used against the ceiling, minimum-spend floor marked
 *   3. This week          live score, last week's result underneath
 *   4. Coming up          the next instants that affect this owner
 *   5. Recent moves       the last few transactions on this team
 *
 * Plus two things R-11 does not name, and they are here on purpose rather than
 * by drift. R-9 cut Team HQ to three tabs -- Overview, Roster, Money -- and the
 * page it cut them from had five, the two extra being Draft Picks and Owner
 * Info. Draft Picks needed no home: /draft-picks is the same board for every
 * team, and the link strip below points at it. OWNER INFO HAD NO OTHER HOME AT
 * ALL for an ordinary owner -- it is the only surface where they can edit their
 * own card -- so it sits at the foot of this tab rather than being dropped.
 * If 2C gives the directory a league-level route, delete the block and the
 * import; nothing else here depends on it.
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
 * favour. The exact figures, to the cent, are one tab away on Money, and the
 * bar's own footnote says so.
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
 * One cell of the roster-count strip. `used` and `limit` are both the view's
 * own columns; nothing is derived and nothing is counted here.
 */
function CountCell(props) {
  const used = num(props.used);
  const limit = num(props.limit);
  let state = '';
  if (used !== null && limit !== null) {
    if (used > limit) state = ' is-over';
    else if (used === limit) state = ' is-full';
  }
  return (
    <div className={'edfl-count' + state}>
      <div className="edfl-count-label">{props.label}</div>
      <div className="edfl-count-value">
        {used === null ? '—' : used}
        {limit === null ? '' : ' / ' + limit}
      </div>
    </div>
  );
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

  // ---- 2. The cap bar ----------------------------------------------------
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
      {/* ---- 1. COMPLIANCE STATE ------------------------------------------ */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">Roster</h2>
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
          <div className="edfl-counts">
            <CountCell label="ACTIVE" used={row.active_count} limit={row.active_roster_size} />
            <CountCell label="PRACTICE SQ" used={row.ps_count} limit={row.taxi_squad_size} />
            <CountCell
              label="PS NON-ROOKIE"
              used={row.ps_non_rookie_count}
              limit={row.taxi_non_rookie_slots}
            />
            <CountCell label="IR" used={row.ir_count} limit={row.ir_slots} />
            <CountCell label="QB" used={row.qb_count} limit={row.qb_max} />
            <CountCell label="K" used={row.k_count} limit={row.k_max} />
          </div>
        )}
        {row && (
          <p className="empty-note">
            Rules 3.1&ndash;3.5. A count at its limit is marked; a count under its limit is
            not a failure. The banner above says whether the roster is legal and why.
          </p>
        )}
      </div>

      {/* ---- 2. CAP BAR --------------------------------------------------- */}
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
              <span>Exact figures on Money.</span>
            </div>
          </div>
        )}
      </div>

      {/* ---- 3. THIS WEEK ------------------------------------------------- */}
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
              <a href="/scoreboard">Scoreboard</a>
            </div>
          </div>
        )}
      </div>

      {/* ---- 4. COMING UP -------------------------------------------------- */}
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

      {/* ---- 5. RECENT MOVES ---------------------------------------------- */}
      <div className="edfl-hq-block">
        <h2 className="section-heading">{isMine ? 'Your recent moves' : 'Recent moves'}</h2>
        {props.recentMovesGated ? (
          /* Not "sign in": under R-7 the middleware means nobody reaches this
             page without a session. This is the signed-in-but-unlinked case --
             a login with no team_owners row -- which is the only way
             getCurrentTeamOwner() returns null here. */
          <p className="empty-note">
            Your login is not linked to a team yet, so transactions are not being
            shown.
          </p>
        ) : props.recentMovesError ? (
          <div className="form-error">
            Transactions could not be loaded: {props.recentMovesError}.
          </div>
        ) : props.recentMoves.length === 0 ? (
          <p className="empty-note">
            No transactions recorded for this team in {currentSeasonYear}.
          </p>
        ) : (
          <div className="edfl-list">
            {props.recentMoves.map(function (m) {
              return (
                <div className="edfl-list-item" key={m.log_id}>
                  <div className="edfl-list-when">{m.when}</div>
                  <div className="edfl-list-what">
                    <div className="edfl-list-title">
                      {m.player_name ? (
                        <PlayerLink playerId={m.player_id}>{m.player_name}</PlayerLink>
                      ) : (
                        m.title
                      )}
                      {m.player_name && m.player_position ? (
                        <span className="edfl-list-note"> {m.player_position}</span>
                      ) : null}
                    </div>
                    <div className="edfl-list-note">{m.description || m.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="page-actions edfl-hq-links">
          <a className="btn" href="/transactions">
            All Transactions
          </a>
          <a className="btn" href="/draft-picks">
            Draft Picks
          </a>
        </p>
      </div>

      {/* ---- OWNER DIRECTORY ----------------------------------------------
          Not one of R-11's five. It is here because R-9 removed the tab it used
          to live on and an ordinary owner has nowhere else to edit their own
          card -- /admin/owner-activity is officer-only. Mounted with the
          DEFAULT editScope, which is self-only; an officer editing somebody
          else's card belongs on that admin page, exactly as cut-from-any-roster
          belongs on /admin/cuts. Do not widen it here. That rule has been
          broken once already. */}
      {props.showOwnerInfo && (
        <div className="edfl-hq-block">
          <h2 className="section-heading">Owner directory</h2>
          <OwnerInfoPanel rows={props.ownerDirectory} loadError={props.ownerDirectoryError} />
        </div>
      )}
    </div>
  );
}
