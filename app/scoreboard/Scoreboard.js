'use client';

import { useState } from 'react';
import { formatShortDateTime } from '../../lib/formatDate';

/**
 * THE SCOREBOARD BODY -- five matchup rows, then the week's note, then the
 * fourteen-week strip.
 *
 * THE ORDER OF THE BLOCKS IS THE POINT OF PHASE 2G-1. Scores first, the week
 * picker last. The picker moved to the bottom because it is a navigation
 * control for the thirteen weeks you are NOT looking at, and it was costing
 * the top of a phone screen to the one week you are.
 *
 * A 0.00-0.00 PAIRING IS AN UNPLAYED WEEK, NOT A TIE. has_scores comes from
 * the view and is the only thing that decides whether a row shows a result.
 * Every week of a season exists in league_weeks from the day the calendar is
 * loaded, so without that flag the whole preseason would render as fifty
 * drawn games.
 *
 * NOTHING HERE DECIDES WHO WON. winner_team_id is the view's own column, and
 * while a week is live it is simply whoever was ahead at the last sync --
 * which is why an unfinished week says IN PROGRESS above it and repeats the
 * warning below the rows.
 *
 * PHASE 2G-2 adds the "Matchup" link on each card, which is how the per-game
 * page is reached.
 *
 * BATCH 5 (October 8, 2026) adds the PROJECTED week. A week with no rows in
 * league_scoreboard -- nothing scored yet -- draws its fixtures from
 * edfl_projected_fixtures instead, each side carrying its projected best-ball
 * total. Three things keep a projection from passing for a result:
 *   * the total is drawn dimmer with a "proj" mark (.edfl-sb-proj), never in
 *     the score's own weight;
 *   * NEITHER side is marked as leading -- a higher projection is not a lead;
 *   * a week with no projections at all shows a dash, never 0.00 (the
 *     function returns NULL, and this file prints what it is given).
 * The total is the function's sum of the twelve slotted players; this file
 * adds nothing up.
 *
 * BATCH 6 (October 9, 2026) adds the PROJECTED FINAL to a week IN PROGRESS:
 * after each side's score, in italic brackets, edfl_live_projected_finals'
 * figure for that team. The current score stays exactly as it was -- the
 * official number, in the score's own ink and weight -- and the bracket is
 * always --ink-3 and never bold, even on the leading side, so an estimate
 * never passes for a result. It is printed only while the week is not final,
 * keyed by week and team, and only when the function returned a figure; this
 * file adds nothing up and re-picks no lineup (the sum and the best-ball
 * re-pick are the database's, the same ones the Matchup page's "proj" shows).
 *
 * The Refresh from Sleeper control is retired (To-Do 96, SR-72): it reached
 * the old Sleeper-points engine and did nothing. Scores refresh on their own.
 *
 * A SCORE IS NOT MONEY AND IS NEVER ROUNDED. It is rendered from the string
 * PostgREST returned, because Number('0.00') prints as "0" and a real zero --
 * which two teams posted in Week 2 -- would then read as "not reported".
 * A PROJECTION is an estimate and is printed to two decimals.
 */

function score(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function proj(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function weekLabel(w) {
  if (!w || !w.first_game_at) return '—';
  return new Date(w.first_game_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function byeNote(n) {
  if (!n) return '';
  return n === 1 ? '1 on bye' : n + ' on bye';
}

export default function Scoreboard(props) {
  const weeks = props.weeks || [];
  const rows = props.rows || [];
  const fixtures = props.fixtures || [];
  const fixturesError = props.fixturesError || null;
  const liveProj = props.liveProj || [];
  const liveProjError = props.liveProjError || null;
  const abbrevById = props.abbrevById || {};
  const myTeamId = props.myTeamId || null;

  const [week, setWeek] = useState(props.initialWeek);

  const shown = rows.filter(function (r) {
    return r.week_number === week;
  });

  // A week is drawn from the scores once it has any; until then, from the
  // projected fixtures. Never both.
  const projected =
    shown.length === 0
      ? fixtures.filter(function (f) {
          return f.week_number === week;
        })
      : [];
  const isProjected = projected.length > 0;

  const meta = weeks.find(function (w) {
    return w.week_number === week;
  });

  const played = shown.filter(function (r) {
    return r.has_scores;
  });

  // FINAL comes from the view, never from a clock here. As of Phase 2G-1
  // league_scoreboard.week_is_final is computed in league_week_status -- the
  // week's last NFL kickoff plus four hours, with a sync since -- and
  // league_standings reads the same view, so "FINAL" here and a record
  // appearing over on /standings are now the same event by construction.
  const isFinal =
    shown.length > 0 &&
    shown.every(function (r) {
      return r.week_is_final === true;
    });

  const syncedAt = shown.reduce(function (acc, r) {
    if (!r.synced_at) return acc;
    const t = new Date(r.synced_at).getTime();
    return t > acc ? t : acc;
  }, 0);

  const projSyncedAt = isProjected ? projected[0].proj_synced_at : null;

  // The projected final for each side of a week in progress, keyed by week and
  // team. A final week never shows one, whatever the function returned.
  const liveProjByTeam = {};
  if (!isFinal) {
    liveProj.forEach(function (p) {
      if (p.week_number === week && p.team_id) {
        liveProjByTeam[p.team_id] = p.proj_final;
      }
    });
  }

  let stateLabel = 'NOT PLAYED';
  if (isFinal) stateLabel = 'FINAL';
  else if (played.length > 0) stateLabel = 'IN PROGRESS';
  else if (isProjected) stateLabel = 'PROJECTED';

  return (
    <div>
      {/* ================= 1. THE SCORES ================= */}
      <section className="edfl-hq-block">
        <div className="lg-head">
          <span>
            WEEK {week}
            {meta && meta.is_provisional ? ' · PROVISIONAL' : ''}
          </span>
          <span className={isFinal ? '' : 'is-live'}>
            {stateLabel}
          </span>
        </div>

        {shown.length === 0 && !isProjected && fixturesError && (
          <p className="empty-note">
            Couldn&apos;t load the projected matchups for week {week}: {fixturesError}
          </p>
        )}

        {shown.length === 0 && !isProjected && !fixturesError && (
          <p className="empty-note">No matchups are on the schedule for week {week}.</p>
        )}

        {shown.length > 0 && (
          <div className="kit-rows">
            {shown.map(function (r) {
              const sides = [
                {
                  id: r.home_team_id,
                  name: r.home_team,
                  owner: r.home_owner,
                  points: r.home_points,
                  key: 'h',
                },
                {
                  id: r.away_team_id,
                  name: r.away_team,
                  owner: r.away_owner,
                  points: r.away_points,
                  key: 'a',
                },
              ];
              return (
                <div className="lg-game" key={r.week_number + ':' + r.matchup_id}>
                  {sides.map(function (s) {
                    const lead = r.winner_team_id ? r.winner_team_id === s.id : false;
                    const mine = myTeamId !== null && s.id === myTeamId;
                    const live = r.has_scores ? liveProjByTeam[s.id] : undefined;
                    return (
                      <a
                        className={
                          'lg-side' + (lead ? ' is-lead' : '') + (mine ? ' is-mine' : '')
                        }
                        href={s.id ? '/team/' + s.id : '#'}
                        key={s.key}
                      >
                        <span className="lg-abbr">{abbrevById[s.id] || ''}</span>
                        <span className="lg-name">{s.name || 'Unclaimed Team'}</span>
                        <span className="lg-score">
                          {r.has_scores ? score(s.points) : '—'}
                          {live !== undefined && live !== null ? (
                            <>
                              {' '}
                              <em className="edfl-sb-live-proj">
                                <span className="edfl-sb-sr">projected final </span>
                                {'(' + proj(live) + ')'}
                              </em>
                            </>
                          ) : null}
                        </span>
                      </a>
                    );
                  })}
                  <p className="lg-note">
                    <span>
                      {!r.has_scores
                        ? 'Not played'
                        : r.winner_team_id
                        ? 'Margin ' + score(r.margin)
                        : 'Tied'}
                    </span>
                    {/* THE WHOLE CARD IS NOT ONE LINK, DELIBERATELY. Each side
                        is already an anchor to that team -- nesting those
                        inside a third anchor is invalid HTML and browsers
                        recover from it by dropping the inner ones, which would
                        cost both team links to buy one matchup link. A
                        separate, explicitly labelled link keeps all three
                        destinations and tells a screen reader which is which. */}
                    <a className="lg-more" href={'/matchup/' + r.week_number + '/' + r.matchup_id}>
                      Matchup &rarr;
                    </a>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- A week still to come: the fixtures, projected ---- */}
        {isProjected && (
          <div className="kit-rows">
            {projected.map(function (f) {
              const sides = [
                {
                  id: f.home_team_id,
                  name: f.home_team,
                  proj: f.home_proj,
                  bye: f.home_on_bye,
                  key: 'h',
                },
                {
                  id: f.away_team_id,
                  name: f.away_team,
                  proj: f.away_proj,
                  bye: f.away_on_bye,
                  key: 'a',
                },
              ];
              const byes = sides
                .map(function (s) {
                  const n = byeNote(s.bye);
                  return n ? (abbrevById[s.id] || 'One side') + ': ' + n : '';
                })
                .filter(Boolean);
              return (
                <div className="lg-game" key={f.week_number + ':' + f.matchup_id}>
                  {sides.map(function (s) {
                    const mine = myTeamId !== null && s.id === myTeamId;
                    return (
                      <a
                        className={'lg-side' + (mine ? ' is-mine' : '')}
                        href={s.id ? '/team/' + s.id : '#'}
                        key={s.key}
                      >
                        <span className="lg-abbr">{abbrevById[s.id] || ''}</span>
                        <span className="lg-name">{s.name || 'Unclaimed Team'}</span>
                        <span className="lg-score edfl-sb-proj">
                          {proj(s.proj)}
                          {s.proj !== null && s.proj !== undefined ? (
                            <span className="edfl-sb-proj-mark"> proj</span>
                          ) : null}
                        </span>
                      </a>
                    );
                  })}
                  <p className="lg-note">
                    <span>{byes.length > 0 ? 'Projected · ' + byes.join(' · ') : 'Projected'}</span>
                    <a className="lg-more" href={'/matchup/' + f.week_number + '/' + f.matchup_id}>
                      Projection &rarr;
                    </a>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {isProjected && (
          <p className="empty-note">
            Week {week} has not been played. Each total is an <strong>estimate</strong>: the
            best-ball lineup from that team&rsquo;s active roster as it stands today, filled by the
            highest projected player at each slot, with anyone whose team is on bye left out.
            Roster moves, injuries and new projections will change it before kickoff, and nothing
            in the league is settled from it.
          </p>
        )}

        {shown.length > 0 && played.length === 0 && (
          <p className="empty-note">Week {week} has not been played yet.</p>
        )}

        {shown.length > 0 && played.length > 0 && !isFinal && (
          <p className="empty-note">
            Scores move until the week is final, and the brighter side of each row is only
            whoever was ahead at the last sync. Records on Standings do not move until the
            week&rsquo;s last game is four hours past.
          </p>
        )}

        {shown.length > 0 && played.length > 0 && !isFinal && !liveProjError && (
          <p className="empty-note">
            The figure in brackets is each team&rsquo;s projected final, an{' '}
            <strong>estimate</strong>: actual points for every game that is over, points so far
            plus the rest of the projection for a game under way, and the projection for a player
            yet to play. The best-ball lineup is picked again on those numbers, so a player who
            has already played keeps his place only if nobody behind him is projected to beat
            him. Nothing in the league is settled from it.
          </p>
        )}

        {shown.length > 0 && !isFinal && liveProjError && (
          <p className="empty-note">
            Couldn&apos;t load the projected finals for week {week}: {liveProjError}
          </p>
        )}
      </section>

      {/* ================= 2. THE WEEK'S NOTE ================= */}
      <div className="control-row" style={{ alignItems: 'baseline' }}>
        <div>
          <p className="stat-label" style={{ margin: 0 }}>
            Week {week} &middot; begins {weekLabel(meta)}
            {meta && meta.is_provisional ? ' (provisional)' : ''}
          </p>
          <p className="row-note" style={{ margin: '4px 0 0' }}>
            {isProjected
              ? projSyncedAt
                ? 'Projections last updated ' + formatShortDateTime(projSyncedAt) + '.'
                : 'No projections have been pulled for this week yet.'
              : syncedAt > 0
              ? 'Scores last updated ' + formatShortDateTime(syncedAt) + '.'
              : 'No scores have been recorded for this week yet.'}
            {isFinal ? ' Sleeper stat corrections later in the week can still move a score.' : ''}
          </p>
          <p className="row-note" style={{ margin: '4px 0 0' }}>
            Scores and projections refresh on their own.
          </p>
        </div>
      </div>

      {/* ================= 3. THE WEEK PICKER, LAST ================= */}
      <section className="edfl-hq-block sb-weeks">
        <h2 className="section-heading">Pick a week</h2>
        <div className="sb-weekgrid" role="tablist" aria-label="League week">
          {weeks.map(function (w) {
            const active = w.week_number === week;
            return (
              <button
                key={w.week_number}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'sb-week is-active' : 'sb-week'}
                onClick={function () {
                  setWeek(w.week_number);
                }}
              >
                <span className="sb-week-n">Wk {w.week_number}</span>
                <span className="sb-week-d">
                  {weekLabel(w)}
                  {w.is_provisional ? '*' : ''}
                </span>
              </button>
            );
          })}
        </div>
        <p className="empty-note">
          Weeks marked * are provisional &mdash; the NFL has not fixed those dates yet.
        </p>
      </section>

      <p className="page-actions edfl-hq-links">
        <a className="btn" href="/standings">
          Standings
        </a>
        <a className="btn" href="/league">
          League
        </a>
        <a className="btn" href="/calendar">
          League Calendar
        </a>
      </p>
    </div>
  );
}
