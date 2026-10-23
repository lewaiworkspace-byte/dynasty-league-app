'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
import CutPlayerDialog from './CutPlayerDialog';
import RosterMoveDialog from './RosterMoveDialog';
import InjuryCross from '../../../components/InjuryCross';
import TeamOverview from './TeamOverview';
import MediaTab from './MediaTab';
import { formatExactMoney } from '../../../lib/formatMoney';
import { headshotUrl, playerInitials } from '../../../lib/playerHeadshot';
import { setPoachExemption, setTaxiHold } from './actions';

// THE ROSTER FILTER -- September 21, 2026; PILLS since October 22, 2026 (UI
// test batch 5). The Overview's roster bar links here with
// ?tab=roster&show=<key>, and the pill row above the roster offers the same
// keys. Each key is a SECTION of the roster. The test reads the row's own
// roster_status / position / contract type; it decides nothing about
// legality, and the counts the bar shows are the compliance view's, not these.
//
// Lewis, October 22: "Replace the Sort with a new 'Sort' that has position
// pills, IR pill, PS pill, Active pill", and "I want an 'All' pill and a
// 'Flex' pill". One pill at a time, All by default; Flex is RB, WR and TE
// (the flex pool of edfl_best_ball_lineup and lib/statsHelpers.js). The Show
// and Sort-by dropdowns are gone, and so is the "Practice squad -- not on a
// rookie deal" OPTION. The key itself stays (pill: false) because the
// roster bar's PS NON-ROOKIE meter links to it: arriving that way lights the
// PS pill and says which narrower list is showing.
//
// 'taxi-nonrookie' is rule 3.3(b)'s definition, which is NOT "contract_type <>
// rookie": a rookie whose draft class has expired counts as a non-rookie there.
// The row carries ps_rule_subject from taxi_eligibility_status for exactly that
// test, so the filter and the view's ps_non_rookie_count agree.
//
// `status` marks the three keys that read roster_status -- where the player
// sits THIS WEEK. A future season's roster has no squads yet, so those pills
// are drawn on the current season only, and a status key carried into another
// season shows everyone.
const ROSTER_FILTERS = [
  { key: 'all', label: 'All', pill: true },
  { key: 'QB', label: 'QB', pill: true },
  { key: 'RB', label: 'RB', pill: true },
  { key: 'WR', label: 'WR', pill: true },
  { key: 'TE', label: 'TE', pill: true },
  { key: 'flex', label: 'Flex', pill: true },
  { key: 'K', label: 'K', pill: true },
  { key: 'active', label: 'Active', pill: true, status: true },
  { key: 'ir', label: 'IR', pill: true, status: true },
  { key: 'taxi', label: 'PS', pill: true, status: true },
  { key: 'taxi-nonrookie', label: 'PS', pill: false, status: true, lights: 'taxi' },
];

const FLEX_POSITIONS = ['RB', 'WR', 'TE'];

function filterKey(v) {
  return ROSTER_FILTERS.some(function (f) {
    return f.key === v;
  })
    ? v
    : 'all';
}

function filterDef(key) {
  return (
    ROSTER_FILTERS.find(function (f) {
      return f.key === key;
    }) || ROSTER_FILTERS[0]
  );
}

function rowMatches(row, show, taxiRow) {
  if (show === 'all') return true;
  if (show === 'active' || show === 'taxi' || show === 'ir') return row.rosterStatus === show;
  if (show === 'taxi-nonrookie') {
    if (row.rosterStatus !== 'taxi') return false;
    const subject = taxiRow && taxiRow.ps_rule_subject === true;
    return !(row.contractType === 'rookie' && subject);
  }
  if (show === 'flex') return FLEX_POSITIONS.indexOf(row.position) >= 0;
  return row.position === show;
}

// THE STATS LINE -- UI test batch 5. Lewis: "the stats in a line below the
// player's name like Sleeper". The current season's totals from
// edfl_player_season_stats, read by page.js; the figures by position were read
// back and approved on October 22:
//   QB     pass yd, pass TD, INT, rush yd, rush TD
//   RB     rush yd, rush TD, rec, rec yd, rec TD
//   WR/TE  targets, rec, rec yd, rec TD
//   K      FG made/att, XP made/att
// then every player's EDFL points and points per game. The line opens with
// this week's projection. Points are not money: the view's figures are shown
// to one decimal, never summed or derived here.
const STAT_LINES = {
  QB: [
    ['passing_yards', 'PASS YD'],
    ['passing_tds', 'PASS TD'],
    ['interceptions', 'INT'],
    ['rushing_yards', 'RUSH YD'],
    ['rushing_tds', 'RUSH TD'],
  ],
  RB: [
    ['rushing_yards', 'RUSH YD'],
    ['rushing_tds', 'RUSH TD'],
    ['receptions', 'REC'],
    ['receiving_yards', 'REC YD'],
    ['receiving_tds', 'REC TD'],
  ],
  WR: [
    ['targets', 'TGT'],
    ['receptions', 'REC'],
    ['receiving_yards', 'REC YD'],
    ['receiving_tds', 'REC TD'],
  ],
  TE: [
    ['targets', 'TGT'],
    ['receptions', 'REC'],
    ['receiving_yards', 'REC YD'],
    ['receiving_tds', 'REC TD'],
  ],
};

function statInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

function statDec1(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

function statItems(c, seasonYear) {
  const items = [];
  if (c.proj !== null && c.proj !== undefined) {
    items.push({ key: 'proj', value: statDec1(c.proj), label: 'PROJ', proj: true });
  }
  const s = c.stats;
  if (!s) {
    items.push({ key: 'none', value: null, label: 'No ' + seasonYear + ' stats' });
    return items;
  }
  if (c.position === 'K') {
    items.push({ key: 'fg', value: statInt(s.fg_made) + '/' + statInt(s.fg_att), label: 'FG' });
    items.push({ key: 'xp', value: statInt(s.xp_made) + '/' + statInt(s.xp_att), label: 'XP' });
  } else {
    (STAT_LINES[c.position] || []).forEach(function (pair) {
      items.push({ key: pair[0], value: statInt(s[pair[0]]), label: pair[1] });
    });
  }
  const pts = statDec1(s.fantasy_points);
  const ppg = statDec1(s.fppg);
  if (pts !== null) items.push({ key: 'pts', value: pts, label: 'PTS' });
  if (ppg !== null) items.push({ key: 'ppg', value: ppg, label: 'PPG' });
  return items;
}

// The headshot: Sleeper's CDN by URL, initials underneath (lib/playerHeadshot.js;
// player-card.md -- never next/image). A missing headshot is the normal case.
//
// THE EFFECT IS NOT DECORATION. This list is drawn on the server, so the <img>
// can fail (Sleeper answers 403 for most practice squad bodies) BEFORE React
// has attached onError -- the event is lost and the browser's broken-image
// mark sat on top of the initials (seen on the batch-5 fixture). On mount, an
// image that has already finished with no pixels is treated as broken.
function RosterFace(props) {
  const [broken, setBroken] = useState(false);
  const imgRef = useRef(null);
  const url = headshotUrl(props.sleeperId, 'thumb');
  useEffect(
    function () {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth === 0) setBroken(true);
    },
    [url]
  );
  return (
    <span className="edfl-rr-face" aria-hidden="true">
      <span className="edfl-rr-face-fallback">{playerInitials(props.name)}</span>
      {url && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          className="edfl-rr-face-img"
          src={url}
          alt=""
          loading="lazy"
          onError={function () {
            setBroken(true);
          }}
        />
      )}
    </span>
  );
}

// THE THREE TABS ARE OVERVIEW, ROSTER AND MONEY -- ruling R-9, phase 2B.
//
// AND A FOURTH, ON YOUR OWN TEAM ONLY -- ruling MEDIA-1, September 19 2026.
// MEDIA carries Insider Threat: Dianna's feed, the Tell Dianna form and Mort's
// Thoughts. It is drawn only when props.media is non-null, which page.js sets
// only for the viewer's own Team HQ. Another owner's HQ keeps three tabs.
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

  // The opening tab and filter come from the URL, through page.js's
  // searchParams -- that is how a roster-bar box lands on its section. Anything
  // unrecognised falls back to Overview / all, so a stale link cannot break it.
  const initialTab = ['overview', 'roster', 'money', 'media'].indexOf(props.initialTab) >= 0
    ? props.initialTab
    : 'overview';
  const [tab, setTab] = useState(initialTab === 'media' && !props.media ? 'overview' : initialTab);
  const [growth, setGrowth] = useState(0);
  const [rosterSeason, setRosterSeason] = useState(seasons[0]);
  const [show, setShow] = useState(filterKey(props.initialShow));
  const [cutTarget, setCutTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);

  // The two practice squad designations (September 21, 2026 rulings): a poaching
  // EXEMPTION on a practice squad player (rule 5.17(l)) and a HOLD on an elevated
  // player (rule 3.3(d)(i)). Both are one Server Action each, both refusals are
  // the database's sentence, and the page re-reads after either so the badge,
  // the compliance row and the poaching board all move together.
  const [designationBusy, setDesignationBusy] = useState(null);
  const [designationError, setDesignationError] = useState('');
  const [designationNotice, setDesignationNotice] = useState('');

  function runDesignation(id, fn, doneText) {
    setDesignationBusy(id);
    setDesignationError('');
    setDesignationNotice('');
    fn()
      .then(function (r) {
        if (!r.ok) {
          setDesignationError(r.message);
          return;
        }
        setDesignationNotice(doneText(r.data));
        router.refresh();
      })
      .catch(function (err) {
        setDesignationError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setDesignationBusy(null);
      });
  }

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
  // THE RED CROSS AND THE BAD-IR MARK -- September 20 2026 ruling. Keyed on
  // contract_id like taxiByContract beside it. Unlike the taxi badge this is
  // NOT gated on showTaxiBadge: an injury designation is a fact about the
  // player now, not about a season the reader has scrolled back to, so a
  // past-season roster view shows no cross at all (the map is only consulted
  // for the current season's rows below).
  const injuryByContract = props.injuryByContract || {};
  const showActions = showCut || showMove;

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

  // THE ORDER IS page.js's, AND IT HOLDS (UI test batch 5, Lewis's ruling,
  // October 22): this week's projected points, highest first; no projection
  // last, by cap hit. The rows arrive in that order for every season and this
  // only filters them -- no pill and no season re-sorts the list.
  //
  // The filter applies to the CURRENT season for the three status pills only:
  // roster_status is where the player sits this week, and a 2028 row has no
  // squad yet. Position pills filter every season.
  const effectiveShow =
    rosterSeason !== currentSeasonYear && filterDef(show).status ? 'all' : show;
  const litPill = filterDef(effectiveShow).lights || effectiveShow;

  function visibleRoster() {
    return (rosterBySeason[rosterSeason] || []).filter(function (r) {
      // A player on the waiver wire is off the roster (ruling W-10) and is drawn
      // only in the On Waivers section below -- in every season's view, because
      // the claim or the clearance decides who carries his later years too.
      if (r.onWaivers) return false;
      return rowMatches(r, effectiveShow, taxiByContract[r.id]);
    });
  }

  const projWeek = props.projWeek || null;
  const projError = props.projError || null;
  const projGated = Boolean(props.projGated);
  const statsError = props.statsError || null;

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
        {props.media ? <TabButton id="media" label="Media" /> : null}
      </div>

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
          </div>

          {/* THE PILLS (UI test batch 5): one at a time, All by default. Plain
              buttons with aria-pressed, one tab stop each. The status pills
              (Active, IR, PS) are the current season's only. */}
          <div className="edfl-rr-pills" role="group" aria-label="Show">
            {ROSTER_FILTERS.filter(function (f) {
              return f.pill && (!f.status || rosterSeason === currentSeasonYear);
            }).map(function (f) {
              const on = litPill === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  className={'edfl-rr-pill' + (on ? ' is-on' : '')}
                  aria-pressed={on}
                  onClick={function () {
                    setShow(f.key);
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          {effectiveShow === 'taxi-nonrookie' && (
            <p className="empty-note edfl-rr-filternote">
              Showing the practice squad players who are not on a rookie deal (rule 3.3(b)).{' '}
              <button
                type="button"
                className="edfl-rr-linkbtn"
                onClick={function () {
                  setShow('taxi');
                }}
              >
                Show the whole practice squad
              </button>
            </p>
          )}

          {/* WHAT THE ORDER IS, AND WHEN IT IS NOT. A failed projection read is
              said in red, because the cap-hit order it falls back to would
              otherwise look like the projection order. */}
          {projError ? (
            <div className="form-error">
              This week&rsquo;s projections could not be loaded: {projError}. The roster is in
              cap-hit order instead.
            </div>
          ) : projGated ? (
            <p className="empty-note">
              Sign in to see each player&rsquo;s projection
              {projWeek ? ' for Week ' + projWeek : ''}. Signed out, the roster is in cap-hit
              order.
            </p>
          ) : projWeek ? (
            <p className="empty-note">
              In order of projected points for Week {projWeek}, highest first. A player with no
              projection is listed last, by cap hit. Stats are {currentSeasonYear} season totals.
            </p>
          ) : null}
          {statsError && (
            <div className="form-error">
              Season stats could not be loaded: {statsError}. The stats line under each name is
              missing, not zero.
            </div>
          )}

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

          {/* Fails closed: without the wire read a waived player would be drawn
              back in his old section, which is the wrong answer this section
              exists to prevent. */}
          {waiverError && (
            <div className="form-error">
              Players on waivers could not be loaded: {waiverError}. A player this team has
              waived may be listed below in the roster section he was cut from.
            </div>
          )}
          {designationError && <div className="form-error">{designationError}</div>}
          {designationNotice && <p className="form-notice">{designationNotice}</p>}

          {/* THE ROSTER ROWS -- UI test batch 5 (October 22, 2026). Lewis, on
              the Roster design canvas: "I want the players displayed like
              Sleeper displays them. I hate this format ... Put the contract
              data beside the player's name and the stats in a line below the
              player's name like Sleeper. The type of contract, length, PPV, and
              specific years (eg 2026-2028) is not important in this view, only
              the cash and cap hit and what year of the contract the player is
              in." So each row is: headshot, the name with POS and NFL team
              under it, and a box at the right with Cap Hit, Cash and the year
              of the deal for the season shown; below them the stats line. Dead
              If Cut and its footnote went with the table (read back and
              approved): the Cut dialog still gives the full settlement.

              A list, not a table, on a phone and a laptop alike -- so the old
              .table-scroll wrapper and the phone card rules for .roster-ledger
              no longer apply to it. KEPT, as they were: the injury cross, every
              status tag (and its tooltip), the R-10 marker (the contract-type
              colour on the name, and the row's left edge), and the own-roster
              controls under the same gates. */}
          <ul className="edfl-rr-list" aria-label={'Roster, ' + rosterSeason}>
            {visibleRoster().map(function (c) {
              const items = statItems(c, currentSeasonYear);
              return (
                <li key={c.id} className={'edfl-rr' + (c.markerClass ? ' ' + c.markerClass : '')}>
                  <div className="edfl-rr-main">
                    <RosterFace sleeperId={c.sleeperId} name={c.name} />
                    <div className="edfl-rr-id">
                      {/* The cross sits BEFORE the name, outside the marker
                          span, so it keeps its own red rather than inheriting
                          the contract-type colour the name wears. Current
                          season only -- see injuryByContract above. */}
                      <span className="edfl-rr-name">
                        {showTaxiBadge &&
                          injuryByContract[c.id] &&
                          injuryByContract[c.id].injury_flagged && (
                            <InjuryCross label={injuryByContract[c.id].injury_label} />
                          )}
                        <span className={c.markerClass ? 'ct-name' : undefined}>
                          <PlayerLink playerId={c.playerId}>{c.name}</PlayerLink>
                        </span>
                      </span>
                      <span className="edfl-rr-meta">
                        {c.position}
                        {c.nflTeam ? ' • ' + c.nflTeam : ''}
                      </span>
                    </div>
                    <div className="edfl-rr-money">
                      <span className="edfl-rr-money-row">
                        <span className="edfl-rr-money-label">Cap</span>
                        <span className="v-cap">{money(c.capCharge)}</span>
                      </span>
                      <span className="edfl-rr-money-row">
                        <span className="edfl-rr-money-label">Cash</span>
                        <span className="v-cash">{money(c.cashValue)}</span>
                      </span>
                      <span className="edfl-rr-money-row edfl-rr-year">
                        Yr {c.yearInDeal}/{c.totalSpan}
                      </span>
                    </div>
                  </div>

                  <div className="edfl-rr-stats">
                    {items.map(function (it) {
                      return (
                        <span key={it.key} className={'edfl-rr-stat' + (it.proj ? ' is-proj' : '')}>
                          {it.proj ? <span className="edfl-rr-stat-label">{it.label}</span> : null}
                          {it.value !== null ? <span className="edfl-rr-stat-value">{it.value}</span> : null}
                          {!it.proj ? <span className="edfl-rr-stat-label">{it.label}</span> : null}
                        </span>
                      );
                    })}
                  </div>

                  <div className="edfl-rr-tags">
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
                      Rule 3.4(b), September 20 2026. He is on injured
                      reserve and carries no Sleeper designation of IR,
                      Out, Doubtful or PUP, so the slot is not his to
                      occupy. The sentence is the view's -- composed in
                      roster_injury_status, never here -- and the same
                      finding is in the compliance banner above with his
                      name in it. This tag is so the reader can find the
                      row the banner is talking about.
                    */}
                    {showTaxiBadge &&
                      injuryByContract[c.id] &&
                      injuryByContract[c.id].ir_ineligible && (
                        <span
                          className="void-tag ps-tag urgent"
                          title={injuryByContract[c.id].ir_ineligible_reason}
                        >
                          {' '}
                          NOT IR ELIGIBLE
                        </span>
                      )}
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
                    {showTaxiBadge && taxiByContract[c.id] && taxiByContract[c.id].warning && (
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
                    {/*
                      Rule 3.3(d)(i), September 21 2026. His owner is holding
                      him on the active roster: the Tuesday return skips him.
                      The sentence is the view's hold_note. Own team only sees
                      the control; every reader sees the fact.
                    */}
                    {showTaxiBadge && taxiByContract[c.id] && taxiByContract[c.id].held && (
                      <span className="void-tag ps-tag held" title={taxiByContract[c.id].hold_note || ''}>
                        {' '}
                        HELD ON ACTIVE
                      </span>
                    )}
                    {/*
                      Rule 5.17(l), September 21 2026. Exempt from poaching by
                      his owner -- shown to the league by ruling, not hidden.
                    */}
                    {showTaxiBadge && taxiByContract[c.id] && taxiByContract[c.id].poach_exempt && (
                      <span
                        className="void-tag ps-tag exempt"
                        title="Rule 5.17(l): his team has exempted him from poaching. The exemption stands until the owner releases it or the player is promoted."
                      >
                        {' '}
                        POACH EXEMPT
                      </span>
                    )}
                  </div>

                  {showActions && (
                    <div className="edfl-rr-actions">
                      {/* OCTOBER 17, 2026 (UI test batch 1): THE ••• OPENS THE
                          PLAYER CARD ON ITS ACTIONS TAB (Lewis, October 12:
                          "when a user clicks on the three dots, it will
                          bring up his player card to an action tab"). Own
                          roster, current season only -- the same gate as
                          Move. It is a link, not a menu: the card's Actions
                          tab (app/player/[playerId]/PlayerCard.js) is the
                          one place that lists everything you can do with a
                          player. Move and Cut stay here as well, unchanged. */}
                      {showMove && (
                        <a
                          className="btn btn-quiet edfl-more"
                          href={'/player/' + c.playerId + '?tab=actions'}
                          aria-label={'Actions for ' + c.name}
                          title="All the actions for this player, on his card"
                        >
                          &#x2022;&#x2022;&#x2022;
                        </a>
                      )}
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
                      {/*
                        THE TWO DESIGNATIONS, own roster and current season
                        only (showMove is that gate). Offered where the
                        database says they apply -- a practice squad row
                        for the exemption, a row the view marks `elevated`
                        for the hold -- and refused by the database with
                        its own sentence if the answer has changed since
                        the page was drawn. The limit of two exemptions is
                        NOT counted here; ps_exempt_set() refuses a third.
                      */}
                      {showMove && c.rosterStatus === 'taxi' && (
                        <button
                          type="button"
                          className="btn btn-quiet"
                          disabled={designationBusy === c.id}
                          title={
                            taxiByContract[c.id] && taxiByContract[c.id].poach_exempt
                              ? 'Rule 5.17(l): release the poaching exemption. It will not come back on its own.'
                              : 'Rule 5.17(l): exempt him from poaching. Two per team at a time.'
                          }
                          onClick={function () {
                            const on = !(taxiByContract[c.id] && taxiByContract[c.id].poach_exempt);
                            runDesignation(
                              c.id,
                              function () {
                                return setPoachExemption(c.id, on);
                              },
                              function (d) {
                                return (
                                  d.player +
                                  (d.exempt ? ' is exempt from poaching. ' : ' is no longer exempt from poaching. ') +
                                  d.team_exempt_count +
                                  ' of ' +
                                  d.team_exempt_limit +
                                  ' exemptions in use.'
                                );
                              }
                            );
                          }}
                        >
                          {designationBusy === c.id
                            ? 'Saving…'
                            : taxiByContract[c.id] && taxiByContract[c.id].poach_exempt
                              ? 'Release exemption'
                              : 'Exempt'}
                        </button>
                      )}
                      {showMove &&
                        c.rosterStatus === 'active' &&
                        taxiByContract[c.id] &&
                        (taxiByContract[c.id].elevated || taxiByContract[c.id].held) && (
                          <button
                            type="button"
                            className="btn btn-quiet"
                            disabled={designationBusy === c.id}
                            title={
                              taxiByContract[c.id].held
                                ? 'Rule 3.3(d): release the hold. He returns to the practice squad at the next Tuesday 00:00.'
                                : 'Rule 3.3(d): keep him on the active roster through Tuesday until you move him down. His weeks still count under 3.3(i).'
                            }
                            onClick={function () {
                              const on = !taxiByContract[c.id].held;
                              runDesignation(
                                c.id,
                                function () {
                                  return setTaxiHold(c.id, on);
                                },
                                function (d) {
                                  return d.held
                                    ? d.player +
                                        ' is held on the active roster; the Tuesday return will skip him. ' +
                                        d.weeks_used +
                                        ' of 3 weeks used.'
                                    : d.player + ' will return to the practice squad at the next Tuesday 00:00.';
                                }
                              );
                            }}
                          >
                            {designationBusy === c.id
                              ? 'Saving…'
                              : taxiByContract[c.id].held
                                ? 'Release hold'
                                : 'Hold on active'}
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {rosterBySeason[rosterSeason].length > 0 && visibleRoster().length === 0 && (
            <p className="empty-note">No players in this section.</p>
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

          {rosterBySeason[rosterSeason].length === 0 && (
            <p className="empty-note">
              No contracts on the books for {rosterSeason}.
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
