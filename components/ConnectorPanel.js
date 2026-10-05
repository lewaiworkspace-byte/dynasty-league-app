'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createConnectorKey, revokeConnectorKey } from '../app/data/actions';

/**
 * CONNECT CLAUDE -- the connector-key section of /data. October 5, 2026.
 *
 * WHAT IT DECIDES: nothing. The three-key limit, who may revoke what, and
 * every refusal sentence are the database's (create_my_api_key,
 * revoke_api_key). This draws the owner's keys, creates one, and shows the
 * plaintext link exactly once -- it lives only in this component's state and
 * is gone on the next page load, by design: the database keeps a hash.
 *
 * Dates arrive already formatted in Eastern (createdLabel, lastUsedLabel);
 * this component never formats a date.
 *
 * Props:
 *   keys         my_api_keys() rows, with createdLabel / lastUsedLabel
 *   baseUrl      https://<host> of this deploy, for the connector link
 *   loadError    a failed my_api_keys() read, as a sentence
 *   officerKeys  officer_api_keys() rows (officers only), or null
 *   officerError a failed officer read, as a sentence
 */

function KeyRows({ rows, showTeam, onRevoke, busyId }) {
  return (
    <div className="table-scroll">
      <table className="ledger dc-keys">
        <thead>
          <tr>
            {showTeam ? <th>Team</th> : null}
            <th>Label</th>
            <th>Key</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Calls</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(function (k) {
            const live = !k.revoked_at;
            return (
              <tr key={k.id}>
                {showTeam ? <td data-label="Team">{k.team_name || 'Unknown'}</td> : null}
                <td data-label="Label">{k.label}</td>
                <td data-label="Key">
                  <span className="ntf-mono">{k.key_prefix}…</span>
                </td>
                <td data-label="Created">{k.createdLabel}</td>
                <td data-label="Last used">{k.lastUsedLabel || 'Never'}</td>
                <td data-label="Calls">{k.use_count}</td>
                <td data-label="Status">{live ? 'Live' : 'Revoked'}</td>
                <td>
                  {live ? (
                    <button
                      type="button"
                      className="btn btn-secondary dc-small"
                      disabled={busyId === k.id}
                      onClick={function () {
                        onRevoke(k);
                      }}
                    >
                      {busyId === k.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ConnectorPanel({ keys, baseUrl, loadError, officerKeys, officerError }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [msgOk, setMsgOk] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [copied, setCopied] = useState(false);

  const mine = keys || [];
  const liveCount = mine.filter(function (k) {
    return !k.revoked_at;
  }).length;
  const freshUrl = fresh ? baseUrl + '/api/mcp/' + fresh.key : null;

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setCopied(false);
    const res = await createConnectorKey(label.trim() || null);
    setBusy(false);
    if (!res || !res.ok) {
      setMsgOk(false);
      setMsg((res && res.message) || 'The key could not be created.');
      return;
    }
    setFresh({ key: res.key, prefix: res.prefix });
    setLabel('');
    router.refresh();
  }

  async function revoke(k) {
    setBusyId(k.id);
    setMsg(null);
    const res = await revokeConnectorKey(k.id);
    setBusyId(null);
    if (!res || !res.ok) {
      setMsgOk(false);
      setMsg((res && res.message) || 'The key could not be revoked.');
      return;
    }
    if (fresh && k.key_prefix === fresh.prefix) setFresh(null);
    setMsgOk(true);
    setMsg('Revoked. Any Claude using that link loses access on its next request.');
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(freshUrl);
      setCopied(true);
    } catch (e) {
      setCopied(false);
    }
  }

  return (
    <div className="dc-connector">
      <p>
        A connector lets Claude read the league directly, so you can ask things like{' '}
        <em>&quot;Which teams have the most cap room in 2027?&quot;</em>,{' '}
        <em>&quot;Compare every WR I could sign against what&apos;s on my roster&quot;</em> or{' '}
        <em>&quot;Who won the last auction tier and what did they pay?&quot;</em>. It reads the same
        league-wide data as the downloads above, and it is read-only: Claude cannot sign, cut,
        trade or bid for you.
      </p>
      <p className="ntf-fine">
        Never available through the connector: bids on an open tier, Auto-Bid slates, free agency
        offers before their window resolves, waiver claims, watchlists, Insider submissions,
        draft trade proposals, cash ledgers and owner contact details.
      </p>

      <h3 className="set-h3">Your connector links</h3>
      {loadError ? (
        <p className="ntf-error">Your connector keys could not be read: {loadError}</p>
      ) : mine.length ? (
        <KeyRows rows={mine} showTeam={false} onRevoke={revoke} busyId={busyId} />
      ) : (
        <p className="empty-note">You have no connector links yet.</p>
      )}

      {fresh ? (
        <div className="dc-fresh" role="status">
          <div className="dc-fresh-title">Your new connector link -- copy it now</div>
          <p className="ntf-fine">
            This is the only time the full link is shown. Treat it like a password: anyone who has
            it can read league data as you. If it leaks, revoke it and make another.
          </p>
          <code className="dc-url">{freshUrl}</code>
          <div className="dc-row">
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      ) : null}

      {!loadError ? (
        <form className="dc-create" onSubmit={create}>
          <label className="ntf-field-label" htmlFor="dc-label">
            Label (optional) -- where you will use it
          </label>
          <div className="dc-row">
            <input
              id="dc-label"
              className="ntf-input"
              type="text"
              maxLength={40}
              placeholder="Claude"
              value={label}
              onChange={function (e) {
                setLabel(e.target.value);
              }}
            />
            <button type="submit" className="btn" disabled={busy || liveCount >= 3}>
              {busy ? 'Creating…' : 'Create connector link'}
            </button>
          </div>
          {liveCount >= 3 ? (
            <p className="ntf-fine">You have 3 live links, the limit. Revoke one to make another.</p>
          ) : null}
        </form>
      ) : null}

      {msg ? <p className={msgOk ? 'ntf-msg ntf-msg-ok' : 'ntf-msg ntf-msg-bad'}>{msg}</p> : null}

      <h3 className="set-h3">Add it to Claude</h3>
      <ol className="dc-steps">
        <li>
          In Claude on the web or the desktop app, open <strong>Customize → Connectors</strong>,
          then <strong>+ Add → Add custom connector</strong>. (Free Claude accounts can add one
          custom connector; Pro and Max can add more. On a Team or Enterprise plan, an
          organization owner has to add it first.)
        </li>
        <li>
          Name it <strong>EDFL</strong>, paste your connector link as the URL, choose{' '}
          <strong>No sign in</strong> for authentication, and click <strong>Add</strong>.
        </li>
        <li>
          In a chat, turn EDFL on from the tools menu and ask away. Once added on the web it is
          available in the Claude phone app too.
        </li>
        <li>
          Claude Code instead? Run{' '}
          <code className="ntf-mono">claude mcp add --transport http edfl &lt;your link&gt;</code>
        </li>
      </ol>

      {officerKeys || officerError ? (
        <>
          <h3 className="set-h3">Every connector link in the league (officers)</h3>
          {officerError ? (
            <p className="ntf-error">The league&apos;s connector keys could not be read: {officerError}</p>
          ) : officerKeys.length ? (
            <KeyRows rows={officerKeys} showTeam={true} onRevoke={revoke} busyId={busyId} />
          ) : (
            <p className="empty-note">No owner has made a connector link yet.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
