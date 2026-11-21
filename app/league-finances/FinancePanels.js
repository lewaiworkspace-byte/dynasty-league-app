import ExplainButton from '../../components/ExplainButton';
import TeamDisc from '../../components/TeamDisc';
import { formatMoney, formatCost, formatRoom } from '../../lib/formatMoney';

/**
 * THE FOUR TABS OF LEAGUE FINANCES -- UI test batch 27, November 15, 2026.
 *
 * Server-safe render functions (no hooks, no 'use client'): page.js reads, this
 * file draws. Every figure arrives from a league_finance_* view; nothing here
 * adds, subtracts or divides money (SR-23). A bar's width, a cell's shade and
 * each sentence are columns of the views.
 *
 * Which formatter (money-and-dates.md): what the league took -- fines,
 * contract cash paid, cash promised -- is formatCost; cash still in a team's
 * account is formatRoom; issued amounts, refunds and the League Fund are
 * ledger facts, formatMoney.
 *
 * Links are plain anchors. Tabs, filters and seasons are query strings on this
 * page; a team row opens /team/<id> in the pop-up sheet (ui-patterns.md).
 */

const BASE = '/league-finances';

function href(params) {
  const parts = [];
  Object.keys(params).forEach(function (k) {
    const v = params[k];
    if (v === null || v === undefined || v === '' || v === 'all' || v === 'overview') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  });
  return parts.length ? BASE + '?' + parts.join('&') : BASE;
}

function Icon(props) {
  const paths = {
    in: 'M10 3v10M5.5 8.5 10 13l4.5-4.5M4 17h12',
    out: 'M10 13V3M5.5 7.5 10 3l4.5 4.5M4 17h12',
    rev: 'M4 8h10a3 3 0 0 1 0 6H8M7 5 4 8l3 3',
    check: 'M4 10.5 8 14.5 16 6',
    cross: 'M5 5l10 10M15 5 5 15',
  };
  if (props.name === 'clock') {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l3 2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[props.name]} />
    </svg>
  );
}

function plural(n, one, many) {
  return n + ' ' + (Number(n) === 1 ? one : many);
}

// ---- the head ---------------------------------------------------------------

export function FinanceTabs(props) {
  const items = [
    ['overview', 'Overview'],
    ['ledger', 'Ledger'],
    ['outlook', 'Outlook'],
    ['seasons', 'Seasons'],
  ];
  return (
    <nav className="lf-tabs" aria-label="League Finances">
      {items.map(function (it) {
        const on = props.tab === it[0];
        return (
          <a
            key={it[0]}
            href={href({ tab: it[0], season: props.season })}
            className={on ? 'is-on' : undefined}
            aria-current={on ? 'page' : undefined}
          >
            {it[1]}
          </a>
        );
      })}
    </nav>
  );
}

export function SeasonPicker(props) {
  const seasons = props.seasons || [];
  if (seasons.length <= 1) {
    return <span className="lf-season">{props.season} season</span>;
  }
  return (
    <nav className="lf-seasons" aria-label="Season">
      {seasons.map(function (s) {
        const on = s.season_year === props.season;
        return (
          <a
            key={s.season_year}
            href={href({ tab: props.tab, season: s.season_year })}
            className={on ? 'is-on' : undefined}
            aria-current={on ? 'page' : undefined}
          >
            {s.season_year}
          </a>
        );
      })}
    </nav>
  );
}

// ---- shared pieces ----------------------------------------------------------

function Tiles(props) {
  const r = props.row;
  return (
    <div className="lf-tiles">
      <div className="lf-tile edfl-explain-host">
        <span className="lf-tile-l">
          Dispersed
          <ExplainButton label="How dispersed is worked out">
            <ul>
              <li>Everything the league paid into team accounts this season.</li>
              <li>Opening amounts (the revenue share): {formatMoney(r.opening)}.</li>
              <li>Increases: {formatMoney(r.increases)}.</li>
              <li>Cash purchases: {formatMoney(r.purchases_net)}.</li>
              <li>Fines refunded: {formatMoney(r.fines_refunded)}.</li>
            </ul>
          </ExplainButton>
        </span>
        <b>{formatMoney(r.dispersed)}</b>
        <em>to {plural(r.team_count, 'team', 'teams')}</em>
      </div>
      <div className="lf-tile edfl-explain-host">
        <span className="lf-tile-l">
          Collected
          <ExplainButton label="How collected is worked out">
            <ul>
              <li>Everything the league took back from team accounts: fines, and any penalty or deduction.</li>
              <li>Fines charged: {formatCost(r.fines_charged)}, refunds included.</li>
              <li>Fines go into the League Fund; a refund comes back out of it.</li>
            </ul>
          </ExplainButton>
        </span>
        <b>{formatCost(r.collected)}</b>
        <em>{plural(r.fine_count, 'fine', 'fines')}</em>
      </div>
      <div className="lf-tile edfl-explain-host">
        <span className="lf-tile-l">
          On hand
          <ExplainButton label="What the League Fund holds">
            <ul>
              <li>The League Fund: fines charged, less fines refunded.</li>
              <li>It is paid out at the end of the season.</li>
            </ul>
          </ExplainButton>
        </span>
        <b>{formatMoney(r.fund_on_hand)}</b>
        <em>League Fund</em>
      </div>
    </div>
  );
}

function FlowPanel(props) {
  const r = props.row;
  const fundW = Number(r.pct_fund) > 0 ? 'max(4px, ' + r.pct_fund + '%)' : '0';
  return (
    <section className="lf-panel">
      <div className="lf-ph edfl-explain-host">
        <h2>
          Where {r.season_year}&rsquo;s Owner Cash is
          <ExplainButton label="How the Owner Cash split is worked out">
            <ul>
              <li>Issued is the opening amounts, increases and cash purchases.</li>
              <li>Paid on contracts is every team&rsquo;s cash spent this season.</li>
              <li>In team accounts is every team&rsquo;s cash still available.</li>
              <li>The League Fund holds the fines that stand.</li>
            </ul>
          </ExplainButton>
        </h2>
      </div>
      <span className="lf-big">
        {formatMoney(r.issued)}
        <small> issued</small>
      </span>
      <div
        className="lf-flow"
        role="img"
        aria-label={
          'Paid on contracts ' + formatCost(r.paid) + ', in team accounts ' + formatRoom(r.held) +
          ', League Fund ' + formatMoney(r.fund_on_hand)
        }
      >
        <i className="lf-c-paid" style={{ width: r.pct_paid + '%' }} />
        <i className="lf-c-held" style={{ width: r.pct_held + '%' }} />
        <i className="lf-c-fund" style={{ width: fundW }} />
      </div>
      <div className="lf-leg">
        <span><i className="lf-c-paid" />Paid on contracts <b>{formatCost(r.paid)}</b></span>
        <span><i className="lf-c-held" />In team accounts <b>{formatRoom(r.held)}</b></span>
        <span><i className="lf-c-fund" />League Fund <b>{formatMoney(r.fund_on_hand)}</b></span>
      </div>
      {r.summary_sentence ? <p className="lf-say">{r.summary_sentence}</p> : null}
    </section>
  );
}

function ReadError(props) {
  return (
    <p className="form-error">
      Couldn&apos;t load {props.what}: {props.message}. Do not read what is missing as zero.
    </p>
  );
}

// ---- Overview ---------------------------------------------------------------

export function OverviewTab(props) {
  const r = props.row;
  return (
    <div className="lf-two">
      <div>
        <Tiles row={r} />
        <FlowPanel row={r} />
      </div>
      <section className="lf-panel">
        <div className="lf-ph">
          <h2>Owner Cash in team accounts</h2>
          <small>tap a team</small>
        </div>
        {props.accountsError ? (
          <ReadError what="the team accounts" message={props.accountsError} />
        ) : (
          <div className="lf-accts">
            {props.accounts.map(function (a) {
              return (
                <a
                  key={a.team_id}
                  href={'/team/' + a.team_id}
                  className={'lf-acct' + (a.team_id === props.myTeamId ? ' is-me' : '')}
                  aria-label={a.name + ': ' + formatRoom(a.on_hand) + ' in its account'}
                >
                  <TeamDisc className="lf-disc" abbrev={a.abbrev} />
                  <span className="lf-bar">
                    <i style={{ width: (a.pct_of_most_on_hand || 0) + '%' }} />
                  </span>
                  <b>{formatRoom(a.on_hand)}</b>
                </a>
              );
            })}
          </div>
        )}
        {!props.accountsError && r.team_sentence ? <p className="lf-say">{r.team_sentence}</p> : null}
      </section>
    </div>
  );
}

// ---- Ledger -----------------------------------------------------------------

function Amount(props) {
  const g = props.g;
  let main;
  if (g.direction === 'reversed') {
    main = (
      <>
        <b>{formatMoney(g.dispersed)}</b>
        <span>reversed &middot; nets $0</span>
      </>
    );
  } else if (g.direction === 'collected') {
    main = (
      <>
        <b className="lf-in">+{formatCost(g.collected)}</b>
        <span>collected</span>
      </>
    );
  } else {
    main = (
      <>
        <b className="lf-out">&minus;{formatMoney(g.dispersed)}</b>
        <span>dispersed</span>
      </>
    );
  }
  return (
    <span className="lf-amt">
      {main}
      {g.fund_after !== null && g.fund_after !== undefined ? (
        <span>Fund {formatMoney(g.fund_after)}</span>
      ) : null}
    </span>
  );
}

function RowFace(props) {
  const g = props.g;
  const kindClass = g.direction === 'collected' ? 'in' : g.direction === 'reversed' ? 'rev' : 'out';
  return (
    <>
      <span className="lf-date">
        <b>{g.day_label}</b>
        {g.month_label}
      </span>
      <span className="lf-what">
        <b>{g.title}</b>
        <span>{g.detail}</span>
        {g.all_teams ? (
          <span className="lf-every">
            <Icon name={kindClass} /> Every team
          </span>
        ) : (
          <span className="lf-tms">
            {(g.teams || []).map(function (t) {
              return <TeamDisc key={t} className="lf-disc xs" abbrev={t} />;
            })}
          </span>
        )}
        {props.expands ? (
          <span className="lf-more">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" />
            </svg>
            {plural(props.count, 'entry', 'entries')}
          </span>
        ) : null}
      </span>
      <Amount g={g} />
    </>
  );
}

export function LedgerTab(props) {
  const r = props.row;
  const season = r.season_year;
  const filters = [
    ['all', 'All'],
    ['collected', 'Collected'],
    ['dispersed', 'Dispersed'],
    ['reversed', 'Reversed'],
  ];
  const byGroup = {};
  props.items.forEach(function (it) {
    if (!byGroup[it.group_key]) byGroup[it.group_key] = [];
    byGroup[it.group_key].push(it);
  });

  // Group the rows (already in date order from the view) under their month.
  const months = [];
  props.groups.forEach(function (g) {
    const last = months[months.length - 1];
    if (!last || last.name !== g.month_name) months.push({ name: g.month_name, rows: [g] });
    else last.rows.push(g);
  });

  return (
    <>
      <nav className="lf-filt" aria-label="Show">
        {filters.map(function (f) {
          const on = props.filter === f[0];
          return (
            <a
              key={f[0]}
              href={href({ tab: 'ledger', season: season, f: f[0], team: props.team })}
              className={on ? 'is-on' : undefined}
              aria-current={on ? 'true' : undefined}
            >
              {f[1]}
            </a>
          );
        })}
      </nav>
      <nav className="lf-teams" aria-label="Team">
        <a
          href={href({ tab: 'ledger', season: season, f: props.filter })}
          className={'lf-all' + (!props.team ? ' is-on' : '')}
          aria-current={!props.team ? 'true' : undefined}
        >
          All
        </a>
        {props.teams.map(function (t) {
          const on = props.team === t.abbrev;
          return (
            <a
              key={t.id}
              href={href({ tab: 'ledger', season: season, f: props.filter, team: t.abbrev })}
              className={on ? 'is-on' : undefined}
              aria-current={on ? 'true' : undefined}
              aria-label={t.name}
            >
              <TeamDisc className="lf-disc" abbrev={t.abbrev} />
            </a>
          );
        })}
      </nav>
      <div className="lf-tiles">
        <div className="lf-tile">
          <span className="lf-tile-l">Collected</span>
          <b className="lf-in">+{formatCost(r.collected)}</b>
        </div>
        <div className="lf-tile">
          <span className="lf-tile-l">Dispersed</span>
          <b>&minus;{formatMoney(r.dispersed)}</b>
        </div>
        <div className="lf-tile">
          <span className="lf-tile-l">Fund now</span>
          <b>{formatMoney(r.fund_on_hand)}</b>
        </div>
      </div>
      {props.ledgerError ? <ReadError what="the ledger" message={props.ledgerError} /> : null}
      {!props.ledgerError && props.groups.length === 0 ? (
        <p className="lf-empty">No ledger entries match.</p>
      ) : null}
      {months.map(function (mo) {
        return (
          <section key={mo.name + mo.rows[0].group_key} className="lf-month">
            <h2 className="lf-mh">
              <span>{mo.name}</span>
              <span>{mo.rows.length}</span>
            </h2>
            <div className="lf-lg">
              {mo.rows.map(function (g) {
                const members = byGroup[g.group_key] || [];
                if (members.length <= 1 && !props.itemsError) {
                  return (
                    <div key={g.group_key} className={'lf-lr' + (g.reversed ? ' is-rev' : '')}>
                      <RowFace g={g} />
                    </div>
                  );
                }
                return (
                  <details key={g.group_key} className={'lf-lrd' + (g.reversed ? ' is-rev' : '')}>
                    <summary className="lf-lr">
                      <RowFace g={g} expands count={members.length} />
                    </summary>
                    {props.itemsError ? (
                      <p className="lf-empty">Couldn&apos;t load the entries in this row: {props.itemsError}.</p>
                    ) : (
                      <ul className="lf-items">
                        {members.map(function (it) {
                          const took = Number(it.collected) > 0;
                          return (
                            <li key={it.id}>
                              <TeamDisc className="lf-disc xs" abbrev={it.abbrev} />
                              <span>
                                <b>{it.team_name}</b>
                                {it.note ? <span>{it.note}</span> : null}
                              </span>
                              <b className={took ? 'lf-in' : undefined}>
                                {took ? '+' + formatCost(it.collected) : formatMoney(it.dispersed)}
                              </b>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

// ---- Outlook ----------------------------------------------------------------

function OutlookChart(props) {
  const rows = props.rows;
  const W = 340;
  const H = 210;
  const top = 18;
  const bottom = 30;
  const left = 8;
  const right = 8;
  const plotH = H - top - bottom;
  const plotW = W - left - right;
  const slot = plotW / Math.max(rows.length, 1);
  const bw = slot * 0.56;
  function y(pct) {
    return top + plotH - (Number(pct) || 0) / 100 * plotH;
  }
  const base = rows.find(function (o) {
    return o.is_base;
  });
  const refY = base ? y(base.pct_reference) : null;
  return (
    <svg className="lf-chart" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label={props.label}>
      <line x1={left} x2={W - right} y1={top + plotH} y2={top + plotH} stroke="var(--line)" strokeWidth="1" />
      {refY !== null ? (
        <>
          <line x1={left} x2={W - right} y1={refY} y2={refY} stroke="var(--line-strong)" strokeDasharray="4 4" strokeWidth="1.2" />
          <text x={W - right} y={refY - 5} fontSize="10" textAnchor="end" fill="var(--ink-2)">
            {base.season_year} issued {formatMoney(base.reference_issued)}
          </text>
        </>
      ) : null}
      {rows.map(function (o, i) {
        const cx = left + slot * (i + 0.5);
        const x = cx - bw / 2;
        if (o.is_base) {
          const yPaid = y(o.pct_paid);
          const yHeld = y(Number(o.pct_paid) + Number(o.pct_held));
          return (
            <g key={o.season_year}>
              <rect x={x} y={yPaid} width={bw} height={top + plotH - yPaid} rx="3" className="lf-f-paid" />
              <rect x={x} y={yHeld} width={bw} height={Math.max(yPaid - yHeld - 1, 0)} rx="3" className="lf-f-held" />
              <text x={cx} y={H - bottom + 15} fontSize="10.5" fontWeight="700" textAnchor="middle" fill="var(--ink-2)">{o.season_year}</text>
              <text x={cx} y={H - bottom + 27} fontSize="9.5" textAnchor="middle" fill="var(--ink-2)">now</text>
            </g>
          );
        }
        const yRef = y(o.pct_reference);
        const yP = y(o.pct_promised);
        return (
          <g key={o.season_year}>
            <rect x={x} y={yRef} width={bw} height={top + plotH - yRef} rx="3" fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" />
            {Number(o.promised) > 0 ? (
              <rect x={x} y={yP} width={bw} height={top + plotH - yP} rx="3" className="lf-f-paid" />
            ) : null}
            <text x={cx} y={(Number(o.promised) > 0 ? yP : top + plotH) - 5} fontSize="10" fontWeight="600" textAnchor="middle" fill="var(--ink)">
              {formatCost(o.promised)}
            </text>
            <text x={cx} y={H - bottom + 15} fontSize="10.5" textAnchor="middle" fill="var(--ink-2)">{o.season_year}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function OutlookTab(props) {
  const r = props.row;
  const future = props.outlook.filter(function (o) {
    return !o.is_base;
  });
  const gridYears = future.slice(0, 4).map(function (o) {
    return o.season_year;
  });
  const byTeam = {};
  const order = [];
  props.byTeam.forEach(function (c) {
    if (!byTeam[c.team_id]) {
      byTeam[c.team_id] = { abbrev: c.abbrev, name: c.name, cells: {} };
      order.push(c.team_id);
    }
    byTeam[c.team_id].cells[c.season_year] = c;
  });
  const label =
    'Owner Cash by season. ' +
    props.outlook
      .map(function (o) {
        return o.is_base
          ? o.season_year + ': paid ' + formatCost(o.paid) + ', in accounts ' + formatRoom(o.held)
          : o.season_year + ': promised ' + formatCost(o.promised);
      })
      .join('; ');

  return (
    <div className="lf-two">
      <div>
        <section className="lf-panel lf-panel-first">
          <div className="lf-ph edfl-explain-host">
            <h2>
              Five-year outlook
              <ExplainButton label="How the outlook is worked out">
                <ul>
                  <li>This season: cash paid on contracts and cash still in team accounts.</li>
                  <li>Later seasons: Owner Cash already promised on signed contracts.</li>
                  <li>The dashed box is what this season issued. Later seasons&rsquo; revenue share is not voted yet, so nothing is estimated for it.</li>
                </ul>
              </ExplainButton>
            </h2>
            {future.length ? (
              <small>
                {future[0].season_year}&ndash;{future[future.length - 1].season_year}
              </small>
            ) : null}
          </div>
          {props.outlookError ? (
            <ReadError what="the outlook" message={props.outlookError} />
          ) : (
            <>
              <OutlookChart rows={props.outlook} label={label} />
              <div className="lf-leg">
                <span><i className="lf-c-paid" />Paid or promised on contracts</span>
                <span><i className="lf-c-held" />In team accounts</span>
                <span><i className="lf-c-none" />Not voted yet</span>
              </div>
              {r.outlook_sentence ? <p className="lf-say">{r.outlook_sentence}</p> : null}
            </>
          )}
        </section>
      </div>
      <div>
        <section className="lf-panel lf-panel-first">
          <div className="lf-ph">
            <h2>Promised by team</h2>
            <small>Owner Cash on signed contracts</small>
          </div>
          {props.byTeamError ? (
            <ReadError what="promised cash by team" message={props.byTeamError} />
          ) : (
            <table className="lf-heat">
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  {gridYears.map(function (yr) {
                    return <th key={yr} scope="col">{yr}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {order.map(function (id) {
                  const t = byTeam[id];
                  return (
                    <tr key={id} className={id === props.myTeamId ? 'is-me' : undefined}>
                      <th scope="row">
                        <span className="lf-tc">
                          <TeamDisc className="lf-disc xs" abbrev={t.abbrev} />
                          {t.abbrev}
                        </span>
                      </th>
                      {gridYears.map(function (yr) {
                        const c = t.cells[yr];
                        const shade = c ? Number(c.shade) || 0 : 0;
                        return (
                          <td
                            key={yr}
                            style={{ '--lf-shade': String(Math.max(shade, 0.05)) }}
                          >
                            {c && Number(c.promised) > 0 ? formatCost(c.promised) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="lf-heat-total">
                  <th scope="row">League</th>
                  {gridYears.map(function (yr) {
                    const o = future.find(function (f) {
                      return f.season_year === yr;
                    });
                    return <td key={yr}>{o ? formatCost(o.promised) : '—'}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          )}
          {!props.byTeamError && r.outlook_team_sentence ? (
            <p className="lf-say">{r.outlook_team_sentence}</p>
          ) : null}
        </section>
        <section className="lf-panel">
          <div className="lf-ph">
            <h2>Team accounts</h2>
            <small>{r.season_year}</small>
          </div>
          {props.accountsError ? (
            <ReadError what="the team accounts" message={props.accountsError} />
          ) : (
            <table className="lf-tbl">
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Issued</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Fines</th>
                  <th scope="col">On hand</th>
                </tr>
              </thead>
              <tbody>
                {props.accounts.map(function (a) {
                  return (
                    <tr key={a.team_id} className={a.team_id === props.myTeamId ? 'is-me' : undefined}>
                      <th scope="row">
                        <a href={'/team/' + a.team_id} className="lf-tc" aria-label={a.name}>
                          <TeamDisc className="lf-disc s" abbrev={a.abbrev} />
                          {a.abbrev}
                        </a>
                      </th>
                      <td>{formatMoney(a.issued)}</td>
                      <td>{formatCost(a.paid)}</td>
                      <td>{Number(a.fines_net) !== 0 ? formatCost(a.fines_net) : '—'}</td>
                      <td>
                        <b>{formatRoom(a.on_hand)}</b>
                        <span className="lf-mini">
                          <i style={{ width: Math.max(Number(a.pct_left) || 0, 0) + '%' }} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">League</th>
                  <td>{formatMoney(r.issued)}</td>
                  <td>{formatCost(r.paid)}</td>
                  <td>{Number(r.fines_net) !== 0 ? formatCost(r.fines_net) : '—'}</td>
                  <td>{formatRoom(r.held)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

// ---- Seasons ----------------------------------------------------------------

function Check(props) {
  return (
    <div className={'lf-ok' + (props.state === 'ok' ? '' : props.state === 'wait' ? ' is-wait' : ' is-bad')}>
      <Icon name={props.state === 'ok' ? 'check' : props.state === 'wait' ? 'clock' : 'cross'} />
      {props.children}
    </div>
  );
}

export function SeasonsTab(props) {
  const r = props.row;
  const first = props.seasons.length ? props.seasons[0].season_year : r.season_year;
  let status;
  if (r.status === 'open') {
    status = (
      <span className="lf-chip is-open">
        <Icon name="clock" /> {r.is_current ? 'Open · closes on EDFL Bowl day' : 'Open'}
      </span>
    );
  } else {
    status = <span className="lf-chip is-none">Not yet reconciled</span>;
  }
  return (
    <>
      <nav className="lf-yrs" aria-label="Seasons">
        {props.seasons
          .slice()
          .reverse()
          .map(function (s) {
            const on = s.season_year === r.season_year;
            return (
              <a
                key={s.season_year}
                href={href({ tab: 'seasons', season: s.season_year })}
                className={on ? 'is-on' : undefined}
                aria-current={on ? 'page' : undefined}
              >
                {s.season_year}
              </a>
            );
          })}
        <span className="lf-yr-none">Before {first} &middot; not recorded</span>
      </nav>
      <div className="lf-two">
        <div>
          <section className="lf-panel lf-panel-first">
            <div className="lf-ph lf-ph-wrap">
              <h2>{r.season_year} year-end statement</h2>
              {status}
            </div>
            <h3 className="lf-ey">Owner Cash</h3>
            <div className="lf-st">
              <div><span>Revenue share issued</span><b>{formatMoney(r.opening)}</b></div>
              <div><span>Increases</span><b>+{formatMoney(r.increases)}</b></div>
              {Number(r.purchases_net) !== 0 ? (
                <div><span>Cash purchases</span><b>+{formatMoney(r.purchases_net)}</b></div>
              ) : null}
              <div><span>Fines charged</span><b>&minus;{formatCost(r.fines_charged)}</b></div>
              <div><span>Fines refunded</span><b>+{formatMoney(r.fines_refunded)}</b></div>
              {Number(r.other_net) !== 0 ? (
                <div><span>Penalties and deductions</span><b>&minus;{formatCost(r.other_net)}</b></div>
              ) : null}
              <div><span>Paid on contracts</span><b>&minus;{formatCost(r.paid)}</b></div>
              <div className="lf-tot edfl-explain-host">
                <span>
                  In team accounts
                  <ExplainButton label="How the closing balance is worked out">
                    <ul>
                      <li>Every team&rsquo;s cash still available, added up.</li>
                      <li>Each team: opening amount, plus increases, purchases and refunds, less fines, deductions and cash paid on contracts.</li>
                    </ul>
                  </ExplainButton>
                </span>
                <b>{formatRoom(r.held)}</b>
              </div>
            </div>
            <h3 className="lf-ey">League Fund</h3>
            <div className="lf-st">
              <div><span>Fines collected</span><b>{formatCost(r.fines_charged)}</b></div>
              <div><span>Refunded</span><b>&minus;{formatMoney(r.fines_refunded)}</b></div>
              <div className="lf-tot"><span>On hand</span><b>{formatMoney(r.fund_on_hand)}</b></div>
              <div><span>Paid out at season end</span><span className="lf-chip is-open">Awaiting ruling</span></div>
            </div>
          </section>
        </div>
        <div>
          <section className="lf-panel lf-panel-first">
            <div className="lf-ph"><h2>Checks</h2></div>
            <Check state={r.accounts_reconcile ? 'ok' : 'bad'}>
              {r.accounts_reconcile ? 'Every team account adds up' : 'A team account does not add up'}
            </Check>
            <Check state={r.fund_matches_fines ? 'ok' : 'bad'}>
              {r.fund_matches_fines ? 'League Fund matches the fines that stand' : 'League Fund does not match the fines that stand'}
            </Check>
            {Number(r.reversed_items) > 0 ? (
              <Check state={r.reversals_net_zero ? 'ok' : 'bad'}>
                {r.reversals_net_zero ? 'Reversed entries net to $0' : 'A reversed entry does not net to $0'}
              </Check>
            ) : null}
            <Check state="wait">League Fund payout not set</Check>
          </section>
          <section className="lf-panel">
            <div className="lf-ph"><h2>Into {r.season_year + 1}</h2></div>
            <div className="lf-st">
              <div className="edfl-explain-host">
                <span>
                  Unspent team cash
                  <ExplainButton label="What carries over">
                    <ul>
                      <li>Every team&rsquo;s Owner Cash left at the close carries into the next League Year on March 1 (ruling OC-1).</li>
                      <li>A team below zero carries the deficit too.</li>
                    </ul>
                  </ExplainButton>
                </span>
                <b className="lf-quiet">Carries over March 1</b>
              </div>
              <div><span>Opening amounts</span><b className="lf-quiet">Owners&rsquo; vote</b></div>
              <div>
                <span>Already promised</span>
                <b>{props.nextError ? '—' : formatCost(props.nextPromised)}</b>
              </div>
            </div>
          </section>
          <section className="lf-panel lf-soon">
            <div className="lf-ph"><h2>Closing the season</h2></div>
            <p className="lf-quiet">Coming soon: the treasurer and commissioner sign off, and the season locks.</p>
          </section>
        </div>
      </div>
    </>
  );
}
