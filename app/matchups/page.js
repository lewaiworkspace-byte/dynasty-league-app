import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import MatchupsView from './MatchupsView';

// Scores and projections both move during a week -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Matchups' };

/**
 * THE MATCHUPS TAB -- UI test batch 20, November 15, 2026.
 *
 * Lewis's canvas "EDFL Matchups tab (test site) - layout options" and his
 * decisions on it (build brief, Build Records > EDFL_Matchups_Build_Brief_
 * 2026-11-15.md): Matchups takes Media's place in the view row (Roster ·
 * Players · League · Matchups). Your matchup is Option B's card, the other
 * four games are Option A's list, the box score is Box Score 1 (both teams
 * side by side), and a finished week is Choice 1 (each position's actual over
 * a dashed projection, the +/- at the bar's end).
 *
 * ONE WEEK AT A TIME, URL-DRIVEN. /matchups?week=N[&box=M]. With no week the
 * page opens on the week in progress: the last one whose first_game_at has
 * passed, the rule /scoreboard used (a Server Component reading Date.now() is
 * correct and never hydrates). Swiping, the arrows and the dots change ?week=
 * (a server round trip, since every week's numbers move); ?box= opens a
 * matchup's box score and is kept in the address by the view itself.
 *
 * WHO READS WHAT.
 *   - league_weeks, league_scoreboard and league_config are public reads, read
 *     as anon like /league and the old /scoreboard (the week strip, the dots,
 *     and each final week's winner and margin).
 *   - edfl_matchups_week_sides and edfl_matchups_week_players (test database,
 *     migrations matchups_01 and matchups_02) are granted to authenticated
 *     only, so they are read through the SESSION client; the middleware
 *     guarantees a session. Every sum and comparison on this tab is made
 *     there (scoreboard-and-matchups.md): the page and the view only draw.
 *
 * HOW EACH READ FAILS. The two readers ARE the page: either failing shows its
 * error and nothing that could be mistaken for a score. The week strip failing
 * is the same. The scoreboard read only decorates (dots, winner, margin): it
 * fails open with a note.
 */
export default async function MatchupsPage({ searchParams }) {
  // ONE CALL (UI test batch 44, November 22, 2026, Lewis: "Yes" to the same fix as
  // the Team page). edfl_matchups_page_reads() returns this page's reads -- the
  // config, the weeks, the scoreboard, the week shown and that week's sides and
  // players -- as parts, each { data, error }, the same rows and columns it read
  // before in three rounds. It runs as the signed-in viewer (SECURITY INVOKER).
  // It also picks the week, the way this page did: an asked week that exists,
  // else the last week whose first game has started, else the first. The loop
  // below still works the week out from the weeks it returns, as the fallback.
  const askedWeek = Number(searchParams && searchParams.week);
  const session = await createSupabaseServerClient();
  const [readsRes, teamOwner] = await Promise.all([
    session.rpc('edfl_matchups_page_reads', {
      p_week: Number.isInteger(askedWeek) ? askedWeek : null,
    }),
    getCurrentTeamOwner(),
  ]);
  const reads = readsRes.data || {};
  function part(key) {
    return reads[key] || { data: null, error: null };
  }

  const config = part('config').data;
  const season = config?.current_season_year || 2026;
  const myTeamId = teamOwner && teamOwner.team_id ? teamOwner.team_id : null;

  // A failed call is reported like a failed weeks read: the note below, never an
  // empty page that looks like "no matchups".
  const weeksRes = readsRes.error ? { data: null, error: readsRes.error } : part('weeks');
  const sbRes = part('scoreboard');

  const weeks = weeksRes.data || [];

  // The week in progress (see above). Before the season opens, week 1.
  const now = Date.now();
  let currentWeek = weeks.length > 0 ? weeks[0].week_number : 1;
  for (let i = 0; i < weeks.length; i += 1) {
    if (new Date(weeks[i].first_game_at).getTime() <= now) currentWeek = weeks[i].week_number;
  }

  const known = weeks.some(function (w) {
    return w.week_number === askedWeek;
  });
  const week = Number.isInteger(reads.week)
    ? reads.week
    : Number.isInteger(askedWeek) && known
    ? askedWeek
    : currentWeek;
  const boxAsked = Number(searchParams && searchParams.box);
  const initialBox = Number.isInteger(boxAsked) && boxAsked > 0 ? boxAsked : null;

  let sides = [];
  let players = [];
  let readError = weeksRes.error ? weeksRes.error.message : null;

  if (!readError && weeks.length > 0) {
    const sidesRes = part('sides');
    const playersRes = part('players');
    if (sidesRes.error) readError = sidesRes.error.message;
    else if (playersRes.error) readError = playersRes.error.message;
    sides = sidesRes.data || [];
    players = playersRes.data || [];
  }

  const sbRows = sbRes.data || [];
  const finalWeeks = {};
  const results = {};
  sbRows.forEach(function (r) {
    if (r.week_is_final) finalWeeks[r.week_number] = true;
    if (r.week_number === week) results[r.matchup_id] = { winner: r.winner_team_id, margin: r.margin };
  });

  return (
    <main className="page mx-page">
      <h1 className="mx-sr">Matchups</h1>
      {readError ? (
        <p className="empty-note">Couldn&apos;t load week {week}&apos;s matchups: {readError}</p>
      ) : weeks.length === 0 ? (
        <p className="empty-note">No weekly calendar has been loaded for {season}, so there are no weeks to show.</p>
      ) : (
        <MatchupsView
          key={week}
          season={season}
          week={week}
          weeks={weeks}
          finalWeeks={finalWeeks}
          results={results}
          resultsError={sbRes.error ? sbRes.error.message : null}
          sides={sides}
          players={players}
          myTeamId={myTeamId}
          initialBox={initialBox}
        />
      )}
    </main>
  );
}
