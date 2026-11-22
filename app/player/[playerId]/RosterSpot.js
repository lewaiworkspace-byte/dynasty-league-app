'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ExplainButton from '../../../components/ExplainButton';
import { formatShortDateTime } from '../../../lib/formatDate';
import { setRosterStatus, setPoachExemption, setTaxiHold } from '../../team/[teamId]/actions';

// THE ROSTER SPOT CONTROL -- UI test batch 34, November 21, 2026.
//
// Lewis on the player-card canvas (Nov 21): the Active / IR / PS control "becomes
// the new way to move a player", shrunk into the card's header ("way too big.
// Move it up and to the right and shrink the size"), on the Mini card and on
// the Full card for his own players. Batch 32 shipped without it; this file is
// the batch 10-31 Mini card's roster-spot block, moved here unchanged in what it
// does so both cards draw the same control:
//
// Each button's state is a row of edfl_roster_spot_options():
//   current       his spot now (filled);
//   current_fine  on IR without IR / Out / Doubtful / PUP: the IR button is RED
//                 and a fine warning shows under the header (IR-3);
//   allowed       pressable;
//   allowed_fine  pressable with the fine warning (IR-2), shown again before the
//                 move is confirmed;
//   refused       greyed, the engine's own sentence behind the one "i" (IR-1).
// A press asks once ("Move him to IR?") and then calls set_roster_status through
// the existing Server Action; its refusal is shown as returned. Nothing here
// re-checks a rule. The two practice squad designations (rule 5.17(l)
// exemption, rule 3.3(d)(i) hold) stay with the control.
//
// LAYOUT. It renders two siblings: .rs-ctl (the label and the pill) and
// .rs-msgs (warnings, the confirm step, the designations, errors). The parent
// places them: the Mini card's header grid puts .rs-ctl at the right of the
// name and .rs-msgs on its own row below; the Full card stacks them. The one
// "i" sits beside the "Roster spot" label; its card opens against the parent's
// edfl-explain-host, which must be the full-width row (never .rs-ctl, L: batch
// 30 slivers), with nothing positioned in between.

const SPOTS = [
  { key: 'active', label: 'Active', short: 'Active', words: 'the active roster' },
  { key: 'ir', label: 'IR', short: 'IR', words: 'injured reserve' },
  { key: 'taxi', label: 'Practice Squad', short: 'PS', words: 'the practice squad' },
];

function notifyPanel() {
  try {
    if (window.name === 'edfl-panel' && window.parent !== window) {
      window.parent.postMessage({ edflPanel: 'changed' }, window.location.origin);
    }
  } catch (e) {
    /* nothing to tell */
  }
}

export default function RosterSpot(props) {
  const router = useRouter();
  const c = props.contract; // { id, rosterStatus }
  const taxi = props.taxi;
  const options = props.options || [];
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const byKey = {};
  options.forEach(function (o) {
    byKey[o.destination] = o;
  });
  const fineRow = options.find(function (o) {
    return o.state === 'current_fine' || o.state === 'allowed_fine';
  });

  function run(fn, doneText) {
    setBusy(true);
    setError('');
    setNotice('');
    fn()
      .then(function (r) {
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setNotice(doneText(r.data));
        setPending(null);
        notifyPanel();
        router.refresh();
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setBusy(false);
      });
  }

  // The reasons behind the one "i": every destination the engine gave a
  // sentence for, except his current spot (the IR fine has its own lines).
  const reasons = SPOTS.map(function (spot) {
    const o = byKey[spot.key];
    if (!o || !o.reason) return null;
    if (o.state === 'current' || o.state === 'current_fine') return null;
    return { spot: spot, o: o };
  }).filter(Boolean);
  const irFine = byKey.ir && byKey.ir.state === 'current_fine' ? byKey.ir : null;

  const explain =
    reasons.length || irFine ? (
      <ExplainButton label="Why some roster spots are greyed or flagged" title="Roster spot">
        {irFine ? (
          <>
            <p>
              <b>IR is red.</b> {irFine.reason}
            </p>
            <p>
              A player may hold an injured reserve place only while he is listed IR, Out, Doubtful or PUP.
              Questionable may be placed but does not qualify. Move him to the active roster, or the fine is
              charged{irFine.fine_due_at ? ' at ' + formatShortDateTime(irFine.fine_due_at) : ''}.
            </p>
            <p>
              Rule Book <a href="/library/rule-book#s-3-4">3.4 Injured reserve</a> and{' '}
              <a href="/library/rule-book#s-6-7">6.7 Fines</a>.
            </p>
          </>
        ) : null}
        {reasons.length ? (
          <ul>
            {reasons.map(function (r) {
                return (
                  <li key={r.spot.key}>
                    <b>{r.spot.label}:</b> {r.o.reason}
                  </li>
                );
              })}
          </ul>
        ) : null}
      </ExplainButton>
    ) : null;

  const ctl = (
    <div className={'rs-ctl' + (props.variant === 'full' ? ' is-full' : '')} key="ctl">
      <span className="rs-labelrow">
        <span className="rs-label" id={'rs-label-' + c.id}>
          Roster spot
        </span>
        {explain}
      </span>
      {props.optionsError ? (
        <span className="rs-unread">Could not be read</span>
      ) : (
        <span className="rs-pill" role="group" aria-labelledby={'rs-label-' + c.id}>
          {SPOTS.map(function (spot) {
            const o = byKey[spot.key] || null;
            const state = o ? o.state : 'refused';
            const current = state === 'current' || state === 'current_fine';
            const refused = state === 'refused';
            return (
              <button
                key={spot.key}
                type="button"
                className={'rs-btn' + (current ? ' is-on' : '') + (state === 'current_fine' ? ' is-fine' : '')}
                aria-pressed={current}
                aria-label={spot.label}
                disabled={refused || busy}
                onClick={function () {
                  if (current) return;
                  setError('');
                  setNotice('');
                  setPending(spot.key);
                }}
              >
                {spot.short}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );

  const msgs = (
    <div className="rs-msgs" key="msgs">
      {props.optionsError ? (
        <div className="form-error mpc-msg">Where he can go could not be read: {props.optionsError}</div>
      ) : null}

      {fineRow && fineRow.state === 'current_fine' ? (
        <p className="mpc-warn">
          $25 fine
          {fineRow.fine_due_at ? ' at ' + formatShortDateTime(fineRow.fine_due_at) : ''} unless he is listed IR,
          Out, Doubtful or PUP, or you move him.
        </p>
      ) : null}

      {pending ? (
        <div className="mpc-msg rs-confirm">
          <p style={{ margin: '0 0 6px' }}>
            Move {props.playerName} to{' '}
            {(SPOTS.find(function (x) {
              return x.key === pending;
            }) || {}).words}
            ?
          </p>
          {byKey[pending] && byKey[pending].state === 'allowed_fine' ? (
            <p className="mpc-warn">
              {byKey[pending].reason}
              {byKey[pending].fine_due_at ? ' His kickoff: ' + formatShortDateTime(byKey[pending].fine_due_at) + '.' : ''}
            </p>
          ) : null}
          <div className="mpc-extra">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={function () {
                const dest = pending;
                run(
                  function () {
                    return setRosterStatus(c.id, dest, null);
                  },
                  function (d) {
                    return (d && d.player ? d.player : props.playerName) + ' moved.';
                  }
                );
              }}
            >
              {busy ? 'Moving…' : 'Move'}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={function () {
                setPending(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {taxi && (c.rosterStatus === 'taxi' || (c.rosterStatus === 'active' && (taxi.elevated || taxi.held))) ? (
        <div className="mpc-extra">
          {c.rosterStatus === 'taxi' ? (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              title="Rule 5.17(l): two per team at a time."
              onClick={function () {
                const on = !taxi.poach_exempt;
                run(
                  function () {
                    return setPoachExemption(c.id, on);
                  },
                  function (d) {
                    return (
                      d.player +
                      (d.exempt ? ' is exempt from poaching. ' : ' is no longer exempt from poaching. ') +
                      d.team_exempt_count +
                      ' of ' +
                      d.team_exempt_limit +
                      ' exemptions in use.'
                    );
                  }
                );
              }}
            >
              {taxi.poach_exempt ? 'Release poach exemption' : 'Exempt from poaching'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              title="Rule 3.3(d): keep him on the active roster through Tuesday until you move him down."
              onClick={function () {
                const on = !taxi.held;
                run(
                  function () {
                    return setTaxiHold(c.id, on);
                  },
                  function (d) {
                    return d.held
                      ? d.player + ' is held on the active roster; the Tuesday return will skip him.'
                      : d.player + ' will return to the practice squad at the next Tuesday 00:00.';
                  }
                );
              }}
            >
              {taxi.held ? 'Release hold' : 'Hold on active'}
            </button>
          )}
        </div>
      ) : null}

      {error ? <div className="form-error mpc-msg">{error}</div> : null}
      {notice ? <p className="form-notice mpc-msg">{notice}</p> : null}
    </div>
  );

  return [ctl, msgs];
}
