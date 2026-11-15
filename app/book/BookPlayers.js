'use client';

import { useMemo, useState } from 'react';
import TeamDisc from '../../components/TeamDisc';
import { formatKickoff } from '../../lib/formatDate';
import { chipMarket, lineText, priceText, PROP_ORDER, propLabel, STAT_CHIPS } from './bookFormat';
import { IconBan, IconLock, IconSearch } from './bookIcons';

/**
 * THE PLAYERS BOARD -- UI test batch 25, November 15, 2026 (test site only).
 *
 * Lewis's Phase 2 Book canvas (YLHTHMMNbmi7fwWyLvRND6): PB-match-390 grouped by
 * matchup with the stat chips, the Group switch's "By team" view (PB-team-390),
 * the player sheet (PlayerSheet-390, tap a name for every bet on him) and, from
 * 1024px, the player table (LapPlayers-1280: Points · Yards · TDs·kicks · Catches).
 *
 * It draws book_week_props (test database, book_09_phase2_engine): active-roster
 * players only (BT-69), each with the lines the House posted when the week opened.
 * A player gets a line only where a projection exists for that stat; otherwise
 * "No line this week". Your own players are teal and take overs only (BT-31): the
 * under is greyed "Your player". The board decides nothing; the price's tap goes to
 * BookBoard, which opens the slip or adds the leg to the parlay.
 */

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K'];
const TOP = 8;

// One player line as a slip/tray candidate.
export function propCand(pl, prop, side) {
  const over = side === 'over';
  const lbl = propLabel(prop.market);
  return {
    key: 'p:' + prop.prop_id + ':' + side,
    heldKey: 'p:' + pl.player_id + ':' + prop.market + ':' + side,
    kind: 'prop',
    prop_id: prop.prop_id,
    market: prop.market,
    side: side,
    line: prop.line,
    odds: over ? prop.over_odds : prop.under_odds,
    player_id: pl.player_id,
    team_id: pl.team_id,
    own_player: Boolean(pl.own_player),
    pos: pl.pos,
    name: pl.name,
    locked: Boolean(pl.locked),
    lock_at: pl.kickoff_at,
    label: pl.name + ' ' + (over ? 'over ' : 'under ') + lineText(prop.line, false),
    sub: lbl + ' · ' + pl.pos + ' · ' + (pl.nfl_team || '') + (pl.own_player ? ' · your player' : pl.team_abbrev ? ' · on ' + pl.team_abbrev : ''),
    lockWhy: '(' + shortFirst(pl.name) + '’s kickoff)',
  };
}

function shortFirst(n) {
  const p = String(n || '').split(' ');
  return p.length > 1 ? p.slice(1).join(' ') : n;
}

function propFor(pl, market) {
  if (!market) return null;
  return (pl.props || []).find(function (x) {
    return x.market === market;
  }) || null;
}

// O/U button. st: open | sel | held | in | locked | blk(reason)
export function PropButton(props) {
  const st = props.state;
  const reason = props.reason;
  let cls = 'bk-od v';
  if (st === 'sel') cls += ' sel';
  if (st === 'in') cls += ' in';
  if (st === 'held') cls += ' mine';
  if (st === 'locked') cls += ' lk';
  if (st === 'blk') cls += ' blk';
  return (
    <button
      type="button"
      className={cls}
      disabled={st === 'locked' || props.watchOnly}
      aria-pressed={st === 'sel' || st === 'in' ? 'true' : 'false'}
      aria-label={props.aria + (st === 'blk' ? ', not allowed: ' + reason : st === 'locked' ? ', locked' : st === 'in' ? ', in your parlay' : '')}
      onClick={props.onClick}
    >
      <b>{props.label}</b>
      {st === 'locked' ? (
        <span>
          <IconLock size={12} /> Locked
        </span>
      ) : st === 'blk' ? (
        <span>{reason}</span>
      ) : (
        <span>{priceText(props.odds)}</span>
      )}
    </button>
  );
}

function OU(props) {
  const pl = props.pl;
  const prop = propFor(pl, props.market);
  if (!prop) return <span className="bk-gap2">No line this week</span>;
  return (
    <>
      {['over', 'under'].map(function (side) {
        const c = propCand(pl, prop, side);
        const s = props.stateOf(c);
        return (
          <PropButton
            key={side}
            state={s.st}
            reason={s.reason}
            odds={c.odds}
            label={(side === 'over' ? 'O ' : 'U ') + lineText(prop.line, false)}
            aria={pl.name + ' ' + side + ' ' + lineText(prop.line, false) + ' ' + propLabel(prop.market)}
            watchOnly={props.watchOnly}
            onClick={function () {
              props.onTap(c);
            }}
          />
        );
      })}
    </>
  );
}

function subLine(pl) {
  const ko = formatKickoff(pl.kickoff_at);
  const inj = pl.injury_status && pl.injury_status !== 'NA' ? ' · ' + pl.injury_status : '';
  if (pl.own_player)
    return (
      <>
        <em className="bk-ppt">Pete&rsquo;s Picks</em> · {pl.nfl_team} · {ko}
        {inj}
      </>
    );
  return pl.nfl_team + ' · ' + (pl.team_abbrev || '') + ' · ' + ko + inj;
}

function Row(props) {
  const pl = props.pl;
  return (
    <div className="bk-prow">
      <span className={'bk-pos' + (pl.own_player ? ' me' : '')}>{pl.pos}</span>
      <button
        type="button"
        className="bk-pn"
        aria-label={'All bets on ' + pl.name}
        onClick={function () {
          props.onOpenPlayer(pl);
        }}
      >
        <b>{pl.name}</b>
        <span>{subLine(pl)}</span>
      </button>
      <OU pl={pl} market={chipMarket(props.chip, pl.pos)} stateOf={props.stateOf} onTap={props.onTap} watchOnly={props.watchOnly} />
    </div>
  );
}

function sortPlayers(list, sort) {
  const a = list.slice();
  if (sort === 'name')
    a.sort(function (x, y) {
      return String(x.name).localeCompare(String(y.name));
    });
  else if (sort === 'kickoff')
    a.sort(function (x, y) {
      return new Date(x.kickoff_at) - new Date(y.kickoff_at) || Number(y.proj_points || 0) - Number(x.proj_points || 0);
    });
  else
    a.sort(function (x, y) {
      return Number(y.proj_points || 0) - Number(x.proj_points || 0);
    });
  return a;
}

function kickRange(list) {
  let a = null;
  let b = null;
  list.forEach(function (p) {
    const t = new Date(p.kickoff_at).getTime();
    if (a === null || t < a) a = t;
    if (b === null || t > b) b = t;
  });
  if (a === null) return '';
  const fa = formatKickoff(new Date(a));
  if (a === b) return fa;
  const fb = formatKickoff(new Date(b));
  return fa.split(' ')[0] === fb.split(' ')[0] ? fa + '–' + fb.replace(/^\w+ /, '') : fa + ' – ' + fb;
}

// The groups the board draws: by matchup (yours first, then the Games board's
// order) or by team (yours first, then by tri-graph).
function buildGroups(players, group, sort, board, teamsById) {
  const myTeamId = board.my_team_id;
  if (group === 'team') {
    const byTeam = {};
    players.forEach(function (p) {
      const k = p.team_id || 'none';
      (byTeam[k] = byTeam[k] || []).push(p);
    });
    return Object.keys(byTeam)
      .sort(function (a, b) {
        if (a === myTeamId) return -1;
        if (b === myTeamId) return 1;
        const ta = teamsById[a] ? teamsById[a].abbrev : a;
        const tb = teamsById[b] ? teamsById[b].abbrev : b;
        return String(ta).localeCompare(String(tb));
      })
      .map(function (tid) {
        const t = teamsById[tid] || {};
        const list = sortPlayers(byTeam[tid], sort);
        return { key: 't' + tid, me: tid === myTeamId, discs: [t.abbrev], title: t.name || t.abbrev || 'Team', sub: (tid === myTeamId ? 'Pete’s Picks · ' : '') + 'locks ' + kickRange(list), list: list };
      });
  }
  const order = (board.matchups || []).map(function (m) {
    return m;
  });
  const byM = {};
  players.forEach(function (p) {
    (byM[p.matchup_id] = byM[p.matchup_id] || []).push(p);
  });
  const out = [];
  order.forEach(function (m) {
    const list = byM[m.matchup_id];
    if (!list || !list.length) return;
    const own = Boolean(m.is_own);
    const L = own && m.away.team_id === myTeamId ? m.away : m.home;
    const R = L === m.home ? m.away : m.home;
    const sorted = sortPlayers(list, sort);
    out.push({
      key: 'm' + m.matchup_id,
      me: own,
      discs: [L.abbrev, R.abbrev],
      title: L.abbrev + ' vs ' + R.abbrev,
      sub: (own ? 'Pete’s Picks · ' : '') + 'locks ' + kickRange(sorted),
      list: sorted,
    });
    delete byM[m.matchup_id];
  });
  // Players whose matchup has no posted game line still get a card.
  Object.keys(byM).forEach(function (k) {
    out.push({ key: 'x' + k, me: false, discs: [], title: 'Other players', sub: '', list: sortPlayers(byM[k], sort) });
  });
  return out;
}

function GroupCard(props) {
  const g = props.g;
  const [all, setAll] = useState(false);
  const shown = all ? g.list : g.list.slice(0, TOP);
  return (
    <section className={'bk-pg' + (g.me ? ' me' : '')} aria-label={g.title}>
      <div className="bk-pgh">
        <span className="bk-pgh-t">
          {g.discs.map(function (d, i) {
            return <TeamDisc key={d + i} abbrev={d} className={'bk-disc xs' + (g.me && i === 0 ? ' me' : '')} />;
          })}
          <span className="bk-tt">
            <b>{g.title}</b>
            <small className={g.me ? 'pk' : ''}>{g.sub}</small>
          </span>
        </span>
      </div>
      {shown.map(function (pl) {
        return (
          <Row
            key={pl.player_id}
            pl={pl}
            chip={props.chip}
            stateOf={props.stateOf}
            onTap={props.onTap}
            onOpenPlayer={props.onOpenPlayer}
            watchOnly={props.watchOnly}
          />
        );
      })}
      {g.list.length > TOP ? (
        <button
          type="button"
          className="bk-pgc"
          onClick={function () {
            setAll(!all);
          }}
          aria-expanded={all ? 'true' : 'false'}
        >
          {all ? 'Show the top ' + TOP : 'Show all ' + g.list.length + ' players'}
          <em>{all ? '' : g.list.length - TOP + ' more'}</em>
        </button>
      ) : null}
    </section>
  );
}

// The laptop table (LapPlayers-1280): one row per player, four stat columns.
const TABLE_COLS = [
  { key: 'points', label: 'Points' },
  { key: 'yards', label: 'Yards' },
  { key: 'tdsk', label: 'TDs · kicks' },
  { key: 'catches', label: 'Catches' },
];

function tableMarket(col, pos) {
  if (col === 'tdsk') return pos === 'K' ? 'fg50' : chipMarket('tds', pos);
  return chipMarket(col, pos);
}

function PlayerTable(props) {
  return (
    <table className="bk-ptable">
      <thead>
        <tr>
          <th scope="col">Player</th>
          {TABLE_COLS.map(function (c) {
            return (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {props.groups.map(function (g) {
          return [
            <tr key={g.key} className={'gh' + (g.me ? ' me' : '')}>
              <td colSpan={TABLE_COLS.length + 1}>
                {g.title}
                {g.sub ? <span> · {g.sub}</span> : null}
              </td>
            </tr>,
          ].concat(
            g.list.map(function (pl) {
              return (
                <tr key={g.key + pl.player_id}>
                  <td>
                    <span className="bk-who">
                      <span className={'bk-pos' + (pl.own_player ? ' me' : '')}>{pl.pos}</span>
                      <button
                        type="button"
                        className="bk-pn"
                        aria-label={'All bets on ' + pl.name}
                        onClick={function () {
                          props.onOpenPlayer(pl);
                        }}
                      >
                        <b>{pl.name}</b>
                        <span>{subLine(pl)}</span>
                      </button>
                    </span>
                  </td>
                  {TABLE_COLS.map(function (c) {
                    return (
                      <td key={c.key}>
                        <span className="bk-pr2">
                          <OU pl={pl} market={tableMarket(c.key, pl.pos)} stateOf={props.stateOf} onTap={props.onTap} watchOnly={props.watchOnly} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })
          );
        })}
      </tbody>
    </table>
  );
}

// Every bet on one player (PlayerSheet-390).
export function PlayerBets(props) {
  const pl = props.pl;
  const props2 = PROP_ORDER.map(function (m) {
    return propFor(pl, m);
  }).filter(Boolean);
  return (
    <div className="bk-slip">
      <div className="bk-pick">
        <span className={'bk-pos' + (pl.own_player ? ' me' : '')}>{pl.pos}</span>
        <span className="bk-pick-t">
          <b>{pl.name}</b>
          <span>{subLine(pl)}</span>
        </span>
      </div>
      {pl.own_player ? (
        <div className="bk-why">
          <IconBan />
          <span>
            <b>Your player.</b> Pete&rsquo;s Picks: you can take the overs only.
          </span>
        </div>
      ) : null}
      {props2.map(function (prop) {
        return (
          <div className="bk-mkt" key={prop.prop_id}>
            <span className="bk-mkt-lb">
              {propLabel(prop.market)}
              <span>Projected {lineText(prop.projection, false)}</span>
            </span>
            <OU pl={pl} market={prop.market} stateOf={props.stateOf} onTap={props.onTap} watchOnly={props.watchOnly} />
          </div>
        );
      })}
    </div>
  );
}

export default function BookPlayers(props) {
  const data = props.data;
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('All');
  const [group, setGroup] = useState('matchup');
  const [sort, setSort] = useState('proj');
  const [chip, setChip] = useState('points');

  const players = useMemo(
    function () {
      const needle = q.trim().toLowerCase();
      return ((data && data.players) || []).filter(function (p) {
        if (pos !== 'All' && p.pos !== pos) return false;
        if (needle && String(p.name).toLowerCase().indexOf(needle) < 0) return false;
        return true;
      });
    },
    [data, q, pos]
  );

  const groups = useMemo(
    function () {
      return buildGroups(players, group, sort, props.board, props.teamsById);
    },
    [players, group, sort, props.board, props.teamsById]
  );

  if (props.error) return <p className="empty-note">Couldn&apos;t load the player lines: {props.error}</p>;
  if (!data || !(data.players || []).length) {
    return <p className="empty-note">No player lines are up for Week {props.board.week}. They post when the week opens, for players on an active roster with a projection.</p>;
  }

  return (
    <div className="bk-players">
      <div className="bk-tools">
        <label className="bk-srch">
          <IconSearch />
          <input
            aria-label="Search players"
            placeholder="Search players"
            value={q}
            onChange={function (e) {
              setQ(e.target.value);
            }}
          />
        </label>
        <div className="bk-posf" role="group" aria-label="Position">
          {POSITIONS.map(function (p) {
            return (
              <button
                key={p}
                type="button"
                className={pos === p ? 'on' : ''}
                aria-pressed={pos === p ? 'true' : 'false'}
                onClick={function () {
                  setPos(p);
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
        <div className="bk-srt">
          <label className="bk-sel">
            <small>Group</small>
            <select
              aria-label="Group players"
              value={group}
              onChange={function (e) {
                setGroup(e.target.value);
              }}
            >
              <option value="matchup">By matchup</option>
              <option value="team">By team</option>
            </select>
          </label>
          <label className="bk-sel">
            <small>Sort</small>
            <select
              aria-label="Sort players"
              value={sort}
              onChange={function (e) {
                setSort(e.target.value);
              }}
            >
              <option value="proj">Projection</option>
              <option value="name">Name</option>
              <option value="kickoff">Kickoff</option>
            </select>
          </label>
        </div>
      </div>
      {props.wide ? (
        groups.length ? (
          <PlayerTable groups={groups} stateOf={props.stateOf} onTap={props.onTap} onOpenPlayer={props.onOpenPlayer} watchOnly={props.watchOnly} />
        ) : (
          <p className="bk-mut bk-small">No players match.</p>
        )
      ) : (
        <>
          <div className="bk-statc" role="tablist" aria-label="Stat">
            {STAT_CHIPS.map(function (c) {
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  className={chip === c.key ? 'on' : ''}
                  aria-selected={chip === c.key ? 'true' : 'false'}
                  onClick={function () {
                    setChip(c.key);
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {groups.length ? (
            groups.map(function (g) {
              return (
                <GroupCard
                  key={g.key + ':' + chip}
                  g={g}
                  chip={chip}
                  stateOf={props.stateOf}
                  onTap={props.onTap}
                  onOpenPlayer={props.onOpenPlayer}
                  watchOnly={props.watchOnly}
                />
              );
            })
          ) : (
            <p className="bk-mut bk-small">No players match.</p>
          )}
        </>
      )}
    </div>
  );
}
