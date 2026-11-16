import ExplainButton from '../../components/ExplainButton';
import { formatCents, formatCentsDelta, formatCost } from '../../lib/formatMoney';

/**
 * OWNER CASH ACCOUNTING, the statement (UI test batch 26). A server component:
 * it draws what owner_cash_statement returned and computes no money (SR-23).
 * Option A of the approved canvas (YHL8z13zcDgpD1zC7tzsXg). Classes are the
 * .oc- block in app/kit.css. Money is to the cent (formatCents): this is a
 * ledger whose rows must tie to its balance, and the Betting Budget shows the
 * Book's own cents.
 */

const KIND_ICON = {
  salary: 'cal',
  signing_bonus: 'pen',
  roster_bonus: 'pen',
  option_bonus: 'pen',
  restructure_bonus: 'pen',
  dead_cash: 'x',
  other_contract_cash: 'doc',
  fine: 'flag',
  book_in: 'arrow',
  book_out: 'arrow',
  starting_cash: 'up',
  cash_purchase: 'up',
  adjustment: 'adj',
};

const FILTER_KINDS = {
  salary: ['salary'],
  bonuses: ['signing_bonus', 'roster_bonus', 'option_bonus', 'restructure_bonus'],
  dead: ['dead_cash', 'other_contract_cash'],
  book: ['book_in'],
  fines: ['fine'],
};

const FILTER_LABELS = [
  ['all', 'All'],
  ['salary', 'Salary'],
  ['bonuses', 'Bonuses'],
  ['dead', 'Dead cash'],
  ['book', 'Book'],
  ['fines', 'Fines'],
];

function Icon(props) {
  const k = props.k;
  let d;
  if (k === 'cal') d = <><rect x="3.5" y="5" width="13" height="11" rx="2" /><path d="M3.5 8.5h13M7 3.5v3M13 3.5v3" /></>;
  else if (k === 'pen') d = <><path d="M4 15.5 13.5 6l1.5 1.5L5.5 17H4z" /><path d="M12 4.5 15.5 8" /></>;
  else if (k === 'x') d = <path d="M6 6l8 8M14 6l-8 8" />;
  else if (k === 'arrow') d = <path d="M4 10h12M11 5l5 5-5 5" />;
  else if (k === 'up') d = <path d="M10 16V4M5 9l5-5 5 5" />;
  else if (k === 'flag') d = <><path d="M5 17V4" /><path d="M5 4h9l-2 3.5L14 11H5" /></>;
  else if (k === 'clock') d = <><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.5 1.5" /></>;
  else if (k === 'adj') d = <path d="M4 7h12M4 13h12" />;
  else d = <><path d="M5 4h7l3 3v9H5z" /><path d="M8 10h4M8 13h4" /></>;
  return (
    <svg width={props.size || 18} height={props.size || 18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

function href(params) {
  const q = [];
  if (params.f && params.f !== 'all') q.push('f=' + params.f);
  if (params.all) q.push('all=1');
  if (params.whatIf !== null && params.whatIf !== undefined) q.push('whatif=' + params.whatIf);
  return '/cash' + (q.length ? '?' + q.join('&') : '') + (params.hash || '');
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function LedgerRow(props) {
  const r = props.r;
  const sched = r.scheduled === true;
  const iconKind = sched ? 'clock' : KIND_ICON[r.kind] || 'doc';
  const tone = sched ? ' is-sched' : r.side === 'revenue' ? ' is-in' : r.kind === 'book_in' || r.kind === 'book_out' ? ' is-book' : r.kind === 'dead_cash' || r.kind === 'fine' ? ' is-bad' : '';
  let detail = r.detail;
  if (r.kind === 'salary' && r.players) {
    detail = r.players + ' players · gtd ' + formatCents(r.gtd) + ' · non-gtd ' + formatCents(r.non_gtd);
  }
  return (
    <li className={'oc-row' + (sched ? ' sched' : '')}>
      <span className={'oc-ic' + tone}>
        <Icon k={iconKind} />
      </span>
      <span className="oc-tx">
        <b>{r.title}</b>
        <span>
          {r.date_label} · {detail}
        </span>
      </span>
      <span className="oc-am">
        <b className={n(r.amount) > 0 ? 'pos' : ''}>{formatCentsDelta(r.amount)}</b>
        <span>
          {sched ? 'after ' : 'bal '}
          {formatCents(r.balance_after)}
        </span>
      </span>
    </li>
  );
}

function ProjectionChart(props) {
  const rows = props.rows;
  const W = 340;
  const H = 214;
  const L = 46;
  const R = 8;
  const T = 14;
  const B = 50;
  const pw = W - L - R;
  const ph = H - T - B;
  // Geometry only: the tallest bar sets the scale.
  let max = 0;
  rows.forEach(function (r) {
    max = Math.max(max, n(r.committed), n(r.revenue), n(r.what_if));
  });
  if (max <= 0) max = 1;
  const step = max > 2000 ? 1000 : max > 800 ? 500 : 200;
  const top = Math.ceil(max / step) * step;
  const y = function (v) {
    return T + ph - (n(v) / top) * ph;
  };
  const gw = pw / Math.max(rows.length, 1);
  const bw = Math.min(26, gw * 0.3);
  const grid = [];
  for (let g = 0; g <= top; g += step) grid.push(g);
  const first = rows.length ? rows[0].season : null;
  return (
    <svg className="oc-chart" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Owner Cash in against cash committed, season by season">
      {grid.map(function (g) {
        return (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="oc-grid" />
            <text x={L - 6} y={y(g) + 3} className="oc-axis" textAnchor="end">
              {'$' + g.toLocaleString('en-US')}
            </text>
          </g>
        );
      })}
      {rows.map(function (r, i) {
        const cx = L + gw * i + gw / 2;
        const x1 = cx - bw - 2;
        const x2 = cx + 2;
        const inc = r.revenue !== null && r.revenue !== undefined ? n(r.revenue) : null;
        const wif = r.what_if !== null && r.what_if !== undefined ? n(r.what_if) : null;
        const out = n(r.committed);
        return (
          <g key={r.season}>
            {inc !== null ? <rect x={x1} y={y(inc)} width={bw} height={Math.max(y(0) - y(inc), 0)} rx="3" className="oc-bar-in" /> : null}
            {inc === null && wif !== null ? (
              <rect x={x1 + 0.75} y={y(wif) + 0.75} width={bw - 1.5} height={Math.max(y(0) - y(wif) - 1.5, 0)} rx="3" className="oc-bar-wif" />
            ) : null}
            {out > 0 ? <rect x={x2} y={y(out)} width={bw} height={Math.max(y(0) - y(out), 0)} rx="3" className="oc-bar-out" /> : null}
            <text x={x2 + bw / 2} y={(out > 0 ? y(out) : y(0)) - 4} className="oc-val" textAnchor="middle">
              {formatCost(r.committed)}
            </text>
            <text x={cx} y={y(0) + 14} className="oc-yr" textAnchor="middle">
              {r.season}
            </text>
          </g>
        );
      })}
      {(props.windows || []).map(function (w) {
        const a = rows.findIndex(function (r) {
          return r.season >= w.start;
        });
        if (a < 0 || first === null) return null;
        let b = -1;
        rows.forEach(function (r, i) {
          if (r.season <= w.end) b = i;
        });
        if (b < a) return null;
        const xa = L + gw * a + 4;
        const xb = L + gw * (b + 1) - 4;
        const wy = y(0) + 28;
        const open = w.end > rows[rows.length - 1].season;
        return (
          <g key={w.start}>
            <path d={'M' + xa + ' ' + (wy - 5) + 'v5h' + (xb - xa) + (open ? '' : 'v-5')} fill="none" className={'oc-win' + (w.start > first ? ' later' : '')} />
            <text x={(xa + xb) / 2} y={wy + 12} className="oc-axis" textAnchor="middle">
              {(b - a >= 1 ? 'Cash Window ' : '') + w.start + '–' + String(w.end).slice(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function OwnerCashView(props) {
  const st = props.st;
  const s = st.summary || {};
  const book = st.book || null;
  const weeks = st.weeks || [];
  const next = st.next_charge || null;
  const ledger = st.ledger || [];
  const proj = st.projection || [];
  const windows = st.windows || [];
  const filter = props.filter;
  const showAll = props.showAll;
  const whatIf = props.whatIf;

  const paidWeeks = weeks.filter(function (w) {
    return w.paid;
  });
  const dueWeeks = weeks.filter(function (w) {
    return !w.paid;
  });
  const paidRange = paidWeeks.length ? 'Weeks ' + paidWeeks[0].week + '–' + paidWeeks[paidWeeks.length - 1].week : null;
  const dueRange = dueWeeks.length ? 'Weeks ' + dueWeeks[0].week + '–' + dueWeeks[dueWeeks.length - 1].week : null;
  const lastDue = dueWeeks.length ? dueWeeks[dueWeeks.length - 1] : null;

  const revenueRows = ledger.filter(function (r) {
    return r.side === 'revenue';
  });
  const kinds = filter !== 'all' ? FILTER_KINDS[filter] : null;
  const expenseRows = ledger.filter(function (r) {
    return r.side === 'expense' && (!kinds || kinds.indexOf(r.kind) >= 0);
  });
  const sched = expenseRows.filter(function (r) {
    return r.scheduled;
  });
  const paid = expenseRows.filter(function (r) {
    return !r.scheduled;
  });
  const schedShown = showAll ? sched.slice().reverse() : sched.slice(-2).reverse();
  const paidShown = showAll ? paid : paid.slice(0, 8);
  const hasFines = n(s.fines) !== 0;
  const filters = FILTER_LABELS.filter(function (f) {
    return f[0] !== 'fines' || hasFines || filter === 'fines';
  }).filter(function (f) {
    return f[0] !== 'book' || book || filter === 'book';
  });

  const teamPct = s.team_share_pct !== null && s.team_share_pct !== undefined ? n(s.team_share_pct) : 100;
  const paidPct = n(s.paid_share_pct);
  const schedPct = n(s.scheduled_share_pct);

  const statement = (
    <>
      <div className="oc-panel oc-hero edfl-explain-host">
        <span className="oc-ey">
          Owner Cash left to spend
          <ExplainButton label="How Owner Cash left to spend is worked out">
            <ul>
              <li>Your Team Budget left after this season&rsquo;s remaining salary, plus what is in your betting account (free to bet and riding on open bets).</li>
              <li>Salary still to come is counted now, so this is what you can commit without going below zero.</li>
            </ul>
          </ExplainButton>
        </span>
        <span className="oc-big">{formatCents(book ? s.owner_cash_total : s.left_to_spend)}</span>
        {book ? (
          <>
            <span className="oc-meter" role="img" aria-label={'Team Budget ' + formatCents(s.left_to_spend) + ', Betting Budget ' + formatCents(s.book_total)}>
              <i className="oc-m-team" style={{ width: Math.max(Math.min(teamPct, 100), 0) + '%' }} />
              <i className="oc-m-book" style={{ width: Math.max(100 - Math.min(teamPct, 100), 0) + '%' }} />
            </span>
            <span className="oc-mlb">
              <span>
                <i className="oc-key oc-m-team" />
                Team Budget <b>{formatCents(s.left_to_spend)}</b>
              </span>
              <span>
                <i className="oc-key oc-m-book" />
                Betting Budget <b>{formatCents(s.book_total)}</b>
              </span>
            </span>
          </>
        ) : null}
        {next ? (
          <span className="oc-next">
            <Icon k="clock" size={16} />
            <span>
              Next salary{' '}
              <b>
                {next.label} · {formatCentsDelta(-n(next.amount))}
              </b>
            </span>
            {dueWeeks.length > 1 && lastDue ? (
              <span className="oc-mut oc-next-r">
                {dueWeeks.length - 1} more to {lastDue.label.replace(/^\w+ /, '')}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="oc-two">
        <div className="oc-panel edfl-explain-host">
          <h2 className="oc-h">
            Team Budget<small>{st.season}</small>
          </h2>
          <span className="oc-meter oc-thin" role="img" aria-label={'Paid ' + formatCents(s.expenses_paid) + ', still to pay ' + formatCents(s.expenses_scheduled) + ', left ' + formatCents(s.left_to_spend)}>
            <i className="oc-m-out" style={{ width: Math.max(Math.min(paidPct, 100), 0) + '%' }} />
            <i className="oc-m-sched" style={{ width: Math.max(Math.min(schedPct, 100 - Math.min(paidPct, 100)), 0) + '%' }} />
          </span>
          <span className="oc-mlb">
            <span>
              <i className="oc-key oc-m-out" />
              Paid <i className="oc-key oc-m-sched oc-key-gap" />
              To pay
            </span>
            <span>
              Left <b>{formatCents(s.left_to_spend)}</b> of {formatCents(s.revenue_total)}
            </span>
          </span>
          <dl className="oc-facts">
            <div className="oc-sh">
              <dt>Revenue</dt>
            </div>
            <div>
              <dt>Starting cash</dt>
              <dd>{formatCents(s.starting_cash)}</dd>
            </div>
            <div>
              <dt>Adjustments</dt>
              <dd>{formatCents(s.revenue_adjustments)}</dd>
            </div>
            {n(s.revenue_purchases) !== 0 ? (
              <div>
                <dt>Cash purchases</dt>
                <dd>{formatCents(s.revenue_purchases)}</dd>
              </div>
            ) : null}
            {n(s.revenue_from_book) !== 0 ? (
              <div>
                <dt>Back from the Book</dt>
                <dd>{formatCents(s.revenue_from_book)}</dd>
              </div>
            ) : null}
            <div className="oc-tot">
              <dt>Total revenue</dt>
              <dd className="pos">{formatCents(s.revenue_total)}</dd>
            </div>
            <div className="oc-sh">
              <dt>Expenses</dt>
            </div>
            <div>
              <dt>
                Salary paid{paidRange ? ' · ' + paidRange : ''}
                <ExplainButton label="How weekly salary is charged">
                  <ul>
                    <li>Each contract&rsquo;s guaranteed and non-guaranteed salary is paid in fourteen equal weekly shares, one each Tuesday of the regular season.</li>
                    <li>A player signed during the season is paid from the week he signed.</li>
                    <li>Signing bonuses are paid in full when the contract is signed; roster bonuses when they convert.</li>
                  </ul>
                </ExplainButton>
              </dt>
              <dd>{formatCents(s.salary_paid)}</dd>
            </div>
            {dueRange ? (
              <div>
                <dt>Salary to pay · {dueRange}</dt>
                <dd>{formatCents(s.salary_scheduled)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Signing bonuses</dt>
              <dd>{formatCents(s.signing_bonuses)}</dd>
            </div>
            {n(s.other_bonuses) !== 0 ? (
              <div>
                <dt>Roster, option and restructure bonuses</dt>
                <dd>{formatCents(s.other_bonuses)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Dead cash</dt>
              <dd>{formatCents(s.dead_cash)}</dd>
            </div>
            {hasFines ? (
              <div>
                <dt>Fines</dt>
                <dd>{formatCents(s.fines)}</dd>
              </div>
            ) : null}
            {n(s.to_book) !== 0 ? (
              <div>
                <dt>Moved to the Book</dt>
                <dd>{formatCents(s.to_book)}</dd>
              </div>
            ) : null}
            {n(s.other_contract_cash) !== 0 ? (
              <div>
                <dt>Other contract cash</dt>
                <dd>{formatCents(s.other_contract_cash)}</dd>
              </div>
            ) : null}
            <div className="oc-tot">
              <dt>Total expenses</dt>
              <dd className="neg">{formatCents(s.expenses_total)}</dd>
            </div>
            <div className="oc-tot oc-net">
              <dt>Left to spend</dt>
              <dd>{formatCents(s.left_to_spend)}</dd>
            </div>
          </dl>
        </div>

        {book ? (
          <div className="oc-panel edfl-explain-host">
            <h2 className="oc-h">
              <span className="oc-h-l">
                <img src="/brand/betting-logo.webp" alt="" width="28" height="28" className="oc-booklogo" />
                Betting Budget
              </span>
              <small>the Book, {st.season}</small>
            </h2>
            <div className="oc-tiles">
              <div className="oc-tile">
                <span>In the Book</span>
                <b>{formatCents(s.book_total)}</b>
                <em>{formatCents(book.in_open_bets)} riding</em>
              </div>
              <div className="oc-tile">
                <span>Profit</span>
                <b className={n(book.net_result) < 0 ? 'neg' : n(book.net_result) > 0 ? 'pos' : ''}>{formatCentsDelta(book.net_result)}</b>
                <em>taxed at cash-out</em>
              </div>
              <div className="oc-tile">
                <span>Put in</span>
                <b>{formatCents(book.deposited)}</b>
                <em>limit {formatCents(book.funding_cap)}</em>
              </div>
              <div className="oc-tile">
                <span>Cash-out room</span>
                <b>{formatCents(book.cashout_room)}</b>
                <em>this season</em>
              </div>
            </div>
            <a className="oc-go2" href="/book?view=account">
              <img src="/brand/betting-logo.webp" alt="" width="22" height="22" className="oc-booklogo" />
              Open the Book account
            </a>
          </div>
        ) : null}
      </div>

      <div className="oc-panel edfl-explain-host">
        <h2 className="oc-h">
          <span className="oc-h-l">
            5-Year Cash Flow
            <ExplainButton label="How the five-season cash flow is built">
              <ul>
                <li>Committed is the cash your contracts already owe each season, dead cash included.</li>
                <li>Owner Cash for future seasons is set by the owners&rsquo; vote each off-season, so it is not known yet. Type a what-if to see what would be left.</li>
              </ul>
            </ExplainButton>
          </span>
          <small>
            {proj.length ? proj[0].season + '–' + proj[proj.length - 1].season : ''}
          </small>
        </h2>
        <div className="oc-chartwrap">
          <ProjectionChart rows={proj} windows={windows} />
        </div>
        <span className="oc-mlb oc-legend">
          <span>
            <i className="oc-key oc-m-team" />
            Owner Cash in
          </span>
          <span>
            <i className="oc-key oc-key-wif" />
            Your what-if
          </span>
          <span>
            <i className="oc-key oc-m-out" />
            Committed
          </span>
        </span>
        <div className="oc-scroll">
          <table className="oc-yt">
            <thead>
              <tr>
                <th scope="col">Season</th>
                <th scope="col">Owner Cash in</th>
                <th scope="col">Committed</th>
                <th scope="col">Left</th>
              </tr>
            </thead>
            <tbody>
              {proj.map(function (r) {
                const future = r.season !== st.season;
                return (
                  <tr key={r.season}>
                    <th scope="row">
                      {r.season}
                      <span>{r.cap_is_set ? (r.cap_is_provisional ? 'PROV' : 'SET') : 'PROJ'}</span>
                    </th>
                    <td>
                      {r.revenue !== null && r.revenue !== undefined ? formatCents(r.revenue) : r.what_if !== null && r.what_if !== undefined ? formatCents(r.what_if) + '*' : '—'}
                    </td>
                    <td>{formatCents(r.committed)}</td>
                    <td className="oc-left">{r.left !== null && r.left !== undefined ? formatCents(r.left) + (future ? '*' : '') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <form className="oc-wif" method="get" action="/cash">
          <label htmlFor="oc-whatif">What-if, per season after {st.season}</label>
          <span className="oc-wif-box">
            $
            <input id="oc-whatif" name="whatif" inputMode="decimal" defaultValue={whatIf !== null ? String(whatIf) : ''} />
          </span>
          {filter !== 'all' ? <input type="hidden" name="f" value={filter} /> : null}
          {showAll ? <input type="hidden" name="all" value="1" /> : null}
          <button type="submit" className="oc-btn">
            Apply
          </button>
          {whatIf !== null ? (
            <a className="oc-clear" href={href({ f: filter, all: showAll, whatIf: null })}>
              Clear
            </a>
          ) : null}
        </form>
      </div>

      {windows.map(function (w) {
        const later = n(w.floor_required) === 0;
        const pct = w.pct !== null && w.pct !== undefined ? Math.min(n(w.pct), 100) : 0;
        return (
          <div className="oc-panel oc-window edfl-explain-host" key={w.start}>
            <div className="oc-win-row">
              <span>
                <b>
                  Cash Window {w.start}–{String(w.end).slice(2)}
                  <ExplainButton label={'How the ' + w.start + '–' + w.end + ' Cash Window is measured'}>
                    <ul>
                      <li>Over the window you must spend at least {Math.round(n(w.floor_pct) * 100)}% of the league&rsquo;s base caps for its seasons, in Owner Cash actually paid.</li>
                      <li>Needed so far counts only the seasons whose cap is set ({w.seasons_priced} of {w.end - w.start + 1}).</li>
                    </ul>
                  </ExplainButton>
                </b>
                <small>
                  Committed {formatCents(w.committed)}
                  {later ? ' · floor set when caps are set' : ' · needed so far ' + formatCents(w.floor_required)}
                </small>
              </span>
              <span className={'oc-chip ' + (later ? 'wf' : w.met_so_far ? 'ok' : 'bad')}>{later ? 'Later' : w.met_so_far ? 'On track' : 'Short'}</span>
            </div>
            {!later ? (
              <span className="oc-meter oc-thin" role="img" aria-label={'Committed is ' + w.pct + '% of the floor so far'}>
                <i className={w.met_so_far ? 'oc-m-team' : 'oc-m-bad'} style={{ width: pct + '%' }} />
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );

  const ledgerPanel = (
    <section className="oc-ledger" id="ledger" aria-label="Ledger">
      <div className="oc-grp">
        <h2>Ledger</h2>
        <a href={href({ f: filter, all: !showAll, whatIf: whatIf, hash: '#ledger' })}>{showAll ? 'Show fewer' : 'See all'}</a>
      </div>
      <div className="oc-rx">
        <div className="oc-rxt">
          <span className="oc-ey">
            <i className="oc-key oc-m-team" />
            Revenue
          </span>
          <b>{formatCents(s.revenue_total)}</b>
          <em>
            {revenueRows.length} {revenueRows.length === 1 ? 'entry' : 'entries'}
          </em>
        </div>
        <div className="oc-rxt">
          <span className="oc-ey">
            <i className="oc-key oc-m-out" />
            Expenses
          </span>
          <b>{formatCents(s.expenses_total)}</b>
          <em>{formatCents(s.expenses_scheduled)} scheduled</em>
        </div>
      </div>
      <nav className="oc-filt" aria-label="Show expenses">
        {filters.map(function (f) {
          return (
            <a key={f[0]} href={href({ f: f[0], all: showAll, whatIf: whatIf, hash: '#ledger' })} className={filter === f[0] ? 'on' : ''} aria-current={filter === f[0] ? 'true' : undefined}>
              {f[1]}
            </a>
          );
        })}
      </nav>
      {filter === 'all' ? (
        <>
          <div className="oc-mo">
            Revenue<span className="pos">{formatCentsDelta(s.revenue_total)}</span>
          </div>
          <ul className="oc-lg">
            {revenueRows.map(function (r) {
              return <LedgerRow key={r.seq} r={r} />;
            })}
          </ul>
        </>
      ) : null}
      {schedShown.length ? (
        <>
          <div className="oc-mo">
            Expenses · scheduled<span>{formatCentsDelta(-n(s.expenses_scheduled))}</span>
          </div>
          <ul className="oc-lg">
            {schedShown.map(function (r) {
              return <LedgerRow key={r.seq} r={r} />;
            })}
          </ul>
        </>
      ) : null}
      <div className="oc-mo">
        Expenses · paid<span>{filter === 'all' ? formatCentsDelta(-n(s.expenses_paid)) : paid.length + (paid.length === 1 ? ' entry' : ' entries')}</span>
      </div>
      {paidShown.length ? (
        <ul className="oc-lg">
          {paidShown.map(function (r) {
            return <LedgerRow key={r.seq} r={r} />;
          })}
        </ul>
      ) : (
        <p className="empty-note">Nothing of this kind this season.</p>
      )}
      {!showAll && (paid.length > paidShown.length || sched.length > schedShown.length) ? (
        <a className="oc-go2" href={href({ f: filter, all: true, whatIf: whatIf, hash: '#ledger' })}>
          See the full ledger
        </a>
      ) : null}
    </section>
  );

  return (
    <div className="oc-root">
      <div className="oc-title">
        <span>
          <b>Owner Cash Accounting</b>
          <span>{st.team_name}</span>
        </span>
        <span className="oc-season">{st.season} season</span>
      </div>
      <div className="oc-lay">
        <div className="oc-main">{statement}</div>
        <div className="oc-side">{ledgerPanel}</div>
      </div>
    </div>
  );
}
