'use client';

import { useEffect, useState } from 'react';
import { previewCut, executeCut } from './actions';

function formatMoney(n) {
  if (n === null || n === undefined) return '\u2014';
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.abs(num).toLocaleString();
}

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
  useEffect(
    function () {
      let cancelled = false;
      setLoading(true);
      setError('');

      previewCut(player.id, useJune1)
        .then(function (data) {
          if (cancelled) return;
          setPreview(data);
          setLoading(false);
        })
        .catch(function (err) {
          if (cancelled) return;
          setError(err.message || String(err));
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
      .then(function () {
        setWorking(false);
        onDone();
      })
      .catch(function (err) {
        setError(err.message || String(err));
        setWorking(false);
        setConfirming(false);
      });
  }

  const windowOpen = preview && preview.june1_election_window_open;
  const remaining = preview ? preview.june1_designations_remaining : null;
  const d = preview ? preview.detail : null;

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
                  <tr className="row-note">
                    <td data-label="Item">Forgiven non-guaranteed salary</td>
                    <td className="num col-num" data-label="Amount">
                      {formatMoney(
                        Number(d.forgiven_non_guaranteed_current) +
                          Number(d.forgiven_non_guaranteed_future)
                      )}
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
