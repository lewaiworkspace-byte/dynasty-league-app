'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatShortDateTime } from '../../../lib/formatDate';
import {
  pullAndCompare,
  rePullAndCompare,
  resolveOne,
  resolveType,
  previewApply,
  applySync,
  abandonSync,
} from './actions';

// THE COMMISSIONER'S SCREEN FOR A SYNC RUN.
//
// THREE ACTS, NAMED DIFFERENTLY ON PURPOSE. Pulling and comparing is safe and
// writes nothing. Applying changes league state. They are not the same button
// and must never become one.
//
// NO RULE IS MIRRORED HERE. Which conflicts block, what may be written, and
// whether an approval is still valid are all decided by the database. This
// screen offers the choices and prints the refusal. A client-side pre-check
// would be a second copy of a rule the database owns, and the database would
// win every time they disagreed -- the same reasoning AdminFifthYearOptionPanel
// records for the 96-hour window.
//
// THE CHOICE LABEL BECOMES THE NOTE. Every resolution is recorded with the
// wording of the button that was pressed, so the Commissioner Action Log reads
// as a sentence rather than a code. There is no free-text box because a note
// nobody fills in is worse than one that always says what was decided.
//
// NO MONEY IS SHOWN. Nothing on this page is a cap or cash figure, so there is
// no formatter here by design -- not an oversight. A taxi decision has a cap
// consequence, but the app computes it when the roster move is actually made,
// not here.
//
// A REFUSAL IS PRINTED WHERE THE BUTTON WAS PRESSED. September 11 2026: an
// apply was refused twice with EDFS2 and the commissioner saw nothing happen.
// Two things had to be true at once for that. onApply() cleared the preview
// before calling the server, so the refusal collapsed the box it came from;
// and the only place a message rendered was the banner at the top of a page
// that is several screens long by the time there are conflicts to decide. So:
// the apply refusal now renders inside the Finish box and the preview survives
// it, and the top banner scrolls itself into view for everything else. A
// message nobody can see is the same as no message.

const TYPE_GUIDE = {
  team_mismatch: {
    title: 'On different teams',
    blurb:
      'The app and Sleeper disagree about who owns this player. Almost always a trade ' +
      'that was executed in the app and never mirrored into Sleeper. This is the one ' +
      'that changes who scores on Sunday.',
    choices: [
      { label: 'App is right — I will fix Sleeper', value: 'app_wins' },
      { label: 'Needs a transaction in the app', value: 'worklist' },
    ],
  },
  orphan: {
    title: 'On a Sleeper roster with no contract',
    blurb:
      'Sleeper has this player rostered but the app has no active contract for him. ' +
      'Almost always a cut that was never mirrored. Remove him in Sleeper.',
    choices: [
      { label: 'App is right — remove him in Sleeper', value: 'app_wins' },
      { label: 'He needs a contract in the app', value: 'worklist' },
    ],
  },
  ghost: {
    title: 'Under contract but on no Sleeper roster',
    blurb:
      'The app has an active contract for this player and Sleeper does not have him ' +
      'anywhere. Add him in Sleeper.',
    choices: [
      { label: 'App is right — add him in Sleeper', value: 'app_wins' },
      { label: 'The contract should end', value: 'worklist' },
    ],
  },
  unknown_player: {
    title: 'Sleeper player not in the app at all',
    blurb:
      'A Sleeper roster holds a player id with no row in the app. Nothing can be ' +
      'reasoned about him until that is fixed.',
    choices: [{ label: 'Note it and look into it', value: 'worklist' }],
  },
  status_taxi: {
    title: 'Taxi squad disagreement',
    blurb:
      'One system has this player on the taxi squad and the other has him active. ' +
      'Taxi carries cap treatment under 3.3(c), so the sync will not change it for ' +
      'you — decide which is right and make the move on the losing side yourself.',
    choices: [
      { label: 'App is right — fix Sleeper', value: 'app_wins' },
      { label: 'Sleeper is right — I will set it in the app', value: 'sleeper_wins' },
      { label: 'Decide this one later', value: 'worklist' },
    ],
  },
  status_ir: {
    title: 'Injured reserve disagreement',
    blurb:
      'One system has this player on IR and the other does not. IR eligibility is ' +
      'Sleeper’s call under 3.4(b), but the app holds the roster status.',
    choices: [
      { label: 'App is right — fix Sleeper', value: 'app_wins' },
      { label: 'Sleeper is right — I will set it in the app', value: 'sleeper_wins' },
      { label: 'Decide this one later', value: 'worklist' },
    ],
  },
  team_mapping: {
    title: 'Sleeper owner and team name fields',
    blurb:
      'These are the only fields this sync actually writes: the Sleeper owner id, the ' +
      'owner’s Sleeper handle, and Sleeper’s own team name. Your team names in the ' +
      'app are never touched.',
    choices: [
      { label: 'Update from Sleeper', value: 'sleeper_wins' },
      { label: 'Leave the app as it is', value: 'acknowledged' },
    ],
  },
  team_name_divergence: {
    title: 'Team name differs from Sleeper',
    blurb:
      'Reported so you know, never written. The app’s team name is the real one and ' +
      'is used everywhere; Sleeper’s copy is often just differently capitalised.',
    choices: [{ label: 'Keep the app’s name', value: 'app_wins' }],
  },
};

function guideFor(type) {
  return (
    TYPE_GUIDE[type] || {
      title: type,
      blurb: '',
      choices: [
        { label: 'App is right', value: 'app_wins' },
        { label: 'Sleeper is right', value: 'sleeper_wins' },
        { label: 'Handle separately', value: 'worklist' },
      ],
    }
  );
}

function groupByType(conflicts) {
  const out = [];
  const index = {};
  for (let i = 0; i < conflicts.length; i++) {
    const c = conflicts[i];
    if (!index[c.conflict_type]) {
      index[c.conflict_type] = { type: c.conflict_type, severity: c.severity, rows: [] };
      out.push(index[c.conflict_type]);
    }
    if (c.severity === 'blocking') index[c.conflict_type].severity = 'blocking';
    index[c.conflict_type].rows.push(c);
  }
  out.sort(function (a, b) {
    if (a.severity !== b.severity) return a.severity === 'blocking' ? -1 : 1;
    return a.type.localeCompare(b.type);
  });
  return out;
}

export default function SleeperSyncPanel({ run, conflicts, armed }) {
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const [applyError, setApplyError] = useState('');
  const [applyHint, setApplyHint] = useState('');
  const [applyCode, setApplyCode] = useState('');
  const [repulling, setRepulling] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [reason, setReason] = useState('');
  const [working, startTransition] = useTransition();
  const router = useRouter();
  const bannerRef = useRef(null);

  // The banner sits above every conflict group, so on a long run it is off
  // screen by the time anything is pressed. Bring it to the reader rather than
  // hoping the reader goes looking for it.
  useEffect(
    function () {
      if (error && bannerRef.current && bannerRef.current.scrollIntoView) {
        bannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [error]
  );

  function clearApplyMessages() {
    setApplyError('');
    setApplyHint('');
    setApplyCode('');
    setRepulling(false);
  }

  function clearMessages() {
    setError('');
    setHint('');
    setNotice('');
  }

  function run_(fn, onOk) {
    clearMessages();
    startTransition(async function () {
      let res;
      try {
        res = await fn();
      } catch (e) {
        setError('The request did not reach the server. Nothing was changed.');
        return;
      }
      if (!res || !res.ok) {
        setError((res && res.message) || 'Something went wrong.');
        if (res && res.hint) setHint(res.hint);
        return;
      }
      if (onOk) onOk(res);
      router.refresh();
    });
  }

  function onPull() {
    setPreview(null);
    clearApplyMessages();
    run_(pullAndCompare, function (res) {
      const total = res.data && res.data.total;
      setNotice(
        total === 0
          ? 'Pulled and compared. Nothing disagrees — the two systems match.'
          : 'Pulled and compared. ' + total + ' thing(s) disagree. Work through them below.'
      );
    });
  }

  function onResolveType(type, value, label) {
    setPreview(null);
    clearApplyMessages();
    run_(function () {
      return resolveType(run.id, type, value, label);
    });
  }

  function onResolveOne(conflictId, value, label) {
    setPreview(null);
    clearApplyMessages();
    run_(function () {
      return resolveOne(run.id, conflictId, value, label);
    });
  }

  function onPreview() {
    clearMessages();
    clearApplyMessages();
    startTransition(async function () {
      let res;
      try {
        res = await previewApply(run.id);
      } catch (e) {
        setError('The request did not reach the server.');
        return;
      }
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setPreview(res.data);
    });
  }

  // NOT run_(). A refused apply must leave the preview standing, because the
  // preview box is where the refusal and its way out are printed. run_() is
  // for actions whose failure belongs in the banner at the top.
  function onApply() {
    if (!preview) return;
    const token = preview.confirm_token;
    clearMessages();
    clearApplyMessages();
    startTransition(async function () {
      let res;
      try {
        res = await applySync(run.id, token);
      } catch (e) {
        setApplyError('The request did not reach the server. Nothing was changed.');
        return;
      }
      if (!res || !res.ok) {
        setApplyError((res && res.message) || 'Something went wrong.');
        if (res && res.hint) setApplyHint(res.hint);
        setApplyCode((res && res.code) || '');
        return;
      }
      setPreview(null);
      const wrote = res.data && res.data.teams_updated;
      setNotice(
        'Applied. ' +
          (wrote ? wrote + ' team mapping row(s) updated.' : 'Nothing needed writing.') +
          ' It is in the Commissioner Action Log.'
      );
      router.refresh();
    });
  }

  // The way out of an EDFS2 refusal. Throws this comparison away and starts a
  // fresh one against Sleeper as it is now. Confirmed first, because every
  // decision made in this run goes with it -- see the note in actions.js.
  function onRePull() {
    setPreview(null);
    clearApplyMessages();
    run_(
      function () {
        return rePullAndCompare(run.id);
      },
      function (res) {
        const total = res.data && res.data.total;
        setNotice(
          total === 0
            ? 'Re-pulled and compared. Nothing disagrees any more — the two systems match.'
            : 'Re-pulled and compared against Sleeper as it is now. ' +
                total +
                ' thing(s) disagree. The earlier decisions went with the old comparison, ' +
                'so work through these again.'
        );
      }
    );
  }

  function onAbandon() {
    run_(
      function () {
        return abandonSync(run.id, reason);
      },
      function () {
        setAbandoning(false);
        setReason('');
        setNotice('Run abandoned. It is in the Commissioner Action Log.');
      }
    );
  }

  const undecided = conflicts.filter(function (c) {
    return !c.resolution;
  }).length;
  const blockingLeft = conflicts.filter(function (c) {
    return c.severity === 'blocking' && !c.resolution;
  }).length;
  const groups = groupByType(conflicts);

  return (
    <div>
      <div ref={bannerRef}>
        {error ? <div className="form-error">{error}</div> : null}
        {hint ? <p className="row-note">{hint}</p> : null}
        {notice ? <div className="form-notice">{notice}</div> : null}
      </div>

      {!run ? (
        <div className="assistant-box">
          <p>
            No comparison is open. Pulling reads your Sleeper rosters and owners and compares
            them against the app. <strong>It writes nothing</strong> — you will see what
            disagrees before anything happens.
          </p>
          <button type="button" className="btn" onClick={onPull} disabled={working}>
            {working ? 'Pulling and comparing…' : 'Pull and compare'}
          </button>
        </div>
      ) : (
        <div>
          <div className="stat-strip">
            <div>
              <div className="stat-label">Disagreements</div>
              <div className="stat-value">{conflicts.length}</div>
            </div>
            <div>
              <div className="stat-label">Still undecided</div>
              <div className="stat-value">{undecided}</div>
            </div>
            <div>
              <div className="stat-label">Must decide first</div>
              <div className="stat-value">{blockingLeft}</div>
            </div>
          </div>

          <p className="row-note">
            {armed
              ? 'Cap and roster enforcement is live, so roster disagreements must be decided before anything can be applied.'
              : 'Cap and roster enforcement has not started yet, so nothing is forced. Once it starts, roster disagreements must be decided before anything can be applied.'}
          </p>

          {conflicts.length === 0 ? (
            <p className="empty-note">Nothing disagrees. The two systems match.</p>
          ) : null}

          {groups.map(function (g) {
            const guide = guideFor(g.type);
            // Team mapping and team-name rows have no player, so the column is
            // dropped for those groups rather than printing a dash down an
            // empty column.
            const showLastAction = g.rows.some(function (r) {
              return Boolean(r.last_action);
            });
            return (
              <section key={g.type} className="assistant-box">
                <h2 className="section-heading">
                  {guide.title}{' '}
                  <span className={g.severity === 'blocking' ? 'status status-bad' : 'status'}>
                    {g.rows.length}
                  </span>
                </h2>
                {guide.blurb ? <p className="empty-note">{guide.blurb}</p> : null}

                <div className="control-row">
                  <span className="stat-label">Same answer for all {g.rows.length}:</span>
                  {guide.choices.map(function (choice) {
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        className="btn btn-secondary"
                        disabled={working}
                        onClick={function () {
                          onResolveType(g.type, choice.value, choice.label);
                        }}
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                </div>

                {/*
                  .ledger, NOT .grid-table. grid-table is the numeric primitive
                  -- right-aligned, tabular-nums, nowrap headers -- and its
                  seven other consumers are all cap or cash figures. This table
                  holds sentences and up to three buttons per row, which sat
                  wide enough to scroll sideways. .ledger is what every other
                  admin panel uses and it brings the 640px card-flip with it,
                  which is why each cell carries a data-label.
                */}
                <div className="table-scroll">
                  <table className="ledger sync-table">
                    <thead>
                      <tr>
                        <th>What disagrees</th>
                        {showLastAction ? <th>Last thing the app did</th> : null}
                        <th>Your decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(function (c) {
                        return (
                          <tr key={c.id}>
                            <td className="sync-detail" data-label="What disagrees">
                              {c.detail}
                            </td>
                            {showLastAction ? (
                              <td className="sync-last" data-label="Last thing the app did">
                                {c.last_action ? (
                                  <span>
                                    {c.last_action}
                                    <br />
                                    <span className="row-note">
                                      {formatShortDateTime(c.last_action_at)}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="row-note">
                                    Nothing on record
                                  </span>
                                )}
                              </td>
                            ) : null}
                            <td className="sync-decision" data-label="Your decision">
                              {c.resolution ? (
                                <span className="status status-good">
                                  {c.resolution_note || c.resolution}
                                </span>
                              ) : (
                                <div className="sync-choices">
                                  {guide.choices.map(function (choice) {
                                    return (
                                      <button
                                        key={choice.value}
                                        type="button"
                                        className="btn btn-quiet"
                                        disabled={working}
                                        onClick={function () {
                                          onResolveOne(c.id, choice.value, choice.label);
                                        }}
                                      >
                                        {choice.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <section className="assistant-box">
            <h2 className="section-heading">Finish</h2>
            {!preview ? (
              <div>
                <p className="empty-note">
                  Preview shows exactly what will be written and what stays on your list to do
                  by hand. It writes nothing.
                </p>
                <button type="button" className="btn" onClick={onPreview} disabled={working}>
                  Preview what will happen
                </button>
              </div>
            ) : (
              <div>
                <p>
                  <strong>Will be written:</strong>{' '}
                  {preview.writes && preview.writes.length > 0
                    ? preview.writes.length + ' team mapping row(s)'
                    : 'nothing'}
                </p>
                <p>
                  <strong>Left for you to do by hand:</strong>{' '}
                  {preview.worklist ? preview.worklist.length : 0} item(s)
                </p>
                {preview.blocking_unresolved && preview.blocking_unresolved.length > 0 ? (
                  <div className="form-error">
                    {preview.blocking_unresolved.length} row(s) must be decided first.
                  </div>
                ) : null}
                <ul>
                  {(preview.worklist || []).map(function (w, i) {
                    return <li key={i}>{w.detail}</li>;
                  })}
                </ul>

                {applyError ? (
                  <div>
                    <div className="form-error">{applyError}</div>
                    {applyHint ? <p className="row-note">{applyHint}</p> : null}

                    {applyCode === 'EDFS2' ? (
                      !repulling ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={function () {
                            setRepulling(true);
                          }}
                          disabled={working}
                        >
                          Re-pull and re-detect
                        </button>
                      ) : (
                        <div className="form-row">
                          <p className="empty-note">
                            This throws the current comparison away and starts a fresh one
                            against Sleeper as it is right now.{' '}
                            <strong>Every decision you have made in this run goes with it</strong>{' '}
                            — they describe rosters that have since changed, which is why the
                            apply was refused. The abandoned run is recorded in the Commissioner
                            Action Log. Nothing in the league is written either way.
                          </p>
                          <button
                            type="button"
                            className="btn"
                            onClick={onRePull}
                            disabled={working}
                          >
                            {working ? 'Re-pulling…' : 'Yes — re-pull and start over'}
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-quiet"
                            onClick={function () {
                              setRepulling(false);
                            }}
                            disabled={working}
                          >
                            Cancel
                          </button>
                        </div>
                      )
                    ) : null}

                    {applyCode === 'EDFS3' ? (
                      <button type="button" className="btn" onClick={onPreview} disabled={working}>
                        Preview again
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <button type="button" className="btn" onClick={onApply} disabled={working}>
                  {working ? 'Applying…' : 'Approve and apply'}
                </button>{' '}
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={function () {
                    setPreview(null);
                  }}
                  disabled={working}
                >
                  Back
                </button>
              </div>
            )}

            <hr />
            {!abandoning ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={function () {
                  setAbandoning(true);
                }}
                disabled={working}
              >
                Throw this comparison away
              </button>
            ) : (
              <div className="form-row">
                <label htmlFor="abandon-reason">
                  Why? At least 10 characters. It goes in the public action log.
                </label>
                <input
                  id="abandon-reason"
                  type="text"
                  value={reason}
                  onChange={function (e) {
                    setReason(e.target.value);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={onAbandon}
                  disabled={working || reason.trim().length < 10}
                >
                  Throw it away
                </button>{' '}
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={function () {
                    setAbandoning(false);
                    setReason('');
                  }}
                  disabled={working}
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
