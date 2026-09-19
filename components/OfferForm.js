'use client';

import { useState } from 'react';
import { useTransition } from 'react';
import { submitOffer } from '../app/free-agency/actions';
import { formatCost } from '../lib/formatMoney';
import { formatDate, formatShortDateTime } from '../lib/formatDate';
import { leagueMinimumSalary } from '../lib/leagueMinimum';
import { buildWeightLookup, rowPpv } from '../lib/ppvMath';
import TaxiReturnNotice from './TaxiReturnNotice';

/**
 * THE OFFER FORM -- one form, two screens. Phase 2D-3, September 19 2026 (ET).
 *
 * WHY THIS FILE EXISTS. Until 2D-3 this form was 250 lines inside
 * FreeAgencyBoard.js, and the poach path ran through it: pickPoach, the
 * 5.17(c)/(d) mirrors, the bar check, the roster- and option-bonus
 * suppression. The approved artboards move poaching onto its own route,
 * and the one thing that must NOT follow it is a second copy of this
 * form. A poach bid is an ordinary submit_fa_offer call -- CLAUDE.md is
 * explicit that poach-ness is the WINDOW's kind and never the offer's,
 * and that there is no second RPC. Two forms would be two payload
 * builders against one RPC, which is the drift CLAUDE.md warns about for
 * the shared trade-impact component, with rules in it.
 *
 * So: /free-agency and /poaching both mount THIS, and the only
 * difference between an offer and a bid is the `poach` prop.
 *
 * WHERE THE SERVER ACTION LIVES, AND WHY IT IS NOT HERE.
 * submitOffer stays in app/free-agency/actions.js -- the route that owns
 * the RPC keeps it, and this form reaches to it. The alternative is an
 * action in each route calling the same RPC, which is the second copy
 * again, one layer down.
 *
 * NOTHING HERE DECIDES A RULE. The league minimum, the Deion Rule, the
 * 30% Rule, FA-14's roster-bonus prohibition, the practice squad cap,
 * PO-17 and the 5.17 bar are all the database's, tested again on submit,
 * and its refusal is what the caller draws. The checks below are
 * advisory and CLAUDE.md says so: "The poach checks on the offer form
 * are advisory. edfl_poach_offer_valid is the rule; the form mirrors it
 * so an owner sees the problem before submitting. When the two disagree,
 * the database is right and the form is the defect."
 *
 * R-12 (phase 2E). Every figure drawn here is a CHARGE -- a salary, a
 * bonus, a league minimum an owner must meet, a cash floor a bid may not
 * go under -- so every one of them is formatCost and rounds UP. There is
 * no room figure on this form and no ledger figure, so formatRoom and
 * formatMoney are not imported. Rounding a floor DOWN would print a
 * minimum an owner could legally bid under, which is exactly the
 * direction R-12 exists to forbid.
 */

// The signing bonus is spread evenly across the contract's seasons, with the
// remainder on the last one so the parts always add back to the whole.
function prorate(total, years) {
  const t = Number(total) || 0;
  if (years < 1) return [];
  const each = Math.floor((t / years) * 100) / 100;
  const parts = [];
  for (let i = 0; i < years - 1; i += 1) parts.push(each);
  parts.push(Math.round((t - each * (years - 1)) * 100) / 100);
  return parts;
}

function ppvText(v) {
  if (v === null || v === undefined || v === '') return '—';
  return (Math.round(Number(v) * 100) / 100).toFixed(2);
}

// Five, matching the auction's BidForm: real years plus void years may not
// exceed five. Read from that form rather than picked (SR-36), and confirmed
// as the commissioner's ruling for free agency too.
const MAX_SLOTS = 5;

export default function OfferForm(props) {
  const season = props.season;
  const player = props.player;
  const poach = props.poach || null;
  const weights = buildWeightLookup(props.weightRows);

  // The league minimum for the Nth season of a deal starting this year, from
  // the module the repo already keeps in step with league_minimum_salary().
  // The database re-tests it on submit; this only stops the form defaulting a
  // later year to a figure that season has outgrown -- 9 in 2026, 10 in 2027.
  function minFor(i) {
    return leagueMinimumSalary(season + i);
  }

  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState(poach ? 'active' : 'active');
  const [years, setYears] = useState(1);
  const [voidYears, setVoidYears] = useState(0);
  const [bonus, setBonus] = useState(function () {
    // POACH DEFAULTS -- the smallest bid the database would accept. A $2
    // signing bonus (5.17(c)) and a first-year salary that brings his cash up
    // to both the league minimum and his current season cash (PO-17), less the
    // $2 the bonus already contributes to year one.
    return poach ? 2 : 0;
  });
  const [salaries, setSalaries] = useState(function () {
    if (!poach) return [{ g: leagueMinimumSalary(season), ng: 0, rb: 0, ob: 0 }];
    const seasonCash = Number(poach.seasonCash) || 0;
    const firstYear = Math.max(leagueMinimumSalary(season), Math.ceil(seasonCash)) - 2;
    return [{ g: firstYear, ng: 0, rb: 0, ob: 0 }];
  });

  function setYearCount(n) {
    const count = Math.max(1, Math.min(MAX_SLOTS, Number(n) || 1));
    setYears(count);
    if (count + voidYears > MAX_SLOTS) setVoidYears(MAX_SLOTS - count);
    const next = [];
    for (let i = 0; i < count; i += 1) {
      next.push(salaries[i] || { g: minFor(i), ng: 0, rb: 0, ob: 0 });
    }
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

  // Running PPV of what is in the form, on the ppv_weight_table weights. A
  // guide only -- free_agent_offer_ppv in the database is the figure that ranks.
  let runningPpv = 0;
  for (let i = 0; i < years; i += 1) {
    const row = salaries[i] || {};
    runningPpv += rowPpv({
      yearNumber: i + 1,
      isVoid: false,
      signingBonusTotal: kind === 'practice_squad' ? 0 : Number(bonus) || 0,
      guaranteedSalary: row.g,
      nonGuaranteedSalary: row.ng,
      rosterBonus: poach || i === 0 ? 0 : row.rb,
      optionBonus: poach || i === 0 ? 0 : row.ob,
      weights: weights,
    });
  }

  // The poach checks, in the order edfl_poach_offer_valid applies them.
  // Advisory: the database re-tests every one on submit and its wording is
  // the one that counts. Every figure is formatCost (R-12) -- each is a
  // charge or a floor, and a floor that rounded down would name a minimum an
  // owner could legally bid under.
  const poachProblems = [];
  if (poach) {
    const b = Number(bonus) || 0;
    if (b < 2) poachProblems.push('Signing bonus must be at least $2 (Rule 5.17(c)).');
    const y1 =
      (Number(salaries[0] && salaries[0].g) || 0) +
      (Number(salaries[0] && salaries[0].ng) || 0) +
      b;
    if (y1 < minFor(0)) {
      poachProblems.push(
        season + ' cash is ' + formatCost(y1) + '; the league minimum is ' +
        formatCost(minFor(0)) + ' (Rule 5.17(c)).'
      );
    }
    if (y1 < poach.seasonCash) {
      poachProblems.push(
        season + ' cash is ' + formatCost(y1) + '; he already earns ' +
        formatCost(poach.seasonCash) + ' this season, and a bid may not pay him less.'
      );
    }
    for (let i = 1; i < years; i += 1) {
      const c =
        (Number(salaries[i] && salaries[i].g) || 0) +
        (Number(salaries[i] && salaries[i].ng) || 0);
      if (c < minFor(i)) {
        poachProblems.push(
          (season + i) + ' salary is ' + formatCost(c) + '; the minimum is ' +
          formatCost(minFor(i)) + ' (Rule 5.6 — the signing bonus counts in the first year only).'
        );
      }
    }
    if (poach.bar !== null && poach.bar !== undefined && runningPpv <= poach.bar) {
      poachProblems.push(
        'Total PPV ' + ppvText(runningPpv) + ' does not beat the bar of ' +
        ppvText(poach.bar) + '. It would lose.'
      );
    }
  }

  function onSubmit() {
    if (!player) { props.onFail('Pick a player first.'); return; }

    const voids = kind === 'practice_squad' ? 0 : voidYears;
    const slots = years + voids;

    // The signing bonus spreads across every slot, real and void alike --
    // absorbing proration past the last real season is the only thing a void
    // year is for here.
    const psb = prorate(kind === 'practice_squad' ? 0 : bonus, slots);

    const payload = [];
    for (let i = 0; i < years; i += 1) {
      payload.push({
        contract_year_number: i + 1,
        league_season_year: season + i,
        prorated_signing_bonus: psb[i],
        guaranteed_salary: Number(salaries[i].g) || 0,
        non_guaranteed_salary: Number(salaries[i].ng) || 0,
        // FA-14 bans a roster bonus in the SIGNING season only, so year 1 is
        // forced to zero here and every later year carries whatever the owner
        // entered. The database tests the same rule on the way in
        // (check_inseason_signing_no_roster_bonus keys on
        // league_season_year = start_year), so this is the form agreeing with
        // it rather than the form deciding it.
        // A poach bid carries no roster bonus in any year (5.17(d)).
        roster_bonus: i === 0 || poach ? 0 : (Number(salaries[i].rb) || 0),
        is_void_year: false,
      });
    }
    // Void years trail the real ones and carry proration only -- no salary, no
    // bonus. edfl_delegation_years_valid refuses any other shape, and
    // void_reason is derived in the database rather than sent from here.
    for (let v = 0; v < voids; v += 1) {
      payload.push({
        contract_year_number: years + v + 1,
        league_season_year: season + years + v,
        prorated_signing_bonus: psb[years + v],
        guaranteed_salary: 0,
        non_guaranteed_salary: 0,
        roster_bonus: 0,
        is_void_year: true,
      });
    }

    // Option bonuses are their own array, never a key inside a contract year --
    // that is the shape bid_option_bonuses uses, and the years payload is
    // validated against an exact seven-key contract shared with the auction.
    // Zero entries are dropped, and year 1 never gets one (FA-14).
    // ...and no option bonus in any year of a poach bid (5.17(d)).
    const optionBonuses = [];
    for (let i = 1; i < years && !poach; i += 1) {
      const amt = Number(salaries[i].ob) || 0;
      if (amt > 0) {
        optionBonuses.push({ exercise_season_year: season + i, bonus_amount: amt });
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
      if (!res.ok) { props.onFail(res.message); return; }

      const d = res.data || {};
      if (d.instant) {
        // Settled in the same transaction. 'void' means the offer was legal
        // enough to submit but failed a gate the award applies -- owner cash,
        // or a practice squad slot -- so the player is still free and the
        // reason comes back with it.
        if (d.result === 'awarded') {
          props.onDone(
            'Signed ' + player.full_name + ' — the contract is live now. He had never held an ' +
            'EDFL contract, so under the first-offer exemption the first valid offer won him ' +
            'outright. Total PPV ' + d.total_ppv + '.'
          );
          return;
        }
        const why = (d.blocked_reasons || []).map(function (b) { return b.reason; }).join('; ');
        props.onFail(
          'The offer on ' + player.full_name + ' could not be honoured, so he is still a free ' +
          'agent and open to the next offer.' + (why ? ' ' + why + '.' : '')
        );
        return;
      }

      // The window's kind is the only source of poach-ness (CLAUDE.md), so the
      // wording is read off what came back rather than off the prop that sent it.
      const what = d.window_kind === 'poach'
        ? (poach && poach.isMine ? 'Bid to keep ' : 'Poach bid on ')
        : 'Offer on ';
      props.onDone(
        what + player.full_name + (d.revision ? ' raised' : ' submitted') +
        ' — total PPV ' + ppvText(d.total_ppv) + '. The window closes ' +
        formatShortDateTime(d.closes_at) + '. It cannot be withdrawn or lowered; you may ' +
        'replace it with a higher offer until then.'
      );
    });
  }

  const heading = poach
    ? (poach.isMine ? 'Bid to keep ' : 'Poach bid on ') + player.full_name
    : 'Offer on ' + player.full_name;

  return (
    <div className="mk-item" id="offer-form">
      {/* .mk-offer, NOT .mk-form. 2D-2's .mk-form is the waiver wire's
          one-select claim form -- it carries a top hairline, a raised
          background and a `select { display: block; width: 100% }` rule that
          would fight this form's .form-row labels. A different shape gets a
          different class rather than an override of somebody else's. */}
      {/* admin-form as well, and it is load-bearing, not decoration.
          `.admin-form input, .admin-form select` in globals.css is what gives
          every form control in this app its 44px min-height (var(--tap)),
          16px type and focus ring. Dropping the class in the redesign left
          the offer form's eleven number inputs 19px tall -- measured, not
          noticed. `.admin-form` itself is one rule, max-width: 900px, so it
          adds no box of its own inside the card. */}
      <div className="mk-offer admin-form">
        <div className="mk-head mk-head-lead">
          <h2 className="section-heading">{heading}</h2>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={props.onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        </div>

        <p className="kit-row-meta">
          {(player.position || '—') + (player.nfl_team ? ' · ' + player.nfl_team : '')}
        </p>

        {poach && (
          <p className="kit-notice mk-notice-info mk-offer-lead">
            <span>
              {poach.isMine
                ? 'Another team has opened a poach window on your player. Your bid replaces his current contract if it wins, and a tie goes to you. '
                : player.full_name + ' is on ' + poach.teamName + '’s practice squad. A winning bid puts him straight onto your active roster. '}
              {poach.bar !== null && poach.bar !== undefined
                ? 'Bar: ' + ppvText(poach.bar) + ' PPV — every bid must be worth more. '
                : 'He is on a practice squad contract, so there is no bar. '}
              He earns {formatCost(poach.seasonCash)} in {season}; a bid may not pay him less.
            </span>
          </p>
        )}

        <div className="form-row">
          <label>
            Shape
            <select
              value={kind}
              disabled={Boolean(poach)}
              onChange={function (e) {
                setKind(e.target.value);
                if (e.target.value === 'practice_squad') { setYearCount(1); setBonus(0); }
              }}
            >
              <option value="active">Active roster</option>
              <option value="practice_squad">Practice squad (1 year)</option>
            </select>
          </label>
          <label>
            Seasons
            <input
              className="num-input" type="number" min="1" max="5" value={years}
              disabled={kind === 'practice_squad'}
              onChange={function (e) { setYearCount(e.target.value); }}
            />
          </label>
          <label>
            Void years
            <input
              className="num-input" type="number" min="0" max={MAX_SLOTS - years}
              value={voidYears}
              disabled={kind === 'practice_squad'}
              onChange={function (e) { setVoidCount(e.target.value); }}
            />
          </label>
          <label>
            Signing bonus
            <input
              className="num-input" type="number" min="0" value={bonus}
              disabled={kind === 'practice_squad'}
              onChange={function (e) { setBonus(e.target.value); }}
            />
          </label>
        </div>

        {salaries.map(function (s, i) {
          return (
            <div className="form-row" key={i}>
              <label>
                {season + i} guaranteed
                <input
                  className="num-input" type="number" min="0" value={s.g}
                  onChange={function (e) { setSalary(i, 'g', e.target.value); }}
                />
              </label>
              <label>
                {season + i} non-guaranteed
                <input
                  className="num-input" type="number" min="0" value={s.ng}
                  onChange={function (e) { setSalary(i, 'ng', e.target.value); }}
                />
              </label>
              {/*
                FA-14 bans a roster bonus in the SIGNING season only, so the
                field is drawn from year 2 on and not at all in year 1 --
                offering an input the database will always refuse is worse than
                not offering it. A practice squad deal is one year by
                definition, so it never reaches this. A poach bid carries none
                in any year (5.17(d)).
              */}
              {i > 0 && kind !== 'practice_squad' && !poach && (
                <label>
                  {season + i} roster bonus
                  <input
                    className="num-input" type="number" min="0" value={s.rb}
                    onChange={function (e) { setSalary(i, 'rb', e.target.value); }}
                  />
                </label>
              )}
              {/*
                Option bonuses are year 2 on and veteran contracts only --
                check_option_bonus_not_year1 and check_option_bonus_contract_type
                both refuse anything else, so the field is simply not drawn there.
              */}
              {i > 0 && kind !== 'practice_squad' && !poach && (
                <label>
                  {season + i} option bonus
                  <input
                    className="num-input" type="number" min="0" value={s.ob}
                    onChange={function (e) { setSalary(i, 'ob', e.target.value); }}
                  />
                </label>
              )}
              {kind !== 'practice_squad' && minFor(i) > 0 && (
                <span className="row-note" style={{ alignSelf: 'flex-end', paddingBottom: 10 }}>
                  minimum {formatCost(minFor(i))}
                  {i === 0
                    ? ' (plus any signing bonus)' +
                      (poach ? ', and at least ' + formatCost(poach.seasonCash) + ' this season' : '')
                    : poach ? ' (salary alone)' : ' (salary plus roster bonus)'}
                </span>
              )}
            </div>
          );
        })}

        {props.signsInstantly && (
          <p className="kit-notice mk-notice-warn">
            <span>
              {player.full_name} has never held an EDFL contract, so until midnight ET on{' '}
              {formatDate(props.firstOfferUntil)} he is exempt from the 24-hour window: submit a
              valid offer and he is signed immediately. Nobody gets a chance to bid against you,
              and you get no chance to change your mind.
            </span>
          </p>
        )}

        {voidYears > 0 && kind !== 'practice_squad' && (
          <p className="row-note">
            {voidYears === 1 ? 'One void season, ' : voidYears + ' void seasons, '}
            {season + years}
            {voidYears > 1 ? '–' + (season + years + voidYears - 1) : ''}
            {'. '}
            A void season carries a share of the signing bonus and nothing else &mdash; no salary,
            no roster bonus, and the player is not on your roster for it.
          </p>
        )}

        <p className="row-note">
          The signing bonus is spread evenly across every season including void ones, and counts
          toward the first season&apos;s minimum. A roster bonus and an option bonus are each
          available from the second season on and count toward that season&apos;s minimum; rule
          FA-14 bars both in the season the contract is signed, which is why the first year has
          neither field. An option bonus prorates over five seasons when it triggers, and the
          database adds whatever void seasons that needs on its own. Salary is written in full and
          pro-rated for the weeks left in the season when the cap and cash are charged &mdash; the
          figures above are the full season. Every rule is checked when you submit, and any refusal
          names the season it applies to.
        </p>

        {/* Rules 5.15(g) and 5.16(a). Shown for EVERY offer kind, not only
            practice squad ones: the reasoning is the same whichever shape the
            contract takes, and scoping it to one would leave an owner making
            room for an active signing with no warning at all. */}
        {props.wireLive && (
          <p className="kit-notice mk-notice-warn">
            <span>
              <strong>The waiver wire is open.</strong> If you cut a player to make room for this
              signing, he goes to the wire rather than straight to free agency. His roster place
              opens immediately, but his cash and cap stay pending until Wednesday&apos;s run
              &mdash; and another team can claim him before then.
            </span>
          </p>
        )}

        {/* Rule 3.3(d)/(e). Before the button, never on it -- the return is not
            an acquisition and cannot be blocked, so this informs the decision
            and does not gate it. */}
        <TaxiReturnNotice
          returning={props.taxiReturning}
          psCount={props.taxiRoom ? props.taxiRoom.ps_count : null}
          taxiMax={props.taxiRoom ? props.taxiRoom.taxi_squad_size : null}
          addingPracticeSquad={kind === 'practice_squad'}
        />

        <p className="row-note">
          Running total PPV: <strong>{ppvText(runningPpv)}</strong>
          {poach && poach.bar !== null && poach.bar !== undefined
            ? ' · bar ' + ppvText(poach.bar) : ''}
          {' '}&mdash; a guide on the league&apos;s weights; the database&apos;s figure is the one
          that ranks.
        </p>

        {poach && poachProblems.length > 0 && (
          <div className="form-error">
            {poachProblems.map(function (m) { return <div key={m}>{m}</div>; })}
          </div>
        )}

        <p className="row-note">
          Submitting is final: an offer cannot be withdrawn or lowered. You may replace it with a
          higher one before the window closes.
        </p>

        <div className="mk-form-actions">
          <button
            type="button"
            className="btn kit-cta"
            onClick={onSubmit}
            disabled={pending || !player || (poach && poachProblems.length > 0)}
          >
            {pending ? 'Working…' : poach ? 'Submit bid' : 'Submit offer'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={props.onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
