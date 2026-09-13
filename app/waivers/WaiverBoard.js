'use client';

import { useState, useTransition } from 'react';
import {
  submitClaim,
  withdrawClaim,
  reorderClaims,
  withdrawPendingCut,
} from './actions';
import { formatDate, formatDateTime } from '../../lib/formatDate';
import PlayerLink from '../../components/PlayerLink';

// The wire, the owner's own claims, the per-row claim form, and the last executed run.
//
// NOTHING HERE DECIDES A RULE. Whether a claim is legal, whether the conditional cut is
// needed, whether the owner has the cap or the cash or the roster spot -- every one of
// those is submit_waiver_claim's question, answered on submit, and its refusal is drawn
// verbatim beside the row that asked. The board only carries choices to the database.
//
// SEALED. While a run is scheduled the owner sees only their own claims (RLS on
// waiver_claims), so the wire shows no count and no names of who else is in -- the same
// ruling as free agency's contested flag. Once a run has executed every claim on it is
// readable, and the last-run panel names every team and what became of its claim.

// Two vocabularies, both owned by the database. An unrecognised value falls through to
// the raw string rather than being guessed at.
const OUTCOME_LABELS = {
  pending: 'Pending',
  claimed: 'Claimed',
  cleared: 'Cleared',
  withdrawn: 'Withdrawn',
};

const CLAIM_STATUS_LABELS = {
  pending: 'Pending',
  awarded: 'Awarded',
  passed_over: 'Passed over',
  voided_cash: 'Voided — cash',
  voided_cap: 'Voided — cap',
  voided_roster: 'Voided — roster',
  withdrawn: 'Withdrawn',
};

function outcomeLabel(v) {
  return OUTCOME_LABELS[v] || v;
}

function claimStatusLabel(v) {
  return CLAIM_STATUS_LABELS[v] || v;
}

function outcomeClass(v) {
  if (v === 'claimed') return 'status status-good';
  if (v === 'pending') return 'status status-live';
  return 'status status-off';
}

function claimStatusClass(v) {
  if (v === 'awarded') return 'status status-good';
  if (v === 'pending') return 'status status-live';
  if (v === 'voided_cash' || v === 'voided_cap' || v === 'voided_roster') return 'status status-bad';
  return 'status status-off';
}

function posTeam(row) {
  const parts = [];
  if (row.position) parts.push(row.position);
  if (row.nfl_team) parts.push(row.nfl_team);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export default function WaiverBoard(props) {
  const wire = props.wire || [];
  const myClaims = props.myClaims || [];
  const roster = props.roster || [];
  const nextRun = props.nextRun || null;
  const lastRun = props.lastRun || null;
  const signedIn = Boolean(props.signedIn);

  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);

  // The inline claim form: which placement it is open on, the cut chosen in it, and the
  // refusal (if any) the last submit on that placement came back with. One form open at
  // a time.
  const [openFor, setOpenFor] = useState(null);
  const [cutChoice, setCutChoice] = useState('');
  const [rowFailure, setRowFailure] = useState({});

  const claimByPlacement = {};
  myClaims.forEach(function (c) { claimByPlacement[c.placement_id] = c; });

  function clearMessages() { setNotice(null); setFailure(null); }

  function openClaim(placementId) {
    clearMessages();
    const existing = claimByPlacement[placementId];
    setCutChoice(existing && existing.cut_contract_id ? existing.cut_contract_id : '');
    setRowFailure({});
    setOpenFor(placementId);
  }

  function closeClaim() {
    setOpenFor(null);
    setCutChoice('');
  }

  function onSubmitClaim(row) {
    clearMessages();
    const placementId = row.placement_id;
    startTransition(async function () {
      const res = await submitClaim(placementId, cutChoice || null);
      if (!res.ok) {
        // Drawn beside the row that asked, verbatim. The database names the rule.
        const next = {};
        next[placementId] = res.message;
        setRowFailure(next);
        return;
      }
      setRowFailure({});
      closeClaim();
      setNotice('Claim on ' + row.player_name + ' is in. Order it below if you have more than one.');
    });
  }

  function onWithdrawClaim(c) {
    clearMessages();
    startTransition(async function () {
      const res = await withdrawClaim(c.id);
      if (!res.ok) { setFailure(res.message); return; }
      setNotice('Claim on ' + c.player_name + ' withdrawn.');
    });
  }

  // Swap one claim with its neighbour and send the WHOLE ordered list -- the database
  // renumbers team_rank 1..n from the array, so a partial list would drop the rest.
  function onMove(index, delta) {
    if (!nextRun) return;
    const target = index + delta;
    if (target < 0 || target >= myClaims.length) return;
    clearMessages();
    const ids = myClaims.map(function (c) { return c.id; });
    const held = ids[index];
    ids[index] = ids[target];
    ids[target] = held;
    startTransition(async function () {
      const res = await reorderClaims(nextRun.id, ids);
      if (!res.ok) { setFailure(res.message); return; }
    });
  }

  return (
    <div>
      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

      <h2 className="section-heading">The wire</h2>
      {!nextRun && (
        <p className="empty-note">No waiver run is scheduled, so nothing is on the wire.</p>
      )}
      {nextRun && wire.length === 0 && (
        <p className="empty-note">Nobody is on the wire for the week {nextRun.week_number} run.</p>
      )}

      {/*
        A .ledger, NOT a .grid-table. Player names, team names, a date and a button per
        row -- rows a human reads, not a grid of figures. Every cell carries data-label
        because .ledger flips to cards at 640px and reads the label from that attribute.
      */}
      {nextRun && wire.length > 0 && (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos &middot; NFL</th>
                <th>Waived by</th>
                <th>Waived</th>
                {signedIn && <th>Your claim</th>}
                {signedIn && <th className="col-status"></th>}
              </tr>
            </thead>
            <tbody>
              {wire.map(function (w) {
                const mine = claimByPlacement[w.placement_id];
                const isOpen = openFor === w.placement_id;
                const colSpan = signedIn ? 6 : 4;
                return (
                  <WireRow
                    key={w.placement_id}
                    row={w}
                    mine={mine}
                    signedIn={signedIn}
                    isOpen={isOpen}
                    colSpan={colSpan}
                    pending={pending}
                    roster={roster}
                    cutChoice={cutChoice}
                    rowFailure={rowFailure[w.placement_id] || null}
                    onOpen={function () { openClaim(w.placement_id); }}
                    onClose={closeClaim}
                    onCutChange={setCutChoice}
                    onSubmit={function () { onSubmitClaim(w); }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {signedIn && nextRun && (
        <>
          <h2 className="section-heading" style={{ marginTop: 32 }}>My claims</h2>
          {myClaims.length === 0 && (
            <p className="empty-note">
              You have no claims in for the week {nextRun.week_number} run.
            </p>
          )}
          {myClaims.length > 0 && (
            <>
              <p className="empty-note">
                Top to bottom is the order they are tried. Only you can see this list until
                the run executes.
              </p>
              <div className="table-scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th className="col-num">#</th>
                      <th>Player</th>
                      <th>Cut if I win</th>
                      <th className="col-status"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {myClaims.map(function (c, i) {
                      return (
                        <tr key={c.id}>
                          <td className="col-num" data-label="#">{c.team_rank}</td>
                          <td data-label="Player">
                            <PlayerLink playerId={c.player_id}>{c.player_name}</PlayerLink>
                            {c.position ? ' · ' + c.position : ''}
                          </td>
                          <td data-label="Cut if I win">
                            {c.cut_player_name ? c.cut_player_name : '—'}
                          </td>
                          {/*
                            Stacked, not side by side -- a cell's natural width becomes the
                            widest single button instead of the sum of them.
                          */}
                          <td className="col-status" data-label="">
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                              <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-quiet"
                                  aria-label={'Move ' + c.player_name + ' up'}
                                  onClick={function () { onMove(i, -1); }}
                                  disabled={pending || i === 0}>
                                  &uarr;
                                </button>
                                <button type="button" className="btn btn-quiet"
                                  aria-label={'Move ' + c.player_name + ' down'}
                                  onClick={function () { onMove(i, 1); }}
                                  disabled={pending || i === myClaims.length - 1}>
                                  &darr;
                                </button>
                              </span>
                              <button type="button" className="btn btn-quiet"
                                onClick={function () { onWithdrawClaim(c); }} disabled={pending}>
                                Withdraw
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <h2 className="section-heading" style={{ marginTop: 32 }}>Last run</h2>
      {!lastRun && <p className="empty-note">No waiver run has executed yet.</p>}
      {lastRun && (
        <>
          <p className="empty-note">
            {'Week ' + lastRun.week_number + ' run, executed ' + formatDateTime(lastRun.executed_at) + '.'}
          </p>
          {lastRun.claimsError && (
            <div className="form-error">
              {'The claims on this run could not be read, so the Claims column below is not answering: ' +
                lastRun.claimsError}
            </div>
          )}
          {lastRun.placements.length === 0 && (
            <p className="empty-note">Nobody was on the wire for that run.</p>
          )}
          {lastRun.placements.length > 0 && (
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pos &middot; NFL</th>
                    <th>Waived by</th>
                    <th>Outcome</th>
                    <th>Awarded to</th>
                    <th>Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {lastRun.placements.map(function (p) {
                    return (
                      <tr key={p.placement_id}>
                        <td data-label="Player">
                          <PlayerLink playerId={p.player_id}>{p.player_name}</PlayerLink>
                        </td>
                        <td data-label="Pos · NFL">{posTeam(p)}</td>
                        <td data-label="Waived by">{p.waived_by || '—'}</td>
                        <td data-label="Outcome">
                          <span className={outcomeClass(p.outcome)}>{outcomeLabel(p.outcome)}</span>
                        </td>
                        <td data-label="Awarded to">{p.awarded_to || '—'}</td>
                        {/*
                          One line per claim, stacked. Every child of this cell is a flex
                          item; bare siblings would lay out side by side.
                        */}
                        <td data-label="Claims">
                          {p.claims.length === 0 && !lastRun.claimsError && (
                            <span className="row-note" style={{ marginTop: 0 }}>No claims</span>
                          )}
                          {p.claims.length > 0 && (
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {p.claims.map(function (c) {
                                return (
                                  <span key={c.id}>
                                    {c.team_name || 'Unknown'}
                                    {' — '}
                                    <span className={claimStatusClass(c.status)}>
                                      {claimStatusLabel(c.status)}
                                    </span>
                                    {c.cut_player_name
                                      ? <span className="row-note" style={{ display: 'block', marginTop: 2 }}>
                                          {'cut if won: ' + c.cut_player_name}
                                        </span>
                                      : null}
                                  </span>
                                );
                              })}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// One wire row, plus the inline claim form beneath it when it is open. The form has one
// optional control: which of the owner's own active-roster players to cut if the claim
// wins. That is a choice handed to submit_waiver_claim, not a rule applied here.
function WireRow(props) {
  const w = props.row;
  const mine = props.mine;
  return (
    <>
      <tr>
        <td data-label="Player">
          <PlayerLink playerId={w.player_id}>{w.player_name}</PlayerLink>
        </td>
        <td data-label="Pos · NFL">{posTeam(w)}</td>
        <td data-label="Waived by">{w.waived_by || '—'}</td>
        <td data-label="Waived">{formatDate(w.waived_at)}</td>
        {props.signedIn && (
          <td data-label="Your claim">
            {mine
              ? 'In (#' + mine.team_rank + ')' +
                (mine.cut_player_name ? ', cut ' + mine.cut_player_name : '')
              : '—'}
          </td>
        )}
        {props.signedIn && (
          <td className="col-status" data-label="">
            {!props.isOpen && (
              <button type="button" className={mine ? 'btn btn-quiet' : 'btn btn-secondary'}
                onClick={props.onOpen} disabled={props.pending}>
                {mine ? 'Change cut' : 'Claim'}
              </button>
            )}
          </td>
        )}
      </tr>
      {props.signedIn && props.isOpen && (
        <tr>
          <td colSpan={props.colSpan} data-label="">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <label htmlFor={'cut-' + w.placement_id} className="stat-label" style={{ margin: 0 }}>
                Cut this player if I win
              </label>
              <span className="control-row" style={{ margin: 0 }}>
                <select
                  id={'cut-' + w.placement_id}
                  value={props.cutChoice}
                  disabled={props.pending}
                  onChange={function (e) { props.onCutChange(e.target.value); }}
                >
                  <option value="">Nobody</option>
                  {props.roster.map(function (r) {
                    return (
                      <option key={r.id} value={r.id}>
                        {r.name + (r.position ? ' (' + r.position + ')' : '')}
                      </option>
                    );
                  })}
                </select>
              </span>
              <button type="button" className="btn" onClick={props.onSubmit} disabled={props.pending}>
                {props.pending ? 'Submitting…' : mine ? 'Update claim' : 'Submit claim'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={props.onClose} disabled={props.pending}>
                Cancel
              </button>
            </div>
            {props.rowFailure && (
              <div className="form-error" style={{ marginTop: 10 }}>{props.rowFailure}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// DESIGNATED CUTS -- the end-of-week cuts an owner has designated and that have not yet
// fired. Mounted on the owner's OWN team page, under the roster, and only when there is
// at least one. Lives in this file because it is the waiver wire's client-side sibling:
// a designated cut is what puts a player on next week's wire, and Withdraw here calls
// the same actions module.
//
// props.cuts: [{ id, playerId, playerName, firesAt }]
export function DesignatedCuts(props) {
  const cuts = props.cuts || [];
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  function onWithdraw(cut) {
    setFailure(null);
    setNotice(null);
    startTransition(async function () {
      const res = await withdrawPendingCut(cut.id);
      if (!res.ok) { setFailure(res.message); return; }
      setNotice('The cut on ' + cut.playerName + ' is withdrawn. He stays on your roster.');
    });
  }

  if (cuts.length === 0) return null;

  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="section-heading">Designated cuts</h2>
      <p className="empty-note">
        These players stay on your roster and score for you until the cut fires. Withdraw
        one to keep him.
      </p>
      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}
      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>Player</th>
              <th>Fires</th>
              <th className="col-status"></th>
            </tr>
          </thead>
          <tbody>
            {cuts.map(function (c) {
              return (
                <tr key={c.id}>
                  <td data-label="Player">
                    <PlayerLink playerId={c.playerId}>{c.playerName}</PlayerLink>
                  </td>
                  <td data-label="Fires">{formatDateTime(c.firesAt)}</td>
                  <td className="col-status" data-label="">
                    <button type="button" className="btn btn-quiet"
                      onClick={function () { onWithdraw(c); }} disabled={pending}>
                      Withdraw
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
