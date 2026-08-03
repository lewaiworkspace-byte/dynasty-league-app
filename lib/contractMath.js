// Live cap / cash / dead-money preview for the contract builder -- mirrors
// the contract_year_computed database view's formulas exactly, so what the
// owner sees while building a contract matches what gets saved. This is
// useful regardless of whether the Contract Assistant was used; it applies
// to any manually-typed contract too.
//
// Roster bonus handling matches the database exactly: it's never prorated
// (always a flat, single-year amount), it only counts toward cap once its
// own season's September 2nd has passed, and -- the part that's easy to
// get wrong -- it NEVER spans forward into future years' dead-cap totals.
// A roster bonus for a future year the player would never reach after
// being cut was never actually committed, unlike signing bonus proration
// or guaranteed salary, which really do accelerate forward on a cut.

import { leagueMinimumSalary } from './leagueMinimum';

// Rounding up to a whole dollar, matching the league rule that all money
// rounds up to the nearest whole dollar -- applied to every cap/cash/dead
// money figure the preview displays, not just what the Contract Assistant
// generates.
function ceilUp(n) {
  return Math.ceil(n - 1e-9);
}

const SEPT_2 = (year) => new Date(year, 8, 2); // JS months are 0-indexed; 8 = September

/**
 * @param {object} params
 * @param {number} params.startYear - the contract's first real season
 * @param {number} params.signingBonusTotal
 * @param {number} params.totalYears - real years
 * @param {number} params.voidYears
 * @param {Array<{guaranteedSalary:number, nonGuaranteedSalary:number, optionBonus:number, rosterBonus:number, proratedSigningBonus:number|null}>} params.years
 *   - array indexed 0..(totalYears-1) for real years; void years have no entry (all zero).
 * @returns {{
 *   rows: Array<{ isVoid:boolean, seasonYear:number, proratedSigningBonus:number, capCharge:number, cashValue:number, deadCapIfCut:number, rosterBonusConverted:boolean }>,
 *   totalCap:number, totalCash:number
 * }}
 */
export function computeContractPreview({ startYear, signingBonusTotal, totalYears, voidYears, years }) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const span = T + V;
  if (span === 0) return { rows: [], totalCap: 0, totalCash: 0 };

  const evenProration = span > 0 ? signingBonusTotal / span : 0;
  const today = new Date();

  const rows = [];
  for (let i = 0; i < span; i++) {
    const isVoid = i >= T;
    const seasonYear = Number(startYear) + i;
    const yearData = !isVoid ? years[i] || {} : {};
    const proratedSigningBonus =
      !isVoid && yearData.proratedSigningBonus != null ? Number(yearData.proratedSigningBonus) : evenProration;

    const guaranteedSalary = isVoid ? 0 : Number(yearData.guaranteedSalary) || 0;
    const nonGuaranteedSalary = isVoid ? 0 : Number(yearData.nonGuaranteedSalary) || 0;
    const optionBonus = isVoid ? 0 : Number(yearData.optionBonus) || 0;
    const rosterBonus = isVoid ? 0 : Number(yearData.rosterBonus) || 0;
    const rosterBonusConverted = today >= SEPT_2(seasonYear);
    const rosterBonusCounted = rosterBonusConverted ? rosterBonus : 0;

    const capCharge = ceilUp(proratedSigningBonus + guaranteedSalary + nonGuaranteedSalary + optionBonus + rosterBonusCounted);
    const cashValue = ceilUp(
      (i === 0 ? signingBonusTotal : 0) + guaranteedSalary + nonGuaranteedSalary + rosterBonus + optionBonus
    );

    rows.push({
      isVoid,
      seasonYear,
      proratedSigningBonus,
      guaranteedSalary,
      nonGuaranteedSalary,
      optionBonus,
      rosterBonus,
      rosterBonusConverted,
      capCharge,
      cashValue,
      // The part that genuinely accelerates forward on a cut -- roster
      // bonus is handled separately below, since it never spans years.
      _acceleratingPortion: proratedSigningBonus + guaranteedSalary + optionBonus,
    });
  }

  // Dead cap if cut in year N = every year's accelerating portion from N
  // onward, PLUS -- only for row N itself -- its own roster bonus, and
  // only if that row's own Sept 2 has already passed. Accumulated using
  // raw (unrounded) figures so rounding doesn't compound year over year,
  // then rounded up once at the end, same as every other displayed figure.
  let runningAccel = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    runningAccel += rows[i]._acceleratingPortion;
    rows[i].deadCapIfCut = ceilUp(runningAccel + (rows[i].rosterBonusConverted ? rows[i].rosterBonus : 0));
    delete rows[i]._acceleratingPortion;
  }

  const totalCap = rows.reduce((sum, r) => sum + r.capCharge, 0);
  const totalCash = rows.reduce((sum, r) => sum + r.cashValue, 0);

  return { rows, totalCap, totalCash };
}

/**
 * Checks whether a contract, as currently entered, would actually be
 * accepted by the database -- the Deion Rule (a real year's salary must
 * cover that year's prorated signing bonus) and the league minimum salary
 * (rule book 1.9: every real year must clear that season's floor on EITHER
 * cash or cap, whichever is higher). Both are constraints that can
 * silently fail at save time with a raw database error, since neither is
 * visible just from looking at the Cap/Cash columns.
 *
 * The minimum-salary check counts roster bonus toward cap unconditionally,
 * unlike computeContractPreview's capCharge, which gates it on that
 * season's September 2nd -- mirrors bidMath.js's validateBidMinimumSalary
 * for the same reason: a validation rule whose answer depends on today's
 * date, passing in October and failing in March for an unchanged contract,
 * would be a trap. It's also skipped entirely for `rookie` and
 * `practice_squad` contracts, which rule book 1.9 exempts from the floor --
 * this is the one check here that ISN'T universal across contract types,
 * unlike the Deion Rule check above it.
 *
 * @param {string} [contractType] - skip the minimum-salary check for
 *   'rookie' and 'practice_squad'; every other type (including undefined,
 *   so existing callers that don't pass it keep today's behavior) is checked.
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateContract({ startYear, signingBonusTotal, totalYears, voidYears, years, contractType }) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const span = T + V;
  const evenProration = span > 0 ? Number(signingBonusTotal) / span : 0;
  const issues = [];
  const minimumSalaryExempt = contractType === 'rookie' || contractType === 'practice_squad';

  for (let i = 0; i < T; i++) {
    const y = years[i] || {};
    const seasonYear = Number(startYear) + i;
    const prorated = y.proratedSigningBonus != null ? Number(y.proratedSigningBonus) : evenProration;

    const guaranteedSalary = Number(y.guaranteedSalary) || 0;
    const nonGuaranteedSalary = Number(y.nonGuaranteedSalary) || 0;
    const rosterBonus = Number(y.rosterBonus) || 0;
    const optionBonus = Number(y.optionBonus) || 0;

    const salary = guaranteedSalary + nonGuaranteedSalary + rosterBonus;
    if (prorated > salary + 1e-9) {
      issues.push(
        `${seasonYear} (Year ${i + 1}): real salary is ${salary.toFixed(2)}, but this year's share of the signing bonus is ${prorated.toFixed(2)} — raise guaranteed, non-guaranteed, or roster bonus for this year, or lower the signing bonus / spread it over more years.`
      );
    }

    if (!minimumSalaryExempt) {
      const min = leagueMinimumSalary(seasonYear);
      const cash = (i === 0 ? Number(signingBonusTotal) || 0 : 0) + guaranteedSalary + nonGuaranteedSalary + rosterBonus + optionBonus;
      const cap = prorated + guaranteedSalary + nonGuaranteedSalary + rosterBonus + optionBonus;
      if (Math.max(cash, cap) < min - 1e-9) {
        issues.push(
          `${seasonYear} (Year ${i + 1}): cash is ${cash.toFixed(2)} and cap is ${cap.toFixed(2)}, both below the ${seasonYear} league minimum of ${min}. Either one reaching ${min} satisfies the rule.`
        );
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
