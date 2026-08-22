'use client';

import { useEffect, useState } from 'react';
import { previewCut, executeCut } from './actions';
import { formatMoney } from '../../../lib/formatMoney';

export default function CutPlayerDialog(props) {
  const player = props.player;
  const onClose = props.onClose;
  const onDone = props.onDone;

  const [useJune1, setUseJune1] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  // Reload the settlement whenever the designation choice changes. The
  // database is the only thing that computes these numbers -- nothing here
  // recalculates them client-side, so the dialog can never disagree with
  // what the cut will actually do.
  //
  // Both actions return a result object rather than throwing. Next.js
  // masks thrown Server Action errors in production builds, replacing the
  // real message with a generic "an error occurred in the Server
  // Components render" string -- which is what an owner saw on the first
  // real cut ever attempted, in place of a perfectly clear explanation
  // that an open auction tier blocks cuts. See ./actions.js.
  //
  // .catch is still wired for genuine transport failures (offline, a
  // crashed action). Those are the only errors that can arrive as throws
  // now, and they are the ones where a generic message is honest.
  useEffect(
    function () {
      let cancelled = false;
      setLoading(true);
      setError('');

      previewCut(player.id, useJune1)
        .then(function (result) {
          if (cancelled) return;
          if (result && result.ok) {
            setPreview(result.data);
            setError('');
          } else {
            setPreview(null);
            setError((result && result.message) || 'The settlement could not be calculated.');
          }
          setLoading(false);
        })
        .catch(function (err) {
          if (cancelled) return;
          setError(
            'Could not reach the server to calculate the settlement. ' +
              'Check your connection and try again. (' +
              (err && err.message ? err.message : String(err)) +
              ')'
          );
          setPreview(null);
          setLoading(false);
        });

      return function () {
        cancelled = true;
      };
    },
    [player.id, useJune1]
  );

  useEffect(
    function () {
      function onKey(e) {
        if (e.key === 'Escape' && !working) onClose();
      }
      window.addEventListener('keydown', onKey);
      return function () {
        window.removeEventListener('keydown', onKey);
      };
    },
    [onClose, working]
  );

  function handleCut() {
    setWorking(true);
    setError('');
    executeCut(player.id, useJune1, note)
      .then(function (result) {
        if (result && result.ok) {
          setWorking(false);
          onDone();
          return;
        }
        // A refusal, not a crash. The contract is untouched -- cut_player()
        // is one transaction, so a refusal writes nothing. Drop out of the
        // confirm state so the owner has to deliberately re-arm after
        // reading why.
        setError((result && result.message) || 'The cut was refused and nothing was changed.');
        setWorking(false);
        setConfirming(false);
      })
      .catch(function (err) {
        setError(
          'Could not reach the server. The cut may not have been applied — ' +
            'reload this page and check before trying again. (' +
            (err && err.message ? err.message : String(err)) +
            ')'
        );
        setWorking(false);
        setConfirming(false);
      });
  }

  const windowOpen = preview && preview.june1_election_window_open;
  const remaining = preview ? preview.june1_designations_remaining : null;
  // compute_cut_charges() always returns detail, but guarding here means a
  // shape change upstream degrades the breakdown rather than blanking the
  // whole dialog and hiding the settlement figures with it.
  const d = preview && preview.detail ? preview.detail : null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={'Cut ' + player.name}
      >
        <h2 className="modal-title">Cut {player.name}</h2>
        <p className="empty-note">
          {player.position} &middot; {player.typeLabel} &middot; {player.span}
        </p>

        {loading && <p className="empty-note">Calculating settlement&hellip;</p>}

        {error && !loading && <p className="form-error">{error}</p>}

        {preview && !loading && (
          <div>
            {windowOpen && (
              <div className="modal-section">
                <label className="modal-check">
                  <input
                    type="checkbox"
                    checked={useJune1}
                    disabled={working || remaining <= 0}
                    onChange={function (e) {
                      setUseJune1(e.target.checked);
                      setConfirming(false);
                    }}
                  />
                  <span>Apply a June 1st designation to this cut</span>
                </label>
                <p className="empty-note">
                  {remaining > 0
                    ? 'You have ' +
                      remaining +
                      ' designation' +
                      (remaining === 1 ? '' : 's') +
                      ' remaining this league year. A designation splits the bonus'
                      + ' proration across two seasons. Guaranteed salary always'
                      + ' accelerates in full and can never be split.'
                    : 'You have no June 1st designations remaining this league year.'}
                </p>
              </div>
            )}

            {!windowOpen && preview.june1_split && (
              <p className="form-notice">
                Cuts made on or after June 1 are split across two seasons
                automatically. This does not use one of your designations.
              </p>
            )}

            <div className="modal-section">
              <table className="ledger">
                <tbody>
                  <tr>
                    <td data-label="Charge">Dead cap, {preview.season_year}</td>
                    <td className="num v-dead col-num" data-label="Amount">
                      {formatMoney(preview.dead_cap_current_year)}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Charge">
                      Dead cap, {preview.season_year + 1}
                    </td>
                    <td className="num v-dead col-num" data-label="Amount">
                      {formatMoney(preview.dead_cap_next_year)}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Charge">Dead cash, {preview.season_year}</td>
                    <td className="num v-cash col-num" data-label="Amount">
                      {formatMoney(preview.dead_cash_current_year)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {d && (
              <details className="modal-section">
                <summary className="modal-summary">
                  How this was calculated ({preview.weeks_charged} of 14 weeks
                  charged)
                </summary>
                <table className="ledger">
                  <tbody>
                    <tr>
                      <td data-label="Item">Signing bonus proration, this season</td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.current_season_proration_sb)}
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Item">Option bonus proration, this season</td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.current_season_proration_ob)}
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Item">
                        Future prorations
                        {preview.june1_split
                          ? ' (charged to ' + (preview.season_year + 1) + ')'
                          : ' (accelerated)'}
                      </td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.accelerated_future_prorations)}
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Item">Guaranteed salary, this season</td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.guaranteed_salary_current_season)}
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Item">
                        Future guaranteed salary (accelerated)
                      </td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.accelerated_future_guaranteed)}
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Item">Non-guaranteed salary already earned</td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.earned_non_guaranteed)}
                      </td>
                    </tr>
                    <tr>
                      <td data-label="Item">Roster bonus kept</td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.roster_bonus_kept)}
                      </td>
                    </tr>
                    {/* Two rows rather than one summed in JS. This was the
                        dialog's only piece of client-side arithmetic --
                        harmless, since a forgiven amount is a roll-up and
                        not a settlement figure, but it was the single
                        exception to the rule that every number here comes
                        straight off the engine payload. Splitting it keeps
                        the rule absolute and tells the owner more: money
                        forgiven this season reads differently from money
                        forgiven in seasons he will never reach. */}
                    <tr className="row-note">
                      <td data-label="Item">
                        Forgiven non-guaranteed salary, {preview.season_year}
                      </td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.forgiven_non_guaranteed_current)}
                      </td>
                    </tr>
                    <tr className="row-note">
                      <td data-label="Item">
                        Forgiven non-guaranteed salary, future seasons
                      </td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.forgiven_non_guaranteed_future)}
                      </td>
                    </tr>
                    <tr className="row-note">
                      <td data-label="Item">Forgiven roster bonuses</td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.forgiven_roster_bonus)}
                      </td>
                    </tr>
                    <tr className="row-note">
                      <td data-label="Item">Option bonuses never triggered</td>
                      <td className="num col-num" data-label="Amount">
                        {formatMoney(d.vaporized_option_bonuses)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </details>
            )}

            <div className="modal-section">
              <label htmlFor="cutnote">Note (optional, kept in the record)</label>
              <input
                id="cutnote"
                type="text"
                value={note}
                disabled={working}
                onChange={function (e) {
                  setNote(e.target.value);
                }}
              />
            </div>

            {confirming && (
              <p className="form-error">
                This cannot be undone. {player.name} loses his contract
                immediately and the dead money above is charged to your team.
                Press Confirm Cut again to proceed.
              </p>
            )}
          </div>
        )}

        <div className="page-actions">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={working}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={loading || working || !preview}
            onClick={function () {
              if (!confirming) {
                // Clear any refusal from a previous attempt as the owner
                // re-arms, so a stale message can never sit alongside a
                // fresh confirmation prompt and be read as applying to it.
                setError('');
                setConfirming(true);
                return;
              }
              handleCut();
            }}
          >
            {working
              ? 'Cutting\u2026'
              : confirming
              ? 'Confirm Cut'
              : 'Cut Player'}
          </button>
        </div>
      </div>
    </div>
  );
}
