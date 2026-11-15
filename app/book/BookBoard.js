'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ExplainButton from '../../components/ExplainButton';
import TeamDisc from '../../components/TeamDisc';
import { formatCents } from '../../lib/formatMoney';
import { formatKickoff, formatShortDateTime } from '../../lib/formatDate';
import { placeTicket } from './actions';
import BookPlayers, { PlayerBets } from './BookPlayers';
import { LegMark, ParlayCard, ParlaySlip, Tray, legSpec } from './BookParlay';
import {
  blockWhy,
  cardState,
  inHundred,
  legBlock,
  legGame,
  legName,
  lineText,
  marketLockAt,
  marketLocked,
  marketName,
  maxStakeFor,
  mySideOf,
  petesPicksAllows,
  pickFace,
  priceText,
  refusalText,
  smallest,
  toWin,
} from './bookFormat';
import { IconBan, IconCheck, IconDown, IconLock, IconPlus, IconWarn, IconX } from './bookIcons';

/**
 * THE BOARD AND THE BET SLIP -- UI test batch 24, November 15, 2026.
 *
 * Board 2 of Lewis's approved Book canvas: one card per matchup, your own first
 * then by lock time (book_week_board orders them). Your own card carries a teal
 * border and "Pete's Picks". Each card shows the face-off, the win-chance bar
 * (the fair probability the line was priced from, which is the two moneylines
 * with the House's edge removed) and, open, five markets of two buttons. Your
 * own matchup, any game you hold a bet on, and a game closing within the hour
 * open expanded; the rest show "See all lines" and toggle.
 *
 * A BUTTON'S FOUR STATES: selected (filled teal), already held (teal outline),
 * locked (dashed, lock, "Locked"), and blocked by Pete's Picks (dashed, struck
 * through, ban icon, "Your game"; tapping one opens "Can't take this bet" with
 * the bets you may take instead). Locks and Pete's Picks are MIRRORED here from
 * book_place_bet so the board can grey a button early; the database decides when
 * the bet is placed, and its refusal is what the owner reads.
 *
 * THE SLIP is a Sleeper-style bottom sheet on a phone (drag the top down, tap
 * outside or press X) and is docked on the right from 1024px, above "My open
 * bets". Stake and To win side by side, quick stakes $10 · $25 · $50 · Max, the
 * bar toward the max win, the facts, and the button. A stake that would win more
 * than the cap is trimmed to the stake that wins the cap ("Trimmed to $82.50");
 * a stake over what is left this week, over the balance, or over what the House
 * can cover shows a red or gold message and disables the button. In the playoffs
 * the cap bar reads "No max win in the playoffs · House floor still applies".
 * Every figure on the slip before the bet is placed is a mirror (bookFormat.js);
 * the database's answer replaces it.
 *
 * UI TEST BATCH 25 (Phase 2, canvas YLHTHMMNbmi7fwWyLvRND6). This file is now the
 * host for both bet-type tabs: Games (the cards below) and Players (BookPlayers.js)
 * share one slip, one tray and one parlay slip (BookParlay.js). A price is a
 * "candidate" (gameCand here, propCand in BookPlayers.js). With no parlay, a tap
 * opens the single slip, whose "Add to a parlay" is now live and starts the tray.
 * While the tray holds a leg, a tap adds or removes that leg, and a price that
 * can't join is greyed with its reason (legBlock); tapping it says why. Every bet,
 * single or parlay, is placed through book_place_ticket.
 */

const WIDE = '(min-width: 1024px)';
const QUICK = [10, 25, 50];

function heldKey(matchupId, market, side) {
  return 'g:' + matchupId + ':' + market + ':' + side;
}

// One game price as a slip/tray candidate.
function gameCand(m, market, side, myTeamId) {
  const face = pickFace(m, market, side);
  const own = Boolean(m.is_own);
  const mySide = own ? mySideOf(m, myTeamId) : null;
  const lockAt = marketLockAt(m, market);
  const disc = face.team ? face.team.abbrev : m[mySide || 'home'].abbrev;
  return {
    key: heldKey(m.matchup_id, market, side),
    heldKey: heldKey(m.matchup_id, market, side),
    kind: 'game',
    line_id: m.line_id,
    matchup_id: m.matchup_id,
    home_team_id: m.home.team_id,
    away_team_id: m.away.team_id,
    market: market,
    side: side,
    m: m,
    face: face,
    own: own,
    mySide: mySide,
    odds: face.odds,
    noLine: market === 'moneyline' && (face.odds === null || face.odds === undefined),
    locked: marketLocked(m, market),
    lock_at: lockAt,
    pete: own && !petesPicksAllows(m, mySide, market, side),
    disc: disc,
    label: face.label,
    sub: marketName(market, m) + ' · ' + (own ? 'your own matchup' : m.home.name + ' vs ' + m.away.name),
    lockWhy:
      market === 'home_total' || market === 'away_total'
        ? '(' + (face.team ? face.team.abbrev : '') + '’s first kickoff)'
        : '(first kickoff in this game)',
  };
}

function teamOrder(m, myTeamId) {
  // Left side: your team in your own matchup, otherwise the favourite.
  if (myTeamId && m.away.team_id === myTeamId) return ['away', 'home'];
  if (myTeamId && m.home.team_id === myTeamId) return ['home', 'away'];
  return m.favorite_team_id === m.away.team_id ? ['away', 'home'] : ['home', 'away'];
}

function stateChip(state) {
  if (state === 'locked')
    return (
      <span className="bk-chip lock">
        <IconLock /> Locked
      </span>
    );
  if (state === 'mostly')
    return (
      <span className="bk-chip lock">
        <IconLock /> Mostly locked
      </span>
    );
  if (state === 'soon')
    return (
      <span className="bk-chip soon">
        <i /> Closing soon
      </span>
    );
  return <span className="bk-chip open">Open</span>;
}

function OddsButton(props) {
  const st = props.state;
  let cls = 'bk-od';
  if (st === 'sel') cls += ' sel';
  if (st === 'held') cls += ' mine';
  if (st === 'locked') cls += ' lk';
  if (st === 'blocked') cls += ' off';
  if (st === 'none') cls += ' gap';
  if (st === 'in') cls += ' in';
  if (st === 'blk') cls += ' blk';
  const disabled = st === 'locked' || st === 'none' || props.watchOnly;
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={st === 'sel' || st === 'in' ? 'true' : 'false'}
      aria-disabled={st === 'blocked' ? 'true' : undefined}
      disabled={disabled}
      onClick={props.onClick}
      aria-label={props.aria}
    >
      <b>{props.label}</b>
      {st === 'locked' ? (
        <span title="Locked">
          <IconLock size={13} />
        </span>
      ) : st === 'blocked' ? (
        <span title="Your game: not allowed">
          <IconBan size={13} />
        </span>
      ) : st === 'none' ? (
        <span>Not offered</span>
      ) : st === 'blk' ? (
        <span>{props.reason}</span>
      ) : (
        <span>{priceText(props.odds)}</span>
      )}
    </button>
  );
}

function MatchCard(props) {
  const m = props.m;
  const myTeamId = props.myTeamId;
  const own = Boolean(m.is_own);
  const mySide = own ? mySideOf(m, myTeamId) : null;
  const order = teamOrder(m, myTeamId);
  const L = m[order[0]];
  const R = m[order[1]];
  const state = cardState(m, props.nowMs);
  const expanded = props.expanded;
  const fav = m.favorite_team_id;
  const spreadAbs = Math.abs(Number(m.spread_home));

  function rec(t) {
    const r = t.record || {};
    if (r.w === null || r.w === undefined) return '';
    return r.w + '–' + r.l + (r.t ? '–' + r.t : '');
  }

  function side(t) {
    return (
      <span className="bk-sd">
        <TeamDisc abbrev={t.abbrev} className={'bk-disc l' + (t.team_id === myTeamId ? ' me' : '')} />
        <span className="bk-nm">{t.name}</span>
        <span className="bk-rc">
          {rec(t)}
          {rec(t) ? ' · ' : ''}
          <span className={'bk-tag' + (t.team_id === fav ? ' fav' : '')}>{t.team_id === fav ? 'Fav' : 'Dog'}</span>
        </span>
      </span>
    );
  }

  function btn(market, side) {
    const c = gameCand(m, market, side, myTeamId);
    const ss = props.stateOf(c);
    const st = ss.st;
    const aria =
      c.label +
      ', ' +
      marketName(market, m) +
      (st === 'locked'
        ? ', locked'
        : st === 'blocked'
        ? ', not allowed in your own matchup'
        : st === 'blk'
        ? ', can’t join the parlay: ' + ss.reason
        : st === 'none'
        ? ', not offered'
        : ', ' + priceText(c.odds)) +
      (st === 'held' ? ', you hold this bet' : st === 'in' ? ', in your parlay' : '');
    return (
      <OddsButton
        state={st}
        reason={ss.reason}
        label={c.label}
        odds={c.odds}
        aria={aria}
        watchOnly={props.watchOnly}
        onClick={function () {
          if (st !== 'locked' && st !== 'none') props.onTap(c);
        }}
      />
    );
  }

  const sideKey = function (s) {
    return s === 'home' ? 'home' : 'away';
  };
  const rows = [
    { market: 'spread', a: sideKey(order[0]), b: sideKey(order[1]) },
    { market: 'moneyline', a: sideKey(order[0]), b: sideKey(order[1]) },
    { market: 'total', a: 'over', b: 'under' },
    { market: order[0] === 'home' ? 'home_total' : 'away_total', a: 'over', b: 'under' },
    { market: order[1] === 'home' ? 'home_total' : 'away_total', a: 'over', b: 'under' },
  ];

  let lockText;
  if (state === 'locked' || state === 'mostly') {
    const first = Number(new Date(m.home.lock_at)) <= Number(new Date(m.away.lock_at)) ? m.home.lock_at : m.away.lock_at;
    lockText = 'Locked ' + formatKickoff(first);
  } else if (state === 'soon') {
    const mins = Math.max(0, Math.round((new Date(m.lock_at).getTime() - props.nowMs) / 60000));
    lockText = 'Closes ' + formatKickoff(m.lock_at).replace(/^\w+ /, '') + ' · ' + mins + ' min';
  } else {
    lockText = 'Locks ' + formatKickoff(m.lock_at);
  }

  // A partly locked game says which part is still open.
  let partly = null;
  if (state === 'mostly') {
    const lockedT = m.home.locked ? m.home : m.away;
    const openT = m.home.locked ? m.away : m.home;
    partly = (
      <div className="bk-why">
        <IconLock />
        <span>
          The line, money and total locked when {lockedT.abbrev}&rsquo;s first player kicked off {formatKickoff(lockedT.lock_at)}.{' '}
          {openT.abbrev}&rsquo;s points stay open until {openT.abbrev}&rsquo;s first kickoff, {formatKickoff(openT.lock_at)}.
        </span>
      </div>
    );
  }

  const summary =
    (fav === L.team_id ? L : R).abbrev +
    ' ' +
    lineText(fav === L.team_id ? L.spread : R.spread, true) +
    ' · O/U ' +
    lineText(m.total, false) +
    ((fav === L.team_id ? L : R).ml ? ' · ' + priceText((fav === L.team_id ? L : R).ml) : '');

  return (
    <article className={'bk-cd' + (own ? ' me' : '')} aria-label={L.name + ' vs ' + R.name}>
      <div className="bk-cd-hd">
        <span className="bk-cd-st">
          {stateChip(state)}
          {own ? <span className="bk-ey">Pete&rsquo;s Picks</span> : null}
        </span>
        <span className="bk-mut">{lockText}</span>
      </div>
      <div className="bk-fo">
        {side(L)}
        <span className="bk-vs">
          {spreadAbs > 0 ? (
            <>
              favored by<b>{lineText(spreadAbs, false)}</b>
            </>
          ) : (
            <b>Pick&rsquo;em</b>
          )}
        </span>
        {side(R)}
      </div>
      <div
        className="bk-wbar"
        role="img"
        aria-label={L.abbrev + ' ' + inHundred(L.win_prob) + ', ' + R.abbrev + ' ' + inHundred(R.win_prob)}
      >
        <i className="l" style={{ width: Number(L.win_prob) * 100 + '%' }} />
        <i className="r" style={{ width: Number(R.win_prob) * 100 + '%' }} />
      </div>
      <div className="bk-wbl edfl-explain-host">
        <span>{inHundred(L.win_prob)}</span>
        <span className="bk-wbl-m">
          Win chance at these prices
          <ExplainButton label="How the win chance is worked out">
            <ul>
              <li>Taken from the two moneylines with the House&rsquo;s edge removed.</li>
              <li>Both come from the teams&rsquo; projected best-ball points when the line posted.</li>
            </ul>
          </ExplainButton>
        </span>
        <span>{inHundred(R.win_prob)}</span>
      </div>

      {expanded ? (
        <div className="bk-mks">
          {rows.map(function (r, idx) {
            return (
              <div className="bk-mk" key={r.market}>
                <span className="bk-lb edfl-explain-host">
                  {marketName(r.market, m)}
                  {idx === 0 ? (
                    <ExplainButton label="How prices work">
                      <ul>
                        <li>&minus;110 means you risk $110 to win $100. A plus price means $100 wins that amount.</li>
                        <li>Moneylines are priced from the spread.</li>
                      </ul>
                    </ExplainButton>
                  ) : null}
                </span>
                {btn(r.market, r.a)}
                {btn(r.market, r.b)}
              </div>
            );
          })}
          {own ? (
            <div className="bk-why">
              <IconBan />
              <span>
                <b>Pete&rsquo;s Picks.</b> Greyed bets aren&rsquo;t allowed: you can only back {m[mySide].name} and the overs.
              </span>
            </div>
          ) : null}
          {partly}
          {!own && state !== 'soon' && !props.forced ? (
            <button type="button" className="bk-tp" onClick={props.onToggle} aria-expanded="true">
              Fewer lines
              <span className="bk-tp-up">
                <IconDown />
              </span>
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" className="bk-tp" onClick={props.onToggle} aria-expanded="false">
          <span>
            See all lines <em>{summary}</em>
          </span>
          <IconDown />
        </button>
      )}
    </article>
  );
}

function Sheet(props) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const closeRef = useRef(null);
  const onClose = props.onClose;

  useEffect(
    function () {
      const html = document.documentElement;
      html.classList.add('bk-sheet-open');
      if (closeRef.current) closeRef.current.focus({ preventScroll: true });
      function onKey(e) {
        if (e.key === 'Escape' && !e.defaultPrevented) onClose();
      }
      document.addEventListener('keydown', onKey);
      return function () {
        html.classList.remove('bk-sheet-open');
        document.removeEventListener('keydown', onKey);
      };
    },
    [onClose]
  );

  const drag = {
    onPointerDown: function (e) {
      if (e.target.closest && e.target.closest('button, a, input')) return;
      dragRef.current = { y: e.clientY, dy: 0, id: e.pointerId };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is a nicety */
      }
    },
    onPointerMove: function (e) {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId) return;
      d.dy = Math.max(0, e.clientY - d.y);
      if (panelRef.current) {
        panelRef.current.style.transition = 'none';
        panelRef.current.style.transform = 'translateY(' + d.dy + 'px)';
      }
    },
    onPointerUp: function (e) {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || d.id !== e.pointerId) return;
      if (d.dy > 100) {
        onClose();
        return;
      }
      if (panelRef.current) {
        panelRef.current.style.transition = 'transform 200ms ease-out';
        panelRef.current.style.transform = '';
      }
    },
    onPointerCancel: function () {
      dragRef.current = null;
      if (panelRef.current) panelRef.current.style.transform = '';
    },
  };

  return (
    <div className="bk-sheet-wrap">
      <div className="bk-scrim" aria-hidden="true" onClick={onClose} />
      <section className="bk-sheet" role="dialog" aria-modal="true" aria-label={props.title} ref={panelRef}>
        <div className="bk-shd" {...drag}>
          <span className="bk-grip" aria-hidden="true" />
          <div className="bk-shh">
            <h2>{props.title}</h2>
            <button type="button" className="bk-cls" aria-label="Close" onClick={onClose} ref={closeRef}>
              <IconX />
            </button>
          </div>
        </div>
        <div className="bk-shb">{props.children}</div>
      </section>
    </div>
  );
}

function PickRow(props) {
  const p = props.pick;
  return (
    <div className="bk-pick edfl-explain-host">
      {p.kind === 'prop' ? <span className={'bk-pos' + (p.own_player ? ' me' : '')}>{p.pos}</span> : <TeamDisc abbrev={p.disc} className="bk-disc" />}
      <span className="bk-pick-t">
        <b>{p.label}</b>
        <span>{p.sub}</span>
      </span>
      <span className="bk-pick-pr">
        {priceText(p.odds)}
        <span>Price</span>
      </span>
    </div>
  );
}

// The single slip, for a game price or a player price (Slip-player-390).
function Slip(props) {
  const p = props.pick;
  const board = props.board;
  const lim = board.limits || {};
  const acct = board.account;
  const playoffs = Boolean(lim.playoffs);
  const cap = playoffs ? null : Number(lim.max_win_single);
  const odds = p.odds;
  const balance = acct ? Number(acct.balance) : 0;
  const left = playoffs ? null : Number(lim.left);
  const room = board.house ? Number(board.house.room) : 0;
  const capStake = cap === null ? null : maxStakeFor(cap, odds);
  const houseStake = room > 0 ? maxStakeFor(room, odds) : 0;
  const maxAllowed = smallest([capStake, balance, left, houseStake]) || 0;

  const [stake, setStake] = useState('');
  const [trimmed, setTrimmed] = useState(null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const n = Number(stake);
  const valid = stake !== '' && isFinite(n) && n > 0 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
  const win = valid ? toWin(n, odds) : 0;
  const noAccount = !acct || (Number(acct.deposited) === 0 && balance === 0);

  function setTyped(v) {
    setError(null);
    const clean = String(v).replace(/[^0-9.]/g, '');
    const num = Number(clean);
    if (cap !== null && clean !== '' && isFinite(num) && toWin(num, odds) > cap) {
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
  } else if (noAccount) {
    msg = { tone: 'info', head: 'Open your betting account first', text: 'Move Owner Cash into the Book on the Account tab, then come back to bet.' };
    blocked = true;
  } else if (!playoffs && left !== null && left <= 0) {
    msg = {
      tone: 'warn',
      head: 'This week’s limit is used up',
      text:
        'You’ve staked ' +
        formatCents(lim.staked) +
        ', half of the ' +
        formatCents(lim.basis) +
        ' you started the week with. Futures count too. It resets when next week’s lines go up on Tuesday.',
    };
    blocked = true;
  } else if (room <= 0) {
    msg = { tone: 'bad', head: 'The House can’t take bets right now', text: 'It keeps ' + formatCents(board.house.house_floor) + ' back and has no room left this week.' };
    blocked = true;
  } else if (trimmed !== null) {
    msg = {
      tone: 'warn',
      head: 'Trimmed to ' + formatCents(capStake),
      text: 'You typed $' + trimmed + ', but one bet can win at most ' + formatCents(cap) + '. ' + formatCents(capStake) + ' already wins the max.',
    };
  } else if (playoffs) {
    msg = { tone: 'good', head: 'Playoffs: no weekly limit, no max win', text: 'The House still checks it can cover every bet.' };
  }

  let over = null;
  if (!blocked && valid) {
    if (n > balance) over = { tone: 'bad', head: 'More than your balance', text: 'You have ' + formatCents(balance) + ' free to bet.' };
    else if (left !== null && n > left) over = { tone: 'bad', head: 'Over this week’s limit', text: 'You have ' + formatCents(left) + ' left to stake this week.' };
    else if (win > room)
      over = {
        tone: 'warn',
        head: 'The House can’t cover this bet right now',
        text:
          'It keeps ' +
          formatCents(board.house.house_floor) +
          ' back and can only risk ' +
          formatCents(room) +
          ' more. The most this bet can take is ' +
          formatCents(houseStake) +
          ' to win ' +
          formatCents(toWin(houseStake, odds)) +
          '.',
        fix: houseStake,
      };
  }

  const shown = over || (error ? { tone: 'bad', head: 'Not placed', text: error } : null) || msg;
  const canPlace = !blocked && valid && !over && !pending;
  const stakedAfter = valid ? (Math.round(Number(lim.staked || 0) * 100) + Math.round(n * 100)) / 100 : Number(lim.staked || 0);
  const balanceAfter = valid ? (Math.round(balance * 100) - Math.round(n * 100)) / 100 : balance;

  function place() {
    if (!canPlace) return;
    setError(null);
    startTransition(async function () {
      const r = await placeTicket([legSpec(p)], n);
      if (r && r.ok) {
        props.onPlaced(p, r);
      } else {
        if (r && r.reason === 'line_moved') props.onRefresh();
        setError(r && r.reason === 'error' ? r.message : refusalText(r, formatCents));
      }
    });
  }

  const pctOfCap = cap ? Math.min(100, (win / cap) * 100) : 0;

  return (
    <div className="bk-slip">
      <PickRow pick={p} />
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
          <label htmlFor="bk-stake">Stake</label>
          <div className={'bk-box' + (trimmed !== null ? ' cap' : '')}>
            <span className="bk-cur">$</span>
            <input
              id="bk-stake"
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
            <ExplainButton label="How to win is worked out">
              <ul>
                <li>Stake × 100 ÷ price for a minus price, or stake × price ÷ 100 for a plus price, to the cent.</li>
                <li>{cap ? 'No single bet wins more than ' + formatCents(cap) + ' before the playoffs.' : 'There is no max win in the playoffs.'}</li>
                <li>If you lose, the stake goes to the House.</li>
                {p.kind === 'prop' ? <li>If the player is listed IR, Out or PUP when his game kicks off, the bet is a push and the stake comes back.</li> : null}
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
              className={valid && n === q ? 'on' : ''}
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
          className={valid && n === maxAllowed ? 'on' : ''}
          onClick={function () {
            setTrimmed(null);
            setError(null);
            setStake(maxAllowed.toFixed(2));
          }}
        >
          Max
        </button>
      </div>
      {cap ? (
        <div className="bk-capbar">
          <span className="bk-capbar-t">
            <i style={{ width: pctOfCap + '%' }} />
          </span>
          <span className="bk-capbar-l">
            <span>
              {formatCents(win)} of {formatCents(cap)} max win
            </span>
            <span>{win >= cap ? 'Max reached' : Math.round(pctOfCap) + '%'}</span>
          </span>
        </div>
      ) : (
        <div className="bk-capbar">
          <span className="bk-capbar-l">
            <span>No max win in the playoffs</span>
            <span>House floor still applies</span>
          </span>
        </div>
      )}
      <div className="bk-facts edfl-explain-host">
        <div>
          <span>
            Staked this week
            <ExplainButton label="How the weekly limit works">
              <ul>
                <li>Up to half of everything in your betting account when the week opens, Tuesday at 12:00 AM, open bets included.</li>
                <li>Money you add or win after Tuesday counts from the next Tuesday. No limit in the playoffs.</li>
              </ul>
            </ExplainButton>
          </span>
          <b>{playoffs ? 'None in the playoffs' : formatCents(stakedAfter) + ' of ' + formatCents(lim.limit)}</b>
        </div>
        <div>
          <span>Balance after</span>
          <b>{formatCents(balanceAfter)}</b>
        </div>
        <div>
          <span>Locks</span>
          <b>
            {formatKickoff(p.lock_at)} <em>{p.lockWhy}</em>
          </b>
        </div>
      </div>
      {over && over.fix ? (
        <button
          type="button"
          className="bk-go"
          onClick={function () {
            setStake(over.fix.toFixed(2));
          }}
        >
          Bet {formatCents(over.fix)} instead
        </button>
      ) : (
        <button type="button" className={'bk-go' + (canPlace ? '' : ' no')} disabled={!canPlace} onClick={place}>
          {pending
            ? 'Placing…'
            : !playoffs && left !== null && left <= 0
            ? 'Weekly limit reached'
            : 'Place bet' + (valid ? ' · ' + formatCents(n) : '')}
        </button>
      )}
      <button
        type="button"
        className="bk-go2 bk-addpar"
        disabled={props.watchOnly}
        onClick={function () {
          props.onAddToParlay(p);
        }}
      >
        <IconPlus />
        Add to a parlay
      </button>
    </div>
  );
}

function PetesSheet(props) {
  const p = props.pick;
  const m = p.m;
  const mine = m[p.mySide];
  const opp = m[p.mySide === 'home' ? 'away' : 'home'];
  const allowed = [
    ['spread', p.mySide],
    ['moneyline', p.mySide],
    ['total', 'over'],
    [p.mySide === 'home' ? 'home_total' : 'away_total', 'over'],
  ].filter(function (x) {
    if (marketLocked(m, x[0])) return false;
    if (x[0] === 'moneyline' && !mine.ml) return false;
    return true;
  });
  return (
    <div className="bk-slip">
      <PickRow pick={p} />
      <div className="bk-msg bad" role="alert">
        <IconBan />
        <span>
          <b>Not allowed in your own matchup</b>
          The Pete Rose rule: when you play {opp.name}, you can only bet {mine.name} to win, to cover, the over on your
          points or the over on the total.
        </span>
      </div>
      {allowed.length ? <p className="bk-grp">You can bet instead</p> : null}
      <div className="bk-alts">
        {allowed.map(function (x) {
          const f = pickFace(m, x[0], x[1]);
          return (
            <button
              key={x[0]}
              type="button"
              className="bk-od h"
              onClick={function () {
                props.onTap(gameCand(m, x[0], x[1], props.myTeamId));
              }}
            >
              <b>{x[0] === 'moneyline' ? mine.abbrev + ' to win' : x[0].indexOf('_total') > 0 ? mine.abbrev + ' over ' + lineText(f.line, false) : f.label}</b>
              <span>{priceText(f.odds)}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="bk-go2" onClick={props.onClose}>
        Got it
      </button>
    </div>
  );
}

// Why a price can't be taken or can't join the parlay (Blk-why-390, Blk-full-390).
function WhySheet(props) {
  const c = props.c;
  return (
    <div className="bk-slip">
      <div className="bk-pick">
        <LegMark c={c} />
        <span className="bk-pick-t">
          <b>{c.label}</b>
          <span>{c.sub}</span>
        </span>
      </div>
      <div className="bk-msg bad" role="alert">
        <IconBan />
        <span>
          <b>{props.reason === 'Your player' || props.reason === 'Your game' ? 'Not allowed: ' + props.reason.toLowerCase() : 'Can’t join this parlay: ' + props.reason}</b>
          {blockWhy(props.reason)}
        </span>
      </div>
      <button type="button" className="bk-go2" onClick={props.onClose}>
        Got it
      </button>
    </div>
  );
}

export function OpenBets(props) {
  const open = (props.tickets || []).filter(function (t) {
    return t.status === 'open';
  });
  if (!open.length) return <p className="bk-mut bk-small">No open bets this week.</p>;
  return (
    <div className="bk-btl">
      {open.map(function (t) {
        if (t.kind === 'parlay') return <ParlayCard key={t.ticket_id} t={t} rules={props.rules} teamsById={props.teamsById} />;
        const leg = (t.legs && t.legs[0]) || {};
        const nm = legName(leg, props.teamsById);
        const took =
          leg.kind === 'prop' || leg.market !== 'moneyline'
            ? lineText(leg.line_value, leg.market === 'spread') + ' at ' + priceText(leg.odds)
            : priceText(leg.odds);
        return (
          <div className="bk-bt" key={t.ticket_id}>
            <span>
              <span className="bk-bt-w">
                {nm.what} <em>{nm.kind}</em>
              </span>
              <span className="bk-bt-d">
                {legGame(leg, props.teamsById)} · took {took}
                {t.lock_at ? ' · locks ' + formatKickoff(t.lock_at) : ''}
              </span>
            </span>
            <span className="bk-bt-r">
              <b>{formatCents(t.stake)}</b>
              <span>to win {formatCents(t.to_win)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function BookBoard(props) {
  const board = props.board;
  const kind = props.kind || 'games';
  const router = useRouter();
  const myTeamId = board.my_team_id || null;
  const watchOnly = props.observer || !myTeamId;
  const [nowMs] = useState(function () {
    return Date.now();
  });
  const [wide, setWide] = useState(false);
  const [pick, setPick] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [why, setWhy] = useState(null);
  const [toggled, setToggled] = useState({});
  const [toast, setToast] = useState(null);
  const [parlay, setParlay] = useState([]);
  const [parlayOpen, setParlayOpen] = useState(false);
  const [player, setPlayer] = useState(null);

  useEffect(function () {
    let mq;
    try {
      mq = window.matchMedia(WIDE);
    } catch (e) {
      return undefined;
    }
    const on = function () {
      setWide(mq.matches);
    };
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    return function () {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
    };
  }, []);

  useEffect(
    function () {
      if (!toast) return undefined;
      const t = setTimeout(function () {
        setToast(null);
      }, 4000);
      return function () {
        clearTimeout(t);
      };
    },
    [toast]
  );

  const matchups = useMemo(
    function () {
      const j = board.limits ? board.limits.juice : -110;
      return (board.matchups || []).map(function (m) {
        return Object.assign({}, m, { juice: j });
      });
    },
    [board]
  );

  const held = useMemo(
    function () {
      const h = {};
      (board.my_tickets || []).forEach(function (t) {
        if (t.status !== 'open' || t.kind === 'parlay') return;
        (t.legs || []).forEach(function (l) {
          if (l.kind === 'prop') h['p:' + l.player_id + ':' + l.market + ':' + l.side] = true;
          else h[heldKey(l.matchup_id, l.market, l.side)] = true;
        });
      });
      return h;
    },
    [board]
  );

  const stateOf = useCallback(
    function (c) {
      if (c.noLine) return { st: 'none' };
      if (c.locked) return { st: 'locked' };
      if (parlay.length) {
        if (
          parlay.some(function (l) {
            return l.key === c.key;
          })
        )
          return { st: 'in' };
        const r = legBlock(c, parlay);
        if (r) return { st: 'blk', reason: r };
        return { st: held[c.heldKey] ? 'held' : 'open' };
      }
      if (c.kind === 'game' && c.pete) return { st: 'blocked' };
      if (c.kind === 'prop' && c.own_player && c.side === 'under') return { st: 'blk', reason: 'Your player' };
      if (pick && pick.key === c.key) return { st: 'sel' };
      if (held[c.heldKey]) return { st: 'held' };
      return { st: 'open' };
    },
    [parlay, held, pick]
  );

  const onTap = useCallback(
    function (c) {
      if (watchOnly) return;
      if (parlay.length) {
        if (
          parlay.some(function (l) {
            return l.key === c.key;
          })
        ) {
          setParlay(
            parlay.filter(function (l) {
              return l.key !== c.key;
            })
          );
          return;
        }
        const r = legBlock(c, parlay);
        if (r) {
          setPlayer(null);
          setWhy({ c: c, reason: r });
          return;
        }
        setParlay(parlay.concat([c]));
        return;
      }
      setPlayer(null);
      setWhy(null);
      if (c.kind === 'game' && c.pete) {
        setPick(null);
        setBlocked(c);
        return;
      }
      if (c.kind === 'prop' && c.own_player && c.side === 'under') {
        setPick(null);
        setWhy({ c: c, reason: 'Your player' });
        return;
      }
      setBlocked(null);
      setPick(c);
    },
    [parlay, watchOnly]
  );

  const close = useCallback(function () {
    setPick(null);
    setBlocked(null);
    setWhy(null);
    setPlayer(null);
    setParlayOpen(false);
  }, []);
  const refresh = useCallback(
    function () {
      router.refresh();
    },
    [router]
  );
  const onPlaced = useCallback(
    function (p, r) {
      setPick(null);
      setToast('Bet placed · ' + p.label + ' · ' + formatCents(r.stake) + ' to win ' + formatCents(r.to_win));
      router.refresh();
    },
    [router]
  );
  const onAddToParlay = useCallback(function (p) {
    setPick(null);
    setParlay([p]);
    setToast('Parlay started · tap more prices to add legs');
  }, []);
  const onRemoveLeg = useCallback(
    function (c) {
      const next = parlay.filter(function (l) {
        return l.key !== c.key;
      });
      setParlay(next);
      if (!next.length) setParlayOpen(false);
    },
    [parlay]
  );
  const onClearParlay = useCallback(function () {
    setParlay([]);
    setParlayOpen(false);
  }, []);
  const onParlayPlaced = useCallback(
    function (r) {
      setParlay([]);
      setParlayOpen(false);
      setToast('Parlay placed · ' + r.legs + ' legs · ' + formatCents(r.stake) + ' to win ' + formatCents(r.to_win));
      router.refresh();
    },
    [router]
  );

  if (!board.market_open && board.opens_at) {
    return (
      <div className="bk-hero2">
        <h2>Week {board.week} opens Tuesday</h2>
        <p>Its lines post {formatShortDateTime(board.opens_at)}, right after the week&rsquo;s pay instant. Deposits made before then count toward that week&rsquo;s limit.</p>
      </div>
    );
  }

  const acct = board.account;
  const noAccount = !watchOnly && acct && Number(acct.deposited) === 0 && Number(acct.balance) === 0;
  const empty =
    !watchOnly && acct && Number(acct.deposited) > 0 && Number(acct.balance) <= 0 && Number(acct.deposit_room) <= 0 && Number(acct.in_open_bets) <= 0;
  const juice = board.limits ? board.limits.juice : -110;
  const capStake = board.limits && !board.limits.playoffs ? maxStakeFor(board.limits.max_win_single, juice) : null;

  let main;
  if (kind === 'players') {
    main = (
      <BookPlayers
        data={props.players}
        error={props.playersError}
        board={board}
        teamsById={props.teamsById}
        wide={wide}
        stateOf={stateOf}
        onTap={onTap}
        onOpenPlayer={function (pl) {
          setPick(null);
          setWhy(null);
          setPlayer(pl);
        }}
        watchOnly={watchOnly}
      />
    );
  } else if (kind === 'games') {
    if (!matchups.length) {
      main = <p className="empty-note">No lines are up for Week {board.week}. Lines post for a game until its first kickoff.</p>;
    } else {
      main = (
        <>
          <div className="bk-cards">
            {matchups.map(function (m) {
              const state = cardState(m, nowMs);
              const own = Boolean(m.is_own);
              const hasHeld = Object.keys(held).some(function (k) {
                return k.indexOf('g:' + m.matchup_id + ':') === 0;
              });
              const inParlay = parlay.some(function (l) {
                return l.kind === 'game' && l.matchup_id === m.matchup_id;
              });
              const forced = own || hasHeld || inParlay || state === 'soon';
              const t = toggled[m.matchup_id];
              const expanded = t === undefined ? forced : t;
              return (
                <MatchCard
                  key={m.matchup_id}
                  m={m}
                  myTeamId={myTeamId}
                  nowMs={nowMs}
                  expanded={expanded}
                  forced={own}
                  stateOf={stateOf}
                  watchOnly={watchOnly}
                  onTap={onTap}
                  onToggle={function () {
                    setToggled(function (prev) {
                      const n = Object.assign({}, prev);
                      n[m.matchup_id] = !expanded;
                      return n;
                    });
                  }}
                />
              );
            })}
          </div>
          <p className="bk-foot">
            Outlined = a bet you already hold.{' '}
            {capStake ? (
              <>
                Spreads and totals pay {priceText(juice)}: bet {formatCents(capStake)} to win {formatCents(board.limits.max_win_single)}.
              </>
            ) : (
              <>Spreads and totals pay {priceText(juice)}.</>
            )}
          </p>
        </>
      );
    }
  } else {
    main = props.later || null;
  }

  const banner = noAccount ? (
    <div className="bk-msg info">
      <IconWarn />
      <span>
        <b>Open your betting account to bet</b>
        Move Owner Cash into the Book on the <a href="/book?view=account">Account tab</a>. What you put in is the most you can lose this season.
      </span>
    </div>
  ) : empty ? (
    <div className="bk-msg info">
      <IconWarn />
      <span>
        <b>Your account is empty</b>
        You&rsquo;ve put in your full season limit, so you can&rsquo;t add more. The board stays open to watch.
      </span>
    </div>
  ) : watchOnly ? (
    <div className="bk-msg info">
      <IconWarn />
      <span>
        <b>Watching only</b>
        Your login is not linked to a team, so it can see the board but not bet.
      </span>
    </div>
  ) : null;

  const parlayBanner =
    parlay.length && kind !== 'futures' ? (
      <div className="bk-hid" role="status">
        <span>
          Building a parlay · {parlay.length} {parlay.length === 1 ? 'leg' : 'legs'}. Tap a price to add or remove it.
        </span>
        <button type="button" onClick={onClearParlay}>
          Clear
        </button>
      </div>
    ) : null;

  const slipBody = why ? (
    <WhySheet c={why.c} reason={why.reason} onClose={function () { setWhy(null); }} />
  ) : blocked ? (
    <PetesSheet pick={blocked} myTeamId={myTeamId} onTap={onTap} onClose={close} />
  ) : pick ? (
    <Slip key={pick.key} pick={pick} board={board} watchOnly={watchOnly} onPlaced={onPlaced} onRefresh={refresh} onAddToParlay={onAddToParlay} />
  ) : null;
  const slipTitle = why ? (why.reason === 'Your player' || why.reason === 'Your game' ? 'Can’t take this bet' : 'Can’t add this leg') : blocked ? 'Can’t take this bet' : 'Bet slip';

  const parlayBody = parlay.length ? (
    <ParlaySlip
      key={'par' + parlay.length}
      legs={parlay}
      board={board}
      watchOnly={watchOnly}
      onRemove={onRemoveLeg}
      onAddLeg={function () {
        setParlayOpen(false);
      }}
      onClear={onClearParlay}
      onPlaced={onParlayPlaced}
      onRefresh={refresh}
    />
  ) : null;
  const parlayTitle = 'Parlay · ' + parlay.length + (parlay.length === 1 ? ' leg' : ' legs');

  return (
    <div className={'bk-lay' + (parlay.length && !wide ? ' has-tray' : '')}>
      <div className="bk-main">
        {banner}
        {parlayBanner}
        {main}
      </div>
      {wide ? (
        <aside className="bk-dock-col" aria-label="Bet slip and open bets">
          {why || blocked ? (
            <div className="bk-dock">
              <div className="bk-shh">
                <h2>{slipTitle}</h2>
                <button type="button" className="bk-cls" aria-label="Close" onClick={function () { setWhy(null); setBlocked(null); }}>
                  <IconX />
                </button>
              </div>
              {slipBody}
            </div>
          ) : null}
          {parlay.length ? (
            <div className="bk-dock">
              <div className="bk-shh">
                <h2>{parlayTitle}</h2>
                <button type="button" className="bk-cls" aria-label="Clear the parlay" onClick={onClearParlay}>
                  <IconX />
                </button>
              </div>
              {parlayBody}
            </div>
          ) : !why && !blocked ? (
            <div className="bk-dock">
              <div className="bk-shh">
                <h2>Bet slip</h2>
                {slipBody ? (
                  <button type="button" className="bk-cls" aria-label="Clear the slip" onClick={close}>
                    <IconX />
                  </button>
                ) : null}
              </div>
              {slipBody || <p className="bk-mut bk-small">Tap a price on the board to start a bet.</p>}
            </div>
          ) : null}
          <div className="bk-dock">
            <h2>My open bets</h2>
            <OpenBets tickets={board.my_tickets} rules={board.rules} teamsById={props.teamsById} />
          </div>
        </aside>
      ) : slipBody ? (
        <Sheet title={slipTitle} onClose={why ? function () { setWhy(null); } : close}>
          {slipBody}
        </Sheet>
      ) : parlayOpen && parlayBody ? (
        <Sheet title={parlayTitle} onClose={function () { setParlayOpen(false); }}>
          {parlayBody}
        </Sheet>
      ) : null}
      {player ? (
        <Sheet title={player.name} onClose={function () { setPlayer(null); }}>
          <PlayerBets pl={player} stateOf={stateOf} onTap={onTap} watchOnly={watchOnly} />
        </Sheet>
      ) : null}
      {parlay.length && !wide && !parlayOpen && !slipBody && !player ? (
        <Tray
          legs={parlay}
          board={board}
          onOpen={function () {
            setParlayOpen(true);
          }}
        />
      ) : null}
      {toast ? (
        <div className="bk-toast" role="status">
          <IconCheck />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
