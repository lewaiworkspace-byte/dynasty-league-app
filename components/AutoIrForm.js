'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveRosterPrefs } from '../app/settings/actions';

/**
 * AUTOMATIC IR MOVES -- the Roster automation section of /settings.
 * October 4, 2026.
 *
 * WHAT IT DECIDES: nothing. Which players qualify (Sleeper's IR, Out, Doubtful
 * or PUP -- edfl_injury_designation_qualifies), when a move may happen, and
 * what happens when IR is full are all in the database (edfl_auto_ir_due, a
 * two-minute job). This form saves two switches and lists what the job did.
 *
 * Rulings (Commissioner, October 4, 2026):
 *   AI-1  to Active: even if the move puts the team over 25 Active or over 3
 *         QBs or Ks -- the over-limit rules then apply and the owner is told.
 *   AI-2  to IR: Active Roster players only; never the practice squad.
 *
 * Dates arrive already formatted in Eastern (createdLabel); this component
 * never formats a date.
 *
 * Props:
 *   initial  my_roster_prefs() result
 *   recent   the team's last ten automatic moves, with createdLabel
 */
export default function AutoIrForm({ initial, recent }) {
  const router = useRouter();
  const p = initial || {};
  const [toActive, setToActive] = useState(Boolean(p.auto_ir_to_active));
  const [toIr, setToIr] = useState(Boolean(p.auto_ir_to_ir));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgOk, setMsgOk] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await saveRosterPrefs({ toActive: toActive, toIr: toIr });
    setBusy(false);
    if (!res || !res.ok) {
      setMsgOk(false);
      setMsg((res && res.message) || 'Your choices could not be saved.');
      return;
    }
    setMsgOk(true);
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <>
      <form className="ntf-form" onSubmit={save}>
        <div className="ntf-channel">
          <label className="ntf-channel-head">
            <input
              type="checkbox"
              checked={toActive}
              onChange={function (e) {
                setToActive(e.target.checked);
              }}
            />
            <span className="ntf-channel-name">Move players who lose their IR designation to the Active Roster</span>
          </label>
          <p className="ntf-help">
            When Sleeper stops listing an IR player as IR, Out, Doubtful or PUP, the app moves him back
            to your Active Roster, so he never sits on IR long enough to draw the IR fine. It moves him
            even if that puts you over 25 Active players or over 3 quarterbacks or kickers. If it does,
            the over-limit rules apply from then on and you are told.
          </p>
        </div>

        <div className="ntf-channel">
          <label className="ntf-channel-head">
            <input
              type="checkbox"
              checked={toIr}
              onChange={function (e) {
                setToIr(e.target.checked);
              }}
            />
            <span className="ntf-channel-name">Move injured Active Roster players to IR</span>
          </label>
          <p className="ntf-help">
            When Sleeper lists one of your Active Roster players as IR, Out, Doubtful or PUP, the app
            moves him to injured reserve if you have an open spot ({p.ir_slots || 10} at most). A player
            on IR does not score. Practice squad players are never moved. If IR is full, nothing moves
            and you are told.
          </p>
        </div>

        <p className="ntf-help ntf-small">
          A move is never made between a player&apos;s kickoff and the end of that league week, so it
          can never add or erase points he has already scored. Moves are made in this app only;
          Sleeper is not changed. You hear about every move, and every move that could not be made,
          through the notification channels below.
        </p>

        <div className="ntf-actions">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Working…' : 'Save'}
          </button>
          {msg ? (
            <span className={msgOk ? 'ntf-msg ntf-msg-ok' : 'ntf-msg ntf-msg-bad'} role="status">
              {msg}
            </span>
          ) : null}
        </div>
      </form>

      <section className="ntf-recent">
        <h3 className="set-h3">Recent automatic moves</h3>
        {!recent || recent.length === 0 ? (
          <p className="ntf-help">None yet.</p>
        ) : (
          <ul className="ntf-recent-list">
            {recent.map(function (r, n) {
              return (
                <li className="ntf-recent-item" key={n}>
                  <span className="ntf-recent-when">{r.createdLabel}</span>
                  <span className="ntf-recent-what">
                    {r.player} · {r.to === 'ir' ? 'to IR' : 'to Active'}
                    {r.injury_status ? ' (' + r.injury_status + ')' : ''}
                  </span>
                  <span className={'ntf-recent-status ' + (r.outcome === 'moved' ? 'ntf-st-sent' : 'ntf-st-failed')}>
                    {r.outcome === 'moved' ? 'Moved' : 'Not moved -- ' + (r.detail || 'blocked')}
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
