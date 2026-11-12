'use client';

import { useState, useTransition } from 'react';
import { submitClaim } from '../../../waivers/actions';
import { reliefText } from '../../../waivers/WaiverBoard';

// The claim sheet's form: today's "Cut this player if I win" choice, the box
// the owner must tick (Lewis, Nov 11; wording read back against Rule Book
// 5.15(i) and agreed), and Submit. It submits through the Waiver Wire page's
// own Server Action (submitClaim -> submit_waiver_claim), which decides
// everything and returns its refusal verbatim. Submit stays off until the box
// is ticked: that is the presentation Lewis asked for, not a gate.

function inSheet() {
  try {
    return window.name === 'edfl-sheet' && window.parent !== window;
  } catch (e) {
    return false;
  }
}

function closeOrBack() {
  if (inSheet()) {
    window.parent.postMessage({ edflSheet: 'close' }, window.location.origin);
  } else {
    window.location.href = '/players?view=waivers';
  }
}

export default function ClaimSheet(props) {
  const [cut, setCut] = useState(props.existingCut || '');
  const [ack, setAck] = useState(false);
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(null);
  const [pending, startTransition] = useTransition();
  const roster = props.roster || [];

  function onSubmit() {
    setFailure(null);
    startTransition(async function () {
      const res = await submitClaim(props.placementId, cut || null);
      if (!res || !res.ok) {
        setFailure(res && res.message ? res.message : 'The claim could not be placed.');
        return;
      }
      setDone(
        (props.alreadyClaimed ? 'Your claim on ' : 'Claim on ') +
          props.playerName +
          (props.alreadyClaimed ? ' is updated.' : ' is in.') +
          ' Order or withdraw your claims on the Waiver Wire page until the run.'
      );
    });
  }

  if (done) {
    return (
      <div className="mpc-box">
        <p className="form-notice">{done}</p>
        <div className="pl-btns">
          <a className="btn btn-secondary" href="/waivers">
            Your claims
          </a>
          <button type="button" className="btn kit-cta" onClick={closeOrBack}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mpc-box">
      {props.alreadyClaimed ? (
        <p className="pl-sm">You already have a claim on him. Submitting again updates its cut choice.</p>
      ) : null}
      <label className="pl-fl" htmlFor="pl-cut">
        Cut this player if I win
      </label>
      <select
        id="pl-cut"
        className="pl-select"
        value={cut}
        disabled={pending}
        onChange={function (e) {
          setCut(e.target.value);
        }}
      >
        <option value="">Nobody</option>
        {roster.map(function (r) {
          return (
            <option key={r.id} value={r.id}>
              {r.name + (r.position ? ' (' + r.position + ')' : '') + reliefText(r.capRelief)}
            </option>
          );
        })}
      </select>

      <label className="pl-ack" htmlFor="pl-ack">
        <input
          id="pl-ack"
          type="checkbox"
          checked={ack}
          disabled={pending}
          onChange={function (e) {
            setAck(e.target.checked);
          }}
        />
        <span>
          If I win this claim, I take on his salary from the waive onward, including the full week I get him. His
          signing bonus stays with {props.waivedBy}.
        </span>
      </label>

      {failure ? <div className="form-error">{failure}</div> : null}

      <p className="pl-sm">Claims are sealed until the run. You can withdraw or reorder this claim until then.</p>
      <div className="pl-btns">
        <button type="button" className="btn btn-secondary" onClick={closeOrBack} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn kit-cta" onClick={onSubmit} disabled={!ack || pending}>
          {pending ? 'Submitting…' : 'Submit claim'}
        </button>
      </div>
    </div>
  );
}
