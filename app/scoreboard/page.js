import { supabase } from '../../lib/supabaseClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import Scoreboard from './Scoreboard';

// Scores move during a week and the refresh button writes -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Scoreboard' };

// THE LEAGUE SCOREBOARD. One tab per league week, five matchups a week.
//
// READ AS ANON, deliberately. league_scoreboard and league_weeks both carry a
// public read grant, so the page renders for a signed-out reader exactly as the
// Cap Sheet and the League Calendar do. Only the refresh control is gated, and
// the database gates it independently.
//
// THE TAB LIST COMES FROM league_weeks, NOT FROM A COUNT. Week 12 of 2026
// begins on a Wednesday because of Thanksgiving, and weeks 13 and 14 are still
// provisional. A tab strip built by assuming fourteen Thursdays would be wrong
// twice over, and this is the same table the dead-money engine charges against,
// so the scoreboard and the salary clock cannot disagree about when a week is.
export default async function ScoreboardPage() {
  const [{ data: config }, teamOwner] = await Promise.all([
    supabase
      .from('league_config')
      .select('league_short_name, current_season_year')
      .eq('id', true)
      .single(),
    getCurrentTeamOwner(),
  ]);

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  const [weeksRes, rowsRes] = await Promise.all([
    supabase
      .from('league_weeks')
      .select('week_number, charge_at, is_provisional')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
    // Filtered by season, so the 1,000-row PostgREST ceiling cannot bite:
    // a season is fourteen weeks of five matchups.
    supabase
      .from('league_scoreboard')
      .select(
        'week_number, matchup_id, home_team_id, home_team, home_owner, home_points,' +
          ' away_team_id, away_team, away_owner, away_points, has_scores, winner_team_id,' +
          ' margin, synced_at, week_starts_at, week_is_provisional'
      )
      .eq('season_year', season)
      .order('week_number', { ascending: true })
      .order('matchup_id', { ascending: true }),
  ]);

  const weeks = weeksRes.data || [];
  const rows = rowsRes.data || [];
  const error = weeksRes.error || rowsRes.error || null;

  // The week in progress: the last one whose charge_at has passed. Before the
  // season opens that is none of them, so week 1 is the landing tab.
  const now = Date.now();
  let currentWeek = weeks.length > 0 ? weeks[0].week_number : 1;
  for (let i = 0; i < weeks.length; i += 1) {
    if (new Date(weeks[i].charge_at).getTime() <= now) currentWeek = weeks[i].week_number;
  }

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">
        {leagueName} &middot; {season}
      </p>
      <h1>Scoreboard</h1>
      <p className="subhead">
        Every matchup, week by week, mirrored from Sleeper. Weeks are read from the same rows the
        dead-money engine charges against, so the scoreboard and the salary clock cannot disagree.
      </p>

      {error && (
        <p className="empty-note">Couldn&apos;t load the scoreboard: {error.message}</p>
      )}

      {!error && weeks.length === 0 && (
        <p className="empty-note">
          No weekly calendar has been loaded for {season}, so there are no weeks to show.
        </p>
      )}

      {!error && weeks.length > 0 && (
        <Scoreboard
          season={season}
          weeks={weeks}
          rows={rows}
          initialWeek={currentWeek}
          canRefresh={Boolean(teamOwner)}
        />
      )}
    </main>
  );
}
