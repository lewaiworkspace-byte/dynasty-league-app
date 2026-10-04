'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveNotificationPrefs, sendTestNotification } from '../app/notifications/actions';

/**
 * NOTIFICATION PREFERENCES -- the form on /notifications. October 1, 2026.
 *
 * WHAT IT DECIDES: nothing. Which channels exist, the default an owner gets
 * without visiting (in-app + email) and that every outside channel may be
 * turned off are commissioner rulings of October 1; validation lives in
 * save_my_notification_prefs(). This form draws the choices and hands the
 * database's sentence back verbatim when it refuses.
 *
 * The three outside channels:
 *   Email           to the login address unless the owner gives another one
 *   Discord DM      a private message from the league's bot; needs the
 *                   owner's numeric Discord user ID, and he must share the
 *                   league server with the bot
 *   Public callout  Robo Goodell names the team in #league-office, 24 hours
 *                   before the check and right after a failed one
 *
 * Timestamps arrive already formatted in Eastern (createdLabel, sentLabel);
 * this component never formats a date.
 *
 * Props:
 *   initial  my_notification_prefs() row
 *   recent   the owner's last ten notices, with createdLabel / sentLabel
 */

const CHANNEL_LABEL = {
  email: 'Email',
  discord_dm: 'Discord DM',
  discord_public: '#league-office',
};

const KIND_LABEL = {
  new_problem: 'Out of compliance',
  warn_24h: '24-hour warning',
  last_call: 'Last call',
  measured: 'Failed the check',
  cure_last_call: 'Cure last call',
  resolved: 'Back in compliance',
  test: 'Test',
  poach_opened: 'Poach alert',
  poach_last_call: 'Poach last call',
  poach_result: 'Poach result',
};

const STATUS_LABEL = {
  pending: 'Waiting to send',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Not sent',
};

function NotReady({ show, what }) {
  if (!show) return null;
  return (
    <p className="ntf-notready">
      {what} is not switched on for the league yet. Your choice is saved and takes effect when it is.
    </p>
  );
}

export default function NotificationPrefsForm({ initial, recent }) {
  const router = useRouter();
  const p = initial || {};

  const [emailEnabled, setEmailEnabled] = useState(Boolean(p.email_enabled));
  const [useOther, setUseOther] = useState(Boolean(p.email_override));
  const [emailOverride, setEmailOverride] = useState(p.email_override || '');
  const [dmEnabled, setDmEnabled] = useState(Boolean(p.discord_dm_enabled));
  const [discordUserId, setDiscordUserId] = useState(p.discord_user_id || '');
  const [publicEnabled, setPublicEnabled] = useState(Boolean(p.discord_public_enabled));

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgOk, setMsgOk] = useState(false);

  const nothingOn = !emailEnabled && !dmEnabled && !publicEnabled;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await saveNotificationPrefs({
      emailEnabled: emailEnabled,
      emailOverride: useOther ? emailOverride : '',
      discordDmEnabled: dmEnabled,
      discordPublicEnabled: publicEnabled,
      discordUserId: discordUserId,
    });
    setBusy(false);
    if (!res || !res.ok) {
      setMsgOk(false);
      setMsg((res && res.message) || 'Your preferences could not be saved.');
      return;
    }
    setMsgOk(true);
    setMsg('Saved.');
    router.refresh();
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const res = await sendTestNotification();
    setBusy(false);
    if (!res || !res.ok) {
      setMsgOk(false);
      setMsg((res && res.message) || 'The test could not be sent.');
      return;
    }
    setMsgOk(true);
    setMsg(
      res.queued > 0
        ? 'Test queued on ' + res.queued + (res.queued === 1 ? ' channel' : ' channels') + '. It should arrive within a minute or two.'
        : 'Nothing to send: every outside channel is off. Save a channel first.'
    );
    router.refresh();
  }

  return (
    <>
      <form className="ntf-form" onSubmit={save}>
        <div className="ntf-channel ntf-channel-fixed">
          <div className="ntf-channel-head">
            <span className="ntf-check-static" aria-hidden="true">
              ✓
            </span>
            <span className="ntf-channel-name">In the app</span>
            <span className="ntf-always">Always on</span>
          </div>
          <p className="ntf-help">
            A red alert at the top of every page while your roster is at risk, with what to fix, the
            deadline, a countdown and the fine.
          </p>
        </div>

        <div className="ntf-channel">
          <label className="ntf-channel-head">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={function (e) {
                setEmailEnabled(e.target.checked);
              }}
            />
            <span className="ntf-channel-name">Email</span>
          </label>
          <p className="ntf-help">
            Sent to <strong>{useOther && emailOverride ? emailOverride : p.login_email}</strong>
            {useOther ? '' : ' (the address you sign in with)'}.
          </p>
          {emailEnabled ? (
            <div className="ntf-sub">
              <label className="ntf-inline">
                <input
                  type="checkbox"
                  checked={useOther}
                  onChange={function (e) {
                    setUseOther(e.target.checked);
                  }}
                />
                Send to a different address
              </label>
              {useOther ? (
                <input
                  className="ntf-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={emailOverride}
                  onChange={function (e) {
                    setEmailOverride(e.target.value);
                  }}
                />
              ) : null}
            </div>
          ) : null}
          <NotReady show={emailEnabled && !p.email_ready} what="Email" />
        </div>

        <div className="ntf-channel">
          <label className="ntf-channel-head">
            <input
              type="checkbox"
              checked={dmEnabled}
              onChange={function (e) {
                setDmEnabled(e.target.checked);
              }}
            />
            <span className="ntf-channel-name">Discord direct message</span>
          </label>
          <p className="ntf-help">A private message from the league&apos;s bot. Nobody else sees it.</p>
          {dmEnabled ? (
            <div className="ntf-sub">
              <label className="ntf-field-label" htmlFor="ntf-did">
                Your Discord user ID
              </label>
              <input
                id="ntf-did"
                className="ntf-input ntf-mono"
                inputMode="numeric"
                placeholder="e.g. 412345678901234567"
                value={discordUserId}
                onChange={function (e) {
                  setDiscordUserId(e.target.value);
                }}
              />
              <p className="ntf-help ntf-small">
                It is a long number, not your username. In Discord: Settings, then Advanced, turn on
                Developer Mode; then right-click (or long-press) your own name and choose Copy User ID.
                You must be in the league&apos;s Discord server, with direct messages from server members
                allowed.
              </p>
            </div>
          ) : null}
          <NotReady show={dmEnabled && !p.discord_dm_ready} what="The Discord bot" />
        </div>

        <div className="ntf-channel">
          <label className="ntf-channel-head">
            <input
              type="checkbox"
              checked={publicEnabled}
              onChange={function (e) {
                setPublicEnabled(e.target.checked);
              }}
            />
            <span className="ntf-channel-name">Public callout in #league-office</span>
          </label>
          <p className="ntf-help">
            Robo Goodell names your team in front of the league: 24 hours before the weekly check, and
            right after a failed one. No dollar figures, but everybody will know.
          </p>
          <NotReady show={publicEnabled && !p.discord_public_ready} what="Robo Goodell's callouts" />
        </div>

        {nothingOn ? (
          <p className="ntf-warn">
            Every outside channel is off. You will only see the alert when you open the app.
          </p>
        ) : null}

        <div className="ntf-actions">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Working…' : 'Save'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={test}>
            Send me a test
          </button>
          {msg ? (
            <span className={msgOk ? 'ntf-msg ntf-msg-ok' : 'ntf-msg ntf-msg-bad'} role="status">
              {msg}
            </span>
          ) : null}
        </div>
        <p className="ntf-help ntf-small">The test goes to the channels you have saved, not the ones ticked above.</p>
      </form>

      <section className="ntf-recent">
        <h2>Your recent notifications</h2>
        {!recent || recent.length === 0 ? (
          <p className="ntf-help">None yet.</p>
        ) : (
          <ul className="ntf-recent-list">
            {recent.map(function (r, n) {
              return (
                <li className="ntf-recent-item" key={n}>
                  <span className="ntf-recent-when">{r.createdLabel}</span>
                  <span className="ntf-recent-what">
                    {KIND_LABEL[r.kind] || r.kind} · {CHANNEL_LABEL[r.channel] || r.channel}
                  </span>
                  <span className={'ntf-recent-status ntf-st-' + r.status}>
                    {STATUS_LABEL[r.status] || r.status}
                    {r.status !== 'sent' && r.last_error ? ' -- ' + r.last_error : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
