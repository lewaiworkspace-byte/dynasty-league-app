// Shared PPV weighting -- the ONE place in the client that knows how a
// contract or bid year converts into PPV (rule book v13 5.2).
//
// Before this module existed the weights lived in three places:
// lib/bidMath.js held FALLBACK_WEIGHTS, lib/contractAssistant.js held its
// own hardcoded GW/NGW/RBW constants (and no option weights at all), and
// lib/contractMath.js computed no PPV whatsoever, which is why the New
// Contract form had no PPV column. Three copies of a table that rule 5.2
// can change is three chances to drift, and the contract form having no
// PPV at all is how a 501.65 label sat above a real 680.30 deal with
// nothing on screen to contradict it.
//
// The authoritative weights are the ppv_weight_table rows in the database.
// Pass them in via buildWeightLookup(). FALLBACK_WEIGHTS exists so a
// component still renders something sensible if that fetch fails; it is
// NOT the source of truth and must be kept equal to the table by hand.
//
// Both database views this mirrors -- contract_year_computed.ppv and
// bid_total_ppv.total_ppv -- apply the same shape:
//   - the FULL un-prorated signing bonus, credited to Year 1 only, and
//     never to a void year
//   - each salary component weighted by its contract year number
//   - an option bonus weighted only in its own exercise season, keyed off
//     that season's contract year number
//
// Neither view rounds. Do not round here either: bid_total_ppv is what
// decides who wins a player under 6.1, and a client that rounds shows a
// number the auction will not use.

export const FALLBACK_WEIGHTS = {
  guaranteed: [0.95, 0.9, 0.85, 0.8, 0.75],
  nonGuaranteed: [0.3, 0.2, 0.15, 0.1, 0.05],
  rosterBonus: [0.5, 0.4, 0.3, 0.2, 0.1],
  optionBonus: [0, 0.9, 0.8, 0.7, 0.6], // Year 1 can never carry one
};

/**
 * Turns raw ppv_weight_table rows into the shape the helpers below expect.
 * Returns FALLBACK_WEIGHTS unchanged when given nothing, so every caller
 * can pass a possibly-empty fetch result straight through.
 *
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
    const idx = Number(r.contract_year_number) - 1;
    if (idx < 0) return;
    weights.guaranteed[idx] = Number(r.guaranteed_weight) || 0;
    weights.nonGuaranteed[idx] = Number(r.non_guaranteed_weight) || 0;
    weights.rosterBonus[idx] = Number(r.roster_bonus_weight) || 0;
    weights.optionBonus[idx] = Number(r.option_bonus_weight) || 0;
  });

  return weights;
}

/**
 * One component's weight for a given contract year number (1-based).
 * Years beyond the table return 0, which is correct: seasons 6-9 are
 * always automatic option void years carrying no salary components, and
 * an option bonus's weight keys off its EXERCISE year, always a real
 * year 2-5.
 *
 * @param {object} weights
 * @param {'guaranteed'|'nonGuaranteed'|'rosterBonus'|'optionBonus'} component
 * @param {number} yearNumber - 1-based contract year
 */
export function weightFor(weights, component, yearNumber) {
  const table = (weights && weights[component]) || FALLBACK_WEIGHTS[component];
  const value = table[Number(yearNumber) - 1];
  return typeof value === 'number' ? value : 0;
}

/**
 * PPV for a single season, mirroring both database views exactly.
 * Unrounded, deliberately -- see the header.
 *
 * @param {object} params
 * @param {number} params.yearNumber - 1-based contract year
 * @param {boolean} params.isVoid
 * @param {number} params.signingBonusTotal - full total, credited in Year 1 only
 * @param {number} params.guaranteedSalary
 * @param {number} params.nonGuaranteedSalary
 * @param {number} params.rosterBonus
 * @param {number} params.optionBonus - the bonus EXERCISING this season, if any
 * @param {object} [params.weights]
 * @returns {number}
 */
export function rowPpv({
  yearNumber,
  isVoid,
  signingBonusTotal,
  guaranteedSalary,
  nonGuaranteedSalary,
  rosterBonus,
  optionBonus,
  weights,
}) {
  if (isVoid) return 0;

  const n = Number(yearNumber) || 0;
  let ppv = n === 1 ? Number(signingBonusTotal) || 0 : 0;

  ppv += (Number(guaranteedSalary) || 0) * weightFor(weights, 'guaranteed', n);
  ppv += (Number(nonGuaranteedSalary) || 0) * weightFor(weights, 'nonGuaranteed', n);
  ppv += (Number(rosterBonus) || 0) * weightFor(weights, 'rosterBonus', n);

  const ob = Number(optionBonus) || 0;
  if (ob > 0) ppv += ob * weightFor(weights, 'optionBonus', n);

  return ppv;
}
