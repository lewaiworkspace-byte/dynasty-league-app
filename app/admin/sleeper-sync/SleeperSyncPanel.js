'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatShortDateTime } from '../../../lib/formatDate';
import {
  pullAndCompare,
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
  const [abandoning, setAbandoning] = useState(false);
  const [reason, setReason] = useState('');
  const [working, startTransition] = useTransition();
  const router = useRouter();

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
    run_(function () {
      return resolveType(run.id, type, value, label);
    });
  }

  function onResolveOne(conflictId, value, label) {
    setPreview(null);
    run_(function () {
      return resolveOne(run.id, conflictId, value, label);
    });
  }

  function onPreview() {
    clearMessages();
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

  function onApply() {
    if (!preview) return;
    const token = preview.confirm_token;
    setPreview(null);
    run_(
      function () {
        return applySync(run.id, token);
      },
      function (res) {
        const wrote = res.data && res.data.teams_updated;
        setNotice(
          'Applied. ' +
            (wrote ? wrote + ' team mapping row(s) updated.' : 'Nothing needed writing.') +
            ' It is in the Commissioner Action Log.'
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
      {error ? <div className="form-error">{error}</div> : null}
      {hint ? <p className="row-note">{hint}</p> : null}
      {notice ? <div className="form-notice">{notice}</div> : null}

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
                        className="btn-secondary"
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

                <div className="table-scroll">
                  <table className="grid-table">
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
                            <td>{c.detail}</td>
                            {showLastAction ? (
                              <td>
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
                            <td>
                              {c.resolution ? (
                                <span className="status status-good">
                                  {c.resolution_note || c.resolution}
                                </span>
                              ) : (
                                guide.choices.map(function (choice) {
                                  return (
                                    <button
                                      key={choice.value}
                                      type="button"
                                      className="btn-quiet"
                                      disabled={working}
                                      onClick={function () {
                                        onResolveOne(c.id, choice.value, choice.label);
                                      }}
                                    >
                                      {choice.label}
                                    </button>
                                  );
                                })
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
                <button type="button" className="btn" onClick={onApply} disabled={working}>
                  {working ? 'Applying…' : 'Approve and apply'}
                </button>{' '}
                <button
                  type="button"
                  className="btn-quiet"
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
                className="btn-danger"
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
                  className="btn-danger"
                  onClick={onAbandon}
                  disabled={working || reason.trim().length < 10}
                >
                  Throw it away
                </button>{' '}
                <button
                  type="button"
                  className="btn-quiet"
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
