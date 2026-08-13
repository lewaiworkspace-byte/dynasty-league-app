// Live PPV / cap / cash / dead-money preview for the bid-submission form.
//
// This remains a SEPARATE implementation from lib/contractMath.js for the
// parts that genuinely differ -- the two carry different columns and
// different signing-bonus cash timing. What they must NOT differ on is now
// shared: PPV weighting comes from lib/ppvMath.js and dead cap from
// lib/deadCapPreview.js, so neither can drift from the other or from the
// database.
//
// Both carry the same REAL option-bonus semantics: a scheduled bonus
// prorates (bonus_amount / 5) across exactly five seasons from its own
// exercise year, and the database automatically extends the deal with
// option void seasons to hold the full proration (rule book v13 5.20(d)).
// The preview does the same: rows beyond the owner span (real +
// signing-bonus void years) are the automatic option void seasons, and
// they carry NO signing-bonus proration -- the signing bonus divides over
// the owner span only (5.10(b)).
//
// Mirrors the database's own formulas:
//   - PPV: full un-prorated signing bonus credited to Year 1 only; each
//     salary component weighted by ppv_weight_table for its year; a real
//     option bonus weighted only in its own exercise year. See
//     lib/ppvMath.js.
//   - Cap: prorated signing bonus + guaranteed + non-guaranteed, plus
//     roster bonus once that season's Sept 2 has passed, plus a
//     (bonus_amount / 5) share of every option bonus whose 5-year window
//     covers this year.
//   - Dead cap: see lib/deadCapPreview.js. New to this module -- the bid
//     builder previously showed none at all, so an owner could not see
//     what a bid would cost to get out of until after they had won it.
//   - Deion Rule: an option bonus only counts in its own exercise year,
//     never an earlier one -- the money isn't committed before then.
//   - The 30% Rule (v13 5.22) is a separate shared module,
//     lib/thirtyPercentRule.js -- the form runs it alongside these.
//
// TOTAL PPV IS NO LONGER ROUNDED. It used to return ceilUp(totalPpv),
// which turned a real 347.15 into a displayed 348. bid_total_ppv -- the
// view that decides who wins a player under 6.1 -- sums raw and does not
// round, so the form was showing a number the auction would never use, and
// two bids 0.45 apart displayed identically. Per-row cap and cash rounding
// is left exactly as it was: that is the open option-proration rounding
// question and it must be settled everywhere at once, not here alone.

import { leagueMinimumSalary, seasonCash, minimumSalaryIssue } from './leagueMinimum';
import { rowPpv, buildWeightLookup, FALLBACK_WEIGHTS } from './ppvMath';
import { computeDeadCapByRow } from './deadCapPreview';

// Re-exported so existing importers of these names from lib/bidMath keep
// working. New code should import them from lib/ppvMath directly.
export { buildWeightLookup, FALLBACK_WEIGHTS };

function ceilUp(n) {
  return Math.ceil(n - 1e-9) + 0;
}

const SEPT_2 = (year) => new Date(year, 8, 2); // JS months 0-indexed; 8 = September

/**
 * @param {object} params
 * @param {number} params.startYear
 * @param {number} params.signingBonusTotal
 * @param {number} params.totalYears
 * @param {number} params.voidYears - owner-elected (signing bonus) void years
 * @param {Array<{guaranteedSalary:number, nonGuaranteedSalary:number, rosterBonus:number, optionBonus:number}>} params.years
 * @param {object} [params.weights] - from buildWeightLookup(); falls back to ppvMath constants
 * @returns {{ rows: Array, totalPpv:number, totalCap:number, totalCash:number }}
 */
export function computeBidPreview({
  startYear,
  signingBonusTotal,
  totalYears,
  voidYears,
  years,
  weights = FALLBACK_WEIGHTS,
}) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const ownerSpan = T + V;
  if (ownerSpan === 0) return { rows: [], totalPpv: 0, totalCap: 0, totalCash: 0 };

  // Real scheduled option bonuses (Year 2+ of real years only) decide how
  // far the automatic option void seasons extend the deal.
  const options = [];
  for (let i = 1; i < T; i++) {
    const amount = Number(years[i] && years[i].optionBonus) || 0;
    if (amount > 0) options.push({ yearNumber: i + 1, amount });
  }
  const lastOptionWindow = options.reduce((m, ob) => Math.max(m, ob.yearNumber + 4), 0);
  const span = Math.max(ownerSpan, lastOptionWindow);

  // Signing bonus prorates over the OWNER span only -- automatic option
  // void seasons never carry it (v13 5.7(a), 5.10(b)).
  const evenProration = signingBonusTotal / ownerSpan;
  const today = new Date();

  const rows = [];
  for (let i = 0; i < span; i++) {
    const yearNumber = i + 1;
    const isReal = yearNumber <= T;
    const isOwnerVoid = !isReal && yearNumber <= ownerSpan;
    const isOptionVoid = yearNumber > ownerSpan;
    const seasonYear = Number(startYear) + i;
    const y = isReal ? years[i] || {} : {};

    rows.push({
      isVoid: !isReal,
      voidReason: isOwnerVoid ? 'signing_bonus' : isOptionVoid ? 'option_bonus' : null,
      seasonYear,
      yearNumber,
      proratedSigningBonus: isOptionVoid ? 0 : evenProration,
      guaranteedSalary: isReal ? Number(y.guaranteedSalary) || 0 : 0,
      nonGuaranteedSalary: isReal ? Number(y.nonGuaranteedSalary) || 0 : 0,
      rosterBonus: isReal ? Number(y.rosterBonus) || 0 : 0,
      // Year 1 (i === 0) can never carry an option bonus -- enforced by a
      // database trigger too, mirrored here so the preview never credits
      // value the server would reject.
      optionBonus: !isReal || i === 0 ? 0 : Number(y.optionBonus) || 0,
      rosterBonusConverted: today >= SEPT_2(seasonYear),
    });
  }

  let totalPpv = 0;
  rows.forEach((r) => {
    r.ppv = rowPpv({
      yearNumber: r.yearNumber,
      isVoid: r.isVoid,
      signingBonusTotal,
      guaranteedSalary: r.guaranteedSalary,
      nonGuaranteedSalary: r.nonGuaranteedSalary,
      rosterBonus: r.rosterBonus,
      optionBonus: r.optionBonus,
      weights,
    });
    totalPpv += r.ppv;
  });

  rows.forEach((r) => {
    let cap = r.proratedSigningBonus + r.guaranteedSalary + r.nonGuaranteedSalary;
    cap += r.rosterBonusConverted ? r.rosterBonus : 0;

    // This year's share of every option bonus whose 5-year proration window
    // (starting from ITS OWN exercise year) covers this year. The window
    // always fits: the automatic option void rows above extend the deal to
    // exercise + 4.
    let optionProration = 0;
    options.forEach((ob) => {
      if (ob.yearNumber <= r.yearNumber && r.yearNumber <= ob.yearNumber + 4) {
        optionProration += ob.amount / 5;
      }
    });
    r.optionProration = optionProration;
    cap += optionProration;

    r.capCharge = ceilUp(cap);

    let cash = r.yearNumber === 1 ? Number(signingBonusTotal) || 0 : 0;
    cash += r.guaranteedSalary + r.nonGuaranteedSalary + r.rosterBonus + r.optionBonus;
    r.cashValue = ceilUp(cash);
  });

  // Dead cap if cut, from the same shared module the contract builder
  // uses, so both screens show the same figure for the same structure.
  const deadCaps = computeDeadCapByRow({ rows, options });
  deadCaps.forEach((d, i) => {
    rows[i].deadCapIfCut = d;
  });

  return {
    rows,
    // Unrounded, matching bid_total_ppv -- see the header.
    totalPpv,
    totalCap: rows.reduce((s, r) => s + r.capCharge, 0),
    totalCash: rows.reduce((s, r) => s + r.cashValue, 0),
  };
}

/**
 * Client-side mirror of check_bid_minimum_salary(). Every real (non-void)
 * season must pay at least the league minimum IN CASH. See
 * lib/leagueMinimum.js for the full rule and for what counts as cash --
 * the arithmetic lives there, not here, because four files each summing
 * their own components is what produced the bug that comment describes.
 *
 * Cap charge has no bearing on this test. computeBidPreview() above still
 * computes and displays a cap charge; it simply no longer decides whether
 * the minimum is met. Nor does the prorated signing bonus: only the full
 * signing bonus, only in Year 1.
 *
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateBidMinimumSalary({ startYear, signingBonusTotal, totalYears, voidYears, years }) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const span = T + V;
  const issues = [];
  if (span === 0) return { valid: true, issues };

  // Real seasons only -- void years are exempt, which is why this stops at
  // T rather than span.
  for (let i = 0; i < T; i++) {
    const y = years[i] || {};
    const seasonYear = Number(startYear) + i;
    const min = leagueMinimumSalary(seasonYear);

    const cash = seasonCash({
      contractYearNumber: i + 1,
      guaranteedSalary: y.guaranteedSalary,
      nonGuaranteedSalary: y.nonGuaranteedSalary,
      rosterBonus: y.rosterBonus,
      signingBonusTotal,
      optionBonus: y.optionBonus,
    });

    if (cash < min - 1e-9) {
      issues.push(minimumSalaryIssue(seasonYear, cash, min));
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Client-side mirror of check_bid_deion_rule(). Blocks submission before
 * the server has to reject it. An option bonus counts only in its own
 * exercise year.
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateBidDeion({ startYear, signingBonusTotal, totalYears, voidYears, years }) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const span = T + V;
  if (span === 0) return { valid: false, issues: ['Contract must have at least one year.'] };

  const evenProration = Number(signingBonusTotal) / span;
  const issues = [];

  for (let i = 0; i < T; i++) {
    const y = years[i] || {};
    const seasonYear = Number(startYear) + i;
    const optionBonus = i === 0 ? 0 : Number(y.optionBonus) || 0;
    const salary =
      (Number(y.guaranteedSalary) || 0) +
      (Number(y.nonGuaranteedSalary) || 0) +
      (Number(y.rosterBonus) || 0) +
      optionBonus;

    if (evenProration > salary + 1e-9) {
      issues.push(
        seasonYear +
          ' (Year ' +
          (i + 1) +
          '): real salary is ' +
          salary.toFixed(2) +
          ", but this year's share of the signing bonus is " +
          evenProration.toFixed(2) +
          ' — raise guaranteed, non-guaranteed, roster bonus, or (Year 2+) option bonus for this year, or lower the signing bonus / spread it over more years.'
      );
    }
  }

  return { valid: issues.length === 0, issues };
}
