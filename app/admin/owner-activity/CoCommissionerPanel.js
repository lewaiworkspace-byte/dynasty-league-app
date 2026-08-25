'use client';

import { useState, useEffect } from 'react';
import { loadOwnerRoles, setCoCommissioner } from './actions';

// Co-commissioner appointment. COMMISSIONER ONLY -- the page redirects and
// both Server Actions re-check independently, because a Server Action is a
// callable endpoint whatever the page renders.
//
// Every action call here follows the project rule: the action RETURNS its
// refusal as { ok: false, message } and this component checks .ok. The
// .catch arms are for genuine transport failures only -- a dead network, not
// a database saying no. If a refusal ever shows up in a catch arm, an action
// somewhere started throwing again.

export default function CoCommissionerPanel() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // The row awaiting confirmation, or null. Holds the whole intent -- who,
  // and in which direction -- so the confirm block never has to re-derive it.
  const [pending, setPending] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  function refresh() {
    setLoading(true);
    setError(null);
    loadOwnerRoles()
      .then(function (result) {
        if (!result.ok) {
          setError(result.message);
          setRows(null);
          return;
        }
        setRows(result.data);
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
        setRows(null);
      })
      .finally(function () {
        setLoading(false);
      });
  }

  useEffect(function () {
    refresh();
    // Runs once. The list is small and the commissioner is the only reader.
  }, []);

  function beginChange(row, enabled) {
    setPending({ id: row.id, email: row.email, teamName: row.teamName, enabled: enabled });
    setReason('');
    setError(null);
    setNotice(null);
  }

  function cancelChange() {
    setPending(null);
    setReason('');
  }

  function confirmChange() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    setCoCommissioner(pending.id, pending.enabled, reason)
      .then(function (result) {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setNotice(
          (pending.enabled ? 'Appointed ' : 'Removed ') +
            (pending.teamName || pending.email) +
            ' as co-commissioner.'
        );
        setPending(null);
        setReason('');
        refresh();
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setBusy(false);
      });
  }

  const holders = rows === null ? [] : rows.filter(function (r) {
    return r.isCoCommissioner;
  });

  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="section-heading">Co-Commissioners</h2>

      <p className="empty-note">
        A co-commissioner may build tiers, resolve and verify them, create and
        repair contracts, cut from any roster, and adjust Owner Cash. They may
        not sync players, import stats, view this activity page, publish a
        Player Value Chart, or appoint another co-commissioner.
      </p>

      {error && <div className="form-error">{error}</div>}
      {notice && <div className="form-notice">{notice}</div>}

      {loading && <p className="empty-note">Loading owners…</p>}

      {!loading && rows !== null && (
        <p className="empty-note">
          {holders.length === 0
            ? 'Nobody currently holds the role.'
            : holders.length === 1
              ? 'One co-commissioner: ' + holders[0].teamName
              : holders.length +
                ' co-commissioners: ' +
                holders
                  .map(function (h) {
                    return h.teamName;
                  })
                  .join(', ')}
        </p>
      )}

      {pending && (
        <div className="form-notice">
          <p>
            {pending.enabled
              ? 'Give ' + pending.teamName + ' co-commissioner access?'
              : 'Remove co-commissioner access from ' + pending.teamName + '?'}
          </p>
          <label>
            Reason (appears in the public action log)
            <input
              type="text"
              value={reason}
              onChange={function (e) {
                setReason(e.target.value);
              }}
              disabled={busy}
            />
          </label>
          <div className="page-actions">
            <button
              type="button"
              className={pending.enabled ? 'btn' : 'btn btn-danger'}
              onClick={confirmChange}
              disabled={busy || !reason.trim()}
            >
              {busy ? 'Saving…' : pending.enabled ? 'Confirm appointment' : 'Confirm removal'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={cancelChange} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!loading && rows !== null && rows.length > 0 && (
        <table className="ledger year-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Email</th>
              <th>Role</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r) {
              return (
                <tr key={r.id}>
                  <td className="team-name" data-label="Team">
                    {r.teamName}
                  </td>
                  <td data-label="Email">{r.email}</td>
                  <td data-label="Role">
                    {r.isCommissioner
                      ? 'Commissioner'
                      : r.isCoCommissioner
                        ? 'Co-commissioner'
                        : 'Owner'}
                  </td>
                  <td data-label="Change">
                    {r.isCommissioner ? (
                      <span className="empty-note">—</span>
                    ) : r.isCoCommissioner ? (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={function () {
                          beginChange(r, false);
                        }}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={function () {
                          beginChange(r, true);
                        }}
                        disabled={busy}
                      >
                        Appoint
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!loading && rows !== null && rows.length === 0 && !error && (
        <p className="empty-note">
          No owners came back. If you are signed in as the commissioner, check
          the row-level security policy on team_owners.
        </p>
      )}
    </section>
  );
}
