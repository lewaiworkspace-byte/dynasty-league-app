'use client';

import { useState, useTransition } from 'react';
import { refreshWeekScores } from './actions';

// One tab per league week; five matchup cards under the selected tab.
//
// A 0.00-0.00 PAIRING IS AN UNPLAYED WEEK, NOT A TIE. has_scores comes from the
// view and is the only thing that decides whether a card shows a result. Every
// week of a season exists in league_weeks from the day the calendar is loaded,
// so without that flag the whole preseason would render as ten drawn games.

function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '--';
  return v.toFixed(2);
}

function weekLabel(w) {
  const d = new Date(w.charge_at);
  const day = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  return day;
}

export default function Scoreboard(props) {
  const weeks = props.weeks || [];
  const rows = props.rows || [];

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
      let msg = 'Week ' + week + ' refreshed: ' + (d.rows_written || 0) + ' of ' +
        (d.teams_expected || 0) + ' teams written.';
      if (unmatched.length > 0) {
        msg = msg + ' Sleeper roster ' + unmatched.join(', ') +
          ' has no matching team in the app and was skipped.';
      }
      const corrections = d.corrections || [];
      if (corrections.length > 0) {
        msg = msg + ' ' + corrections.length +
          ' score(s) changed from what was recorded before; the correction is in the action log.';
      }
      setNotice(msg);
    });
  }

  return (
    <div>
      <div className="tabs" role="tablist">
        {weeks.map(function (w) {
          return (
            <button
              key={w.week_number}
              type="button"
              role="tab"
              aria-selected={w.week_number === week}
              className={w.week_number === week ? 'tab is-active' : 'tab'}
              onClick={function () {
                setWeek(w.week_number);
                setNotice(null);
                setFailure(null);
              }}
            >
              Wk {w.week_number}
            </button>
          );
        })}
      </div>

      <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <p className="stat-label" style={{ margin: 0 }}>
            Week {week} &middot; begins {meta ? weekLabel(meta) : '--'}
            {meta && meta.is_provisional ? ' (provisional)' : ''}
          </p>
          <p className="row-note" style={{ margin: '4px 0 0' }}>
            {syncedAt > 0
              ? 'Last refreshed ' + new Date(syncedAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'
              : 'Never refreshed from Sleeper.'}
          </p>
        </div>
        {props.canRefresh && (
          <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={pending}>
            {pending ? 'Refreshing...' : 'Refresh from Sleeper'}
          </button>
        )}
      </div>

      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

      {shown.length === 0 && (
        <p className="empty-note">
          No matchups have been pulled for week {week}.
          {props.canRefresh ? ' Refresh from Sleeper to load them.' : ''}
        </p>
      )}

      {shown.length > 0 && played.length === 0 && (
        <p className="empty-note">Week {week} has not been played yet.</p>
      )}

      {shown.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 12,
            marginTop: 16,
          }}
        >
          {shown.map(function (r) {
            return (
              <div
                key={r.matchup_id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '14px 16px',
                  background: 'var(--bg-elevated)',
                }}
              >
                <Side
                  teamId={r.home_team_id}
                  team={r.home_team}
                  owner={r.home_owner}
                  points={r.home_points}
                  winner={r.winner_team_id}
                  played={r.has_scores}
                />
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    margin: '10px 0',
                  }}
                />
                <Side
                  teamId={r.away_team_id}
                  team={r.away_team}
                  owner={r.away_owner}
                  points={r.away_points}
                  winner={r.winner_team_id}
                  played={r.has_scores}
                />
                <p className="row-note" style={{ margin: '10px 0 0' }}>
                  {!r.has_scores
                    ? 'Not played'
                    : r.winner_team_id
                    ? 'Margin ' + fmt(r.margin)
                    : 'Tied'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Side(props) {
  const isWinner = props.played && props.winner && props.winner === props.teamId;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
      <div style={{ minWidth: 0 }}>
        <a
          href={props.teamId ? '/team/' + props.teamId : '#'}
          className="team-name"
          style={{ fontWeight: isWinner ? 700 : 500 }}
        >
          {props.team || 'Unclaimed Team'}
        </a>
        <p className="row-note" style={{ margin: '2px 0 0' }}>
          {props.owner || ''}
        </p>
      </div>
      <span
        className="num"
        style={{
          fontFamily: 'var(--font-mono), monospace',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 16,
          fontWeight: isWinner ? 700 : 400,
          color: props.played ? 'var(--text)' : 'var(--text-dim)',
        }}
      >
        {props.played ? fmt(props.points) : '--'}
      </span>
    </div>
  );
}
