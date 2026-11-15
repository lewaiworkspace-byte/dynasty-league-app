'use client';

import { useMemo, useState } from 'react';
import ExplainButton from '../../components/ExplainButton';
import { formatCents } from '../../lib/formatMoney';
import { formatMonthDay, formatShortDateTime } from '../../lib/formatDate';
import BookBoard from './BookBoard';
import { BookBets, BookAccount, BookRecords, BookHouse, BookClosed } from './BookPanels';
import { IconLeft, IconRight } from './bookIcons';

/**
 * THE BOOK'S FRAME -- UI test batch 24, November 15, 2026 (test site only).
 *
 * In the approved order (handoff §2): the week pager, the Book's own header (the
 * betting logo, "The Book", "Owner Cash only · no real money" -- no big page
 * title, app-wide), the pills Board · My bets · Account · Records, then on the
 * Board the account strip and the bet-type tabs Games · Players (Later) ·
 * Futures (Later), then the view. The House opens from the Account view's link
 * card and lights Account.
 *
 * It draws what the database sent (book_week_board and the view's own read) and
 * decides nothing. Every link is a server round trip (page.js).
 */

export function bookHref(view, params) {
  const q = ['view=' + encodeURIComponent(view || 'board')];
  const p = params || {};
  Object.keys(p).forEach(function (k) {
    if (p[k] !== null && p[k] !== undefined && p[k] !== '') q.push(k + '=' + encodeURIComponent(p[k]));
  });
  return '/book?' + q.join('&');
}

function WeekPager(props) {
  const board = props.board;
  const weeks = (board.weeks || []).slice().sort(function (a, b) {
    return a.week - b.week;
  });
  const i = weeks.findIndex(function (w) {
    return w.week === board.week;
  });
  const cur = i >= 0 ? weeks[i] : null;
  const prev = i > 0 ? weeks[i - 1] : null;
  const next = i >= 0 && i < weeks.length - 1 ? weeks[i + 1] : null;
  // The arrows always open the Board for that week: only the Board is per week.
  const linkView = 'board';

  let sub = '';
  if (cur) {
    sub = formatMonthDay(cur.first_game_at) + '–' + formatMonthDay(cur.last_game_at);
    if (cur.playoffs) sub += ' · Playoffs';
    else if (!cur.market_open && cur.opens_at) sub += ' · Lines post ' + formatShortDateTime(cur.opens_at);
  }

  return (
    <div className="bk-wkp">
      {prev ? (
        <a className="bk-arr" href={bookHref(linkView, { week: prev.week })} aria-label={'Week ' + prev.week}>
          <IconLeft />
        </a>
      ) : (
        <span className="bk-arr is-off" aria-hidden="true">
          <IconLeft />
        </span>
      )}
      <div className="bk-wmid">
        <b>{board.week ? 'Week ' + board.week : 'The Book'}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
      {next ? (
        <a className="bk-arr" href={bookHref(linkView, { week: next.week })} aria-label={'Week ' + next.week}>
          <IconRight />
        </a>
      ) : (
        <span className="bk-arr is-off" aria-hidden="true">
          <IconRight />
        </span>
      )}
    </div>
  );
}

function BookHeader() {
  return (
    <div className="bk-head">
      <img className="bk-logo" src="/brand/betting-logo.webp" alt="" width="60" height="60" />
      <span className="bk-head-t">
        <b>The Book</b>
        <span>Owner Cash only · no real money</span>
      </span>
    </div>
  );
}

function Pills(props) {
  const on = props.view === 'house' ? 'account' : props.view;
  const items = [
    { key: 'board', label: 'Board' },
    { key: 'bets', label: 'My bets' },
    { key: 'account', label: 'Account' },
    { key: 'records', label: 'Records' },
  ];
  return (
    <nav className="bk-pills" aria-label="The Book">
      {items.map(function (it) {
        const params = it.key === 'board' ? { week: props.week } : {};
        return (
          <a
            key={it.key}
            href={bookHref(it.key, params)}
            className={on === it.key ? 'on' : ''}
            aria-current={on === it.key ? 'page' : undefined}
          >
            {it.label}
          </a>
        );
      })}
    </nav>
  );
}

export function AccountStrip(props) {
  const acct = props.board.account;
  const lim = props.board.limits || {};
  const rules = props.board.rules || {};
  const playoffs = Boolean(lim.playoffs);
  const pct = Number(lim.limit) > 0 ? Math.min(100, (Number(lim.staked) / Number(lim.limit)) * 100) : Number(lim.staked) > 0 ? 100 : 0;
  const half = Math.round(Number(rules.weekly_stake_pct || 0.5) * 100);
  return (
    <div className="bk-acs edfl-explain-host">
      <div>
        <span>
          Balance
          <ExplainButton label="How your balance is worked out">
            <ul>
              <li>Money in your betting account that isn&apos;t riding on an open bet.</li>
              <li>A stake leaves your balance when you place the bet and comes back with the winnings when it settles.</li>
            </ul>
          </ExplainButton>
        </span>
        <b>{acct ? formatCents(acct.balance) : '—'}</b>
      </div>
      <div>
        <span>
          {playoffs ? 'Weekly limit' : 'Left this week'}
          <ExplainButton label="How the weekly limit works">
            <ul>
              <li>
                Each week you can stake up to {half}% of everything in your betting account when the week opens,
                Tuesday at 12:00 AM. Money riding on open bets counts toward that total.
              </li>
              <li>Money you add, or win, after Tuesday counts from the next Tuesday.</li>
              <li>Futures and season-long player bets count too. Pre-season counts as one week.</li>
              <li>There is no weekly limit in the playoffs.</li>
            </ul>
          </ExplainButton>
        </span>
        <b>{playoffs ? 'None' : formatCents(lim.left)}</b>
        {playoffs ? (
          <em className="bk-acs-sub">playoffs</em>
        ) : (
          <span
            className="bk-acs-bar"
            role="img"
            aria-label={formatCents(lim.staked) + ' of ' + formatCents(lim.limit) + ' staked this week'}
          >
            <i style={{ width: pct + '%' }} />
          </span>
        )}
      </div>
      <div>
        <span>
          Max win
          <ExplainButton label="How the max win works">
            <ul>
              <li>To win = stake × 100 ÷ price for a minus price, or stake × price ÷ 100 for a plus price.</li>
              <li>
                Before the playoffs no single bet wins more than {formatCents(rules.max_win_single)}. A bigger stake is
                trimmed to the one that wins the most.
              </li>
              <li>If you lose, the stake goes to the House.</li>
            </ul>
          </ExplainButton>
        </span>
        <b>{playoffs ? 'None' : formatCents(lim.max_win_single)}</b>
      </div>
    </div>
  );
}

function Kinds(props) {
  const items = [
    { key: 'games', label: 'Games' },
    { key: 'players', label: 'Players', later: true },
    { key: 'futures', label: 'Futures', later: true },
  ];
  return (
    <div className="bk-kinds" role="tablist" aria-label="Kinds of bet">
      {items.map(function (it) {
        const on = props.kind === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on ? 'true' : 'false'}
            className={(on ? 'on' : '') + (it.later ? ' dim' : '')}
            onClick={function () {
              props.setKind(it.key);
            }}
          >
            {it.label}
            {it.later ? <em>Later</em> : null}
          </button>
        );
      })}
    </div>
  );
}

function Later(props) {
  const rules = props.rules || {};
  const caps = rules.max_win_parlay || {};
  return (
    <div className="bk-later">
      {props.kind === 'players' ? (
        <div className="bk-dashed">
          <span className="bk-chip soonx">Coming later</span>
          <h3>Player bets</h3>
          <p>EDFL-rostered players only: fantasy points, yards, touchdowns and receptions. In your own matchup, your own players take overs only.</p>
        </div>
      ) : (
        <div className="bk-dashed">
          <span className="bk-chip soonx">Coming later</span>
          <h3>Futures</h3>
          <p>Championship odds from pre-season to the playoffs, and make-the-playoffs through Week 8.</p>
        </div>
      )}
      <div className="bk-dashed">
        <span className="bk-chip soonx">Coming later</span>
        <h3>Parlays</h3>
        <p>Up to 5 legs. The most a parlay can win:</p>
        <ul className="bk-caps">
          {Object.keys(caps)
            .sort()
            .map(function (k) {
              return (
                <li key={k}>
                  <span>{k} legs</span>
                  <b>{formatCents(caps[k])}</b>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}

export default function BookView(props) {
  const board = props.board;
  const view = props.view;
  const [kind, setKind] = useState('games');

  const teamsById = useMemo(
    function () {
      const m = {};
      (props.teams || []).forEach(function (t) {
        m[t.id] = t;
      });
      return m;
    },
    [props.teams]
  );

  const closed = !board.book_open;

  let body = null;
  if (props.extraError) {
    body = <p className="empty-note">Couldn&apos;t load this part of the Book: {props.extraError}</p>;
  } else if (view === 'bets') {
    body = <BookBets board={board} bets={props.extra.bets || []} teamsById={teamsById} filter={props.filter} />;
  } else if (view === 'account') {
    body = <BookAccount board={board} endNow={props.extra.endNow || null} observer={props.observer} />;
  } else if (view === 'records') {
    body = (
      <BookRecords
        board={board}
        ats={props.extra.ats || []}
        games={props.extra.games || []}
        teamsById={teamsById}
        teams={props.teams || []}
        team={props.team}
      />
    );
  } else if (view === 'house') {
    body = <BookHouse board={board} history={props.extra.history || []} />;
  } else if (closed) {
    body = <BookClosed board={board} />;
  } else {
    body = (
      <>
        <AccountStrip board={board} />
        <Kinds kind={kind} setKind={setKind} />
        {kind === 'games' ? (
          <BookBoard board={board} teamsById={teamsById} observer={props.observer} />
        ) : (
          <Later kind={kind} rules={board.rules} />
        )}
      </>
    );
  }

  return (
    <div className="bk-root">
      {view === 'board' || view === 'bets' || view === 'account' ? <WeekPager board={board} view={view} /> : null}
      <BookHeader />
      <Pills view={view} week={view === 'board' ? board.week : null} />
      {body}
    </div>
  );
}
