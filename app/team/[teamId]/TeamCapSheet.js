'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
import CutPlayerDialog from './CutPlayerDialog';
import RosterList from './RosterList';
import TeamOverview from './TeamOverview';
import MediaTab from './MediaTab';
import { formatExactMoney } from '../../../lib/formatMoney';

// THE ROSTER LIST LEFT THIS FILE on November 11, 2026 (UI test batch 10): the
// Option C rows, the squad switch, the position pills and their filters are
// RosterList.js. ?show=<key> from the Overview's roster bar is read there.

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

  // The view and the filter come from the URL, through page.js's searchParams
  // -- that is how a roster-bar box lands on its section. Anything
  // unrecognised falls back to Overview / all, so a stale link cannot break it.
  // Since batch 7 there is no tab row to change it in place: a link is the
  // only way between views, so this is a constant, not state.
  const initialTab = ['overview', 'roster', 'money', 'media'].indexOf(props.initialTab) >= 0
    ? props.initialTab
    : 'overview';
  const tab = initialTab === 'media' && !props.media ? 'overview' : initialTab;
  const [growth, setGrowth] = useState(0);
  const [rosterSeason, setRosterSeason] = useState(seasons[0]);
  const [cutTarget, setCutTarget] = useState(null);

  // ?cut=<contract id> -- the full player card's Cut link (UI test batch 10):
  // Cut left the roster row, so the card's link lands here and opens the Cut
  // dialog for that contract. Own roster, current season only (canCut);
  // cut_player() still enforces ownership itself.
  const cutOpened = useRef(false);
  useEffect(
    function () {
      if (cutOpened.current || !props.initialCut || !canCut) return;
      const row = (rosterBySeason[currentSeasonYear] || []).find(function (r) {
        return r.id === props.initialCut && !r.onWaivers;
      });
      cutOpened.current = true;
      if (row) setCutTarget(row);
    },
    [props.initialCut, canCut, rosterBySeason, currentSeasonYear]
  );

  const taxiByContract = props.taxiByContract || {};

  // ON WAIVERS -- October 6, 2026. Rows page.js marked onWaivers: cut in season,
  // pending on the wire. Ruling W-10: he is off the roster immediately, so he
  // fills no Active, Practice Squad or IR slot -- the compliance view and the
  // roster bar already leave him out (edfl_on_waivers()). His cap hit and cash
  // stay on this team, worst case, until the run settles him, so his money is
  // shown here and still counts in the Money tab. No Cut, Move or designation
  // control: he has been cut, and the wire is not this page's to change.
  const waivedRows = (rosterBySeason[rosterSeason] || []).filter(function (r) {
    return r.onWaivers;
  });
  const waiverError = props.waiverError || null;

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

  const projWeek = props.projWeek || null;
  const projError = props.projError || null;

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

      {tab === 'media' && props.media ? (
        <MediaTab media={props.media} teamId={teamId} />
      ) : null}

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
          isMine={Boolean(props.isMine)}
          teamId={teamId}
          teamName={props.teamName}
          positionRankings={props.positionRankings || null}
          positionRankingsError={props.positionRankingsError || null}
          positionRankingsGated={Boolean(props.positionRankingsGated)}
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
            different figure from the auction allowance used in auction cap flags.
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
          {/* Fails closed: without the wire read a waived player would be drawn
              back in his old section, which is the wrong answer the On waivers
              section exists to prevent. */}
          {waiverError && (
            <div className="form-error">
              Players on waivers could not be loaded: {waiverError}. A player this team has
              waived may be listed below in the roster section he was cut from.
            </div>
          )}

          {/* OPTION C (UI test batch 10, November 11, 2026). RosterList.js
              carries Lewis's markup and every rule of the new list; the order
              is page.js's projection order, and every figure on a row is a
              column of edfl_team_roster_rows(). Move, Cut, the ••• link, the
              two designations and the status tags left the row: the roster
              spot, the designations and the tags are on the Mini Player Card,
              Cut on the full player card (its Cut link lands here with
              ?cut=<contract>, which opens the Cut dialog below). */}
          <RosterList
            rows={rosterBySeason[rosterSeason] || []}
            extra={rosterSeason === currentSeasonYear ? props.rowExtra || {} : {}}
            extraError={rosterSeason === currentSeasonYear ? props.rowExtraError || null : null}
            projError={projError}
            projWeek={projWeek}
            isCurrent={rosterSeason === currentSeasonYear}
            season={rosterSeason}
            seasons={seasons}
            onSeason={function (yr) {
              setRosterSeason(yr);
            }}
            complianceRow={props.complianceRow}
            taxiByContract={taxiByContract}
            initialShow={props.initialShow}
          />
          {(rosterBySeason[rosterSeason] || []).length === 0 && (
            <p className="empty-note">No contracts on the books for {rosterSeason}.</p>
          )}

          {waivedRows.length > 0 && (
            <div>
              <h2 className="section-heading">On waivers</h2>
              <p className="empty-note">
                Cut and on the waiver wire. These players take no Active Roster, Practice
                Squad or IR spot. Their cap hit and cash stay on this team until the waiver
                run: if a team claims him, that team takes his contract; if he clears, he is
                released and the cut settlement is charged here.
              </p>
              <div className="table-scroll">
                <table className="ledger roster-ledger">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Pos</th>
                      <th>Type</th>
                      <th>Contract</th>
                      <th className="col-num">Cap Hit</th>
                      <th className="col-num">Cash</th>
                      <th>Waived</th>
                      <th>Claims resolve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waivedRows.map(function (c) {
                      const w = c.waiver || {};
                      return (
                        <tr key={c.id} className={c.markerClass || undefined}>
                          <td className="team-name" data-label="Player">
                            <span className="roster-player">
                              <span className={c.markerClass ? 'ct-name' : undefined}>
                                <PlayerLink playerId={c.playerId}>{c.name}</PlayerLink>
                              </span>
                            </span>
                            {c.isVoidYear && <span className="void-tag"> VOID YR</span>}
                            {/* Where he was when he was cut -- history, not a slot. */}
                            {c.rosterStatus === 'taxi' && (
                              <span className="void-tag"> CUT FROM PRACTICE SQUAD</span>
                            )}
                            {c.rosterStatus === 'ir' && <span className="void-tag"> CUT FROM IR</span>}
                          </td>
                          <td data-label="Pos">{c.position}</td>
                          <td data-label="Type">{c.typeLabel}</td>
                          <td data-label="Contract">
                            {c.span}
                            <span className="empty-note" style={{ marginLeft: 6 }}>
                              (Yr {c.yearInDeal}/{c.totalSpan})
                            </span>
                          </td>
                          <td className="num v-cap col-num" data-label="Cap Hit">
                            {money(c.capCharge)}
                          </td>
                          <td className="num v-cash col-num" data-label="Cash">
                            {money(c.cashValue)}
                          </td>
                          <td data-label="Waived">{w.waivedAtLabel || '—'}</td>
                          <td data-label="Claims resolve">
                            {w.runAtLabel
                              ? (w.runWeek ? 'Week ' + w.runWeek + ' run · ' : '') + w.runAtLabel
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
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

    </div>
  );
}
