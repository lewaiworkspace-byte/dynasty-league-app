import { supabase } from '../../lib/supabaseClient';
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
  const [{ data: config }, teamOwner] = await Promise.all([
    supabase.from('league_config').select('league_short_name, current_season_year').eq('id', true).single(),
    getCurrentTeamOwner(),
  ]);

  const season = config?.current_season_year || 2026;
  const myTeamId = teamOwner && teamOwner.team_id ? teamOwner.team_id : null;

  const [weeksRes, sbRes] = await Promise.all([
    supabase
      .from('league_weeks')
      .select('week_number, first_game_at, last_game_at, is_provisional')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
    // A season is fourteen weeks of five matchups: far under the row ceiling (SR-29).
    supabase
      .from('league_scoreboard')
      .select('week_number, matchup_id, winner_team_id, margin, week_is_final')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
  ]);

  const weeks = weeksRes.data || [];

  // The week in progress (see above). Before the season opens, week 1.
  const now = Date.now();
  let currentWeek = weeks.length > 0 ? weeks[0].week_number : 1;
  for (let i = 0; i < weeks.length; i += 1) {
    if (new Date(weeks[i].first_game_at).getTime() <= now) currentWeek = weeks[i].week_number;
  }

  const asked = Number(searchParams && searchParams.week);
  const known = weeks.some(function (w) {
    return w.week_number === asked;
  });
  const week = Number.isInteger(asked) && known ? asked : currentWeek;
  const boxAsked = Number(searchParams && searchParams.box);
  const initialBox = Number.isInteger(boxAsked) && boxAsked > 0 ? boxAsked : null;

  let sides = [];
  let players = [];
  let readError = weeksRes.error ? weeksRes.error.message : null;

  if (!readError && weeks.length > 0) {
    const session = await createSupabaseServerClient();
    const [sidesRes, playersRes] = await Promise.all([
      session.rpc('edfl_matchups_week_sides', { p_season: season, p_week: week }),
      session.rpc('edfl_matchups_week_players', { p_season: season, p_week: week }),
    ]);
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
