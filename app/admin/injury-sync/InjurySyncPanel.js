'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { formatDateTime } from '../../../lib/formatDate';
import { runInjurySyncAction } from './actions';

const initialState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? 'Pulling from Sleeper…' : 'Pull Injury Status Now'}
    </button>
  );
}

function Count(props) {
  return (
    <p style={{ margin: '2px 0' }}>
      <span className="empty-note">{props.label}: </span>
      <span className="num">{props.value}</span>
    </p>
  );
}

export default function InjurySyncPanel(props) {
  const [state, formAction] = useFormState(runInjurySyncAction, initialState);
  const runs = props.runs || [];
  const last = props.lastCompleted;

  return (
    <div className="admin-form">
      <p className="subhead">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">Admin</p>
      <h1>Injury Status Sync</h1>

      <p className="empty-note">
        Pulls every QB/RB/WR/TE/K designation from Sleeper &mdash; Questionable,
        Doubtful, Out, IR, PUP, Sus and the rest &mdash; onto the matching player
        rows, then stamps the timestamp the league Injury Report shows. It runs
        automatically once a day; this button is for when you want it now, on a
        Friday afternoon or ninety minutes before kickoff.
      </p>

      <p className="empty-note">
        This pull only ever <strong>updates</strong> players it can match by
        Sleeper ID. It never adds a player, never renames one and never changes
        an NFL team &mdash; that is what Sync Sleeper Player Pool is for. If a
        new player is missing his designation here, run that one first.
      </p>

      <p className="empty-note">
        Injury status is reference data. It does not affect the cap, roster
        counts, compliance, or whether any move is legal.
      </p>

      <p style={{ margin: '16px 0' }}>
        <span className="empty-note">Report currently reads: </span>
        {last ? (
          <strong>{formatDateTime(last.completed_at)}</strong>
        ) : (
          <strong>never pulled</strong>
        )}
      </p>

      <form action={formAction}>
        <SubmitButton />
      </form>

      {state.status === 'busy' && (
        <div className="form-notice" style={{ marginTop: 12 }}>{state.message}</div>
      )}

      {state.status === 'error' && (
        <div className="form-error" style={{ marginTop: 12 }}>
          Pull failed: {state.message}
        </div>
      )}

      {state.status === 'done' && state.summary && (
        <div className="assistant-box" style={{ marginTop: 12 }}>
          <p>
            <strong>Done.</strong> The Injury Report banner now reads the moment
            this finished.
          </p>
          <Count label="Players examined" value={state.summary.players_examined} />
          <Count label="Carrying a designation" value={state.summary.injured_after} />
          <Count label="Designations that changed" value={state.summary.status_changes} />
          <Count label="Cleared (healthy again)" value={state.summary.cleared} />
          <Count label="Note or body-part updates" value={state.summary.detail_updates} />

          {Number(state.summary.unmatched) > 0 && (
            <p className="empty-note" style={{ marginTop: 8 }}>
              {state.summary.unmatched} designated player(s) in the feed have no
              matching row here. That is normal for someone the player pool sync
              has not picked up yet &mdash; run Sync Sleeper Player Pool to
              close the gap.
            </p>
          )}

          {Number(state.summary.reaped) > 0 && (
            <p className="empty-note" style={{ marginTop: 8 }}>
              Cleared {state.summary.reaped} abandoned run(s) before starting.
            </p>
          )}

          {state.summary.log_error && (
            <p className="form-error" style={{ marginTop: 8 }}>
              The pull succeeded but the Commissioner Action Log entry did not
              write: {state.summary.log_error}
            </p>
          )}

          <p style={{ marginTop: 10 }}>
            <a href="/injury-report" className="btn btn-quiet">Open the Injury Report</a>
          </p>
        </div>
      )}

      <h2 className="section-heading" style={{ marginTop: 32 }}>Recent pulls</h2>
      {runs.length === 0 ? (
        <p className="empty-note">No pull has been recorded yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="ledger sync-table">
            <thead>
              <tr>
                <th>When</th>
                <th>How</th>
                <th>Result</th>
                <th className="col-num">Changed</th>
                <th className="col-num">Designated</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(function (r) {
                return (
                  <tr key={r.id}>
                    <td data-label="When">
                      {formatDateTime(r.completed_at || r.started_at)}
                    </td>
                    <td data-label="How">
                      {r.trigger_source === 'scheduled' ? 'Daily' : 'Manual'}
                    </td>
                    <td data-label="Result">
                      <span
                        className={
                          'status ' +
                          (r.status === 'completed'
                            ? 'status-good'
                            : r.status === 'running'
                              ? 'status-live'
                              : 'status-bad')
                        }
                      >
                        {r.status}
                      </span>
                      {r.error_message && (
                        <div className="empty-note">{r.error_message}</div>
                      )}
                    </td>
                    <td className="col-num" data-label="Changed">
                      {r.status === 'completed' ? r.players_changed : '—'}
                    </td>
                    <td className="col-num" data-label="Designated">
                      {r.status === 'completed' ? r.injured_after : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
