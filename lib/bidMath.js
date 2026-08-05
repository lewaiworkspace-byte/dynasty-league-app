// Live PPV / cap / cash preview for the bid-submission form.
//
// This is deliberately a SEPARATE implementation from lib/contractMath.js,
// not a reuse. contractMath.js's optionBonus handling is the LEGACY flat
// field's semantics (a one-time flat addition in a single year, no forward
// proration). A bid can carry a REAL option bonus (bid_option_bonuses),
// which prorates forward across up to 5 years from its own exercise year --
// completely different math. Reusing contractMath.js here would show
// bidders understated future-year cap charges.
//
// Mirrors the database's own formulas:
//   - PPV: full un-prorated signing bonus credited to Year 1 only; each
//     salary component weighted by ppv_weight_table for its year; a real
//     option bonus weighted only in its own exercise year.
//   - Cap: prorated signing bonus + guaranteed + non-guaranteed, plus
//     roster bonus once that season's Sept 2 has passed, plus a
//     (bonus_amount / 5) share of every option bonus whose 5-year window
//     covers this year. Any proration tail falling past the deal's last
//     year is simply never charged -- matching real NFL behavior and the
//     contract_year_computed view.
//   - Deion Rule: an option bonus only counts in its own exercise year,
//     never an earlier one -- the money isn't committed before then.

import { leagueMinimumSalary, seasonCash, minimumSalaryIssue } from './leagueMinimum';

function ceilUp(n) {
  return Math.ceil(n - 1e-9);
}

const SEPT_2 = (year) => new Date(year, 8, 2); // JS months 0-indexed; 8 = September

// Fallback only. The real weights are read from ppv_weight_table and passed
// in as the weights argument -- see buildWeightLookup() below and the page component.
// These exist so the module still works if that fetch fails, NOT as the
// source of truth.
const FALLBACK_WEIGHTS = {
  guaranteed: [0.95, 0.9, 0.85, 0.8, 0.75],
  nonGuaranteed: [0.3, 0.2, 0.15, 0.1, 0.05],
  rosterBonus: [0.5, 0.4, 0.3, 0.2, 0.1],
  optionBonus: [null, 0.9, 0.8, 0.7, 0.6], // Year 1 never valid
};

/**
 * Turns raw ppv_weight_table rows into the shape computeBidPreview expects.
 * @param {Array<{contract_year_number:number, guaranteed_weight:number, non_guaranteed_weight:number, roster_bonus_weight:number, option_bonus_weight:number}>} rows
 */
export function buildWeightLookup(rows) {
  if (!rows || rows.length === 0) return FALLBACK_WEIGHTS;

  const weights = {
    guaranteed: [],
    nonGuaranteed: [],
    rosterBonus: [],
    optionBonus: [],
  };

  rows.forEach((r) => {
    const idx = r.contract_year_number - 1;
    weights.guaranteed[idx] = Number(r.guaranteed_weight) || 0;
    weights.nonGuaranteed[idx] = Number(r.non_guaranteed_weight) || 0;
    weights.rosterBonus[idx] = Number(r.roster_bonus_weight) || 0;
    weights.optionBonus[idx] = Number(r.option_bonus_weight) || 0;
  });

  return weights;
}

/**
 * @param {object} params
 * @param {number} params.startYear
 * @param {number} params.signingBonusTotal
 * @param {number} params.totalYears
 * @param {number} params.voidYears
 * @param {Array<{guaranteedSalary:number, nonGuaranteedSalary:number, rosterBonus:number, optionBonus:number}>} params.years
 * @param {object} [params.weights] - from buildWeightLookup(); falls back to constants above
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
  const span = T + V;
  if (span === 0) return { rows: [], totalPpv: 0, totalCap: 0, totalCash: 0 };

  const evenProration = signingBonusTotal / span;
  const today = new Date();

  const rows = [];
  for (let i = 0; i < span; i++) {
    const isVoid = i >= T;
    const seasonYear = Number(startYear) + i;
    const y = !isVoid ? years[i] || {} : {};

    rows.push({
      isVoid,
      seasonYear,
      yearNumber: i + 1,
      proratedSigningBonus: evenProration,
      guaranteedSalary: isVoid ? 0 : Number(y.guaranteedSalary) || 0,
      nonGuaranteedSalary: isVoid ? 0 : Number(y.nonGuaranteedSalary) || 0,
      rosterBonus: isVoid ? 0 : Number(y.rosterBonus) || 0,
      // Year 1 (i === 0) can never carry an option bonus -- enforced by a
      // database trigger too, mirrored here so the preview never credits
      // value the server would reject.
      optionBonus: isVoid || i === 0 ? 0 : Number(y.optionBonus) || 0,
      rosterBonusConverted: today >= SEPT_2(seasonYear),
    });
  }

  let totalPpv = 0;
  rows.forEach((r) => {
    if (r.isVoid) {
      r.ppv = 0;
      return;
    }
    const idx = r.yearNumber - 1;
    let ppv = 0;
    if (r.yearNumber === 1) ppv += Number(signingBonusTotal) || 0;
    ppv += r.guaranteedSalary * (weights.guaranteed[idx] ?? 0);
    ppv += r.nonGuaranteedSalary * (weights.nonGuaranteed[idx] ?? 0);
    ppv += r.rosterBonus * (weights.rosterBonus[idx] ?? 0);
    if (r.optionBonus > 0) ppv += r.optionBonus * (weights.optionBonus[idx] ?? 0);
    r.ppv = ppv;
    totalPpv += ppv;
  });

  rows.forEach((r) => {
    let cap = r.proratedSigningBonus + r.guaranteedSalary + r.nonGuaranteedSalary;
    cap += r.rosterBonusConverted ? r.rosterBonus : 0;

    // This year's share of every option bonus whose 5-year proration window
    // (starting from ITS OWN exercise year) covers this year. Anything
    // falling past the last row simply never gets charged.
    rows.forEach((ob) => {
      if (ob.optionBonus > 0 && ob.yearNumber <= r.yearNumber && r.yearNumber <= ob.yearNumber + 4) {
        cap += ob.optionBonus / 5;
      }
    });

    r.capCharge = ceilUp(cap);

    let cash = r.yearNumber === 1 ? Number(signingBonusTotal) || 0 : 0;
    cash += r.guaranteedSalary + r.nonGuaranteedSalary + r.rosterBonus + r.optionBonus;
    r.cashValue = ceilUp(cash);
  });

  return {
    rows,
    totalPpv: ceilUp(totalPpv),
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
