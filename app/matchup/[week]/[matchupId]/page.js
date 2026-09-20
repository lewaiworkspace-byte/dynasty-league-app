import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../../lib/getCurrentTeamOwner';
import MatchupBoard from './MatchupBoard';

// Scores and projections both move during a week -- never cache.
export const revalidate = 0;

/**
 * THE MATCHUP PAGE -- Phase 2G-2, September 20, 2026.
 *
 * One game, both rosters, every active player, and the best-ball lineup as it
 * currently stands. Reached by clicking a matchup on the Scoreboard or the
 * fixture tile on a Team page.
 *
 * READ THROUGH THE SESSION CLIENT, NOT THE ANON ONE. player_week_scores has
 * never carried an anon grant (best-ball spec, September 13) and neither does
 * player_week_projections or edfl_matchup_detail. This page is the first thing
 * in the app that shows a per-player breakdown, and per-player production is
 * the raw material of the Trade Block and Pro Bowl work -- it stays behind a
 * session. The middleware gate means a session always exists here.
 *
 * THE OFFICIAL SCORE AND THE PROVISIONAL LINEUP ARE TWO DIFFERENT THINGS, and
 * the page is built around keeping them apart:
 *
 *   * The big number on each side is team_week_scores.points, read through
 *     league_scoreboard. That is best ball on ACTUAL points and it is what
 *     the standings, the waiver order and the record are settled from.
 *
 *   * The small number beneath it is the projected final: the same twelve
 *     slots with each unkicked-off player contributing his projection. It is
 *     an estimate, it is labelled as one, and nothing in the database is ever
 *     settled from it.
 *
 * Commissioner ruling, 2026-09-20: a player who has not kicked off is slotted
 * on his projection; a player whose game has started is slotted on his actual
 * points. So the lineup reflows through Sunday as real points land -- which is
 * the whole point of showing it, because under best ball an owner never sets a
 * lineup and this page is the only way to see the one he is getting.
 */
// NEXT 14.2.5: `params` is a plain object, not a Promise. Awaiting it here
// would still "work" -- await on a non-thenable resolves to the value -- but
// it would be written against an API this repo is not on, and the next person
// to copy this file as a template would carry the mistake somewhere it breaks.
// Matches app/player/[playerId]/page.js, which is the pattern in this repo.
export function generateMetadata({ params }) {
  return { title: 'Week ' + params.week + ' Matchup' };
}

export default async function MatchupPage({ params }) {
  const week = Number(params.week);
  const matchupId = Number(params.matchupId);

  if (!Number.isInteger(week) || week < 1 || !Number.isInteger(matchupId)) {
    return (
      <main className="page">
        <p className="page-actions">
          <a href="/scoreboard">&larr; Scoreboard</a>
        </p>
        <h1>Matchup</h1>
        <p className="empty-note">That is not a week and a matchup this league has.</p>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();

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
  const myTeamId = teamOwner && teamOwner.team_id ? teamOwner.team_id : null;

  const [gameRes, detailRes, projRes] = await Promise.all([
    supabase
      .from('league_scoreboard')
      .select(
        'week_number, matchup_id, home_team_id, home_team, home_owner, home_points,' +
          ' away_team_id, away_team, away_owner, away_points, has_scores, winner_team_id,' +
          ' margin, synced_at, week_is_final, week_final_at'
      )
      .eq('season_year', season)
      .eq('week_number', week)
      .eq('matchup_id', matchupId)
      .maybeSingle(),
    supabase.rpc('edfl_matchup_detail', {
      p_season: season,
      p_week: week,
      p_matchup_id: matchupId,
    }),
    // One row is enough to date the projections. If the table is empty for
    // this week the page still renders -- projections are an enhancement, not
    // a dependency.
    supabase
      .from('player_week_projections')
      .select('synced_at')
      .eq('season_year', season)
      .eq('week_number', week)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const game = gameRes.data || null;
  const players = detailRes.data || [];
  const projSyncedAt = projRes.data ? projRes.data.synced_at : null;

  if (gameRes.error || !game) {
    return (
      <main className="page">
        <p className="page-actions">
          <a href="/scoreboard">&larr; Scoreboard</a>
        </p>
        <h1>Matchup</h1>
        <p className="empty-note">
          {gameRes.error
            ? "Couldn't load that matchup: " + gameRes.error.message
            : 'Week ' +
              week +
              ' matchup ' +
              matchupId +
              ' has not been pulled from Sleeper yet. Refresh the week on the Scoreboard.'}
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/scoreboard">&larr; Scoreboard</a>
      </p>
      <p className="eyebrow">
        {leagueName} &middot; {season} &middot; Week {week}
      </p>

      {detailRes.error && (
        <div className="form-error">
          The rosters could not be loaded: {detailRes.error.message}. The score above each team is
          still correct; the lineups below are not.
        </div>
      )}

      <MatchupBoard
        season={season}
        week={week}
        game={game}
        players={players}
        myTeamId={myTeamId}
        projSyncedAt={projSyncedAt}
        canRefresh={Boolean(teamOwner)}
      />
    </main>
  );
}
