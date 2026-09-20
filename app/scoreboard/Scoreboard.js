'use client';

import { useState, useTransition } from 'react';
import { refreshWeekScores } from './actions';

/**
 * THE SCOREBOARD BODY -- five matchup rows, then the controls, then the
 * fourteen-week strip.
 *
 * THE ORDER OF THE THREE BLOCKS IS THE POINT OF PHASE 2G-1. Scores, then
 * refresh, then the week picker. The picker moved to the bottom because it
 * is a navigation control for the thirteen weeks you are NOT looking at, and
 * it was costing the top of a phone screen to the one week you are.
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
 * A SCORE IS NOT MONEY AND IS NEVER ROUNDED. It is rendered from the string
 * PostgREST returned, because Number('0.00') prints as "0" and a real zero --
 * which two teams posted in Week 2 -- would then read as "not reported".
 */

function score(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function weekLabel(w) {
  if (!w || !w.first_game_at) return '—';
  return new Date(w.first_game_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

export default function Scoreboard(props) {
  const weeks = props.weeks || [];
  const rows = props.rows || [];
  const abbrevById = props.abbrevById || {};
  const myTeamId = props.myTeamId || null;

  const [week, setWeek] = useState(props.initialWeek);
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);
  const [pending, startTransition] = useTransition();

  const shown = rows.filter(function (r) {
    return r.week_number === week;
  });

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

  function onRefresh() {
    setNotice(null);
    setFailure(null);
    startTransition(async function () {
      const res = await refreshWeekScores(props.season, week);
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      const d = res.data || {};
      const unmatched = d.unmatched_rosters || [];
      let msg =
        'Week ' +
        week +
        ' refreshed: ' +
        (d.rows_written || 0) +
        ' of ' +
        (d.teams_expected || 0) +
        ' teams written.';
      if (unmatched.length > 0) {
        msg =
          msg +
          ' Sleeper roster ' +
          unmatched.join(', ') +
          ' has no matching team in the app and was skipped.';
      }
      const corrections = d.corrections || [];
      if (corrections.length > 0) {
        msg =
          msg +
          ' ' +
          corrections.length +
          ' score(s) changed from what was recorded before; the correction is in the action log.';
      }
      setNotice(msg);
    });
  }

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
            {isFinal ? 'FINAL' : played.length > 0 ? 'IN PROGRESS' : 'NOT PLAYED'}
          </span>
        </div>

        {shown.length === 0 && (
          <p className="empty-note">
            No matchups have been pulled for week {week}.
            {props.canRefresh ? ' Refresh from Sleeper below to load them.' : ''}
          </p>
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
                        </span>
                      </a>
                    );
                  })}
                  <p className="lg-note">
                    {!r.has_scores
                      ? 'Not played'
                      : r.winner_team_id
                      ? 'Margin ' + score(r.margin)
                      : 'Tied'}
                  </p>
                </div>
              );
            })}
          </div>
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
      </section>

      {/* ================= 2. THE CONTROLS ================= */}
      <div
        className="control-row"
        style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <div>
          <p className="stat-label" style={{ margin: 0 }}>
            Week {week} &middot; begins {weekLabel(meta)}
            {meta && meta.is_provisional ? ' (provisional)' : ''}
          </p>
          <p className="row-note" style={{ margin: '4px 0 0' }}>
            {syncedAt > 0
              ? 'Last refreshed ' +
                new Date(syncedAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) +
                ' ET'
              : 'Never refreshed from Sleeper.'}
            {isFinal ? ' Sleeper stat corrections later in the week can still move a score.' : ''}
          </p>
        </div>
        {props.canRefresh && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={pending}
          >
            {pending ? 'Refreshing...' : 'Refresh from Sleeper'}
          </button>
        )}
      </div>

      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

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
                  setNotice(null);
                  setFailure(null);
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
