'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reverseCut } from './actions';

function formatMoney(n) {
  if (n === null || n === undefined) return '\u2014';
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.abs(num).toLocaleString();
}

function formatWhen(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Why a cut can't be reversed. The view already folds every condition into
// is_reversible; this only decides which sentence to show. Order matches the
// guard precedence in reverse_cut(): the two superior guards speak first,
// then the time window.
function blockedReason(c, seasonYear, windowHours) {
  if (!c.is_active_cut) return 'Already reversed';
  if (c.event_season_year !== seasonYear) {
    return 'Made in ' + c.event_season_year + ' \u2014 reversing would rewrite a closed season';
  }
  if (c.contract_status !== 'cut' && c.contract_status !== 'cut_june1') {
    return 'Contract is no longer in a cut state';
  }
  if (Number(c.reversal_hours_left) <= 0) {
    return 'The ' + windowHours + '-hour window has closed';
  }
  return 'Player has signed an active contract since the cut';
}

export default function CutsPanel(props) {
  const cuts = props.cuts;
  const seasonYear = props.seasonYear;
  const windowHours = props.windowHours;

  const router = useRouter();

  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  function close() {
    setTarget(null);
    setReason('');
    setError('');
  }

  function submit() {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setWorking(true);
    setError('');
    reverseCut(target.event_id, reason)
      .then(function () {
        setWorking(false);
        close();
        router.refresh();
      })
      .catch(function (err) {
        setError(err.message || String(err));
        setWorking(false);
      });
  }

  if (cuts.length === 0) {
    return <p className="empty-note">No cuts have been made yet.</p>;
  }

  return (
    <div>
      {cuts.length >= 500 && (
        <p className="form-notice">
          Showing the 500 most recent cuts. Older cuts exist but are not
          listed here.
        </p>
      )}

      <table className="ledger">
        <thead>
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>When</th>
            <th className="col-num">Dead Cap</th>
            <th className="col-num">Dead Cash</th>
            <th>Status</th>
            <th>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {cuts.map(function (c) {
            const reversed = !c.is_active_cut;
            return (
              <tr key={c.event_id}>
                <td className="team-name" data-label="Player">
                  {c.player_name}
                  <span className="empty-note" style={{ marginLeft: 6 }}>
                    {c.position}
                  </span>
                </td>
                <td data-label="Team">{c.team_name}</td>
                <td data-label="When">
                  {formatWhen(c.created_at)}
                  {c.created_by_email && (
                    <span className="empty-note" style={{ marginLeft: 6 }}>
                      {c.created_by_email}
                    </span>
                  )}
                </td>
                <td className="num v-dead col-num" data-label="Dead Cap">
                  {formatMoney(c.dead_cap_current_year)}
                  {Number(c.dead_cap_next_year) > 0 && (
                    <span className="empty-note" style={{ marginLeft: 6 }}>
                      +{formatMoney(c.dead_cap_next_year)} in {c.event_season_year + 1}
                    </span>
                  )}
                </td>
                <td className="num v-cash col-num" data-label="Dead Cash">
                  {formatMoney(c.dead_cash_current_year)}
                </td>
                <td data-label="Status">
                  {reversed ? (
                    <span>
                      <span className="status status-off">REVERSED</span>
                      <span className="empty-note" style={{ marginLeft: 6 }}>
                        {formatWhen(c.reversed_at)}
                        {c.reversed_by_email ? ' by ' + c.reversed_by_email : ''}
                        {c.reversal_reason ? ' \u2014 ' + c.reversal_reason : ''}
                      </span>
                    </span>
                  ) : (
                    <span>
                      <span className="status status-live">CUT</span>
                      {c.june1_designated && (
                        <span className="empty-note" style={{ marginLeft: 6 }}>
                          June 1st designation
                        </span>
                      )}
                      {!c.june1_designated && c.june1_split && (
                        <span className="empty-note" style={{ marginLeft: 6 }}>
                          auto split
                        </span>
                      )}
                    </span>
                  )}
                  {c.notes && (
                    <span className="empty-note" style={{ display: 'block' }}>
                      {c.notes}
                    </span>
                  )}
                </td>
                <td data-label="Reverse">
                  {c.is_reversible ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={function () {
                        setTarget(c);
                        setReason('');
                        setError('');
                      }}
                    >
                      Reverse
                    </button>
                  ) : (
                    <span className="empty-note">
                      {blockedReason(c, seasonYear, windowHours)}
                    </span>
                  )}
                  {c.is_reversible && (
                    <span className="empty-note" style={{ display: 'block' }}>
                      {Number(c.reversal_hours_left).toFixed(1)}h left
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {target && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={'Reverse the cut of ' + target.player_name}
          >
            <h2 className="modal-title">Reverse: {target.player_name}</h2>
            <p className="empty-note">
              {target.team_name} &middot; cut {formatWhen(target.created_at)}
            </p>

            <p className="form-notice">
              This restores the contract to active and removes{' '}
              {formatMoney(target.dead_cap_current_year)} dead cap and{' '}
              {formatMoney(target.dead_cash_current_year)} dead cash from{' '}
              {target.team_name}
              {Number(target.dead_cap_next_year) > 0
                ? ', plus ' +
                  formatMoney(target.dead_cap_next_year) +
                  ' charged to ' +
                  (target.event_season_year + 1)
                : ''}
              . The cut stays on this page marked reversed.
            </p>

            <div className="modal-section">
              <label htmlFor="revreason">
                Reason (required, appears in the public action log)
              </label>
              <input
                id="revreason"
                type="text"
                value={reason}
                disabled={working}
                onChange={function (e) {
                  setReason(e.target.value);
                }}
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <div className="page-actions">
              <button
                type="button"
                className="btn btn-quiet"
                disabled={working}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={working}
                onClick={submit}
              >
                {working ? 'Reversing\u2026' : 'Reverse Cut'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
