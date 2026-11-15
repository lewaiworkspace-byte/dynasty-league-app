'use client';

import { useState, useTransition } from 'react';
import ExplainButton from '../../components/ExplainButton';
import TeamDisc from '../../components/TeamDisc';
import { formatCents, formatCentsDelta } from '../../lib/formatMoney';
import { formatKickoff } from '../../lib/formatDate';
import { placeTicket } from './actions';
import {
  americanOf,
  capFor,
  decimalOf,
  legGame,
  legName,
  lineText,
  parlayDecimal,
  parlayMaxStake,
  parlayToWin,
  priceText,
  refusalText,
  smallest,
} from './bookFormat';
import { IconCheck, IconPlus, IconWarn, IconX } from './bookIcons';

/**
 * THE PARLAY TRAY AND THE PARLAY SLIP -- UI test batch 25, November 15, 2026.
 *
 * Lewis's Phase 2 Book canvas (YLHTHMMNbmi7fwWyLvRND6), option B: "Add to a parlay"
 * on a single slip starts the tray; while the tray holds a leg, tapping a price
 * adds or removes that leg, and a price that can't join is greyed with its reason
 * (legBlock, bookFormat.js). The tray rides above the office row on a phone; from
 * 1024px the parlay slip is docked on the right instead (LapBets-1280).
 *
 * The slip, top to bottom (ParSlip-390): the legs with a remove button, Add a leg,
 * the combined price, stake and to-win with the quick stakes, the max-win ladder
 * (1 to 5 legs, this parlay's row teal, the 4-5 rows in the Reserve colour), the
 * weekly-limit bar, Balance after, Backed by, Locks, and Place parlay. Max = the
 * least of the cap stake, the balance, what is left this week and what the House
 * or the Longshot Reserve can cover. Every figure before placing is a mirror;
 * book_place_ticket's answer replaces it.
 */

const QUICK = [10, 25, 50];

export function legSpec(c) {
  return c.kind === 'prop' ? { prop_id: c.prop_id, side: c.side } : { line_id: c.line_id, market: c.market, side: c.side };
}

// The disc (a game leg) or the position square (a player leg) at a leg's left.
export function LegMark(props) {
  const c = props.c;
  if (c.kind === 'prop') return <span className={'bk-pos sm' + (c.own_player ? ' me' : '')}>{c.pos}</span>;
  return <TeamDisc abbrev={c.disc} className="bk-disc xs" />;
}

function backers(n) {
  return n >= 4 ? 'reserve' : 'house';
}

export function Tray(props) {
  const legs = props.legs;
  const n = legs.length;
  const rules = props.board.rules || {};
  const playoffs = Boolean((props.board.limits || {}).playoffs);
  const price = n >= 2 ? americanOf(parlayDecimal(legs)) : null;
  const cap = n >= 2 ? capFor(n, rules, playoffs) : null;
  const sub =
    n < 2
      ? 'Add one more leg to make a parlay'
      : (cap ? 'Max win ' + formatCents(cap) : 'No max win in the playoffs') + ' · ' + (backers(n) === 'reserve' ? 'Longshot Reserve' : 'House');
  return (
    <button type="button" className={'bk-tray' + (n >= 5 ? ' full' : '')} onClick={props.onOpen} aria-label={'Open parlay, ' + n + (n === 1 ? ' leg' : ' legs')}>
      <span className="bk-tray-n">{n}</span>
      <span className="bk-tray-m">
        <b>
          Parlay · {n} {n === 1 ? 'leg' : 'legs'}
          {price !== null ? ' · ' + priceText(price) : ''}
        </b>
        <span>{sub}</span>
      </span>
      <span className="bk-tray-o">Open</span>
    </button>
  );
}

function Ladder(props) {
  const rules = props.rules || {};
  const rows = [1, 2, 3, 4, 5].map(function (k) {
    return { k: k, cap: capFor(k, rules, false) };
  });
  const top = rows[4].cap || 1;
  return (
    <div className="bk-panel bk-ladder edfl-explain-host">
      <h3>
        Max win by legs
        <ExplainButton label="How the parlay max win works">
          <ul>
            <li>
              {formatCents(rows[1].cap)} for two legs, {formatCents(rows[2].cap)} for three, {formatCents(rows[3].cap)} for four,{' '}
              {formatCents(rows[4].cap)} for five. One bet alone wins at most {formatCents(rows[0].cap)}.
            </li>
            <li>No max in the playoffs.</li>
            <li>The Longshot Reserve backs 4- and 5-leg parlays; the House backs the rest.</li>
          </ul>
        </ExplainButton>
      </h3>
      <div
        className="bk-cl"
        role="img"
        aria-label={
          'Max win: ' +
          rows
            .map(function (r) {
              return r.k + (r.k === 1 ? ' leg ' : ' legs ') + formatCents(r.cap);
            })
            .join(', ')
        }
      >
        {rows.map(function (r) {
          return (
            <div key={r.k} className={r.k === props.n ? 'on' : ''}>
              <span>
                {r.k} {r.k === 1 ? 'leg' : 'legs'}
              </span>
              <span>
                <i className={r.k >= 4 ? 'bk-res' : 'bk-tr2'} style={{ width: ((r.cap || 0) / top) * 100 + '%' }} />
              </span>
              <b>{formatCents(r.cap)}</b>
            </div>
          );
        })}
      </div>
      <div className="bk-key">
        <span>
          <i className="h" />
          Backed by the House
        </span>
        <span>
          <i className="r" />
          Backed by the Longshot Reserve
        </span>
      </div>
      <p className="bk-ladder-p">
        {props.win > 0
          ? 'This parlay wins ' + formatCents(props.win) + ' of its ' + formatCents(props.cap) + ' max.'
          : 'This parlay can win up to ' + formatCents(props.cap) + '.'}{' '}
        More legs, bigger max.
      </p>
    </div>
  );
}

export function ParlaySlip(props) {
  const legs = props.legs;
  const n = legs.length;
  const board = props.board;
  const lim = board.limits || {};
  const rules = board.rules || {};
  const acct = board.account;
  const house = board.house || {};
  const playoffs = Boolean(lim.playoffs);
  const balance = acct ? Number(acct.balance) : 0;
  const left = playoffs ? null : Number(lim.left);
  const pot = backers(n);
  const room = pot === 'reserve' ? Number(house.reserve_room || 0) : Number(house.room || 0);
  const cap = n >= 2 ? capFor(n, rules, playoffs) : null;
  const dec = parlayDecimal(legs);
  const price = n >= 2 ? americanOf(dec) : null;
  const capStake = cap === null || n < 2 ? null : parlayMaxStake(cap, legs);
  const potStake = n >= 2 && room > 0 ? parlayMaxStake(room, legs) : 0;
  const maxAllowed = smallest([capStake, balance, left, potStake]) || 0;
  let lockAt = null;
  legs.forEach(function (l) {
    if (l.lock_at && (!lockAt || new Date(l.lock_at) < new Date(lockAt))) lockAt = l.lock_at;
  });

  const [stake, setStake] = useState('');
  const [trimmed, setTrimmed] = useState(null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const num = Number(stake);
  const valid = stake !== '' && isFinite(num) && num > 0 && Math.abs(Math.round(num * 100) - num * 100) < 1e-6;
  const win = valid && n >= 2 ? parlayToWin(num, legs) : 0;
  const noAccount = !acct || (Number(acct.deposited) === 0 && balance === 0);

  function setTyped(v) {
    setError(null);
    const clean = String(v).replace(/[^0-9.]/g, '');
    const x = Number(clean);
    if (cap !== null && capStake !== null && clean !== '' && isFinite(x) && parlayToWin(x, legs) > cap) {
      setTrimmed(clean);
      setStake(String(capStake));
      return;
    }
    setTrimmed(null);
    setStake(clean);
  }

  let msg = null;
  let blocked = false;
  if (props.watchOnly) {
    msg = { tone: 'info', head: 'Watching only', text: 'Your login is not linked to a team, so it can watch the Book but not bet.' };
    blocked = true;
  } else if (n < 2) {
    msg = { tone: 'info', head: 'Add one more leg', text: 'A parlay needs at least two legs. Tap Add a leg, then tap a price on the board.' };
    blocked = true;
  } else if (noAccount) {
    msg = { tone: 'info', head: 'Open your betting account first', text: 'Move Owner Cash into the Book on the Account tab, then come back to bet.' };
    blocked = true;
  } else if (!playoffs && left !== null && left <= 0) {
    msg = { tone: 'warn', head: 'This week’s limit is used up', text: 'It resets when next week’s lines go up on Tuesday.' };
    blocked = true;
  } else if (trimmed !== null) {
    msg = {
      tone: 'warn',
      head: 'Trimmed to ' + formatCents(capStake),
      text: 'You typed $' + trimmed + ', but a ' + n + '-leg parlay can win at most ' + formatCents(cap) + '. ' + formatCents(capStake) + ' already wins the max.',
    };
  }

  let over = null;
  if (!blocked && valid) {
    if (num > balance) over = { tone: 'bad', head: 'More than your balance', text: 'You have ' + formatCents(balance) + ' free to bet.' };
    else if (left !== null && num > left) over = { tone: 'bad', head: 'Over this week’s limit', text: 'You have ' + formatCents(left) + ' left to stake this week.' };
    else if (win > room) {
      const who = pot === 'reserve' ? 'The Longshot Reserve' : 'The House';
      over = {
        tone: 'warn',
        head: who + ' can’t cover this',
        text:
          (pot === 'reserve'
            ? 'It backs 4- and 5-leg parlays and has ' + formatCents(room) + ' free.'
            : 'It keeps ' + formatCents(house.house_floor) + ' back and has ' + formatCents(room) + ' free.') +
          ' Most it can take: ' +
          formatCents(potStake) +
          ' (wins ' +
          formatCents(parlayToWin(potStake, legs)) +
          ').',
        fix: potStake,
      };
    }
  }

  const shown = over || (error ? { tone: 'bad', head: 'Not placed', text: error } : null) || msg;
  const canPlace = !blocked && valid && !over && !pending;

  function place(amount) {
    setError(null);
    startTransition(async function () {
      const r = await placeTicket(
        legs.map(function (l) {
          return legSpec(l);
        }),
        amount
      );
      if (r && r.ok) props.onPlaced(r);
      else {
        if (r && r.reason === 'line_moved') props.onRefresh();
        setError(r && r.reason === 'error' ? r.message : refusalText(r, formatCents));
      }
    });
  }

  const stakedNow = Number(lim.staked || 0);
  const limitAll = Number(lim.limit || 0);
  const stakedAfter = valid ? (Math.round(stakedNow * 100) + Math.round(num * 100)) / 100 : stakedNow;
  const balanceAfter = valid ? (Math.round(balance * 100) - Math.round(num * 100)) / 100 : balance;
  const pctNow = limitAll > 0 ? Math.min(100, (stakedNow / limitAll) * 100) : 0;
  const pctThis = limitAll > 0 && valid ? Math.min(100 - pctNow, (num / limitAll) * 100) : 0;

  return (
    <div className="bk-slip bk-pslip">
      <div className="bk-legs">
        {legs.map(function (c) {
          return (
            <div className="bk-leg" key={c.key}>
              <LegMark c={c} />
              <span className="bk-leg-t">
                <b>{c.label}</b>
                <span>{c.sub}</span>
              </span>
              <span className="bk-leg-p">{priceText(c.odds)}</span>
              <button
                type="button"
                className="bk-leg-x"
                aria-label={'Remove ' + c.label}
                onClick={function () {
                  props.onRemove(c);
                }}
              >
                <IconX />
              </button>
            </div>
          );
        })}
      </div>
      {n < 5 ? (
        <button type="button" className="bk-addleg" onClick={props.onAddLeg}>
          <IconPlus />
          Add a leg
        </button>
      ) : null}
      {n >= 2 ? (
        <div className="bk-cprice edfl-explain-host">
          <span>
            Combined price
            <ExplainButton label="How the combined price is worked out">
              <ul>
                <li>Each leg&rsquo;s price becomes a multiplier: &minus;110 is 1.91, &minus;115 is 1.87, +150 is 2.50.</li>
                <li>Multiply them together; the result, less one, is what each dollar wins.</li>
              </ul>
            </ExplainButton>
          </span>
          <b>{priceText(price)}</b>
        </div>
      ) : null}
      {shown ? (
        <div className={'bk-msg ' + shown.tone} role={shown.tone === 'bad' ? 'alert' : 'status'}>
          {shown.tone === 'good' ? <IconCheck /> : <IconWarn />}
          <span>
            <b>{shown.head}</b>
            {shown.text}
          </span>
        </div>
      ) : null}
      <div className="bk-stk">
        <div className="bk-fld">
          <label htmlFor="bk-pstake">Stake</label>
          <div className={'bk-box' + (trimmed !== null ? ' cap' : '')}>
            <span className="bk-cur">$</span>
            <input
              id="bk-pstake"
              inputMode="decimal"
              autoComplete="off"
              value={stake}
              disabled={blocked}
              placeholder="0.00"
              onChange={function (e) {
                setTyped(e.target.value);
              }}
            />
          </div>
        </div>
        <div className="bk-fld edfl-explain-host">
          <span className="bk-lab">
            To win
            <ExplainButton label="How to-win is worked out">
              <ul>
                <li>Stake × (combined multiplier − 1), to the cent.</li>
                <li>{cap ? 'Capped at ' + formatCents(cap) + ' for ' + n + ' legs before the playoffs.' : 'There is no max win in the playoffs.'}</li>
                <li>Lose any leg and the whole stake goes to the House.</li>
              </ul>
            </ExplainButton>
          </span>
          <div className="bk-box ro" aria-live="polite">
            {formatCents(win)}
          </div>
        </div>
      </div>
      <div className="bk-qk">
        {QUICK.map(function (q) {
          return (
            <button
              key={q}
              type="button"
              disabled={blocked}
              className={valid && num === q ? 'on' : ''}
              onClick={function () {
                setTyped(String(q));
              }}
            >
              ${q}
            </button>
          );
        })}
        <button
          type="button"
          disabled={blocked || maxAllowed <= 0}
          className={valid && num === maxAllowed ? 'on' : ''}
          onClick={function () {
            setTrimmed(null);
            setError(null);
            setStake(maxAllowed.toFixed(2));
          }}
        >
          Max
        </button>
      </div>
      {n >= 2 && cap !== null ? (
        <Ladder rules={rules} n={n} cap={cap} win={win} />
      ) : n >= 2 ? (
        <div className="bk-capbar">
          <span className="bk-capbar-l">
            <span>No max win in the playoffs</span>
            <span>The House and Reserve still check they can cover it</span>
          </span>
        </div>
      ) : null}
      {!playoffs ? (
        <div className="bk-lim edfl-explain-host">
          <div className="bk-lim-bar" role="img" aria-label={formatCents(stakedAfter) + ' of ' + formatCents(limitAll) + ' staked this week after this parlay'}>
            <i className="was" style={{ width: pctNow + '%' }} />
            <i className="now" style={{ width: pctThis + '%' }} />
          </div>
          <div className="bk-lim-lb">
            <span>
              Uses {formatCents(valid ? num : 0)} of {formatCents(left)} left this week
              <ExplainButton label="How the weekly limit works">
                <ul>
                  <li>Every stake counts toward the week&rsquo;s half of your account, parlays included.</li>
                  <li>It is half of everything in your betting account when the week opens, Tuesday at 12:00 AM.</li>
                </ul>
              </ExplainButton>
            </span>
            <span>
              {formatCents(stakedAfter)} of {formatCents(limitAll)}
            </span>
          </div>
        </div>
      ) : null}
      <div className="bk-facts edfl-explain-host">
        <div>
          <span>Balance after</span>
          <b>{formatCents(balanceAfter)}</b>
        </div>
        <div>
          <span>
            Backed by
            <ExplainButton label="Who pays a winning parlay">
              <ul>
                <li>The House pays winning parlays of two or three legs and keeps a {formatCents(house.house_floor)} floor.</li>
                <li>The Longshot Reserve pays four- and five-leg parlays.</li>
              </ul>
            </ExplainButton>
          </span>
          <b>{n < 2 ? '—' : pot === 'reserve' ? 'Longshot Reserve' : 'The House'}</b>
        </div>
        <div>
          <span>
            Locks
            <ExplainButton label="When a parlay locks">
              <ul>
                <li>A parlay locks when the first game among its legs kicks off.</li>
                <li>Bets on a game that has started can&rsquo;t be added.</li>
              </ul>
            </ExplainButton>
          </span>
          <b>
            {lockAt ? formatKickoff(lockAt) : '—'} <em>(first kickoff among its legs)</em>
          </b>
        </div>
      </div>
      {over && over.fix > 0 ? (
        <button
          type="button"
          className="bk-go"
          disabled={pending}
          onClick={function () {
            setStake(over.fix.toFixed(2));
            place(over.fix);
          }}
        >
          {pending ? 'Placing…' : 'Place parlay · ' + formatCents(over.fix)}
        </button>
      ) : (
        <button
          type="button"
          className={'bk-go' + (canPlace ? '' : ' no')}
          disabled={!canPlace}
          onClick={function () {
            if (canPlace) place(num);
          }}
        >
          {pending ? 'Placing…' : 'Place parlay' + (valid ? ' · ' + formatCents(num) : '')}
        </button>
      )}
      <button type="button" className="bk-go2" onClick={props.onClear}>
        Clear the parlay
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- a parlay in My bets (MB-list-390)

function legIcon(l, nowMs) {
  if (l.result === 'won') return { cls: 'won', ch: '✓', rt: 'Won' };
  if (l.result === 'lost') return { cls: 'lost', ch: '✗', rt: 'Lost' };
  if (l.result === 'push') return { cls: 'push', ch: '–', rt: l.push_reason === 'trade' ? 'Push · trade' : l.push_reason === 'out' ? 'Push · Out' : 'Push' };
  if (l.lock_at && new Date(l.lock_at).getTime() <= nowMs) return { cls: 'live', ch: '●', rt: 'Live' };
  return { cls: 'wait', ch: '○', rt: l.lock_at ? formatKickoff(l.lock_at) : '' };
}

function legDetail(l, teamsById) {
  if (l.result === 'push') {
    if (l.push_reason === 'out') return 'Pushed: listed ' + (l.injury_at_lock || 'Out') + ' at kickoff';
    if (l.push_reason === 'trade') return 'Pushed: you traded with a team in this game';
    return 'Pushed';
  }
  if (l.kind === 'prop') {
    const g = l.graded_value !== null && l.graded_value !== undefined ? ' · finished with ' + lineText(l.graded_value, false) : '';
    return legGame(l, teamsById) + ' · took ' + priceText(l.odds) + g;
  }
  const took = l.market === 'moneyline' ? priceText(l.odds) : lineText(l.line_value, l.market === 'spread') + ' at ' + priceText(l.odds);
  return legGame(l, teamsById) + ' · took ' + took;
}

export function ParlayCard(props) {
  const t = props.t;
  const rules = props.rules || {};
  const legs = t.legs || [];
  const n = legs.length;
  const [nowMs] = useState(function () {
    return Date.now();
  });
  const pushed = legs.filter(function (l) {
    return l.result === 'push';
  });
  const alive = legs.filter(function (l) {
    return l.result !== 'push';
  });
  const m = alive.length;
  let note = null;
  if (pushed.length && t.status === 'open' && m >= 1) {
    let d = 1;
    alive.forEach(function (l) {
      d *= decimalOf(l.odds) || 1;
    });
    const was = capFor(n, rules, false);
    const now = capFor(m, rules, false);
    note =
      (m === 1 ? 'Now a single bet: ' : 'Now a ' + m + '-leg parlay: ') +
      priceText(t.odds) +
      ' → ' +
      priceText(americanOf(d) || alive[0].odds) +
      (now ? ', max win ' + formatCents(now) + (was ? ' (was ' + formatCents(was) + ')' : '') : '') +
      '.';
  }
  let amt;
  let sub;
  if (t.status === 'won') {
    amt = <b className="pos">{formatCentsDelta(t.paid !== null && t.paid !== undefined ? t.paid : t.to_win)}</b>;
    sub = 'stake ' + formatCents(t.stake);
  } else if (t.status === 'lost') {
    amt = <b className="neg">{'-' + formatCents(t.stake)}</b>;
    sub = 'to the House';
  } else if (t.status === 'push') {
    amt = <b>{formatCents(0)}</b>;
    sub = formatCents(t.stake) + ' back';
  } else {
    amt = <b>{formatCents(t.to_win)}</b>;
    sub = 'to win';
  }
  return (
    <article className="bk-pcard" aria-label={n + '-leg parlay'}>
      <div className="bk-pcard-top">
        <span className="bk-pcard-w">
          {n}-leg parlay {pushed.length && m >= 1 ? <em>· now {m === 1 ? '1 leg' : m + ' legs'}</em> : null}
        </span>
        <span className="bk-pcard-r">
          {amt}
          <span>{sub}</span>
        </span>
        <span className="bk-pcard-d">
          {props.showWeek ? 'Week ' + t.week + ' · ' : ''}
          {priceText(t.odds)} · stake {formatCents(t.stake)} · {t.pays_from === 'reserve' ? 'Longshot Reserve' : 'the House'}
          {t.status === 'open' && t.lock_at ? ' · locks ' + formatKickoff(t.lock_at) : ''}
          {t.status !== 'open' && t.settle_note ? ' · ' + t.settle_note : ''}
        </span>
      </div>
      {note ? <p className="bk-redu">{note}</p> : null}
      {legs.map(function (l) {
        const ic = legIcon(l, nowMs);
        const nm = legName(l, props.teamsById);
        return (
          <div className="bk-lr" key={l.leg_no}>
            <span className={'bk-lr-ic ' + ic.cls} aria-hidden="true">
              {ic.ch}
            </span>
            <span>
              <b className={l.result === 'push' ? 'x' : ''}>
                {nm.what} <em>{nm.kind}</em>
              </b>
              <span className="bk-lr-s">{legDetail(l, props.teamsById)}</span>
            </span>
            <span className="bk-lr-rt">{ic.rt}</span>
          </div>
        );
      })}
    </article>
  );
}
