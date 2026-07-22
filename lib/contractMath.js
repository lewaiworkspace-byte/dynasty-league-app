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
 * accepted by the database -- specifically the Deion Rule (a real year's
 * salary must cover that year's prorated signing bonus). This is the one
 * constraint that can silently fail at save time with a raw database
 * error, since it isn't visible just from looking at the Cap/Cash columns.
 *
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateContract({ startYear, signingBonusTotal, totalYears, voidYears, years }) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const span = T + V;
  const evenProration = span > 0 ? Number(signingBonusTotal) / span : 0;
  const issues = [];

  for (let i = 0; i < T; i++) {
    const y = years[i] || {};
    const seasonYear = Number(startYear) + i;
    const prorated = y.proratedSigningBonus != null ? Number(y.proratedSigningBonus) : evenProration;
    const salary = (Number(y.guaranteedSalary) || 0) + (Number(y.nonGuaranteedSalary) || 0) + (Number(y.rosterBonus) || 0);
    if (prorated > salary + 1e-9) {
      issues.push(
        `${seasonYear} (Year ${i + 1}): real salary is ${salary.toFixed(2)}, but this year's share of the signing bonus is ${prorated.toFixed(2)} — raise guaranteed, non-guaranteed, or roster bonus for this year, or lower the signing bonus / spread it over more years.`
      );
    }
  }

  return { valid: issues.length === 0, issues };
}
