import { supabase } from '../../lib/supabaseClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// Scores move during a week and records move with them -- never cache.
export const revalidate = 0;
export const metadata = { title: 'League' };

/**
 * THE LEAGUE SCREEN -- commissioner ruling R-8, phase 2C.
 *
 * This is where `/` used to send people, and it is the second half of R-8: the
 * league's own face -- this week's scores and the table -- as a route of its
 * own, reached from the drawer, rather than as a wall of links.
 *
 * IT IS A GLANCE, NOT A REPLACEMENT. /scoreboard still carries every week, the
 * week tabs and the Refresh from Sleeper control; /standings still carries the
 * full table with PA, differential, points per game and streak. Both are linked
 * from the blocks below and neither was touched by this batch. If a figure here
 * and a figure there ever disagree, the full page is right -- they read the same
 * two views, so they cannot.
 *
 * READ AS ANON, like the two pages it summarises. league_standings,
 * league_scoreboard, league_weeks and teams all carry a public read grant.
 * getCurrentTeamOwner() is the one session-aware call and it decides ONE thing:
 * which row to mark as yours.
 *
 * WHICH WEEK IS "THIS WEEK" comes from league_weeks.first_game_at against the
 * server clock -- the same test /scoreboard uses, deliberately, so the two
 * cannot land on different weeks. A Server Component reading Date.now() is
 * correct and never hydrates (CLAUDE.md).
 */

// A score is not money and is never rounded. It is rendered from the string
// PostgREST returned, because Number('0.00') prints as "0" and a real zero --
// which two teams posted in Week 2 -- would then read as "not reported".
function score(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

export default async function LeaguePage() {
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

  const [weeksRes, gamesRes, standingsRes, teamsRes] = await Promise.all([
    supabase
      .from('league_weeks')
      .select('week_number, first_game_at, is_provisional')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
    // Filtered by season, so the 1,000-row PostgREST ceiling cannot bite: a
    // season is fourteen weeks of five matchups (SR-29).
    supabase
      .from('league_scoreboard')
      .select(
        'week_number, matchup_id, home_team_id, home_team, home_points,' +
          ' away_team_id, away_team, away_points, has_scores, winner_team_id, week_is_final'
      )
      .eq('season_year', season)
      .order('week_number', { ascending: true })
      .order('matchup_id', { ascending: true }),
    supabase
      .from('league_standings')
      .select('team_id, team_name, wins, losses, ties, points_for, games, league_rank')
      .eq('season_year', season)
      .order('league_rank', { ascending: true }),
    // The trigraph. Neither league_scoreboard nor league_standings carries
    // teams.abbrev, so it is joined here rather than derived from the name --
    // a team without one shows an empty disc, never a guess (the same rule the
    // old home page's teams list was written under).
    supabase.from('teams').select('id, abbrev'),
  ]);

  const loadError =
    weeksRes.error || gamesRes.error || standingsRes.error || teamsRes.error || null;

  const weeks = weeksRes.data || [];
  const games = gamesRes.data || [];
  const standings = standingsRes.data || [];

  const abbrevById = {};
  (teamsRes.data || []).forEach((t) => {
    abbrevById[t.id] = t.abbrev || '';
  });

  // The week in progress: the last one whose first_game_at has passed. Before
  // the season opens that is none of them, so week 1 is what shows.
  const now = Date.now();
  let currentWeek = weeks.length > 0 ? weeks[0].week_number : null;
  weeks.forEach((w) => {
    if (w.first_game_at && new Date(w.first_game_at).getTime() <= now) {
      currentWeek = w.week_number;
    }
  });

  function weekGames(n) {
    if (n === null) return [];
    return games.filter((g) => g.week_number === n);
  }

  const thisWeek = weekGames(currentWeek);
  const thisWeekFinal = thisWeek.length > 0 && Boolean(thisWeek[0].week_is_final);

  // Last week's results, shown only while THIS week is unfinished. Once the
  // current week is final it is the result, and repeating the one before it
  // would be two settled weeks with nothing to tell them apart.
  const prevWeekNumber =
    !thisWeekFinal && currentWeek !== null && currentWeek > 1 ? currentWeek - 1 : null;
  const prevWeek = weekGames(prevWeekNumber);

  // Rendered as one block per side so the winner can be brighter than the loser
  // without either being a colour. Nothing here decides who won: winner_team_id
  // is the view's own column, and while a week is live it is simply whoever is
  // ahead at the last sync -- which is why an unfinished week says so above.
  function Matchups(props) {
    return (
      <div className="kit-rows">
        {props.rows.map(function (g) {
          const sides = [
            {
              id: g.home_team_id,
              name: g.home_team,
              points: g.home_points,
              key: 'h',
            },
            {
              id: g.away_team_id,
              name: g.away_team,
              points: g.away_points,
              key: 'a',
            },
          ];
          return (
            <div className="lg-game" key={g.week_number + ':' + g.matchup_id}>
              {sides.map(function (s) {
                const lead = g.winner_team_id ? g.winner_team_id === s.id : false;
                const mine = myTeamId !== null && s.id === myTeamId;
                return (
                  <a
                    className={'lg-side' + (lead ? ' is-lead' : '') + (mine ? ' is-mine' : '')}
                    href={'/team/' + s.id}
                    key={s.key}
                  >
                    <span className="lg-abbr">{abbrevById[s.id] || ''}</span>
                    <span className="lg-name">{s.name || 'Unclaimed Team'}</span>
                    <span className="lg-score">
                      {g.has_scores ? score(s.points) : '—'}
                    </span>
                  </a>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main className="page">
      <p className="eyebrow">
        {leagueName} &middot; {season}
      </p>
      <h1>League</h1>
      <p className="subhead">
        This week&rsquo;s scores and the table. Every week, the week tabs and the Sleeper
        refresh are on the Scoreboard; the full table with points against, differential and
        streak is on Standings.
      </p>

      {loadError && (
        <div className="form-error">
          The league screen could not be loaded: {loadError.message}. Nothing below is
          complete &mdash; do not rely on it.
        </div>
      )}

      {/* ---- THIS WEEK ---- */}
      <section className="edfl-hq-block">
        {currentWeek === null || thisWeek.length === 0 ? (
          <>
            <h2 className="section-heading">This week</h2>
            <p className="empty-note">
              {weeks.length === 0
                ? 'No weekly calendar has been loaded for ' +
                  season +
                  ', so there are no weeks to show.'
                : 'Week ' +
                  currentWeek +
                  ' has not been loaded from Sleeper yet. Refresh it on the Scoreboard.'}
            </p>
          </>
        ) : (
          <>
            <div className="lg-head">
              <span>WEEK {currentWeek}</span>
              <span className={thisWeekFinal ? '' : 'is-live'}>
                {thisWeekFinal ? 'FINAL' : 'IN PROGRESS'}
              </span>
            </div>
            <Matchups rows={thisWeek} />
            {!thisWeekFinal && (
              <p className="empty-note">
                Scores move until the week is final, and the brighter side of each row is
                only whoever was ahead at the last sync.
              </p>
            )}
          </>
        )}
      </section>

      {/* ---- LAST WEEK, only while this one is unfinished ---- */}
      {prevWeek.length > 0 && (
        <section className="edfl-hq-block">
          <div className="lg-head">
            <span>WEEK {prevWeekNumber}</span>
            <span>{prevWeek[0].week_is_final ? 'FINAL' : 'NOT FINAL'}</span>
          </div>
          <Matchups rows={prevWeek} />
        </section>
      )}

      <p className="page-actions edfl-hq-links">
        <a className="btn" href="/scoreboard">
          Full Scoreboard
        </a>
        <a className="btn" href="/calendar">
          League Calendar
        </a>
      </p>

      {/* ---- STANDINGS ---- */}
      <section className="edfl-hq-block">
        <h2 className="section-heading">Standings</h2>
        {standings.length === 0 ? (
          <p className="empty-note">No teams found for {season}.</p>
        ) : (
          <>
            <div className="lg-colhead">
              <span className="lg-rank">#</span>
              <span style={{ width: 34, flex: '0 0 auto' }} />
              <span style={{ flexGrow: 1 }}>TEAM</span>
              <span className="lg-wl">W&ndash;L</span>
              <span className="lg-pf">PF</span>
            </div>
            <div className="kit-rows">
              {standings.map(function (r) {
                const mine = myTeamId !== null && r.team_id === myTeamId;
                const record =
                  r.wins + '–' + r.losses + (r.ties ? '–' + r.ties : '');
                return (
                  <a className="kit-row" href={'/team/' + r.team_id} key={r.team_id}>
                    <span className="lg-rank">{r.league_rank}</span>
                    <span
                      className={mine ? 'kit-disc kit-disc-own' : 'kit-disc'}
                      aria-hidden="true"
                    >
                      {abbrevById[r.team_id] || ''}
                    </span>
                    <div className="kit-row-main">
                      <div className="kit-row-title">{r.team_name || 'Unclaimed Team'}</div>
                      {mine ? <div className="kit-row-meta">Your team</div> : null}
                    </div>
                    <span className="lg-wl">{r.games > 0 ? record : '—'}</span>
                    <span className="lg-pf">{r.points_for}</span>
                  </a>
                );
              })}
            </div>
            <p className="empty-note">
              Ranked on overall record, then points for. Divisions are a label and carry no
              seeding weight (ruling, 7 September).
            </p>
          </>
        )}
      </section>

      <p className="page-actions edfl-hq-links">
        <a className="btn" href="/standings">
          Full Standings
        </a>
        <a className="btn" href="/cap-sheet">
          Cap Sheet
        </a>
      </p>
    </main>
  );
}
