import ExplainButton from '../../components/ExplainButton';
import TeamDisc from '../../components/TeamDisc';
import { formatRoom } from '../../lib/formatMoney';
import { formatMonthDay } from '../../lib/formatDate';
import { designationFor, CHANGE_LABELS } from '../../lib/injuryReport';
import { daysBetween } from '../calendar/calendarModel';
import { RECENT_DAYS, shortDay, weekdayOf, standingsBar, signed } from './leagueModel';

/**
 * THE LEAGUE PAGE'S MARKUP -- November 14, 2026 (UI test batch 15).
 *
 * A server component that reads nothing: page.js loads and shapes every box
 * and hands the results in, so this file can be rendered on its own (the
 * edfl-measure fixture does exactly that with invented rows). It decides no
 * order and no rule; see page.js for the reads and leagueModel.js for the
 * orderings, and league-page.md for why.
 */

const LOGO = '/brand/edfl-logo.webp';

function Arrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

// The box head: a small line (a link to the full page, or plain text), the
// title, and the league logo on the right.
function BoxHead(props) {
  return (
    <div className="lgx-head">
      <div className="lgx-head-t">
        {props.href ? (
          <a className="lgx-eylink" href={props.href} aria-label={props.label + ': open the full page'}>
            {props.label} <Arrow />
          </a>
        ) : (
          <span className="lgx-ey">{props.label}</span>
        )}
        <h2 className="lgx-title">{props.title}</h2>
      </div>
      <div className="lgx-head-r">
        <img className="lgx-logo" src={LOGO} alt="" width="30" height="30" />
        {props.right || null}
      </div>
    </div>
  );
}

function Disc(props) {
  return <TeamDisc className={props.mine ? 'kit-disc kit-disc-own lgx-disc' : 'kit-disc lgx-disc'} abbrev={props.abbr || ''} />;
}

function BoxError(props) {
  return <p className="form-error lgx-err">{props.children}</p>;
}

function fixed2(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(2);
}

export default function LeagueView(props) {
  const {
    leagueName, season, myTeamId, abbrevById, projWeek, todayKey,
    standings, standingsError,
    injuries, injAny, injCounts, injTotal, injError, statsError,
    tx, txError, txCapped, txCap, projError,
    capRows, capError, capTitle, maxRoom,
    dates, calError,
  } = props;
  const TX_CAP = txCap;

  function teamOf(r) {
    return r.team_to_id || r.team_from_id || null;
  }
  function teamNameOf(r) {
    return r.team_to || r.team_from || '';
  }

  function TxRow(props) {
    const r = props.r;
    const tid = teamOf(r);
    const mine = myTeamId !== null && tid === myTeamId;
    const when = formatMonthDay(r.occurred_at);
    return (
      <li>
        <a className={'lgx-row' + (mine ? ' is-mine' : '')} href={'/player/' + r.player_id}>
          <Disc abbr={abbrevById[tid] || ''} mine={mine} />
          <span className="lgx-bd">
            <b>
              {r.player_name}{' '}
              {r.player_position ? <em>({r.player_position})</em> : null}
            </b>
            <span>{r.title} &middot; {teamNameOf(r)} &middot; {when}</span>
          </span>
          <span className="lgx-vl">
            {r.metric === null ? '—' : fixed2(r.metric)}
            <span>
              {r.metric === null
                ? r.metricKind === 'proj' ? 'no Wk ' + (projWeek || '') + ' proj' : 'no games'
                : r.metricKind === 'proj' ? 'Wk ' + projWeek + ' proj' : 'avg / game'}
            </span>
          </span>
        </a>
      </li>
    );
  }

  return (
    <main className="page lgx-page">
      <div className="lgx-ph edfl-explain-h edfl-explain-host">
        <h1>League</h1>
        <ExplainButton label="What the League page shows" title="What this page shows">
          <ul>
            <li>Five summaries, each linking to its full page.</li>
            <li>Standings: the official table, as the Standings page ranks it. The bar sets points
              for against points against; the figure on it is the difference. Per game or season
              totals, whole numbers, cut toward zero.</li>
            <li>Key Injuries: rostered players with an injury designation, most {season} points
              first.</li>
            <li>Recent Transactions, the last {RECENT_DAYS} days: signings and practice-squad
              promotions ranked by next week&rsquo;s projection, every other move by points per
              game. A player shows once.</li>
            <li>Cap Space: each team&rsquo;s {season} room, rounded down.</li>
            <li>Key Dates: the next one-off dates on the League Calendar.</li>
          </ul>
        </ExplainButton>
      </div>

      <div className="lgx-grid">
        {/* ---- STANDINGS ---- */}
        <section className="lgx-box lgx-st" aria-label="Standings">
          <input className="lgx-rv lgx-r-pg" type="radio" name="lgx-st-view" id="lgx-st-pg" defaultChecked />
          <input className="lgx-rv lgx-r-tot" type="radio" name="lgx-st-view" id="lgx-st-tot" />
          <BoxHead
            label={leagueName + ' · ' + season}
            title="Standings"
            right={
              <div className="lgx-tgl" role="group" aria-label="Show points">
                <label className="lgx-l-pg" htmlFor="lgx-st-pg">Per game</label>
                <label className="lgx-l-tot" htmlFor="lgx-st-tot">Total</label>
              </div>
            }
          />
          {standingsError ? (
            <BoxError>Standings could not be loaded: {standingsError.message}</BoxError>
          ) : standings.length === 0 ? (
            <p className="empty-note">No teams found for {season}.</p>
          ) : (
            <div className="lgx-panes">
              {[true, false].map(function (perGame) {
                return (
                  <div className={perGame ? 'lgx-p-pg' : 'lgx-p-tot'} key={perGame ? 'pg' : 'tot'}>
                    <div className="lgx-sth" aria-hidden="true">
                      <span>{perGame ? 'Avg for' : 'Points for'}</span>
                      <span>{perGame ? 'Per game' : 'Difference'}</span>
                      <span>{perGame ? 'Avg against' : 'Points against'}</span>
                    </div>
                    <ul className="lgx-stl">
                      {standings.map(function (r) {
                        const mine = myTeamId !== null && r.team_id === myTeamId;
                        const bar = standingsBar(r, perGame);
                        const record = r.wins + '–' + r.losses + (r.ties ? '–' + r.ties : '');
                        return (
                          <li key={r.team_id}>
                            <a className={'lgx-sr' + (mine ? ' is-mine' : '')} href={'/team/' + r.team_id}
                              aria-label={(r.team_name || 'Team') + ', ' + record +
                                (bar ? ', ' + (perGame ? 'per game ' : '') + 'points for ' + bar.forText +
                                  ', against ' + bar.againstText + ', difference ' + signed(bar.diff) : '')}>
                              <span className="lgx-rk">{r.league_rank}</span>
                              <span className="lgx-cd">
                                {abbrevById[r.team_id] || ''}
                                <em>{r.games > 0 ? record : '—'}</em>
                              </span>
                              {bar ? (
                                <span className="lgx-tugw" aria-hidden="true">
                                  <span className="lgx-tugv">
                                    <b>{bar.forText}</b>
                                    <span>{bar.againstText}</span>
                                  </span>
                                  <span className="lgx-tug">
                                    <span className="lgx-pf" style={{ width: bar.share.toFixed(2) + '%' }} />
                                    <span className="lgx-pa" />
                                    <span className="lgx-mid" />
                                    <span className={'lgx-knob' + (bar.diff < 0 ? ' is-neg' : '')}
                                      style={{ left: bar.share.toFixed(2) + '%' }}>
                                      {signed(bar.diff)}
                                    </span>
                                  </span>
                                </span>
                              ) : (
                                <span className="lgx-nog">No games yet</span>
                              )}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <a className="lgx-full" href="/standings">Full standings <Arrow /></a>
        </section>

        {/* ---- KEY INJURIES ---- */}
        <section className="lgx-box lgx-inj" aria-label="Key injuries">
          <BoxHead label="Injury Report" href="/injury-report" title="Key Injuries" />
          {injError ? (
            <BoxError>The injury report could not be loaded: {injError.message}</BoxError>
          ) : injAny === false ? (
            <p className="empty-note">No rostered player carries an injury designation.</p>
          ) : (
            <>
              <div className="lgx-stack" role="img"
                aria-label={injTotal + ' rostered players with a designation: ' +
                  injCounts.map(function (c) { return c.label + ' ' + c.n; }).join(', ')}>
                {injCounts.map(function (c) {
                  return <i key={c.label} className={'lgx-s-' + c.shade}
                    style={{ flexGrow: c.n, flexBasis: 0 }} />;
                })}
              </div>
              <div className="lgx-slg">
                {injCounts.map(function (c) {
                  return (
                    <span key={c.label}><i className={'lgx-s-' + c.shade} />{c.label} {c.n}</span>
                  );
                })}
              </div>
              {statsError ? (
                <BoxError>Season points could not be loaded, so this list is not in points order:
                  {' '}{statsError.message}</BoxError>
              ) : null}
              <ul className="lgx-list">
                {injuries.map(function (r) {
                  const d = designationFor(r.injury_status);
                  const mine = myTeamId !== null && r.edfl_team_id === myTeamId;
                  const flag = r.change_flag ? CHANGE_LABELS[r.change_flag] || r.change_flag : '';
                  return (
                    <li key={r.player_id}>
                      <a className={'lgx-row' + (mine ? ' is-mine' : '')} href={'/player/' + r.player_id}>
                        <Disc abbr={abbrevById[r.edfl_team_id] || ''} mine={mine} />
                        <span className="lgx-bd">
                          <b>
                            {r.full_name}{' '}
                            <em>({[r.position, r.nfl_team].filter(Boolean).join(' · ')})</em>
                            {flag ? <span className="lgx-flag">{flag}</span> : null}
                          </b>
                          <span>
                            {d ? <span className={'lgx-ist is-' + d.tone}>{d.label}</span> : null}
                            {r.injury_body_part ? r.injury_body_part + ' · ' : ''}{r.edfl_team || ''}
                          </span>
                        </span>
                        <span className="lgx-vl">
                          {fixed2(r.points)}
                          <span>{season} pts</span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* ---- RECENT TRANSACTIONS ---- */}
        <section className="lgx-box lgx-tx" aria-label="Recent transactions">
          <BoxHead label="Transactions" href="/transactions" title="Recent Transactions" />
          {txError ? (
            <BoxError>Transactions could not be loaded: {txError.message}</BoxError>
          ) : (
            <>
              {txCapped ? (
                <p className="empty-note">Only the newest {TX_CAP} moves were read.</p>
              ) : null}
              {statsError || projError ? (
                <BoxError>Points could not be loaded, so these lists are not in points order:
                  {' '}{(statsError || projError).message}</BoxError>
              ) : null}
              <div className="lgx-grp">
                Signings and promotions
                {projWeek !== null ? <span> &middot; by Week {projWeek} projection</span> : null}
              </div>
              {tx.signings.length === 0 ? (
                <p className="empty-note">No signings or promotions in the last {RECENT_DAYS} days.</p>
              ) : (
                <ul className="lgx-list">
                  {tx.signings.map(function (r) { return <TxRow r={r} key={r.log_id} />; })}
                </ul>
              )}
              <div className="lgx-grp">Other Notable Moves</div>
              {tx.others.length === 0 ? (
                <p className="empty-note">No other moves in the last {RECENT_DAYS} days.</p>
              ) : (
                <ul className="lgx-list">
                  {tx.others.map(function (r) { return <TxRow r={r} key={r.log_id} />; })}
                </ul>
              )}
            </>
          )}
        </section>

        {/* ---- CAP SPACE ---- */}
        <section className="lgx-box lgx-cap" aria-label="Cap space">
          <BoxHead
            label="Salary Cap"
            href="/cap-sheet"
            title={
              <>
                Cap Space
                {capTitle ? <span className="lgx-title-s"> ({capTitle})</span> : null}
              </>
            }
          />
          {capError ? (
            <BoxError>Cap space could not be loaded: {capError.message}</BoxError>
          ) : capRows.length === 0 ? (
            <p className="empty-note">No cap figures for {season}.</p>
          ) : (
            <ul className="lgx-caps" aria-label={'Cap room for every team, ' + season}>
              {capRows.map(function (r) {
                const mine = myTeamId !== null && r.team_id === myTeamId;
                const v = Number(r.cap_space_remaining);
                const w = maxRoom > 0 && Number.isFinite(v) && v > 0 ? Math.max((v / maxRoom) * 100, 1) : 0;
                return (
                  <li key={r.team_id} className={mine ? 'is-mine' : ''}>
                    <span className="lgx-cc">{abbrevById[r.team_id] || ''}</span>
                    <span className="lgx-ctr" aria-hidden="true"><i style={{ width: w.toFixed(1) + '%' }} /></span>
                    <span className="lgx-cv">{formatRoom(r.cap_space_remaining)}</span>
                    <span className="lgx-vh">{r.team_name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- KEY DATES ---- */}
        <section className="lgx-box lgx-dt" aria-label="Key dates">
          <BoxHead label="League Calendar" href="/calendar" title="Key Dates" />
          {calError ? (
            <BoxError>The calendar could not be loaded: {calError.message}</BoxError>
          ) : dates.length === 0 ? (
            <p className="empty-note">No dates ahead on the {season} calendar.</p>
          ) : (
            <ul className="lgx-list">
              {dates.map(function (e) {
                const days = todayKey && e.dateKey ? daysBetween(todayKey, e.dateKey) : null;
                const wd = weekdayOf(e.dayLabel);
                return (
                  <li key={e.id + (e.closes ? ':end' : '')}>
                    <div className="lgx-row">
                      <span className="lgx-dp">{shortDay(e.dayLabel)}</span>
                      <span className="lgx-bd">
                        <b>
                          {e.title}
                          {e.provisional ? <span className="lgx-prov">Provisional</span> : null}
                        </b>
                        <span>
                          {e.closes ? 'Closes ' : ''}{wd}{e.timeLabel ? ' · ' + e.timeLabel : ''}
                        </span>
                      </span>
                      <span className="lgx-dys">
                        {days === null ? '' : days === 0 ? <b>Today</b> : (
                          <><b>{days}</b> {days === 1 ? 'day' : 'days'}</>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
