'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  searchFreeAgents,
  submitOffer,
  withdrawOffer,
  previewWindow,
  resolveWindow,
} from './actions';
import { formatMoney } from '../../lib/formatMoney';
import { formatShortDateTime } from '../../lib/formatDate';
import { leagueMinimumSalary } from '../../lib/leagueMinimum';

// The board, the offer form, and the commissioner's resolve panel.
//
// THE FORM IS DELIBERATELY SIMPLER THAN THE AUCTION'S BidForm. It writes a straight
// multi-year deal: salary per season, an optional signing bonus spread evenly, no option
// bonuses and no void years. That is the phase-1 scope. Every rule -- the league minimum,
// the Deion Rule, the 30% Rule, FA-14's roster-bonus prohibition, the practice squad cap
// -- is enforced in the database and comes back as a plain-language error, so this form
// does not re-implement any of them and cannot drift from them.

// NOTHING HERE READS THE CLOCK. Every time-dependent value is derived from the `now`
// state below, which is null until the component mounts. This is a client component, so
// Next.js renders it once on the server too; a Date.now() in the render body gives the
// server one answer and the browser another a moment later, and React reports that as a
// hydration mismatch. Passing the clock in as state makes the first client paint match
// the server exactly, and the ticker then updates it.
function countdown(iso, nowMs) {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return 'closed';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

// The signing bonus is spread evenly across the contract's seasons, with the remainder on
// the last one so the parts always add back to the whole.
function prorate(total, years) {
  const t = Number(total) || 0;
  if (years < 1) return [];
  const each = Math.floor((t / years) * 100) / 100;
  const parts = [];
  for (let i = 0; i < years - 1; i += 1) parts.push(each);
  parts.push(Math.round((t - each * (years - 1)) * 100) / 100);
  return parts;
}

export default function FreeAgencyBoard(props) {
  const board = props.board || [];
  const myOffers = props.myOffers || [];

  // The clock, as state. Null on the server and on the first client paint; set on mount
  // and ticked every thirty seconds so the countdowns move without a reload.
  const [now, setNow] = useState(null);
  useEffect(function () {
    setNow(Date.now());
    const t = setInterval(function () { setNow(Date.now()); }, 30000);
    return function () { clearInterval(t); };
  }, []);

  // 5.14(b): until this instant, an offer on a player who has never held an EDFL contract
  // wins him outright rather than opening an eight-hour window. The database decides this
  // for real on submit; here it only shapes what the owner is told before they click, so
  // before mount it stays false and the notice simply has not appeared yet.
  const firstOfferUntil = props.firstOfferUntil
    ? new Date(props.firstOfferUntil).getTime()
    : null;
  const exemptionLive = Boolean(firstOfferUntil) && now !== null && now < firstOfferUntil;
  function signsInstantly(p) {
    return Boolean(exemptionLive && p && p.hasPriorContract === false);
  }

  // The league minimum for the Nth season of a deal starting this year, from the module
  // the repo already keeps in step with league_minimum_salary() for exactly this purpose.
  // The database re-tests it on submit; this only stops the form defaulting a later year
  // to a figure that season has outgrown -- 9 in 2026, 10 in 2027.
  function minFor(i) {
    return leagueMinimumSalary(props.season + i);
  }

  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [player, setPlayer] = useState(null);

  const [kind, setKind] = useState('active');
  const [years, setYears] = useState(1);
  const [voidYears, setVoidYears] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [salaries, setSalaries] = useState([{ g: minFor(0), ng: 0, rb: 0, ob: 0 }]);
  const [detail, setDetail] = useState(null);

  // One entry per window. myOffers arrives newest first, so a plain assignment would let
  // an older withdrawn offer overwrite the live one an owner re-submitted afterwards --
  // the row would read "withdrawn" and the Withdraw button would disappear from an offer
  // that is still standing. A live offer always wins; otherwise the newest is kept.
  const offerByWindow = {};
  myOffers.forEach(function (o) {
    const held = offerByWindow[o.window_id];
    if (!held || (held.status !== 'submitted' && o.status === 'submitted')) {
      offerByWindow[o.window_id] = o;
    }
  });

  function clearMessages() { setNotice(null); setFailure(null); }

  // Five, matching the auction's BidForm: real years plus void years may not exceed five.
  // Read from that form rather than picked (SR-36), and confirmed as the commissioner's
  // ruling for free agency too.
  const MAX_SLOTS = 5;

  function setYearCount(n) {
    const count = Math.max(1, Math.min(MAX_SLOTS, Number(n) || 1));
    setYears(count);
    if (count + voidYears > MAX_SLOTS) setVoidYears(MAX_SLOTS - count);
    const next = [];
    for (let i = 0; i < count; i += 1) next.push(salaries[i] || { g: minFor(i), ng: 0, rb: 0, ob: 0 });
    setSalaries(next);
    if (kind === 'practice_squad' && count !== 1) setKind('active');
  }

  function setVoidCount(n) {
    setVoidYears(Math.max(0, Math.min(MAX_SLOTS - years, Number(n) || 0)));
  }

  function setSalary(i, field, value) {
    const next = salaries.slice();
    next[i] = Object.assign({}, next[i]);
    next[i][field] = value === '' ? '' : Number(value);
    setSalaries(next);
  }

  function onSearch(text) {
    setQuery(text);
    setPlayer(null);
    if (text.trim().length < 2) { setResults([]); return; }
    startTransition(async function () {
      const res = await searchFreeAgents(text);
      if (res.ok) setResults(res.data);
    });
  }

  function onSubmit() {
    clearMessages();
    if (!player) { setFailure('Pick a player first.'); return; }

    const voids = kind === 'practice_squad' ? 0 : voidYears;
    const slots = years + voids;

    // The signing bonus spreads across every slot, real and void alike -- absorbing
    // proration past the last real season is the only thing a void year is for here.
    const psb = prorate(kind === 'practice_squad' ? 0 : bonus, slots);

    const payload = [];
    for (let i = 0; i < years; i += 1) {
      payload.push({
        contract_year_number: i + 1,
        league_season_year: props.season + i,
        prorated_signing_bonus: psb[i],
        guaranteed_salary: Number(salaries[i].g) || 0,
        non_guaranteed_salary: Number(salaries[i].ng) || 0,
        // FA-14 bans a roster bonus in the SIGNING season only, so year 1 is forced to
        // zero here and every later year carries whatever the owner entered. The database
        // tests the same rule on the way in (check_inseason_signing_no_roster_bonus keys
        // on league_season_year = start_year), so this is the form agreeing with it rather
        // than the form deciding it.
        roster_bonus: i === 0 ? 0 : (Number(salaries[i].rb) || 0),
        is_void_year: false,
      });
    }
    // Void years trail the real ones and carry proration only -- no salary, no bonus.
    // edfl_delegation_years_valid refuses any other shape, and void_reason is derived in
    // the database rather than sent from here.
    for (let v = 0; v < voids; v += 1) {
      payload.push({
        contract_year_number: years + v + 1,
        league_season_year: props.season + years + v,
        prorated_signing_bonus: psb[years + v],
        guaranteed_salary: 0,
        non_guaranteed_salary: 0,
        roster_bonus: 0,
        is_void_year: true,
      });
    }

    // Option bonuses are their own array, never a key inside a contract year -- that is
    // the shape bid_option_bonuses uses, and the years payload is validated against an
    // exact seven-key contract shared with the auction. Zero entries are dropped, and
    // year 1 never gets one (FA-14).
    const optionBonuses = [];
    for (let i = 1; i < years; i += 1) {
      const amt = Number(salaries[i].ob) || 0;
      if (amt > 0) {
        optionBonuses.push({ exercise_season_year: props.season + i, bonus_amount: amt });
      }
    }

    startTransition(async function () {
      const res = await submitOffer({
        playerId: player.id,
        offerKind: kind,
        totalYears: years,
        voidYears: voids,
        signingBonusTotal: kind === 'practice_squad' ? 0 : Number(bonus) || 0,
        years: payload,
        optionBonuses: kind === 'practice_squad' ? [] : optionBonuses,
      });
      if (!res.ok) { setFailure(res.message); return; }

      const d = res.data || {};
      if (d.instant) {
        // Settled in the same transaction. 'void' means the offer was legal enough to
        // submit but failed a gate the award applies -- owner cash, or a practice squad
        // slot -- so the player is still free and the reason comes back with it.
        if (d.result === 'awarded') {
          setNotice(
            'Signed ' + player.full_name + ' — the contract is live now. He had never held an ' +
            'EDFL contract, so under the September 14 exemption the first valid offer won him ' +
            'outright. Total PPV ' + d.total_ppv + '.'
          );
        } else {
          const why = (d.blocked_reasons || []).map(function (b) { return b.reason; }).join('; ');
          setFailure(
            'The offer on ' + player.full_name + ' could not be honoured, so he is still a free ' +
            'agent and open to the next offer.' + (why ? ' ' + why + '.' : '')
          );
          return;
        }
      } else {
        setNotice(
          'Offer submitted on ' + player.full_name + ' — total PPV ' + d.total_ppv +
          '. The window closes ' +
          formatShortDateTime(d.closes_at) + '.'
        );
      }
      setPlayer(null); setQuery(''); setResults([]);
    });
  }

  function onWithdraw(offerId) {
    clearMessages();
    startTransition(async function () {
      const res = await withdrawOffer(offerId);
      if (!res.ok) { setFailure(res.message); return; }
      setNotice('Offer withdrawn. You may offer again while the window is open.');
    });
  }

  function onPreview(windowId) {
    clearMessages(); setDetail(null);
    startTransition(async function () {
      const res = await previewWindow(windowId);
      if (!res.ok) { setFailure(res.message); return; }
      setDetail(res.data);
    });
  }

  function onResolve(windowId) {
    clearMessages();
    startTransition(async function () {
      const res = await resolveWindow(windowId);
      if (!res.ok) { setFailure(res.message); return; }
      setDetail(null);
      setNotice(
        res.data.result === 'awarded'
          ? 'Resolved — contract created. ' + (res.data.passed_over || 0) + ' offer(s) passed over.'
          : 'Resolved — no legal offer. The player returns to the pool.'
      );
    });
  }

  return (
    <div>
      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

      <h2 className="section-heading">Open windows</h2>
      {board.length === 0 && (
        <p className="empty-note">
          No windows are open. Make an offer below and you will start one.
        </p>
      )}

      {/*
        A .ledger, NOT a .grid-table. CLAUDE.md is explicit: .grid-table is the numeric
        primitive and its consumers are all cap and cash grids, while .ledger is for rows a
        human reads. This table holds a player name, a team name, a status phrase and up to
        two buttons per row -- the same shape as the Sleeper Sync table that scrolled
        sideways by 332px until it was moved. Every cell carries data-label because
        .ledger flips to cards at 640px and reads the label from that attribute.
      */}
      {board.length > 0 && (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>Opened by</th>
                <th>Closes in</th>
                <th>Interest</th>
                <th>Your offer</th>
                <th className="col-status"></th>
              </tr>
            </thead>
            <tbody>
              {board.map(function (w) {
                const mine = offerByWindow[w.window_id];
                // Before mount the clock is unknown, so a window is treated as still open
                // and the commissioner's buttons simply have not appeared yet. Nothing is
                // decided here -- the database refuses a resolve before closes_at anyway.
                const closed = now !== null && new Date(w.closes_at).getTime() <= now;
                return (
                  <tr key={w.window_id}>
                    <td data-label="Player">{w.player_name}</td>
                    <td data-label="Pos">{w.position}</td>
                    <td data-label="Opened by">{w.opened_by}</td>
                    <td data-label="Closes in">
                      {now === null ? formatShortDateTime(w.closes_at)
                        : closed ? 'closed' : countdown(w.closes_at, now)}
                    </td>
                    <td data-label="Interest">{w.is_contested ? 'Contested' : 'Uncontested'}</td>
                    <td data-label="Your offer">
                      {mine
                        ? mine.status === 'submitted'
                          ? mine.offer_kind === 'practice_squad'
                            ? 'In (practice squad)'
                            : 'In (' + mine.total_years + 'yr)'
                          : mine.status
                        : '\u2014'}
                    </td>
                    {/*
                      Stacked, not side by side. A cell's natural width becomes the widest
                      single button instead of the sum of them -- the .sync-choices lesson.
                    */}
                    <td className="col-status" data-label="">
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                        {mine && mine.status === 'submitted' && !closed && (
                          <button type="button" className="btn btn-quiet"
                            onClick={function () { onWithdraw(mine.id); }} disabled={pending}>
                            Withdraw
                          </button>
                        )}
                        {props.canResolve && closed && (
                          <>
                            <button type="button" className="btn btn-secondary"
                              onClick={function () { onPreview(w.window_id); }} disabled={pending}>
                              Preview
                            </button>
                            <button type="button" className="btn"
                              onClick={function () { onResolve(w.window_id); }} disabled={pending}>
                              Resolve
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 6, padding: 16 }}>
          <p className="stat-label" style={{ margin: '0 0 10px' }}>
            Preview &mdash; signing week {detail.signing_week}, fraction {detail.signing_fraction}
          </p>
          <div className="table-scroll">
            {/*
              Also a .ledger. The three money columns are numbers, but the Outcome column
              carries a whole sentence -- "passed over - Owner Cash: needs 600, has 347" --
              and one sentence column is what decides it. col-num right-aligns the figures
              inside it, which is the part of .grid-table this table actually wanted.
            */}
            <table className="ledger">
              <thead>
                <tr>
                  <th>#</th><th>Team</th><th>Kind</th>
                  <th className="col-num">PPV</th>
                  <th className="col-num">Season cash</th>
                  <th className="col-num">Cash available</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {(detail.offers || []).map(function (o) {
                  return (
                    <tr key={o.offer_id}>
                      <td data-label="#">{o.rank}</td>
                      <td data-label="Team">{o.team}</td>
                      <td data-label="Kind">{o.offer_kind}</td>
                      <td className="col-num" data-label="PPV">{o.total_ppv}</td>
                      <td className="col-num" data-label="Season cash">{formatMoney(o.season_cash_charge)}</td>
                      <td className="col-num" data-label="Cash available">{formatMoney(o.cash_available)}</td>
                      <td data-label="Outcome">{o.blocked_by ? o.outcome + ' \u2014 ' + o.blocked_by : o.outcome}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="row-note" style={{ marginTop: 10 }}>{detail.result}</p>
        </div>
      )}

      {props.isOpen && (
        <>
          <h2 className="section-heading" style={{ marginTop: 32 }}>Make an offer</h2>
          <div className="admin-form">
            <div className="form-row">
              <label style={{ flex: '1 1 320px' }}>
                Player
                <input
                  type="text"
                  value={player ? player.full_name : query}
                  placeholder="Type at least two letters"
                  onChange={function (e) { onSearch(e.target.value); }}
                />
              </label>
            </div>

            {results.length > 0 && !player && (
              <div className="page-actions" style={{ marginTop: -8, marginBottom: 16 }}>
                {results.map(function (p) {
                  return (
                    <button key={p.id} type="button" className="btn btn-quiet"
                      onClick={function () { setPlayer(p); setResults([]); }}>
                      {p.full_name} · {p.position} · {p.nfl_team || 'FA'}
                      {signsInstantly(p) ? ' · signs instantly' : ''}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="form-row">
              <label>
                Shape
                <select value={kind} onChange={function (e) {
                  setKind(e.target.value);
                  if (e.target.value === 'practice_squad') { setYearCount(1); setBonus(0); }
                }}>
                  <option value="active">Active roster</option>
                  <option value="practice_squad">Practice squad (1 year)</option>
                </select>
              </label>
              <label>
                Seasons
                <input className="num-input" type="number" min="1" max="5" value={years}
                  disabled={kind === 'practice_squad'}
                  onChange={function (e) { setYearCount(e.target.value); }} />
              </label>
              <label>
                Void years
                <input className="num-input" type="number" min="0" max={MAX_SLOTS - years}
                  value={voidYears}
                  disabled={kind === 'practice_squad'}
                  onChange={function (e) { setVoidCount(e.target.value); }} />
              </label>
              <label>
                Signing bonus
                <input className="num-input" type="number" min="0" value={bonus}
                  disabled={kind === 'practice_squad'}
                  onChange={function (e) { setBonus(e.target.value); }} />
              </label>
            </div>

            {salaries.map(function (s, i) {
              return (
                <div className="form-row" key={i}>
                  <label>
                    {props.season + i} guaranteed
                    <input className="num-input" type="number" min="0" value={s.g}
                      onChange={function (e) { setSalary(i, 'g', e.target.value); }} />
                  </label>
                  <label>
                    {props.season + i} non-guaranteed
                    <input className="num-input" type="number" min="0" value={s.ng}
                      onChange={function (e) { setSalary(i, 'ng', e.target.value); }} />
                  </label>
                  {/*
                    FA-14 bans a roster bonus in the SIGNING season only, so the field is
                    drawn from year 2 on and not at all in year 1 -- offering an input the
                    database will always refuse is worse than not offering it. A practice
                    squad deal is one year by definition, so it never reaches this.
                  */}
                  {i > 0 && kind !== 'practice_squad' && (
                    <label>
                      {props.season + i} roster bonus
                      <input className="num-input" type="number" min="0" value={s.rb}
                        onChange={function (e) { setSalary(i, 'rb', e.target.value); }} />
                    </label>
                  )}
                  {/*
                    Option bonuses are year 2 on and veteran contracts only --
                    check_option_bonus_not_year1 and check_option_bonus_contract_type both
                    refuse anything else, so the field is simply not drawn there.
                  */}
                  {i > 0 && kind !== 'practice_squad' && (
                    <label>
                      {props.season + i} option bonus
                      <input className="num-input" type="number" min="0" value={s.ob}
                        onChange={function (e) { setSalary(i, 'ob', e.target.value); }} />
                    </label>
                  )}
                  {kind !== 'practice_squad' && minFor(i) > 0 && (
                    <span className="row-note" style={{ alignSelf: 'flex-end', paddingBottom: 10 }}>
                      minimum {formatMoney(minFor(i))}
                      {i === 0 ? ' (plus any signing bonus)' : ' (salary plus roster bonus)'}
                    </span>
                  )}
                </div>
              );
            })}

            {signsInstantly(player) && (
              <p className="form-notice">
                {player.full_name} has never held an EDFL contract, so until midnight ET on
                September 14 he is exempt from the eight-hour window: submit a valid offer and
                he is signed immediately. Nobody gets a chance to bid against you, and you get
                no chance to change your mind.
              </p>
            )}

            {voidYears > 0 && kind !== 'practice_squad' && (
              <p className="row-note">
                {voidYears === 1 ? 'One void season, ' : voidYears + ' void seasons, '}
                {props.season + years}
                {voidYears > 1 ? '\u2013' + (props.season + years + voidYears - 1) : ''}
                {'. '}
                A void season carries a share of the signing bonus and nothing else &mdash; no
                salary, no roster bonus, and the player is not on your roster for it.
              </p>
            )}

            <p className="row-note">
              The signing bonus is spread evenly across every season including void ones, and
              counts toward the first season&apos;s minimum. A roster bonus and an option bonus
              are each available from the second season on and count toward that season&apos;s
              minimum; rule FA-14 bars both in the season the contract is signed, which is why
              the first year has neither field. An option bonus prorates over five seasons when
              it triggers, and the database adds whatever void seasons that needs on its own.
              Salary is written in full and pro-rated for the weeks left in the season when the
              cap and cash are charged &mdash; the figures above are the full season. Every rule
              is checked when you submit, and any refusal names the season it applies to.
            </p>

            <div className="control-row">
              <button type="button" className="btn" onClick={onSubmit} disabled={pending || !player}>
                {pending ? 'Working...' : 'Submit offer'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
