import { supabase } from '../../lib/supabaseClient';

// Records and points move when a week goes final -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Standings' };

/**
 * THE LEAGUE STANDINGS.
 *
 * RANKED ON OVERALL RECORD, THEN POINTS FOR. Commissioner ruling, September 7
 * 2026. The league carries two Sleeper divisions and they are a label here:
 * division_rank exists in the view and is deliberately not what orders the
 * page. If divisions are ever given seeding weight, that is a ruling and the
 * ordering changes in the view, not here.
 *
 * A RECORD DOES NOT MOVE UNTIL THE WEEK IS OVER. Commissioner ruling,
 * September 20 2026, Phase 2G-1. league_standings now counts only weeks where
 * league_week_status.week_is_final -- the week's last NFL kickoff plus four
 * hours, with a score sync since. Wins, losses, points for, points against,
 * differential and streak all post at the same moment or not at all.
 *
 * THE RULE IS ENFORCED IN THE VIEW, NOT HERE. This page does not filter
 * anything; it reads league_standings and prints it. The only thing added in
 * 2G-1 is the LINE OF TEXT below the table naming the week that is still
 * running, because a table that silently omits Sunday's game looks broken to
 * anyone who does not know the rule. league_week_status is read for that one
 * sentence and for nothing else -- if that read fails the table still renders,
 * which is why it is not in a Promise.all with the standings.
 *
 * POINTS AGAINST IS DERIVED, NOT MIRRORED. Sleeper's rosters feed reports fpts
 * but has no fpts_against at all, so the view pairs each team with its opponent
 * through matchup_id. That is also what makes the points-against tiebreak in
 * the waiver priority order possible.
 *
 * TEAM NAMES: .team-name is a CLASSED anchor, so kit.css's `a:not([class])`
 * rule never reached it and every name on this page rendered in the browser's
 * default link blue -- unreadable on a dark card, and purple once visited.
 * Fixed in kit.css in 2G-1 with a rule for .team-name itself. Nothing on this
 * page sets a colour; do not add one here.
 *
 * READ AS ANON: league_standings and league_week_status both carry a public
 * read grant, like the Cap Sheet and the League Calendar.
 */
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

  // Deliberately a second round trip rather than a Promise.all: this is one
  // explanatory sentence and it must never be able to take the table down
  // with it.
  const { data: weekStatus } = await supabase
    .from('league_week_status')
    .select('week_number, week_final_at, week_is_final, last_synced_at')
    .eq('season_year', season)
    .order('week_number', { ascending: true });

  // The week that has started but has not gone final -- the one whose result
  // is deliberately missing from the table above.
  const now = Date.now();
  let pending = null;
  (weekStatus || []).forEach(function (w) {
    if (w.week_is_final) return;
    if (!w.last_synced_at) return; // never pulled from Sleeper: not "running"
    if (w.week_final_at && new Date(w.week_final_at).getTime() <= now) return;
    if (pending === null) pending = w;
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

  function finalWhen(w) {
    if (!w || !w.week_final_at) return null;
    return new Date(w.week_final_at).toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
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

      {!error && rows.length === 0 && <p className="empty-note">No teams found for {season}.</p>}

      {!error && rows.length > 0 && !anyPlayed && (
        <p className="form-notice">
          No week has gone final yet, so every team reads 0-0-0. A week&rsquo;s results post once
          its last NFL game is four hours past.
        </p>
      )}

      {/* The one sentence that keeps a correct table from looking like a broken
          one on a Sunday afternoon. */}
      {!error && rows.length > 0 && pending && (
        <p className="form-notice">
          Week {pending.week_number} is still being played, so it is not in this table. Its
          results post after the week&rsquo;s last game
          {finalWhen(pending) ? ' — about ' + finalWhen(pending) + ' ET' : ''}. Live scores
          are on the <a href="/scoreboard">Scoreboard</a>.
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
        feed does not report it. A week counts here only once its last NFL game is four hours
        past and the scores have been refreshed since &mdash; the same test the Scoreboard uses
        for &ldquo;Final&rdquo;.
      </p>
    </main>
  );
}
