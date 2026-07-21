// Live cap / cash / dead-money preview for the contract builder -- mirrors
// the contract_year_computed database view's formulas exactly, so what the
// owner sees while building a contract matches what gets saved. This is
// useful regardless of whether the Contract Assistant was used; it applies
// to any manually-typed contract too.
//
// One simplification, stated plainly rather than hidden: this assumes any
// roster bonus has already converted to a real cap charge. In reality that
// only happens on a set date each season (00:01 ET the Monday before the
// first NFL game) -- before that date, the database would show a roster
// bonus counting toward cap the same as non-guaranteed salary instead.
// Since that covers the vast majority of the season, this preview shows
// the post-conversion (steady-state) number, with the caveat surfaced in
// the UI rather than silently assumed.

/**
 * @param {object} params
 * @param {number} params.signingBonusTotal
 * @param {number} params.totalYears - real years
 * @param {number} params.voidYears
 * @param {Array<{guaranteedSalary:number, nonGuaranteedSalary:number, optionBonus:number, rosterBonus:number, proratedSigningBonus:number|null}>} params.years
 *   - array indexed 0..(totalYears-1) for real years; void years have no entry (all zero).
 * @returns {{
 *   rows: Array<{ isVoid:boolean, proratedSigningBonus:number, capCharge:number, cashValue:number, deadCapIfCut:number }>,
 *   totalCap:number, totalCash:number
 * }}
 */
export function computeContractPreview({ signingBonusTotal, totalYears, voidYears, years }) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const span = T + V;
  if (span === 0) return { rows: [], totalCap: 0, totalCash: 0 };

  const evenProration = span > 0 ? signingBonusTotal / span : 0;

  // Build one entry per season across the whole span (real years then void years)
  const rows = [];
  for (let i = 0; i < span; i++) {
    const isVoid = i >= T;
    const yearData = !isVoid ? years[i] || {} : {};
    const proratedSigningBonus =
      !isVoid && yearData.proratedSigningBonus != null ? Number(yearData.proratedSigningBonus) : evenProration;

    const guaranteedSalary = isVoid ? 0 : Number(yearData.guaranteedSalary) || 0;
    const nonGuaranteedSalary = isVoid ? 0 : Number(yearData.nonGuaranteedSalary) || 0;
    const optionBonus = isVoid ? 0 : Number(yearData.optionBonus) || 0;
    const rosterBonus = isVoid ? 0 : Number(yearData.rosterBonus) || 0;

    const capCharge = proratedSigningBonus + guaranteedSalary + nonGuaranteedSalary + optionBonus + rosterBonus;
    const cashValue =
      (i === 0 ? signingBonusTotal : 0) + guaranteedSalary + nonGuaranteedSalary + rosterBonus + optionBonus;

    rows.push({
      isVoid,
      proratedSigningBonus,
      guaranteedSalary,
      nonGuaranteedSalary,
      optionBonus,
      rosterBonus,
      capCharge,
      cashValue,
      // dead cap portion for THIS year alone (guaranteed money doesn't get
      // excluded here -- only non-guaranteed is forgiven if cut)
      _deadCapPortion: proratedSigningBonus + guaranteedSalary + optionBonus + rosterBonus,
    });
  }

  // Dead cap if cut in year N = sum of every year's dead-cap portion from N onward
  let runningDeadCap = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    runningDeadCap += rows[i]._deadCapPortion;
    rows[i].deadCapIfCut = runningDeadCap;
    delete rows[i]._deadCapPortion;
  }

  const totalCap = rows.reduce((sum, r) => sum + r.capCharge, 0);
  const totalCash = rows.reduce((sum, r) => sum + r.cashValue, 0);

  return { rows, totalCap: Math.round(totalCap * 100) / 100, totalCash: Math.round(totalCash * 100) / 100 };
}
