'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  submitClaim,
  withdrawClaim,
  reorderClaims,
  withdrawPendingCut,
} from './actions';
import { formatDate, formatDateTime, formatShortDateTime } from '../../lib/formatDate';
import PlayerLink from '../../components/PlayerLink';
import { formatCost, formatRoom } from '../../lib/formatMoney';

/**
 * THE WAIVER WIRE -- phase 2D-2, September 18 2026 (ET).
 *
 * The run, the wire, the owner's own claims and the last executed run.
 *
 * WHAT CHANGED IN 2D-2, AND WHAT DID NOT. The screen was three .ledger tables
 * under three headings. It is now a lead card for the run, a card per player
 * on the wire, and a card per claim -- the approved Waivers artboard. The last
 * run stays a table, deliberately: it is a results grid with an outcome, an
 * awarding team and a list of claims per row, and a grid of results is what a
 * table is for.
 *
 * NOTHING HERE DECIDES A RULE, and that is unchanged from the first build.
 * Whether a claim is legal, whether the conditional cut is needed, whether the
 * owner has the cap or the cash or the roster spot -- every one of those is
 * submit_waiver_claim's question, answered on submit, and its refusal is drawn
 * verbatim on the card that asked.
 *
 * SEALED. While a run is scheduled the owner sees only their own claims (RLS on
 * waiver_claims), so the wire shows no count and no names of who else is in --
 * the same ruling as free agency's contested flag. The seal is stated on the
 * screen rather than left as an absence: a reader who cannot see other claims
 * should be told that is the rule, not left to conclude nobody has claimed.
 * Once a run has executed every claim on it is readable, and the last-run panel
 * names every team and what became of its claim.
 *
 * THE CLOCK IS A PROP, NOT A CALL. props.nowIso is the instant the server
 * rendered the page. It seeds the clock state, so the server's HTML and the
 * first client paint are identical and React has nothing to complain about;
 * a mount effect then replaces it with the browser's own clock and ticks it.
 * FreeAgencyBoard solves the same hydration problem by rendering a dash until
 * mount -- this is that pattern with the dash removed, because a countdown is
 * the largest figure on this screen and it should not pop in.
 */

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
  if (v === 'claimed') return 'kit-chip kit-chip-good';
  if (v === 'pending') return 'kit-chip kit-chip-live';
  return 'kit-chip';
}

function claimStatusClass(v) {
  if (v === 'awarded') return 'kit-chip kit-chip-good';
  if (v === 'pending') return 'kit-chip kit-chip-live';
  if (v === 'voided_cash' || v === 'voided_cap' || v === 'voided_roster') {
    return 'kit-chip kit-chip-bad';
  }
  return 'kit-chip';
}

function posTeam(row) {
  const parts = [];
  if (row.position) parts.push(row.position);
  if (row.nfl_team) parts.push(row.nfl_team);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

// DAYS, THEN HOURS, THEN MINUTES. The free agency countdown is hours and minutes
// because a window is 24 hours long; a waiver run can be six days out, and "137h"
// is not a readable answer to "when". Never seconds: the ticker runs every thirty,
// so a seconds figure would be wrong most of the time it was on screen.
function countdown(iso, nowMs) {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return 'due';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

// WHAT A CONDITIONAL CUT DOES TO THE CAP, IN WORDS.
//
// team_cut_previews returns a SIGNED figure: positive is room freed, negative is
// room the cut COSTS, because a contract whose dead cap exceeds its current charge
// is more expensive gone than kept. Twelve of Cash Over Cap's twenty-one active
// contracts were negative on September 18 2026, so this is the common case, not the
// edge one -- and the old wording printed the signed figure after the word "frees",
// which rendered as "frees -$178".
//
// The verb now follows the sign, and R-12 follows the verb: room rounds DOWN so a
// gain never reads high, a cost rounds UP so it never reads low. Neither figure is
// computed here. Both are the database's, printed.
function reliefText(v) {
  if (v === null || v === undefined) return '';
  const num = Number(v);
  if (!Number.isFinite(num)) return '';
  if (num < 0) return ' — costs ' + formatCost(-num);
  return ' — frees ' + formatRoom(num);
}

// The seal marker. An inline SVG rather than a padlock emoji: an emoji is a font
// question on every platform and renders at a different size and colour on each,
// and this one sits inside a sentence. currentColor, so it takes the notice's ink
// in both themes.
function LockMark() {
  return (
    <svg
      className="mk-lock"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path
        d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export default function WaiverBoard(props) {
  const wire = props.wire || [];
  const myClaims = props.myClaims || [];
  const roster = props.roster || [];
  const nextRun = props.nextRun || null;
  const lastRun = props.lastRun || null;
  const priority = props.priority || null;
  const signedIn = Boolean(props.signedIn);

  // Seeded from the server's instant, then replaced by the browser's own on mount
  // and ticked every thirty seconds. See the header note.
  const [now, setNow] = useState(function () {
    return props.nowIso ? new Date(props.nowIso).getTime() : Date.now();
  });
  useEffect(function () {
    setNow(Date.now());
    const t = setInterval(function () { setNow(Date.now()); }, 30000);
    return function () { clearInterval(t); };
  }, []);

  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);

  // The claim form: which placement it is open on, the cut chosen in it, and the
  // refusal (if any) the last submit on that placement came back with. One form open
  // at a time.
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
        // Drawn on the card that asked, verbatim. The database names the rule.
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

      {/* ---- THE RUN ----
          The lead card, and the only thing on this screen that is a countdown.
          Everything below it is a consequence of this instant. */}
      {!nextRun ? (
        <div className="mk-lead">
          <p className="mk-lead-label">NO RUN SCHEDULED</p>
          <p className="mk-lead-foot" style={{ marginTop: 8 }}>
            Nothing is on the wire, because nothing can be claimed until a run exists.
            The commissioner schedules them.
          </p>
        </div>
      ) : (
        <div className="mk-lead">
          <p className="mk-lead-label">
            {'NEXT RUN · WEEK ' + nextRun.week_number}
          </p>
          <p className="mk-lead-figure">{countdown(nextRun.runs_at, now)}</p>
          <p className="mk-lead-when">
            {(props.runWeekday ? props.runWeekday + ' · ' : '') +
              formatShortDateTime(nextRun.runs_at)}
          </p>
          <p className="mk-lead-foot">
            Claims lock at the run. Priority is lowest points for &mdash; snapshotted when
            the run fires, not now.
          </p>
        </div>
      )}

      {/* ---- THE WIRE ---- */}
      {nextRun && (
        <div className="edfl-hq-block">
          <div className="mk-head">
            <h2 className="section-heading">{'On the wire · ' + wire.length}</h2>
            {/* Only a signed-in owner has a seat in the order, and
                waiver_priority_order is granted to authenticated only, so a
                signed-out reader is never even asked the question. */}
            {priority && (
              <span className="kit-chip">
                {'YOUR PRIORITY ' + priority.rank + ' OF ' + priority.of}
              </span>
            )}
          </div>

          {wire.length === 0 && (
            <p className="empty-note">
              {'Nobody is on the wire for the week ' + nextRun.week_number + ' run.'}
            </p>
          )}

          {/* THE SEAL, STATED ONCE. The artboard puts this sentence inside each
              player's card, between the row and the button; with more than one
              player on the wire that is the same sentence repeated down the page,
              so it is drawn once under the heading instead and the reading order
              is kept -- the rule, then the players, then the act. */}
          {wire.length > 0 && signedIn && (
            <p className="kit-notice" style={{ marginBottom: 12 }}>
              <LockMark />
              <span>
                Claims are sealed until the run. You cannot see whether anyone else has
                claimed a player here, and nobody can see yours.
              </span>
            </p>
          )}

          {wire.length > 0 && !signedIn && (
            <p className="kit-notice" style={{ marginBottom: 12 }}>
              <LockMark />
              <span>
                The wire is public; claiming is not. <a href="/login?next=/waivers">Sign in</a>{' '}
                to claim, and to see where your team sits in the priority order.
              </span>
            </p>
          )}

          {wire.map(function (w) {
            const mine = claimByPlacement[w.placement_id];
            const isOpen = openFor === w.placement_id;
            return (
              <div className="mk-item" key={w.placement_id}>
                <div className="kit-row">
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      <PlayerLink playerId={w.player_id}>{w.player_name}</PlayerLink>
                      {w.position && <span className="kit-chip">{w.position}</span>}
                    </div>
                    <div className="kit-row-meta">
                      {(w.nfl_team ? w.nfl_team + ' · ' : '') +
                        'waived by ' + (w.waived_by || 'unknown') + ', ' +
                        formatDate(w.waived_at)}
                    </div>
                  </div>
                  <div className="kit-row-right">
                    <span className={outcomeClass('pending')}>PENDING</span>
                    {mine && (
                      <span className="kit-chip kit-chip-neon" style={{ marginLeft: 6 }}>
                        {'IN · #' + mine.team_rank}
                      </span>
                    )}
                  </div>
                </div>

                {signedIn && !isOpen && (
                  <button
                    type="button"
                    // NEON IS FOR THE NEW ACTION. A player already claimed gets
                    // the quiet bordered variant: the loud one belongs to the
                    // players an owner has not acted on yet, and five neon slabs
                    // down a page is five shouts and no priority.
                    className={'btn mk-cta ' + (mine ? 'btn-secondary' : 'kit-cta')}
                    onClick={function () { openClaim(w.placement_id); }}
                    disabled={pending}
                  >
                    {mine ? 'Change your claim' : 'Place a claim'}
                  </button>
                )}

                {signedIn && isOpen && (
                  <div className="mk-form">
                    <label htmlFor={'cut-' + w.placement_id} className="stat-label">
                      Cut this player if I win
                    </label>
                    <select
                      id={'cut-' + w.placement_id}
                      value={cutChoice}
                      disabled={pending}
                      onChange={function (e) { setCutChoice(e.target.value); }}
                    >
                      <option value="">Nobody</option>
                      {roster.map(function (r) {
                        return (
                          <option key={r.id} value={r.id}>
                            {r.name +
                              (r.position ? ' (' + r.position + ')' : '') +
                              reliefText(r.capRelief)}
                          </option>
                        );
                      })}
                    </select>
                    <div className="mk-form-actions">
                      <button
                        type="button"
                        className="btn kit-cta"
                        onClick={function () { onSubmitClaim(w); }}
                        disabled={pending}
                      >
                        {pending ? 'Submitting…' : mine ? 'Update claim' : 'Submit claim'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={closeClaim}
                        disabled={pending}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {rowFailure[w.placement_id] && (
                  <div className="form-error" style={{ margin: '10px 13px 13px' }}>
                    {rowFailure[w.placement_id]}
                  </div>
                )}
              </div>
            );
          })}

          {/* WHAT A CLAIM COSTS. Prose, not arithmetic: every figure in an owner's
              own answer -- his cap room, his cash, what a cut would free -- is the
              database's to compute, and submit_waiver_claim refuses in its own
              words if any of them falls short. The one figure on this screen, what
              a conditional cut frees, comes from team_cut_previews and is printed,
              not derived. */}
          {wire.length > 0 && signedIn && (
            <p className="kit-notice mk-notice-info" style={{ marginTop: 14 }}>
              <span>
                A winning claim is a signing: you take on the rest of his contract, in cash
                and against the cap, from the run onward. If your roster is full, name the
                player you would cut when you claim &mdash; he goes to the next run&apos;s
                wire, not straight to free agency.
              </span>
            </p>
          )}
        </div>
      )}

      {/* ---- MY CLAIMS ---- */}
      {signedIn && nextRun && (
        <div className="edfl-hq-block">
          <div className="mk-head">
            <h2 className="section-heading">Your claims this run</h2>
          </div>

          {myClaims.length === 0 ? (
            <p className="mk-empty">
              {'Nothing in for the week ' + nextRun.week_number + ' run. Claim someone above ' +
                'and he appears here, in the order they are tried.'}
            </p>
          ) : (
            <>
              <p className="empty-note" style={{ marginTop: 0 }}>
                Top to bottom is the order they are tried. Only you can see this list until
                the run executes.
              </p>
              <div className="kit-rows">
                {myClaims.map(function (c, i) {
                  return (
                    <div className="kit-row mk-actionrow" key={c.id}>
                      <span className="mk-rank">{c.team_rank}</span>
                      <div className="kit-row-main">
                        <div className="kit-row-title">
                          <PlayerLink playerId={c.player_id}>{c.player_name}</PlayerLink>
                          {c.position && <span className="kit-chip">{c.position}</span>}
                        </div>
                        <div className="kit-row-meta">
                          {c.cut_player_name
                            ? 'Cut ' + c.cut_player_name + ' if this one wins'
                            : 'No conditional cut'}
                        </div>
                      </div>
                      <div className="mk-claim-actions">
                        <span className="mk-nudge">
                          <button
                            type="button"
                            className="btn btn-quiet"
                            aria-label={'Move ' + c.player_name + ' up'}
                            onClick={function () { onMove(i, -1); }}
                            disabled={pending || i === 0}
                          >
                            &uarr;
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet"
                            aria-label={'Move ' + c.player_name + ' down'}
                            onClick={function () { onMove(i, 1); }}
                            disabled={pending || i === myClaims.length - 1}
                          >
                            &darr;
                          </button>
                        </span>
                        <button
                          type="button"
                          className="btn btn-quiet"
                          onClick={function () { onWithdrawClaim(c); }}
                          disabled={pending}
                        >
                          Withdraw
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- THE LAST RUN ----
          Still a table. Six columns, one of them a list of every team's claim and
          what became of it: a results grid, which is the one shape .ledger is for.
          The status words are kit chips now, so they read like every other marker
          on the redesigned screens. */}
      <div className="edfl-hq-block">
        <div className="mk-head">
          <h2 className="section-heading">Last run</h2>
        </div>
        {!lastRun && <p className="mk-empty">No waiver run has executed yet.</p>}
        {lastRun && (
          <>
            <p className="empty-note" style={{ marginTop: 0 }}>
              {'Week ' + lastRun.week_number + ' run, executed ' +
                formatDateTime(lastRun.executed_at) + '.'}
            </p>
            {lastRun.claimsError && (
              <div className="form-error">
                {'The claims on this run could not be read, so the Claims column below is not answering: ' +
                  lastRun.claimsError}
              </div>
            )}
            {lastRun.placements.length === 0 && (
              <p className="mk-empty">Nobody was on the wire for that run.</p>
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
    </div>
  );
}

// DESIGNATED CUTS -- the end-of-week cuts an owner has designated and that have not yet
// fired. Mounted on the owner's OWN team page, under the roster, and only when there is
// at least one. Lives in this file because it is the waiver wire's client-side sibling:
// a designated cut is what puts a player on next week's wire, and Withdraw here calls
// the same actions module.
//
// THE EXPORT NAME AND THE PROP SHAPE ARE A CONTRACT. app/team/[teamId]/page.js imports
// { DesignatedCuts } from here and passes cuts=[{ id, playerId, playerName, firesAt }].
// Neither changed in 2D-2; only the markup did, from a .ledger to the kit's rows, so
// the block stops looking like the screen Team HQ replaced.
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
    <section className="edfl-hq-block">
      <div className="mk-head">
        <h2 className="section-heading">Designated cuts</h2>
      </div>
      <p className="empty-note" style={{ marginTop: 0 }}>
        These players stay on your roster and score for you until the cut fires. Withdraw
        one to keep him.
      </p>
      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}
      <div className="kit-rows">
        {cuts.map(function (c) {
          return (
            <div className="kit-row mk-actionrow" key={c.id}>
              <div className="kit-row-main">
                <div className="kit-row-title">
                  <PlayerLink playerId={c.playerId}>{c.playerName}</PlayerLink>
                </div>
                <div className="kit-row-meta">
                  {'Fires ' + formatDateTime(c.firesAt)}
                </div>
              </div>
              <div className="mk-claim-actions">
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={function () { onWithdraw(c); }}
                  disabled={pending}
                >
                  Withdraw
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
