'use client';

import { useState } from 'react';
import { loadOwnerActivity } from './actions';

// Local formatter rather than lib/formatDate: this page needs the time of day,
// not just the date -- "signed in today" is not the question, "signed in since
// the tier opened" is.
function formatStamp(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAgo(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 0) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

export default function OwnerActivityPanel() {
  const [rows, setRows] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleLoad() {
    setError(null);
    setCopied(false);
    setIsPending(true);
    try {
      const data = await loadOwnerActivity();
      setRows(data);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err.message);
      setRows(null);
    } finally {
      setIsPending(false);
    }
  }

  const nudgeList = rows === null ? [] : rows.filter((r) => r.nudge_suggested);

  // Column self-hides when no tier is open: the function returns NULL for this
  // field in that case, and a column of dashes is noise.
  const tierAware =
    rows !== null &&
    rows.length > 0 &&
    rows[0].signed_in_since_tier_opened !== null &&
    rows[0].signed_in_since_tier_opened !== undefined;

  function handleCopy() {
    const emails = nudgeList.map((r) => r.email).filter(Boolean).join(', ');
    if (!emails) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(emails).then(
        () => setCopied(true),
        () => setCopied(false)
      );
    }
  }

  return (
    <section>
      <button type="button" className="btn" onClick={handleLoad} disabled={isPending}>
        {isPending
          ? 'Loading…'
          : rows === null
            ? 'Check Owner Login Activity'
            : 'Refresh'}
      </button>

      {loadedAt && !isPending && (
        <p className="empty-note">Loaded {formatStamp(loadedAt)}</p>
      )}

      {error && <div className="form-error">{error}</div>}

      {rows !== null && rows.length === 0 && !error && (
        <p className="empty-note">No owners found.</p>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <h2 className="section-heading">
            {nudgeList.length === 0
              ? 'Everyone is current'
              : nudgeList.length +
                (nudgeList.length === 1 ? ' owner' : ' owners') +
                ' may need a nudge'}
          </h2>

          {nudgeList.length === 0 ? (
            <p className="empty-note" style={{ color: 'var(--accent-gold)' }}>
              ✓ Every owner has signed in
              {tierAware ? ' since the open tier opened.' : '.'}
            </p>
          ) : (
            <button type="button" className="btn" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy Their Emails'}
            </button>
          )}

          <table className="ledger year-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Email</th>
                <th>Last Sign-In</th>
                <th>Last Seen</th>
                <th style={{ textAlign: 'right' }}>Sessions</th>
                {tierAware && <th>Since Tier Opened</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email || r.team_name}>
                  <td className="team-name" data-label="Team">{r.team_name}</td>
                  <td data-label="Email">{r.email}</td>
                  <td data-label="Last Sign-In">{formatStamp(r.last_sign_in_at)}</td>
                  <td data-label="Last Seen">
                    {formatStamp(r.last_seen_at)}
                    {r.last_seen_at && (
                      <span className="empty-note"> ({formatAgo(r.last_seen_at)})</span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }} data-label="Sessions">
                    {r.open_session_count}
                  </td>
                  {tierAware && (
                    <td data-label="Since Tier Opened">
                      {r.signed_in_since_tier_opened === null ||
                      r.signed_in_since_tier_opened === undefined
                        ? '—'
                        : r.signed_in_since_tier_opened
                          ? 'Yes'
                          : 'No'}
                    </td>
                  )}
                  <td
                    className={
                      !r.has_account || r.nudge_suggested ? 'negative' : 'positive'
                    }
                    data-label="Status"
                  >
                    {!r.has_account
                      ? 'Never registered'
                      : r.nudge_suggested
                        ? 'Needs nudge'
                        : 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="empty-note">
            Last Seen is the later of the last sign-in and the most recent token
            refresh. It is a ceiling, not presence — a session stays open until
            sign-out or expiry, not until a browser closes. Sessions counts
            unexpired sessions, so one owner on two devices shows two.
          </p>
          <p className="empty-note">
            This panel deliberately shows no tier activity. Bids are sealed from
            everyone including the commissioner under rule 6.1(b) while a tier
            is open; once a tier is verified its results are published with
            every bidder named, on the tier's results page.
          </p>
        </>
      )}
    </section>
  );
}
