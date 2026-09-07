import { supabase } from '../../lib/supabaseClient';

// Records and points change whenever a week is refreshed -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Standings' };

// THE LEAGUE STANDINGS.
//
// RANKED ON OVERALL RECORD, THEN POINTS FOR. Commissioner ruling, September 7
// 2026. The league carries two Sleeper divisions and they are a label here:
// division_rank exists in the view and is deliberately not what orders the
// page. If divisions are ever given seeding weight, that is a ruling and the
// ordering changes in the view, not here.
//
// POINTS AGAINST IS DERIVED, NOT MIRRORED. Sleeper's rosters feed reports fpts
// but has no fpts_against at all, so the view pairs each team with its opponent
// through matchup_id. That is also what makes the points-against tiebreak in
// the waiver priority order possible.
//
// READ AS ANON: league_standings carries a public read grant, like the Cap
// Sheet and the League Calendar.
export default async function StandingsPage() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name, current_season_year')
    .eq('id', true)
    .single();

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  // Filtered by season: ten rows, and the filter keeps a future season's rows
  // from arriving unannounced.
  const { data, error } = await supabase
    .from('league_standings')
    .select(
      'team_id, team_name, owner_display_name, division, games, wins, losses, ties,' +
        ' points_for, points_against, win_pct, streak, point_differential,' +
        ' points_per_game, league_rank'
    )
    .eq('season_year', season)
    .order('league_rank', { ascending: true });

  const rows = data || [];
  const anyPlayed = rows.some(function (r) {
    return r.games > 0;
  });

  function pct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '.000';
    return n.toFixed(3).replace(/^0/, '');
  }

  function num(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '--';
    return n.toFixed(2);
  }

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">
        {leagueName} &middot; {season}
      </p>
      <h1>Standings</h1>
      <p className="subhead">
        Ranked on overall record, then points for. Divisions are shown as a label and carry no
        seeding weight.
      </p>

      <p className="page-actions">
        <a href="/scoreboard">Scoreboard &rarr;</a>
      </p>

      {error && <p className="empty-note">Couldn&apos;t load the standings: {error.message}</p>}

      {!error && rows.length === 0 && (
        <p className="empty-note">No teams found for {season}.</p>
      )}

      {!error && rows.length > 0 && !anyPlayed && (
        <p className="form-notice">
          No week has been played yet, so every team reads 0-0-0. Refresh a week on the scoreboard
          once games are final.
        </p>
      )}

      {!error && rows.length > 0 && (
        <div className="table-scroll">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>PCT</th>
                <th>PF</th>
                <th>PA</th>
                <th>DIFF</th>
                <th>PPG</th>
                <th>STRK</th>
                <th>DIV</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function (r) {
                return (
                  <tr key={r.team_id}>
                    <th scope="row">
                      <span className="row-note" style={{ marginRight: 8 }}>
                        {r.league_rank}
                      </span>
                      <a href={'/team/' + r.team_id} className="team-name">
                        {r.team_name || 'Unclaimed Team'}
                      </a>
                    </th>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                    <td>{r.ties}</td>
                    <td>{pct(r.win_pct)}</td>
                    <td>{num(r.points_for)}</td>
                    <td>{num(r.points_against)}</td>
                    <td>{num(r.point_differential)}</td>
                    <td>{r.games > 0 ? num(r.points_per_game) : '--'}</td>
                    <td>{r.streak || '--'}</td>
                    <td>{r.division || '--'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="row-note" style={{ marginTop: 16 }}>
        Points against is derived from each week&apos;s opponent, because Sleeper&apos;s rosters
        feed does not report it.
      </p>
    </main>
  );
}
