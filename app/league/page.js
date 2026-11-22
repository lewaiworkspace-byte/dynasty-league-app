import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { formatMoney } from '../../lib/formatMoney';
import { easternDateKey } from '../../lib/formatDate';
import { designationFor } from '../../lib/injuryReport';
import LeagueView from './LeagueView';
import {
  RECENT_DAYS,
  LIST_ROWS,
  transactionGroups,
  keyInjuries,
  keyDates,
} from './leagueModel';

// Records, injuries, moves and room all move during a week -- never cache.
export const revalidate = 0;
export const metadata = { title: 'League' };

/**
 * THE LEAGUE PAGE -- redrawn November 14, 2026 (UI test batch 15).
 *
 * Lewis, that morning: the League page is FIVE SUMMARY BOXES -- Standings, Key
 * Injuries, Recent Transactions, Cap Space and Key Dates, in that order -- each
 * linking to its full page. Matchups and scores LEFT this page; they get a new
 * section of their own (the Scoreboard and Team HQ's matchup tile still carry
 * them). The look is Option B of the Claude Design canvas "EDFL League tab
 * (test site)", with his canvas notes through 12:16 ET. league-page.md carries
 * the decisions that protect this file.
 *
 * WHO READS WHAT. Since UI test batch 44 every read is one call,
 * edfl_league_page_reads(), made through the SESSION client and run as the
 * signed-in viewer (SECURITY INVOKER). The injury report, the transaction log
 * and the projections are granted to authenticated only -- through anon they
 * return nothing and the boxes would read as empty, which must never look like
 * "no injuries" -- so the call must never move to the anon client. The other
 * parts are public reads with the same rows either way. getCurrentTeamOwner()
 * decides one thing: which row is yours.
 *
 * EACH BOX FAILS ON ITS OWN. A read that IS a box's content fails that box
 * closed: an error line in the box, never an empty list (ui-patterns.md). The
 * page never goes down because one box could not load.
 *
 * THE CLOCK is read here, once, on the server (money-and-dates.md). "Next week"
 * for a projection is the first league week whose first game has not kicked
 * off, the same first_game_at test /scoreboard uses.
 */

const TX_CAP = 500; // a week of moves is far below this; reaching it says so

export default async function LeaguePage() {
  const nowMs = Date.now();
  const todayKey = easternDateKey(nowMs);
  const sinceIso = new Date(nowMs - RECENT_DAYS * 86400000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  // ONE CALL (UI test batch 44, November 22, 2026, Lewis: "Yes" to the same fix as
  // the Team page). edfl_league_page_reads() returns this page's eleven reads as
  // parts, each { data, error }, the same rows and columns it read before in three
  // rounds, filtered by the same moments (sinceIso, nowIso) worked out here. It runs
  // as the signed-in viewer (SECURITY INVOKER). It also does what this page did to
  // choose its second round: the projections' week (the first week whose first game
  // is still to come) and the players listed in the injury and transaction boxes.
  const sb = await createSupabaseServerClient();
  const [teamOwner, readsRes] = await Promise.all([
    getCurrentTeamOwner(),
    sb.rpc('edfl_league_page_reads', {
      p_since: sinceIso,
      p_now: nowIso,
      p_tx_cap: TX_CAP,
    }),
  ]);
  const reads = readsRes.data || {};
  // A failed call fails every box, each with the call's own message, so no box
  // can look empty when it was never read.
  function part(key) {
    if (readsRes.error) return { data: null, error: readsRes.error };
    return reads[key] || { data: null, error: null };
  }

  const config = part('config').data;
  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';
  const myTeamId = teamOwner && teamOwner.team_id ? teamOwner.team_id : null;

  const standingsRes = part('standings');
  const teamsRes = part('teams');
  const capRes = part('capSummary');
  const capSetRes = part('capSet');
  const injRes = part('injuries');
  const txRes = part('tx');
  const calRes = part('calendar');
  const statsRes = part('stats');
  const projRes = part('proj');

  const abbrevById = {};
  (teamsRes.data || []).forEach(function (t) {
    abbrevById[t.id] = t.abbrev || '';
  });

  // ---- next week, for the projections (worked out by the call) -------------
  const projWeek = Number.isInteger(reads.projWeek) ? reads.projWeek : null;

  const injRows = injRes.data || [];
  const txRows = txRes.data || [];

  const pointsById = {};
  const fppgById = {};
  (statsRes.data || []).forEach(function (s) {
    pointsById[s.player_id] = s.fantasy_points;
    fppgById[s.player_id] = s.fppg;
  });
  const projById = {};
  (projRes.data || []).forEach(function (p) {
    projById[p.player_id] = p.proj_points;
  });

  // ---- shape each box -------------------------------------------------------
  const standings = standingsRes.data || [];
  const capRows = capRes.data || [];
  const capSet = capSetRes.data || null;
  const injuries = keyInjuries(injRows, pointsById, LIST_ROWS);
  const tx = transactionGroups(txRows, projById, fppgById, LIST_ROWS);
  const dates = keyDates(calRes.data || [], nowMs, LIST_ROWS);

  // The injury count bar: every rostered designation, grouped by its label,
  // most serious first (lib/injuryReport.js is the vocabulary).
  const injCounts = [];
  const byLabel = {};
  injRows.forEach(function (r) {
    const d = designationFor(r.injury_status);
    if (!d) return;
    if (!byLabel[d.label]) {
      byLabel[d.label] = { label: d.label, tone: d.tone, severity: d.severity, n: 0 };
      injCounts.push(byLabel[d.label]);
    }
    byLabel[d.label].n += 1;
  });
  injCounts.sort(function (a, b) { return a.severity - b.severity; });
  const injTotal = injCounts.reduce(function (s, c) { return s + c.n; }, 0);
  let badSeen = 0;
  let warnSeen = 0;
  injCounts.forEach(function (c) {
    c.shade = c.tone === 'bad' ? 'b' + Math.min(badSeen++, 2) : 'w' + Math.min(warnSeen++, 2);
  });

  const maxRoom = capRows.reduce(function (m, r) {
    const v = Number(r.cap_space_remaining);
    return Number.isFinite(v) && v > m ? v : m;
  }, 0);

  const capTitle = capSet && capSet.fantasy_salary_cap !== null && capSet.fantasy_salary_cap !== undefined
    ? season + ' Salary Cap – ' + formatMoney(capSet.fantasy_salary_cap) +
      (capSet.is_provisional ? ', provisional' : '')
    : null;

  return (
    <LeagueView
      leagueName={leagueName}
      season={season}
      myTeamId={myTeamId}
      abbrevById={abbrevById}
      projWeek={projWeek}
      todayKey={todayKey}
      standings={standings}
      standingsError={standingsRes.error || null}
      injuries={injuries}
      injAny={injRows.length > 0}
      injCounts={injCounts}
      injTotal={injTotal}
      injError={injRes.error || null}
      statsError={statsRes.error || null}
      tx={tx}
      txError={txRes.error || null}
      txCapped={txRows.length >= TX_CAP}
      txCap={TX_CAP}
      projError={projRes.error || null}
      capRows={capRows}
      capError={capRes.error || null}
      capTitle={capTitle}
      maxRoom={maxRoom}
      dates={dates}
      calError={calRes.error || null}
    />
  );
}
