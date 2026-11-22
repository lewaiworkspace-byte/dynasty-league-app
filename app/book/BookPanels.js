'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ExplainButton from '../../components/ExplainButton';
import TeamDisc from '../../components/TeamDisc';
import { formatCents, formatCentsDelta } from '../../lib/formatMoney';
import { cashOutOfBook, depositToBook, previewCashOut } from './actions';
import { legGame, legName, lineText, priceText, refusalText, taxKept } from './bookFormat';
import { IconChevron } from './bookIcons';
import { OpenBets } from './BookBoard';
import { ParlayCard } from './BookParlay';

/**
 * THE BOOK'S OTHER VIEWS -- UI test batch 24, November 15, 2026.
 *
 * My bets (MyBets-390; batch 25: a parlay lists every leg, MB-list-390), Account (Account-390, with the open-account state
 * S-noacct and the cash-out), Records (ATS-league-390 and ATS-team-390), the
 * House (House-full-390, choice 1, open to every owner) and the closed Book
 * (S-dead). Every figure is the database's (book_week_board, book_my_bets,
 * book_cash_out_preview, book_ats, book_ats_games, book_house_history); the only
 * arithmetic here is a sum or difference of two of those figures for a caption,
 * worked in whole cents, and the tax curve drawn from its formula (the handoff:
 * "Draw it from the formula").
 */

function addCents(a, b) {
  return (Math.round(Number(a || 0) * 100) + Math.round(Number(b || 0) * 100)) / 100;
}

function wlp(w, l, p) {
  return w + '–' + l + (p ? '–' + p : '');
}

// ---------------------------------------------------------------- My bets

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'push', label: 'Pushed' },
];

function statusChip(t) {
  if (t.status === 'won') return <span className="bk-chip w">Won</span>;
  if (t.status === 'lost') return <span className="bk-chip l">Lost</span>;
  if (t.status === 'push') {
    const trade = /trade/i.test(t.settle_note || '');
    return <span className="bk-chip p">{trade ? 'Push · trade' : 'Push'}</span>;
  }
  if (t.status === 'void') return <span className="bk-chip p">Void</span>;
  return <span className="bk-chip open">Open</span>;
}

function SettledRow(props) {
  const t = props.t;
  const leg = (t.legs && t.legs[0]) || {};
  const nm = legName(leg, props.teamsById);
  let amt;
  let sub;
  if (t.status === 'won') {
    amt = <b className="pos">{formatCentsDelta(t.paid !== null && t.paid !== undefined ? t.paid : t.to_win)}</b>;
    sub = 'stake ' + formatCents(t.stake);
  } else if (t.status === 'lost') {
    amt = <b className="neg">{'-' + formatCents(t.stake)}</b>;
    sub = 'to the House';
  } else {
    amt = <b>{formatCents(0)}</b>;
    sub = formatCents(t.stake) + ' back';
  }
  return (
    <div className="bk-bt">
      <span>
        <span className="bk-bt-w">
          {nm.what} <em>{nm.kind}</em>
        </span>
        <span className="bk-bt-d">
          Week {t.week} · {legGame(leg, props.teamsById)} · took{' '}
          {leg.kind !== 'prop' && leg.market === 'moneyline' ? priceText(leg.odds) : lineText(leg.line_value, leg.market === 'spread')}
          {t.settle_note ? ' · ' + t.settle_note : ''}
        </span>
      </span>
      <span className="bk-bt-r">
        {amt}
        <span>{sub}</span>
        {statusChip(t)}
      </span>
    </div>
  );
}

export function BookBets(props) {
  const bets = props.bets || [];
  const board = props.board;
  const lim = board.limits || {};
  const f = FILTERS.some(function (x) {
    return x.key === props.filter;
  })
    ? props.filter
    : 'all';
  let w = 0;
  let l = 0;
  let p = 0;
  bets.forEach(function (t) {
    if (t.status === 'won') w += 1;
    else if (t.status === 'lost') l += 1;
    else if (t.status === 'push') p += 1;
  });
  const open = bets.filter(function (t) {
    return t.status === 'open';
  });
  const settled = bets.filter(function (t) {
    return t.status !== 'open';
  });
  const showOpen = f === 'all' || f === 'open';
  const shownSettled = settled.filter(function (t) {
    return f === 'all' || t.status === f;
  });
  const acct = board.account;

  return (
    <div className="bk-bets">
      <div className="bk-tiles">
        <div className="bk-tile">
          <span>Season</span>
          <b>{wlp(w, l, p)}</b>
          <em>won · lost · pushed</em>
        </div>
        <div className="bk-tile edfl-explain-host">
          <span>
            Net so far
            <ExplainButton label="How net so far is worked out">
              <ul>
                <li>Everything in your betting account and riding on open bets, plus what you&rsquo;ve cashed out, minus what you put in.</li>
                <li>Profit you cashed out counts after its tax.</li>
              </ul>
            </ExplainButton>
          </span>
          <b className={acct && Number(acct.net_result) < 0 ? 'neg' : 'pos'}>{acct ? formatCentsDelta(acct.net_result) : '—'}</b>
          <em>this season</em>
        </div>
      </div>
      <nav className="bk-filt" aria-label="Show">
        {FILTERS.map(function (x) {
          return (
            <a key={x.key} href={'/book?view=bets' + (x.key === 'all' ? '' : '&f=' + x.key)} className={f === x.key ? 'on' : ''} aria-current={f === x.key ? 'page' : undefined}>
              {x.label}
            </a>
          );
        })}
      </nav>
      {showOpen ? (
        <>
          <p className="bk-grp">
            Open
            <span>
              {lim.playoffs ? 'No weekly limit in the playoffs' : 'Week ' + board.week + ' · ' + formatCents(lim.staked) + ' of ' + formatCents(lim.limit) + ' staked'}
            </span>
          </p>
          {open.length ? <OpenBets tickets={open} rules={board.rules} teamsById={props.teamsById} /> : <p className="bk-mut bk-small">No open bets.</p>}
        </>
      ) : null}
      {f !== 'open' ? (
        <>
          <p className="bk-grp">Settled</p>
          {shownSettled.length ? (
            <div className="bk-btl">
              {shownSettled.map(function (t) {
                if (t.kind === 'parlay') return <ParlayCard key={t.ticket_id} t={t} rules={board.rules} teamsById={props.teamsById} showWeek />;
                return <SettledRow key={t.ticket_id} t={t} teamsById={props.teamsById} />;
              })}
            </div>
          ) : (
            <p className="bk-mut bk-small">Nothing settled{f === 'all' ? ' yet' : ' here'}.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- House health

export function houseHealth(house, rules) {
  const room = Number(house && house.room);
  const single = Number((rules && rules.max_win_single) || 75);
  if (!isFinite(room) || room <= 0) return { key: 'none', label: 'Can’t take bets', line: 'The House is at its floor and can’t take a new bet until bets settle.' };
  if (room < single * 10) return { key: 'tight', label: 'Tight', line: 'The House can still take bets, but only ' + formatCents(room) + ' more in winnings this week.' };
  return { key: 'ok', label: 'Healthy', line: 'The House can cover every bet on the board this week.' };
}

function HealthBar(props) {
  const h = props.health;
  const parts = [
    { key: 'none', label: 'Can’t take bets' },
    { key: 'tight', label: 'Tight' },
    { key: 'ok', label: 'Healthy' },
  ];
  return (
    <div className="bk-health" role="img" aria-label={'House health: ' + h.label}>
      {parts.map(function (p) {
        return (
          <span key={p.key} className={'bk-hp ' + p.key + (p.key === h.key ? ' on' : '')}>
            {p.label}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Account

function TaxChart(props) {
  const scale = Number(props.scale);
  const k = Number(props.k);
  if (!isFinite(scale) || !isFinite(k) || k <= 0) return null;
  const maxP = 3000;
  const W = 320;
  const H = 150;
  const px = function (p) {
    return 34 + (p / maxP) * (W - 44);
  };
  const py = function (v) {
    return H - 22 - (v / scale) * (H - 40);
  };
  let d = '';
  for (let i = 0; i <= 60; i += 1) {
    const p = (maxP * i) / 60;
    d += (i ? 'L' : 'M') + px(p).toFixed(1) + ' ' + py(scale * (1 - Math.exp(-p / k))).toFixed(1);
  }
  const you = props.you;
  return (
    <svg className="bk-chart" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Profit kept after tax, by profit">
      <line x1={px(0)} x2={px(maxP)} y1={py(scale)} y2={py(scale)} className="bk-ch-cap" />
      <text x={px(maxP)} y={py(scale) - 4} textAnchor="end" className="bk-ch-t">
        {formatCents(scale)} most you keep
      </text>
      <line x1={px(0)} x2={px(maxP)} y1={py(0)} y2={py(0)} className="bk-ch-ax" />
      <path d={d} className="bk-ch-line" />
      {[0, 1000, 2000, 3000].map(function (p) {
        return (
          <text key={p} x={px(p)} y={H - 6} textAnchor={p === 0 ? 'start' : p === maxP ? 'end' : 'middle'} className="bk-ch-t">
            {formatCents(p).replace('.00', '')}
          </text>
        );
      })}
      {you && you.profit > 0 ? (
        <g>
          <circle cx={px(Math.min(you.profit, maxP))} cy={py(Math.min(you.kept, scale))} r="5" className="bk-ch-you" />
          <text x={px(Math.min(you.profit, maxP)) + 8} y={py(Math.min(you.kept, scale)) + 14} className="bk-ch-t strong">
            You: keep {formatCents(you.kept)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function AmountForm(props) {
  const [v, setV] = useState('');
  const n = Number(v);
  const ok = v !== '' && isFinite(n) && n > 0 && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
  return (
    <form
      className="bk-amt"
      onSubmit={function (e) {
        e.preventDefault();
        if (ok && !props.pending) props.onSubmit(n);
      }}
    >
      <label className="bk-fld">
        <span className="bk-lab">{props.label}</span>
        <span className="bk-box">
          <span className="bk-cur">$</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={v}
            onChange={function (e) {
              setV(String(e.target.value).replace(/[^0-9.]/g, ''));
            }}
          />
        </span>
      </label>
      <button type="submit" className={'bk-go' + (ok && !props.pending ? '' : ' no')} disabled={!ok || props.pending}>
        {props.pending ? 'Working…' : props.button + (ok ? ' ' + formatCents(n) : '')}
      </button>
    </form>
  );
}

function CashOut(props) {
  const acct = props.acct;
  const router = useRouter();
  const room = Number(acct.cashout_room);
  const [amount, setAmount] = useState(null);
  const [other, setOther] = useState('');
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const chips = [50, 150, 250].filter(function (c) {
    return c <= room;
  });

  function choose(a) {
    setAmount(a);
    setMsg(null);
    setPreview(null);
    startTransition(async function () {
      const r = await previewCashOut(a);
      if (r && r.ok) setPreview(r);
      else setMsg(r && r.reason === 'error' ? r.message : refusalText(r, formatCents));
    });
  }

  function go() {
    if (!amount) return;
    startTransition(async function () {
      const r = await cashOutOfBook(amount);
      if (r && r.ok) {
        setMsg('Cashed out ' + formatCents(amount) + '.');
        setPreview(null);
        setAmount(null);
        router.refresh();
      } else setMsg(r && r.reason === 'error' ? r.message : refusalText(r, formatCents));
    });
  }

  if (room <= 0) return <p className="bk-mut bk-small">Nothing to cash out right now.</p>;

  return (
    <>
      <div className="bk-co">
        {chips.map(function (c) {
          return (
            <button key={c} type="button" className={amount === c ? 'on' : ''} onClick={function () { choose(c); }}>
              ${c}
            </button>
          );
        })}
        <span className="bk-co-other">
          <span>$</span>
          <input
            inputMode="decimal"
            placeholder="Other"
            aria-label="Other amount to cash out"
            value={other}
            onChange={function (e) {
              setOther(String(e.target.value).replace(/[^0-9.]/g, ''));
            }}
            onBlur={function () {
              const n = Number(other);
              if (other !== '' && isFinite(n) && n > 0) choose(Math.round(n * 100) / 100);
            }}
          />
        </span>
      </div>
      {preview ? (
        <div className="bk-facts">
          <div>
            <span>From your buy-in</span>
            <b>{formatCents(preview.buy_in_returned)}</b>
          </div>
          <div>
            <span>From profit</span>
            <b>{formatCents(preview.profit_gross)}</b>
          </div>
          <div>
            <span>Tax</span>
            <b>{formatCents(preview.tax)}</b>
          </div>
          <div>
            <span>Back to Owner Cash</span>
            <b>{formatCents(preview.take_home)}</b>
          </div>
        </div>
      ) : null}
      {msg ? <p className="bk-say">{msg}</p> : null}
      <p className="bk-plain">Whatever stays in cashes out by itself when the Dead Season starts.</p>
      <button type="button" className={'bk-go' + (amount && preview && !pending ? '' : ' no')} disabled={!amount || !preview || pending} onClick={go}>
        {pending ? 'Working…' : amount ? 'Cash out ' + formatCents(amount) : 'Choose an amount'}
      </button>
    </>
  );
}

export function BookAccount(props) {
  const board = props.board;
  const acct = board.account;
  const rules = board.rules || {};
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const health = houseHealth(board.house, rules);

  function deposit(n) {
    setMsg(null);
    startTransition(async function () {
      const r = await depositToBook(n);
      if (r && r.ok) {
        setMsg('Added ' + formatCents(n) + ' from Owner Cash.');
        router.refresh();
      } else setMsg(r && r.reason === 'error' ? r.message : refusalText(r, formatCents));
    });
  }

  const houseCard = (
    <a className="bk-loi" href="/book?view=house">
      <span>
        <b>The House</b>
        <span>The league&rsquo;s bank: balance, Reserve, floor</span>
        <HealthBar health={health} />
      </span>
      <span className="bk-loi-r">
        {health.label}
        <IconChevron />
      </span>
    </a>
  );

  if (!acct) {
    return (
      <div className="bk-acct">
        {houseCard}
        <p className="empty-note">Your login is not linked to a team, so there is no betting account to show.</p>
      </div>
    );
  }

  const pctLabel = Math.round(Number(rules.account_pct || 0) * 100) + '%';
  const limitLine =
    'The lesser of ' + formatCents(rules.account_cap) + ' and ' + pctLabel + ' of your Owner Cash at the start of the season (' + formatCents(acct.owner_cash_basis) + ').';

  if (Number(acct.deposited) === 0 && Number(acct.balance) === 0) {
    return (
      <div className="bk-acct">
        {houseCard}
        <div className="bk-panel edfl-explain-host">
          <h3>Open your betting account</h3>
          <p className="bk-plain">Move Owner Cash into the Book to bet. What you put in is the most you can lose this season.</p>
          <div className="bk-facts">
            <div>
              <span>
                Your limit
                <ExplainButton label="How your deposit limit is worked out">
                  <ul>
                    <li>{limitLine}</li>
                    <li>That is also the most you can lose in a season.</li>
                  </ul>
                </ExplainButton>
              </span>
              <b>{formatCents(acct.funding_cap)}</b>
            </div>
            <div>
              <span>Owner Cash at season start</span>
              <b>{formatCents(acct.owner_cash_basis)}</b>
            </div>
            <div>
              <span>Owner Cash available now</span>
              <b>{formatCents(acct.owner_cash_for_betting)}</b>
            </div>
          </div>
          {props.observer ? null : <AmountForm label="Put in" button="Open account with" pending={pending} onSubmit={deposit} />}
          {msg ? <p className="bk-say">{msg}</p> : null}
          <p className="bk-plain">Money you put in after a week opens counts toward the weekly limit from the next Tuesday.</p>
        </div>
      </div>
    );
  }

  const total = addCents(acct.balance, acct.in_open_bets);
  const end = props.endNow;
  const scale = Number(rules.tax_scale);
  const k = Number(rules.tax_k);
  const you = end ? { profit: addCents(end.profit_cashed_before, end.profit_gross), kept: end.kept } : null;
  const putIn = Number(acct.buy_in_outstanding);
  const cap = Number(acct.funding_cap);
  const putPct = cap > 0 ? Math.min(100, (putIn / cap) * 100) : 0;

  return (
    <div className="bk-acct">
      {houseCard}
      <div className="bk-acct-cols">
        <div>
          <div className="bk-panel edfl-explain-host">
            <h3>
              <span>
                In your account
                <ExplainButton label="What is in your account">
                  <ul>
                    <li>Free to bet: money in your account that isn&apos;t riding on an open bet.</li>
                    <li>Riding: stakes on open bets. They come back with the winnings, or go to the House, when the bets settle.</li>
                  </ul>
                </ExplainButton>
              </span>
            </h3>
            <span className="bk-big">{formatCents(total)}</span>
            <p className="bk-plain">
              {formatCents(acct.balance)} free to bet · {formatCents(acct.in_open_bets)} riding on open bets
            </p>
          </div>
          <div className="bk-tiles bk-tiles-4">
            <div className="bk-tile">
              <span>Buy-in</span>
              <b>{formatCents(acct.buy_in_outstanding)}</b>
              <em>comes back tax-free</em>
            </div>
            <div className="bk-tile">
              <span>Net so far</span>
              <b className={Number(acct.net_result) < 0 ? 'neg' : 'pos'}>{formatCentsDelta(acct.net_result)}</b>
              <em>profit is taxed at cash-out</em>
            </div>
            <div className="bk-tile">
              <span>Can still add</span>
              <b>{formatCents(acct.deposit_room)}</b>
              <em>season limit {formatCents(acct.funding_cap)}</em>
            </div>
            <div className="bk-tile">
              <span>Cash-out left</span>
              <b>{formatCents(acct.cashout_room)}</b>
              <em>of {formatCents(rules.inseason_cashout_cap)} in-season</em>
            </div>
          </div>
          <div className="bk-panel edfl-explain-host">
            <h3>
              <span>
                Season limit
                <ExplainButton label="How your season limit is worked out">
                  <ul>
                    <li>{limitLine}</li>
                    <li>The most you can lose in a season is what you put in.</li>
                    <li>Money you add after a week opens counts toward the weekly limit from the next Tuesday.</li>
                  </ul>
                </ExplainButton>
              </span>
              <small>the most you can lose is what you put in</small>
            </h3>
            <div className="bk-meter" role="img" aria-label={formatCents(putIn) + ' put in of a ' + formatCents(cap) + ' limit'}>
              <i style={{ width: putPct + '%' }} />
            </div>
            <div className="bk-mlb">
              <span>Put in {formatCents(putIn)}</span>
              <span>Limit {formatCents(cap)}</span>
            </div>
            {Number(acct.deposit_room) > 0 && !props.observer ? (
              <AmountForm label="Add money from Owner Cash" button="Add" pending={pending} onSubmit={deposit} />
            ) : null}
            {msg ? <p className="bk-say">{msg}</p> : null}
          </div>
        </div>
        <div>
          <div className="bk-panel">
            <h3>
              Cash out <small>buy-in first, then profit</small>
            </h3>
            {props.observer ? <p className="bk-mut bk-small">Watching only.</p> : <CashOut acct={acct} />}
          </div>
          <div className="bk-panel edfl-explain-host">
            <h3>
              <span>
                Profit tax
                <ExplainButton label="How the profit tax works">
                  <ul>
                    <li>Your buy-in comes back tax-free.</li>
                    <li>Profit is taxed on a sliding scale, and the tax goes to the House.</li>
                    <li>
                      You keep {formatCents(scale)} × (1 − e^(−profit ÷ {formatCents(k)})) of a season&rsquo;s profit, so
                      nobody takes home more than {formatCents(scale)} of profit.
                    </li>
                  </ul>
                </ExplainButton>
              </span>
              <small>it goes back to the House</small>
            </h3>
            <TaxChart scale={scale} k={k} you={you} />
            <p className="bk-plain">
              Win $100, keep {formatCents(taxKept(100, scale, k))}. Win $1,000, keep {formatCents(taxKept(1000, scale, k))}. The more you win, the
              bigger the House&rsquo;s share.
            </p>
            {end ? (
              <div className="bk-facts">
                <div>
                  <span>If you cashed out everything now</span>
                  <b>{formatCents(end.take_home)}</b>
                </div>
                <div>
                  <span>Buy-in back</span>
                  <b>{formatCents(end.buy_in_returned)}</b>
                </div>
                <div>
                  <span>Profit {formatCents(end.profit_gross)}, tax</span>
                  <b>{Number(end.tax) > 0 ? '-' + formatCents(end.tax) : formatCents(0)}</b>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Records

function MarginChart(props) {
  const rows = props.rows;
  if (!rows.length) return null;
  const W = 320;
  const H = 150;
  const max = Math.max.apply(
    null,
    rows.map(function (r) {
      return Math.abs(r.margin);
    }).concat([10])
  );
  const bw = (W - 30) / rows.length;
  const mid = H / 2;
  return (
    <svg className="bk-chart" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Beat the spread by, week by week">
      <line x1="24" x2={W - 4} y1={mid} y2={mid} className="bk-ch-ax" />
      {rows.map(function (r, i) {
        const h = (Math.abs(r.margin) / max) * (mid - 16);
        const x = 26 + i * bw + bw * 0.15;
        const y = r.margin >= 0 ? mid - h : mid;
        return (
          <g key={r.week_number}>
            <rect x={x} y={y} width={bw * 0.7} height={Math.max(h, 1)} rx="2" className={'bk-ch-bar ' + r.ats + (r.is_retro ? ' retro' : '')} />
            <text x={x + bw * 0.35} y={H - 4} textAnchor="middle" className="bk-ch-t">
              {r.week_number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BookRecords(props) {
  const ats = props.ats || [];
  const games = props.games || [];
  const teamsById = props.teamsById;
  const myId = props.board.my_team_id;
  const byAbbrev = {};
  (props.teams || []).forEach(function (t) {
    byAbbrev[t.abbrev] = t;
  });
  const sel = props.team && byAbbrev[props.team] ? byAbbrev[props.team] : null;
  const me = myId ? teamsById[myId] : null;
  const switchTeam = sel || me;

  const retroWeeks = [];
  const liveWeeks = [];
  games.forEach(function (g) {
    (g.is_retro ? retroWeeks : liveWeeks).push(g.week_number);
  });
  const lastWeek = games.length
    ? Math.max.apply(
        null,
        games.map(function (g) {
          return g.week_number;
        })
      )
    : null;

  const seg = (
    <div className="bk-seg">
      <a href="/book?view=records" className={sel ? '' : 'on'} aria-current={sel ? undefined : 'page'}>
        League
      </a>
      {switchTeam ? (
        <a href={'/book?view=records&team=' + switchTeam.abbrev} className={sel ? 'on' : ''} aria-current={sel ? 'page' : undefined}>
          {switchTeam.name}
        </a>
      ) : (
        <span className="is-off">Your team</span>
      )}
    </div>
  );

  if (!games.length) {
    return (
      <div className="bk-records">
        {seg}
        <p className="empty-note">No graded games yet. Records fill in as weeks with posted lines go final.</p>
      </div>
    );
  }

  const chips = (
    <div className="bk-chips">
      {retroWeeks.length ? (
        <span className="bk-chip retro">
          Weeks {Math.min.apply(null, retroWeeks)}&ndash;{Math.max.apply(null, retroWeeks)} retro
        </span>
      ) : null}
      {liveWeeks.length ? <span className="bk-chip p">Live since Week {Math.min.apply(null, liveWeeks)}</span> : null}
      {lastWeek ? <span className="bk-mut bk-small">Through Week {lastWeek}</span> : null}
    </div>
  );

  if (!sel) {
    return (
      <div className="bk-records">
        {seg}
        {chips}
        <div className="bk-scrollx">
          <table className="bk-atb">
            <thead>
              <tr>
                <th>Team</th>
                <th>ATS</th>
                <th>As fav</th>
                <th>As dog</th>
                <th>O/U</th>
              </tr>
            </thead>
            <tbody>
              {ats.map(function (r) {
                const g = r.ats_w + r.ats_l;
                const pct = g > 0 ? Math.round((r.ats_w / g) * 100) + '%' : '—';
                return (
                  <tr key={r.team_id} className={r.team_id === myId ? 'me' : ''}>
                    <td>
                      <a className="bk-tcell" href={'/book?view=records&team=' + r.abbrev}>
                        <TeamDisc abbrev={r.abbrev} className="bk-disc s" />
                        {r.abbrev}
                      </a>
                    </td>
                    <td>
                      <b>{wlp(r.ats_w, r.ats_l, r.ats_push)}</b>
                      <span className="bk-pct">{pct}</span>
                    </td>
                    <td>{wlp(r.fav_w, r.fav_l)}</td>
                    <td>{wlp(r.dog_w, r.dog_l)}</td>
                    <td>{wlp(r.ou_over, r.ou_under)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="bk-plain bk-mut">
          ATS = beat the spread. As fav / as dog = won outright when favored or not. O/U = games that went over the total. Retro weeks were filled in after the fact.
        </p>
      </div>
    );
  }

  const mine = games
    .filter(function (g) {
      return g.team_id === sel.id;
    })
    .sort(function (a, b) {
      return a.week_number - b.week_number;
    })
    .map(function (g) {
      return Object.assign({}, g, { margin: Math.round((Number(g.pts) + Number(g.spread) - Number(g.opp)) * 10) / 10 });
    });
  const row = ats.find(function (r) {
    return r.team_id === sel.id;
  });
  const g2 = row ? row.ats_w + row.ats_l : 0;

  return (
    <div className="bk-records">
      {seg}
      {chips}
      {row ? (
        <div className="bk-tiles bk-tiles-4">
          <div className="bk-tile">
            <span>Against the spread</span>
            <b>{wlp(row.ats_w, row.ats_l, row.ats_push)}</b>
            <em>{g2 ? Math.round((row.ats_w / g2) * 100) + '% covered' : 'no games'}</em>
          </div>
          <div className="bk-tile">
            <span>Over / under</span>
            <b>{wlp(row.ou_over, row.ou_under)}</b>
            <em>{row.ou_over} went over</em>
          </div>
          <div className="bk-tile">
            <span>As favorite</span>
            <b>{wlp(row.fav_w, row.fav_l)}</b>
            <em>won outright</em>
          </div>
          <div className="bk-tile">
            <span>As underdog</span>
            <b>{wlp(row.dog_w, row.dog_l)}</b>
            <em>won outright</em>
          </div>
        </div>
      ) : null}
      <div className="bk-panel">
        <h3>
          Beat the spread by <small>teal covered · orange missed · faded = retro</small>
        </h3>
        <MarginChart rows={mine} />
      </div>
      <p className="bk-grp">Week by week</p>
      <div className="bk-btl">
        {mine
          .slice()
          .reverse()
          .map(function (g) {
            const opp = teamsById[g.opp_team_id];
            const diff = Math.round((Number(g.pts) - Number(g.opp)) * 10) / 10;
            return (
              <div className="bk-wl" key={g.week_number + ':' + g.matchup_id}>
                <span className="bk-wk">
                  W{g.week_number}
                  {g.is_retro ? <em>retro</em> : null}
                </span>
                <span className="bk-tx">
                  <b>
                    vs {opp ? opp.name : '?'} · {sel.abbrev} {lineText(g.spread, true)}
                  </b>
                  <span>
                    {diff > 0 ? 'Won by ' + diff.toFixed(1) : diff < 0 ? 'Lost by ' + Math.abs(diff).toFixed(1) : 'Tied'} · {g.ou === 'over' ? 'Over' : g.ou === 'under' ? 'Under' : 'Push'}
                  </span>
                </span>
                <span className={'bk-chip ' + (g.ats === 'won' ? 'w' : g.ats === 'lost' ? 'l' : 'p')}>
                  {g.ats === 'won' ? 'Covered' : g.ats === 'lost' ? 'Missed' : 'Push'}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- The House

function HouseChart(props) {
  const pts = props.points;
  if (pts.length < 2) return <p className="bk-mut bk-small">The chart fills in week by week once the House has a finished week behind it.</p>;
  const floor = Number(props.floor);
  const W = 320;
  const H = 160;
  const vals = pts.map(function (p) {
    return Number(p.house);
  });
  const hi = Math.max.apply(null, vals.concat([floor])) * 1.08;
  const lo = 0;
  const px = function (i) {
    return 36 + (i / (pts.length - 1)) * (W - 48);
  };
  const py = function (v) {
    return H - 22 - ((v - lo) / (hi - lo)) * (H - 36);
  };
  let d = '';
  pts.forEach(function (p, i) {
    d += (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(Number(p.house)).toFixed(1);
  });
  return (
    <svg className="bk-chart" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="House balance by week, with the floor">
      <rect x="36" y={py(floor)} width={W - 48} height={H - 22 - py(floor)} className="bk-ch-floor" />
      <text x="40" y={py(floor) - 4} className="bk-ch-t">
        Floor {formatCents(floor)}
      </text>
      <path d={d} className="bk-ch-line" />
      {pts.map(function (p, i) {
        return (
          <g key={p.label}>
            <circle cx={px(i)} cy={py(Number(p.house))} r="3" className="bk-ch-dot" />
            <text x={px(i)} y={H - 6} textAnchor="middle" className="bk-ch-t">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BookHouse(props) {
  const board = props.board;
  const h = board.house || {};
  const rules = board.rules || {};
  const health = houseHealth(h, rules);
  const points = (props.history || [])
    .map(function (r) {
      return { label: 'W' + r.week, house: r.house };
    })
    .concat([{ label: 'Now', house: h.house }]);
  return (
    <div className="bk-house">
      <a className="bk-back" href="/book?view=account">
        ‹ Account
      </a>
      <div className="bk-panel">
        <h3>House health at a glance</h3>
        <HealthBar health={health} />
        <p className="bk-plain">
          <b>{health.label}.</b> {health.line}
        </p>
      </div>
      <div className="bk-panel edfl-explain-host">
        <h3>
          The House <small>everyone sees this</small>
        </h3>
        <div className="bk-hrows">
          <div>
            <span>House balance</span>
            <b>{formatCents(h.house)}</b>
          </div>
          <div>
            <span>Longshot Reserve</span>
            <b>{formatCents(h.reserve)}</b>
          </div>
          <div>
            <span>Floor (never goes below)</span>
            <b>{formatCents(h.house_floor)}</b>
          </div>
          <div>
            <span>Could pay out on open bets</span>
            <b>{formatCents(h.open_liability)}</b>
          </div>
          <div>
            <span>
              Room for new bets
              <ExplainButton label="How room for new bets is worked out">
                <ul>
                  <li>The House never takes a bet that could drop it below its {formatCents(h.house_floor)} floor.</li>
                  <li>Room = House balance − the floor − what open bets could pay out.</li>
                  <li>The floor holds in the playoffs too, when there is no max win.</li>
                </ul>
              </ExplainButton>
            </span>
            <b>{formatCents(h.room)}</b>
          </div>
        </div>
      </div>
      <div className="bk-panel">
        <h3>Balance by week</h3>
        <HouseChart points={points} floor={h.house_floor} />
        <p className="bk-plain">Losing stakes, fines and the profit tax go to the House; winnings come out of it.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Closed

export function BookClosed(props) {
  const acct = props.board.account;
  return (
    <div className="bk-closed">
      <div className="bk-hero2">
        <span className="bk-chip lock">Book closed</span>
        <h2>See you in pre-season</h2>
        <p>EDFL Bets reopens when pre-season starts. Records stay open to browse.</p>
      </div>
      {acct && Number(acct.deposited) > 0 ? (
        <div className="bk-panel">
          <h3>Your season</h3>
          <div className="bk-facts">
            <div>
              <span>Buy-in back, tax-free</span>
              <b>{formatCents(acct.buy_in_returned)}</b>
            </div>
            <div>
              <span>Profit kept after tax</span>
              <b>{formatCents(acct.profit_kept)}</b>
            </div>
            <div>
              <span>Net for the season</span>
              <b>{formatCentsDelta(acct.net_result)}</b>
            </div>
          </div>
          <p className="bk-plain">Your account cashed out by itself when the Dead Season started.</p>
        </div>
      ) : null}
      <a className="bk-go2" href="/book?view=records">
        See Records
      </a>
    </div>
  );
}
