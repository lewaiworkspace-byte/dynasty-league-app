'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ExplainButton from '../../../../components/ExplainButton';
import { formatExactMoney } from '../../../../lib/formatMoney';
import { formatShortDateTime } from '../../../../lib/formatDate';
import { RosterFace } from '../../../team/[teamId]/RosterList';
import { setRosterStatus, setPoachExemption, setTaxiHold } from '../../../team/[teamId]/actions';

// THE MINI PLAYER CARD's body -- UI test batch 10. page.js reads; this draws.
//
// THE ROSTER SPOT BUTTONS (Lewis, Nov 11: "Change this to 'Active', 'IR',
// 'Practice Squad'; if it isn't an option grey it out", reasons behind the
// explain icon, and rulings IR-1 to IR-3 at 3:57-4:05 PM). Each button's state
// is a row of edfl_roster_spot_options():
//   current       his spot now (filled);
//   current_fine  on IR without IR / Out / Doubtful / PUP: the IR button is RED,
//                 a fine warning sits under the buttons, and the explain icon
//                 gives the fuller explanation with links to the rules (IR-3);
//   allowed       pressable;
//   allowed_fine  pressable with the fine warning (a Questionable player to IR,
//                 IR-2), shown again before the move is confirmed;
//   refused       greyed, the engine's own sentence in the explain icon (IR-1
//                 and every other refusal).
// A press asks once ("Move him to IR?") and then calls set_roster_status
// through the existing Server Action; its refusal, if the answer changed since
// the page was drawn, is shown as returned. Nothing here re-checks a rule.
//
// THE TWO PRACTICE SQUAD DESIGNATIONS (rule 5.17(l) exemption, rule 3.3(d)(i)
// hold) moved here with the rest of the row's controls. They are offered
// where the view says they apply and refused by the database otherwise.

const SPOTS = [
  { key: 'active', label: 'Active', words: 'the active roster' },
  { key: 'ir', label: 'IR', words: 'injured reserve' },
  { key: 'taxi', label: 'Practice Squad', words: 'the practice squad' },
];

const STAT_LINES = {
  QB: [
    ['passing_yards', 'PASS YD'],
    ['passing_tds', 'PASS TD'],
    ['interceptions', 'INT'],
    ['rushing_yards', 'RUSH YD'],
    ['rushing_tds', 'RUSH TD'],
  ],
  RB: [
    ['rushing_yards', 'RUSH YD'],
    ['rushing_tds', 'RUSH TD'],
    ['receptions', 'REC'],
    ['receiving_yards', 'REC YD'],
    ['receiving_tds', 'REC TD'],
  ],
  WR: [
    ['targets', 'TGT'],
    ['receptions', 'REC'],
    ['receiving_yards', 'REC YD'],
    ['receiving_tds', 'REC TD'],
  ],
  TE: [
    ['targets', 'TGT'],
    ['receptions', 'REC'],
    ['receiving_yards', 'REC YD'],
    ['receiving_tds', 'REC TD'],
  ],
};

function int(v) {
  if (v === null || v === undefined) return '–';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '–';
}

function dec1(v) {
  if (v === null || v === undefined) return '–';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : '–';
}

function oppLabel(u) {
  if (u.no_team) return '';
  if (u.on_bye || !u.opponent) return '';
  if (u.is_neutral) return u.opponent + ' (N)';
  return (u.is_away ? '@' : '') + u.opponent;
}

function notifyPanel() {
  try {
    if (window.name === 'edfl-panel' && window.parent !== window) {
      window.parent.postMessage({ edflPanel: 'changed' }, window.location.origin);
    }
  } catch (e) {
    /* nothing to tell */
  }
}

export default function MiniPlayerCard(props) {
  const router = useRouter();
  const p = props.player;
  const c = props.contract;
  const taxi = props.taxi;
  const options = props.options || [];
  const [pending, setPending] = useState(null); // destination awaiting confirmation
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

  const team = p.nfl_team || 'FA';
  const meta = p.position + ' • ' + team + (props.byeWeek ? ' · Bye Week ' + props.byeWeek : '');
  const statLine = STAT_LINES[p.position] || null;
  const s = props.stats;
  const sum = props.summary;

  const locked = taxi ? Boolean(taxi.locked !== null && taxi.locked !== undefined ? taxi.locked : taxi.eligibility_spent) : false;
  const lastDemotion = taxi && !locked ? Boolean(taxi.last_demotion_available) : false;

  return (
    <div>
      <div className="mpc-head">
        <RosterFace big sleeperId={p.sleeper_player_id} name={p.full_name} />
        <div style={{ minWidth: 0 }}>
          <h1 className="mpc-name">{p.full_name}</h1>
          <div className="mpc-meta">{meta}</div>
          {c ? (
            <div className="mpc-tags">
              {c.isVoidYear ? <span className="void-tag">VOID YR</span> : null}
              {props.onWaivers ? <span className="void-tag ps-tag urgent">ON WAIVERS</span> : null}
              {taxi && taxi.warning ? (
                <span className={'void-tag ps-tag' + (locked ? ' spent' : lastDemotion ? ' urgent' : '')} title={taxi.warning}>
                  {locked
                    ? 'LOCKED TO ACTIVE ROSTER'
                    : taxi.weeks_used + ' OF ' + taxi.weeks_max + ' WEEKS' + (lastDemotion ? ' · LAST DEMOTION' : '')}
                </span>
              ) : null}
              {taxi && taxi.held ? (
                <span className="void-tag ps-tag held" title={taxi.hold_note || ''}>
                  HELD ON ACTIVE
                </span>
              ) : null}
              {taxi && taxi.poach_exempt ? <span className="void-tag ps-tag exempt">POACH EXEMPT</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      {props.isMine && c && !props.onWaivers ? (
        <div className="mpc-box">
          <p className="mpc-boxh">Roster spot</p>
          {props.optionsError ? (
            <div className="form-error">Where he can go could not be read: {props.optionsError}</div>
          ) : (
            <div className="mpc-spots edfl-explain-host" role="group" aria-label="Roster spot">
              {SPOTS.map(function (spot) {
                const o = byKey[spot.key] || null;
                const state = o ? o.state : 'refused';
                const current = state === 'current' || state === 'current_fine';
                const refused = state === 'refused';
                const why = o && o.reason ? o.reason : null;
                return (
                  <div
                    key={spot.key}
                    className={
                      'mpc-spot' + (current ? ' is-current' : '') + (state === 'current_fine' ? ' is-fine' : '')
                    }
                  >
                    <button
                      type="button"
                      className={current ? 'btn' : 'btn btn-quiet'}
                      aria-pressed={current}
                      disabled={refused || busy}
                      onClick={function () {
                        if (current) return;
                        setError('');
                        setNotice('');
                        setPending(spot.key);
                      }}
                    >
                      {spot.label}
                    </button>
                    {why && !current ? (
                      <span className="mpc-spot-why">
                        <ExplainButton label={'Why: ' + spot.label} title={refused ? 'Why he can’t go here' : 'Before you move him'}>
                          <p>{why}</p>
                        </ExplainButton>
                      </span>
                    ) : null}
                    {state === 'current_fine' ? (
                      <span className="mpc-spot-why">
                        <ExplainButton label="Why the IR button is red" title="Injured reserve without a qualifying designation">
                          <p>{why}</p>
                          <p>
                            A player may hold an injured reserve place only while he is listed IR, Out,
                            Doubtful or PUP. Questionable may be placed but does not qualify. Move him to the
                            active roster, or the fine is charged
                            {fineRow && fineRow.fine_due_at ? ' at ' + formatShortDateTime(fineRow.fine_due_at) : ''}.
                          </p>
                          <p>
                            Rule Book <a href="/library/rule-book#s-3-4">3.4 Injured reserve</a> and{' '}
                            <a href="/library/rule-book#s-6-7">6.7 Fines</a>.
                          </p>
                        </ExplainButton>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {fineRow && fineRow.state === 'current_fine' ? (
            <p className="mpc-warn">
              $25 fine
              {fineRow.fine_due_at ? ' at ' + formatShortDateTime(fineRow.fine_due_at) : ''} unless he is
              listed IR, Out, Doubtful or PUP, or you move him.
            </p>
          ) : null}

          {pending ? (
            <div className="mpc-msg">
              <p style={{ margin: '0 0 6px' }}>
                Move {p.full_name} to {(SPOTS.find(function (x) { return x.key === pending; }) || {}).words}?
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
                        return (d && d.player ? d.player : p.full_name) + ' moved.';
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
      ) : null}

      <div className="mpc-box">
        <p className="mpc-boxh">Projected points, next {props.upcoming.length || 5} weeks</p>
        {props.upcomingError ? (
          <div className="form-error">The next weeks could not be read: {props.upcomingError}</div>
        ) : props.upcoming.length === 0 ? (
          <p className="empty-note">No league weeks left this season.</p>
        ) : (
          <div className="mpc-grid is-five">
            {props.upcoming.map(function (u, i) {
              const label = u.on_bye ? 'Bye' : u.proj_points === null || u.proj_points === undefined ? '–' : dec1(u.proj_points);
              return (
                <div key={u.week_number}>
                  <b className={u.on_bye ? 'is-quiet' : i === 0 ? 'is-now' : undefined}>{label}</b>
                  Wk {u.week_number}
                  <span className="mpc-opp">{oppLabel(u) || ' '}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mpc-box">
        <p className="mpc-boxh">{props.season} season</p>
        {props.statsError || props.summaryError ? (
          <div className="form-error">The season could not be read: {props.statsError || props.summaryError}</div>
        ) : (
          <div className="mpc-grid">
            <div>
              <b>{sum && sum.weeks_active ? sum.weeks_counted + '/' + sum.weeks_active : '–'}</b>STARTS
            </div>
            {statLine
              ? statLine.map(function (pair) {
                  return (
                    <div key={pair[0]}>
                      <b>{s ? int(s[pair[0]]) : '–'}</b>
                      {pair[1]}
                    </div>
                  );
                })
              : p.position === 'K'
              ? [
                  <div key="fg">
                    <b>{s ? int(s.fg_made) + '/' + int(s.fg_att) : '–'}</b>FG
                  </div>,
                  <div key="xp">
                    <b>{s ? int(s.xp_made) + '/' + int(s.xp_att) : '–'}</b>XP
                  </div>,
                ]
              : null}
            <div>
              <b>{s ? dec1(s.fantasy_points) : '–'}</b>PTS
            </div>
            <div>
              <b>{s ? dec1(s.fppg) : '–'}</b>PPG
            </div>
          </div>
        )}
      </div>

      {c ? (
        <div className="mpc-box">
          <p className="mpc-boxh">{props.season} contract</p>
          {props.contractError ? (
            <div className="form-error">The contract could not be read: {props.contractError}</div>
          ) : (
            <div className="mpc-trio">
              <div>
                <b className="v-cap">{formatExactMoney(c.capCharge)}</b>Cap hit
              </div>
              <div>
                <b className="v-cash">{formatExactMoney(c.cashValue)}</b>Cash
              </div>
              <div>
                <b>
                  {props.season - c.startYear + 1}/{c.totalSpan}
                </b>
                Contract year
              </div>
            </div>
          )}
          {c.teamName ? <p className="mpc-warn is-caution">{c.teamName}</p> : null}
        </div>
      ) : (
        <div className="mpc-box">
          <p className="mpc-boxh">Contract</p>
          <p className="empty-note" style={{ margin: 0 }}>
            Not under contract in the league.
          </p>
        </div>
      )}

      <a className="mpc-cardlink" href={'/player/' + p.id} data-full-card="">
        Open the full player card ›
      </a>
    </div>
  );
}
