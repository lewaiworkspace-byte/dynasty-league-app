'use client';

import { useState } from 'react';
import PlayerLink from '../../components/PlayerLink';
import TeamDisc from '../../components/TeamDisc';

// THE LEAGUE DRAFT BOARD (UI test batch 18, November 15, 2026), drawn from
// Lewis's "League Draft Board" canvas. One draft year at a time, picked from a
// drop-down; two shapes underneath (Lewis, canvas comments Nov 15):
//
//   A FINISHED DRAFT is drawn BY TEAM (the canvas's Option C, "I like this
//   concept for historic draft years"): a chart with one solid bar per team,
//   as long as the picks it made and split by position, whose logos jump to
//   that team's card; then one card per team with its picks and players.
//   "Solid bar graphs because the number of picks will not be even ... due to
//   trades": a bar's length is a count, never a fixed share.
//
//   A DRAFT STILL TO COME is drawn ROUND BY ROUND (Option B): the draft logo
//   with All / Round 1 ... buttons to its right, one round shown until All is
//   pressed, never a player name ("these are future picks"); then the "Draft
//   capital" chart: one bar per team, a segment per round in its own colour.
//
// WHICH SHAPE A SEASON GETS IS THE DATABASE'S ANSWER, NOT A YEAR COMPARISON.
// draft_completed is bool_and(used_by_contract_id is not null) over the season,
// and order_set is bool_and(pick_number is not null). When an order is set the
// future shape shows the pick numbers (pick_label); until then a pick is its
// round, and the view's sort_key lists each round by the ORIGINAL owner's team
// name, A to Z. The page reads in sort_key order: do not re-sort the rounds.
//
// THE YEAR LIST COMES FROM THE ROWS, NEVER FROM A RANGE (ui-patterns.md). It is
// 2023 through 2029 today and gains 2030 the day the rollover writes that class.
// The rounds, the teams and the positions come from the rows too: no count of
// teams, rounds or seasons is written here.
//
// THE PAGE OPENS ON THE NEXT DRAFT (the first season not yet drafted), else the
// newest one; initialSeason is only the fallback.
//
// No money on this page, and no dates.

const POS_KNOWN = ['QB', 'RB', 'WR', 'TE', 'K'];

function posClass(p) {
  return POS_KNOWN.indexOf(p) !== -1 ? 'edfl-db-pos-' + p : 'edfl-db-pos-x';
}

function roundClass(r) {
  return 'edfl-db-rd' + (((Number(r) || 1) - 1) % 4 + 1);
}

function Disc(props) {
  return (
    <TeamDisc
      className={'kit-disc edfl-db-disc' + (props.size ? ' edfl-db-disc-' + props.size : '') + (props.mine ? ' kit-disc-own' : '')}
      abbrev={props.abbrev}
    />
  );
}

function YearPicker(props) {
  return (
    <div className="edfl-db-year">
      <label htmlFor="edfl-db-year">Draft year</label>
      <span className="edfl-db-selwrap">
        <select
          id="edfl-db-year"
          className="edfl-db-sel"
          value={props.season}
          onChange={function (e) {
            props.onChange(Number(e.target.value));
          }}
        >
          {props.seasons.map(function (s) {
            return (
              <option key={s.year} value={s.year}>
                {s.year + ' draft' + (s.done ? '' : s.year === props.nextYear ? ' · next' : ' · future')}
              </option>
            );
          })}
        </select>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 8l5 5 5-5" />
        </svg>
      </span>
      <span className={'edfl-db-status' + (props.info.done ? ' is-done' : ' is-future')}>
        <i aria-hidden="true" />
        {props.info.done
          ? 'Complete · ' + props.info.rounds.length + (props.info.rounds.length === 1 ? ' round · ' : ' rounds · ') + props.info.count + ' picks'
          : props.info.orderSet
          ? 'Draft order set'
          : 'Order set after the ' + (props.season - 1) + ' season'}
      </span>
    </div>
  );
}

function Logo() {
  return (
    <span className="edfl-db-logo">
      <img src="/brand/draft-logo.webp" alt="EDFL Draft" width="220" height="210" />
    </span>
  );
}

// ---- a draft still to come -------------------------------------------------

function FutureBoard(props) {
  const shown = props.rows;
  const rounds = props.info.rounds;
  const ab = props.abbrevById;
  const me = props.myTeamId;
  const [round, setRound] = useState(rounds.length ? rounds[0] : 'all');
  const showRound = round === 'all' || rounds.indexOf(round) !== -1 ? round : rounds[0];

  // Draft capital: every team in the season's rows, its picks by round.
  const teams = {};
  shown.forEach(function (r) {
    [[r.original_team_id, r.original_team_name], [r.current_team_id, r.current_team_name]].forEach(function (t) {
      if (t[0] && !teams[t[0]]) teams[t[0]] = { id: t[0], name: t[1] || '', byRound: {}, total: 0 };
    });
  });
  shown.forEach(function (r) {
    const t = teams[r.current_team_id];
    if (!t) return;
    t.byRound[r.round] = (t.byRound[r.round] || 0) + 1;
    t.total += 1;
  });
  const capital = Object.keys(teams).map(function (k) {
    return teams[k];
  });
  capital.sort(function (a, b) {
    if (b.total !== a.total) return b.total - a.total;
    for (let i = 0; i < rounds.length; i++) {
      const d = (b.byRound[rounds[i]] || 0) - (a.byRound[rounds[i]] || 0);
      if (d !== 0) return d;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const most = capital.reduce(function (m, t) {
    return Math.max(m, t.total);
  }, 0);

  return (
    <div>
      <div className="edfl-db-head">
        <Logo />
        <div className="edfl-db-rbtns" role="group" aria-label="Show rounds">
          <button
            type="button"
            className={'edfl-db-rbtn' + (showRound === 'all' ? ' is-on' : '')}
            aria-pressed={showRound === 'all'}
            onClick={function () {
              setRound('all');
            }}
          >
            All
          </button>
          {rounds.map(function (r) {
            return (
              <button
                key={r}
                type="button"
                className={'edfl-db-rbtn' + (showRound === r ? ' is-on' : '')}
                aria-pressed={showRound === r}
                onClick={function () {
                  setRound(r);
                }}
              >
                {'Round ' + r}
              </button>
            );
          })}
        </div>
      </div>

      {props.picker}

      <div className={'edfl-db-rounds' + (showRound === 'all' ? ' is-all' : '')}>
        {rounds
          .filter(function (r) {
            return showRound === 'all' || r === showRound;
          })
          .map(function (r) {
            const inRound = shown.filter(function (p) {
              return p.round === r;
            });
            return (
              <section key={r} aria-label={'Round ' + r}>
                <h2 className="edfl-db-sec">
                  {'Round ' + r}
                  <span>{props.info.orderSet ? 'in draft order' : 'A to Z until the order is set'}</span>
                </h2>
                <ul className="edfl-db-list">
                  {inRound.map(function (p) {
                    const traded = Boolean(p.pick_changed_hands);
                    const mine = me && p.current_team_id === me;
                    return (
                      <li key={p.pick_id} className={'edfl-db-row' + (mine ? ' is-mine' : '')}>
                        <span className="edfl-db-pk">{props.info.orderSet ? p.pick_label : 'R' + p.round}</span>
                        <Disc abbrev={ab[p.original_team_id] || ''} mine={me && p.original_team_id === me} />
                        <span className="edfl-db-bd">
                          <b>{p.original_team_name}</b>
                          <span>
                            {traded ? (
                              <>
                                {'Traded · now '}
                                <em>{p.current_team_name}</em>
                                {'’s'}
                              </>
                            ) : (
                              'Own pick'
                            )}
                          </span>
                        </span>
                        {traded ? (
                          <span className="edfl-db-own">
                            <span className="edfl-db-tag">Traded</span>
                            <Disc abbrev={ab[p.current_team_id] || ''} mine={mine} size="s" />
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
      </div>

      <section className="edfl-db-card" aria-label={'Draft capital, ' + props.season}>
        <span className="edfl-db-eyb">{'Draft capital · ' + props.season}</span>
        <div className="edfl-db-chart">
          {capital.map(function (t) {
            const parts = rounds
              .filter(function (r) {
                return t.byRound[r];
              })
              .map(function (r) {
                return 'round ' + r + ': ' + t.byRound[r];
              });
            return (
              <div key={t.id} className={'edfl-db-bar' + (me && t.id === me ? ' is-mine' : '')}>
                <Disc abbrev={ab[t.id] || ''} mine={me && t.id === me} size="s" />
                <span className="edfl-db-tri" aria-hidden="true">{ab[t.id] || ''}</span>
                <span className="edfl-db-trk" role="img" aria-label={t.name + ': ' + t.total + ' picks' + (parts.length ? '; ' + parts.join(', ') : '')}>
                  {rounds.map(function (r) {
                    const n = t.byRound[r] || 0;
                    if (!n) return null;
                    return (
                      <i key={r} className={roundClass(r)} style={{ width: (most ? (n / most) * 100 : 0) + '%' }}>
                        {n}
                      </i>
                    );
                  })}
                </span>
                <span className="edfl-db-tot" aria-hidden="true">{t.total}</span>
              </div>
            );
          })}
        </div>
        <div className="edfl-db-key">
          {rounds.map(function (r) {
            return (
              <span key={r}>
                <i className={roundClass(r)} aria-hidden="true" />
                {'Round ' + r}
              </span>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ---- a finished draft -------------------------------------------------------

function DoneBoard(props) {
  const shown = props.rows;
  const ab = props.abbrevById;
  const me = props.myTeamId;

  // The team on the clock is current_team_id: the original owner unless the
  // slot was traded before it was used. Teams in draft order: by their first pick.
  const teams = {};
  shown.forEach(function (r) {
    const id = r.current_team_id;
    if (!id) return;
    if (!teams[id]) teams[id] = { id: id, name: r.current_team_name || '', first: Infinity, picks: [], byPos: {} };
    const t = teams[id];
    t.picks.push(r);
    const ov = Number(r.overall_pick);
    if (ov && ov < t.first) t.first = ov;
    const pos = r.player_position || '—';
    t.byPos[pos] = (t.byPos[pos] || 0) + 1;
  });
  const order = Object.keys(teams)
    .map(function (k) {
      return teams[k];
    })
    .sort(function (a, b) {
      if (a.first !== b.first) return a.first - b.first;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  const most = order.reduce(function (m, t) {
    return Math.max(m, t.picks.length);
  }, 0);

  const posSeen = [];
  shown.forEach(function (r) {
    const p = r.player_position || '—';
    if (posSeen.indexOf(p) === -1) posSeen.push(p);
  });
  posSeen.sort(function (a, b) {
    const ia = POS_KNOWN.indexOf(a);
    const ib = POS_KNOWN.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a < b ? -1 : a > b ? 1 : 0;
  });

  function anchorId(t) {
    return 'db-team-' + String(ab[t.id] || t.id).replace(/[^A-Za-z0-9-]/g, '');
  }

  return (
    <div>
      <div className="edfl-db-head is-done">
        <Logo />
        {props.picker}
      </div>

      <section className="edfl-db-card" aria-label="What each team took">
        <div className="edfl-db-chart">
          {order.map(function (t) {
            const parts = posSeen
              .filter(function (p) {
                return t.byPos[p];
              })
              .map(function (p) {
                return t.byPos[p] + ' ' + p;
              });
            return (
              <div key={t.id} className={'edfl-db-bar' + (me && t.id === me ? ' is-mine' : '')}>
                <a className="edfl-db-jump" href={'#' + anchorId(t)} aria-label={t.name + ': go to its ' + props.season + ' picks'}>
                  <Disc abbrev={ab[t.id] || ''} mine={me && t.id === me} size="s" />
                </a>
                <span className="edfl-db-tri" aria-hidden="true">{ab[t.id] || ''}</span>
                <span className="edfl-db-trk is-solid" role="img" aria-label={t.picks.length + ' picks; ' + parts.join(', ')}>
                  {posSeen.map(function (p) {
                    const n = t.byPos[p] || 0;
                    if (!n) return null;
                    return (
                      <i key={p} className={posClass(p)} style={{ width: (most ? (n / most) * 100 : 0) + '%' }}>
                        {n}
                      </i>
                    );
                  })}
                </span>
                <span className="edfl-db-tot" aria-hidden="true">{t.picks.length}</span>
              </div>
            );
          })}
        </div>
        <div className="edfl-db-key">
          {posSeen.map(function (p) {
            return (
              <span key={p}>
                <i className={posClass(p)} aria-hidden="true" />
                {p}
              </span>
            );
          })}
        </div>
      </section>

      <div className="edfl-db-teams">
        {order.map(function (t) {
          const mine = me && t.id === me;
          return (
            <section key={t.id} id={anchorId(t)} className={'edfl-db-team' + (mine ? ' is-mine' : '')} aria-label={t.name}>
              <div className="edfl-db-teamhead">
                <Disc abbrev={ab[t.id] || ''} mine={mine} size="l" />
                <b>{t.name}</b>
              </div>
              <ul className="edfl-db-list is-flat">
                {t.picks.map(function (p) {
                  const moved = p.player_current_team_id && p.player_current_team_id !== p.current_team_id;
                  const gone = !p.player_current_team_id && p.player_status;
                  return (
                    <li key={p.pick_id} className="edfl-db-row">
                      <span className="edfl-db-pk">{p.pick_label}</span>
                      <span className={'edfl-db-poschip ' + posClass(p.player_position)}>{p.player_position || '—'}</span>
                      <span className="edfl-db-bd">
                        <b>
                          <PlayerLink playerId={p.player_id}>{p.player_name || '—'}</PlayerLink>
                        </b>
                        <span>
                          {p.overall_pick ? 'Overall ' + p.overall_pick : ''}
                          {p.pick_changed_hands ? ' · via ' + p.original_team_name : ''}
                          {moved ? (
                            <>
                              {' · '}
                              <em className="edfl-db-moved">{'now ' + p.player_current_team_name}</em>
                            </>
                          ) : gone ? (
                            <>
                              {' · '}
                              <em className="edfl-db-moved">{p.player_status}</em>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function DraftPicksBoard(props) {
  const rows = props.rows || [];

  const bySeason = {};
  rows.forEach(function (r) {
    const y = r.season_year;
    if (!bySeason[y]) bySeason[y] = { rows: [], rounds: [], done: true, orderSet: true };
    const s = bySeason[y];
    s.rows.push(r);
    if (s.rounds.indexOf(r.round) === -1) s.rounds.push(r.round);
    if (!r.draft_completed) s.done = false;
    if (!r.order_set) s.orderSet = false;
  });
  const years = Object.keys(bySeason)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });
  years.forEach(function (y) {
    bySeason[y].rounds.sort(function (a, b) {
      return a - b;
    });
  });

  // The next draft: the first season not yet drafted.
  let nextYear = null;
  years.forEach(function (y) {
    if (nextYear === null && !bySeason[y].done) nextYear = y;
  });
  const landing =
    nextYear !== null
      ? nextYear
      : years.indexOf(props.initialSeason) !== -1
      ? props.initialSeason
      : years[years.length - 1];
  const [season, setSeason] = useState(landing);

  // Menu order: the next draft, the futures, then the finished drafts newest first.
  const menu = years
    .filter(function (y) {
      return !bySeason[y].done;
    })
    .concat(
      years
        .filter(function (y) {
          return bySeason[y].done;
        })
        .reverse()
    )
    .map(function (y) {
      return { year: y, done: bySeason[y].done };
    });

  const s = bySeason[season] || { rows: [], rounds: [], done: false, orderSet: false };
  const info = { done: s.done, orderSet: s.orderSet, rounds: s.rounds, count: s.rows.length };
  const picker = <YearPicker seasons={menu} season={season} nextYear={nextYear} info={info} onChange={setSeason} />;

  return s.done ? (
    <DoneBoard
      key={season}
      rows={s.rows}
      season={season}
      info={info}
      picker={picker}
      abbrevById={props.abbrevById || {}}
      myTeamId={props.myTeamId || null}
    />
  ) : (
    <FutureBoard
      key={season}
      rows={s.rows}
      season={season}
      info={info}
      picker={picker}
      abbrevById={props.abbrevById || {}}
      myTeamId={props.myTeamId || null}
    />
  );
}
