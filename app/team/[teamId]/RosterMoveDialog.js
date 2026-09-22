'use client';

import { useEffect, useState } from 'react';
import PlayerLink from '../../../components/PlayerLink';
import PracticeSquadWarning from '../../../components/PracticeSquadWarning';
import { supabase } from '../../../lib/supabaseClient';
import { setRosterStatus, setTaxiHold } from './actions';

// NOTHING IN THIS FILE DECIDES WHETHER A MOVE IS LEGAL.
//
// The squad limits live in set_roster_status() and practice-squad eligibility
// lives in the check_taxi_eligibility trigger, which is anchored to the
// player's draft year. Both refuse with a sentence naming the rule, and those
// sentences are rendered verbatim. A client pre-check would be a second copy
// of a rule the database already owns -- the same reason CutPlayerDialog
// computes no money and re-queries the engine instead.
//
// THE HOLD (rule 3.3(d)(i), September 21 2026). On a practice squad -> active
// move the dialog offers ONE checkbox: keep him up through the Tuesday return.
// It is a second call, taxi_hold_set(), made only after set_roster_status()
// has succeeded, and its refusal is shown beside the move's result rather than
// undoing the move -- the promotion the owner asked for is real either way, and
// the hold can be set from the Roster tab afterwards. The checkbox is offered
// only where the database will accept it (the view's ps_rule_subject is true
// and he is not locked); the function re-tests all of that itself.
//
// So every destination is offered except the one the player is already on, and
// the database says no when the answer is no. An owner learning "Rule 3.3(b):
// at most 3 practice squad slots may hold players who are not on a rookie
// contract" from a refusal is better served than by a greyed-out button with
// no explanation.

const STATUS_LABELS = {
  active: 'Active roster',
  taxi: 'Practice squad',
  ir: 'Injured reserve',
};

const STATUS_BLURB = {
  active: 'Available to start. Counts against the 25-man limit once the season begins.',
  taxi: 'Rule 3.3. Seven slots, of which at most three may hold players who are not on a rookie contract. Eligibility depends on draft year.',
  ir: 'Rule 3.4. Ten slots.',
};

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

export default function RosterMoveDialog(props) {
  const player = props.player;
  const onClose = props.onClose;
  const onDone = props.onDone;

  const current = player.rosterStatus || 'active';
  const [target, setTarget] = useState(null);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [taxiStatus, setTaxiStatus] = useState(null);
  const [holdWanted, setHoldWanted] = useState(false);
  const [holdResult, setHoldResult] = useState(null);

  useEffect(
    function () {
      function onKey(e) {
        if (e.key === 'Escape' && !working) onClose();
      }
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('keydown', onKey);
      };
    },
    [onClose, working]
  );

  // Rule 3.3(i), read when the dialog opens so the owner sees it BEFORE he
  // picks a destination rather than after the move is made. One row, keyed
  // on this contract. A failed read renders nothing: the warning is an
  // advisory and the trigger still refuses an illegal move with its own
  // sentence, so a silent miss costs the owner information, never a rule.
  useEffect(
    function () {
      let live = true;
      supabase
        .from('taxi_eligibility_status')
        .select(
          'contract_id, weeks_used, weeks_max, weeks_left, eligibility_spent, warning, locked, last_demotion_available,' +
            ' held, hold_note, poach_exempt, ps_rule_subject'
        )
        .eq('contract_id', player.id)
        .maybeSingle()
        .then(function (r) {
          if (live && r && r.data) setTaxiStatus(r.data);
        });
      return function () {
        live = false;
      };
    },
    [player.id]
  );

  function handleMove() {
    if (!target) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setWorking(true);
    setError('');
    setRosterStatus(player.id, target, note)
      .then(function (r) {
        if (!r.ok) {
          setError(r.message);
          // Drop the confirmation so a second press has to be deliberate
          // rather than landing on a prompt raised for the previous attempt.
          setConfirming(false);
          return;
        }
        setResult(r.data);
        // The promotion is made. If the owner asked for the hold, make it now;
        // its refusal is reported, never used to undo the move above.
        if (target === 'active' && current === 'taxi' && holdWanted) {
          return setTaxiHold(player.id, true, note).then(function (h) {
            setHoldResult(h.ok ? { ok: true, text: h.data.player + ' is held on the active roster; the Tuesday return will skip him.' } : { ok: false, text: h.message });
          });
        }
        return undefined;
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
        setConfirming(false);
      })
      .finally(function () {
        setWorking(false);
      });
  }

  const destinations = ['active', 'taxi', 'ir'].filter(function (s) {
    return s !== current;
  });

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true">
        <h2 className="modal-title">
          Move <PlayerLink playerId={player.playerId}>{player.name}</PlayerLink>
        </h2>

        {result ? (
          <>
            <div className="modal-section">
              <p>
                <strong>
                  <PlayerLink playerId={player.playerId}>{result.player}</PlayerLink>
                </strong>{' '}
                moved from {statusLabel(result.from)} to {statusLabel(result.to)}.
              </p>
            </div>

            {/*
              Both figures come straight from the return value. Nothing here is
              counted client-side -- the function counts the roster as it stood
              after the move and hands back the totals.
            */}
            <div className="modal-section">
              <p>
                Practice squad: <strong>{result.taxi_used}</strong> of{' '}
                <strong>{result.taxi_limit}</strong> slots used.
              </p>
              <p>
                Active roster: <strong>{result.active_after}</strong> players.
              </p>
              {result.active_limit_enforced ? (
                <p className="empty-note">
                  The active roster limit is in force now that the season has started, so a
                  move onto the active roster can be refused under rule 3.6.
                </p>
              ) : (
                <p className="empty-note">
                  The active roster limit is <strong>not being enforced yet</strong>. Rule
                  3.6 applies in-season only, and it begins at the In-Season boundary on the{' '}
                  <a href="/calendar">League Calendar</a>. Until then the active roster has
                  no size cap, so it can hold more players now than it will be allowed to
                  carry later.
                </p>
              )}
            </div>

            {holdResult && (
              <div className={holdResult.ok ? 'form-notice' : 'form-error'}>
                {holdResult.ok
                  ? holdResult.text
                  : 'The move was made, but the hold was refused: ' +
                    holdResult.text +
                    ' You can set it from the Roster tab.'}
              </div>
            )}

            <div className="page-actions">
              <button type="button" className="btn" onClick={onDone}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-section">
              <p className="empty-note">
                Currently on the <strong>{statusLabel(current)}</strong>.
              </p>
            </div>

            <PracticeSquadWarning status={taxiStatus} />

            <div className="modal-section">
              {destinations.map(function (s) {
                return (
                  <label className="modal-check" key={s}>
                    <input
                      type="radio"
                      name="roster-target"
                      value={s}
                      checked={target === s}
                      disabled={working}
                      onChange={function () {
                        setTarget(s);
                        setConfirming(false);
                        setError('');
                      }}
                    />
                    <span>
                      <strong>{statusLabel(s)}</strong>
                      <span className="empty-note" style={{ display: 'block' }}>
                        {STATUS_BLURB[s]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {target === 'active' &&
              current === 'taxi' &&
              taxiStatus &&
              taxiStatus.ps_rule_subject === true &&
              !taxiStatus.locked && (
                <div className="modal-section">
                  <label className="modal-check">
                    <input
                      type="checkbox"
                      checked={holdWanted}
                      disabled={working}
                      onChange={function (e) {
                        setHoldWanted(e.target.checked);
                      }}
                    />
                    <span>
                      <strong>Keep him on the active roster until I move him down</strong>
                      <span className="empty-note" style={{ display: 'block' }}>
                        Rule 3.3(d). Without this he returns to the practice squad automatically at
                        Tuesday 00:00. With it he stays up until you move him. Either way his weeks
                        on the active roster count under rule 3.3(i): the fourth counted week locks
                        him there for the season.
                      </span>
                    </span>
                  </label>
                </div>
              )}

            <div className="modal-section">
              <label>
                Note (optional)
                <input
                  type="text"
                  value={note}
                  onChange={function (e) {
                    setNote(e.target.value);
                  }}
                  disabled={working}
                />
              </label>
            </div>

            {error && <div className="form-error">{error}</div>}

            {confirming && target && (
              <p className="empty-note">
                Move {player.name} to the {statusLabel(target).toLowerCase()}? Press again to
                confirm.
              </p>
            )}

            <div className="page-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={onClose}
                disabled={working}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleMove}
                disabled={working || !target}
              >
                {working ? 'Moving…' : confirming ? 'Confirm move' : 'Move'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
