// The transform from bid-form state into the submit_bid RPC payload, and
// its inverse back into the camelCase shape lib/bidMath.js's validators
// accept.
//
// This used to live only inside BidForm.js's handleSubmit(), which meant
// nothing outside that one function could produce or check a bid payload.
// Extracted here so a page that never renders the bid form (the Auto-Bid
// delegation page) can build and validate the same payload the live form
// would submit, through the exact same code path -- not a second
// implementation that could quietly drift from the first.
//
// buildBidPayload() reproduces handleSubmit()'s prior inline logic exactly,
// including its exact numeric-coercion quirks (startYear is NOT defaulted
// to 0 if invalid, unlike totalYears/voidYears/signingBonusTotal, which
// are -- that asymmetry already existed in handleSubmit() and is preserved
// here rather than "fixed," since the goal of this file is fidelity to
// current behavior, not improving it).

/**
 * @param {object} input
 * @param {number} input.startYear
 * @param {number} input.totalYears
 * @param {number} input.voidYears
 * @param {number} input.signingBonusTotal
 * @param {Array<{guaranteedSalary:number, nonGuaranteedSalary:number, rosterBonus:number, optionBonus:number}>} input.years
 *   - the form's own year objects, indexed 0..(totalYears + voidYears - 1)
 * @returns {{
 *   years: Array<{contract_year_number:number, league_season_year:number, prorated_signing_bonus:number, guaranteed_salary:number, non_guaranteed_salary:number, roster_bonus:number, is_void_year:boolean}>,
 *   optionBonuses: Array<{exercise_season_year:number, bonus_amount:number}>
 * }}
 */
export function buildBidPayload(input) {
  const startYear = Number(input.startYear);
  const totalYears = Number(input.totalYears) || 0;
  const voidYears = Number(input.voidYears) || 0;
  const signingBonusTotal = Number(input.signingBonusTotal) || 0;
  const formYears = input.years || [];
  const span = totalYears + voidYears;

  const years = [];
  for (let i = 0; i < span; i++) {
    const isVoid = i >= totalYears;
    const y = formYears[i] || {};
    years.push({
      contract_year_number: i + 1,
      league_season_year: startYear + i,
      prorated_signing_bonus: signingBonusTotal / span,
      guaranteed_salary: isVoid ? 0 : Number(y.guaranteedSalary) || 0,
      non_guaranteed_salary: isVoid ? 0 : Number(y.nonGuaranteedSalary) || 0,
      roster_bonus: isVoid ? 0 : Number(y.rosterBonus) || 0,
      is_void_year: isVoid,
    });
  }

  // Only real years (Year 2+) can carry an option bonus -- matches
  // handleSubmit()'s own filter exactly, including dropping zero-amount
  // entries rather than sending them as 0.
  const optionBonuses = [];
  for (let i = 0; i < totalYears; i++) {
    const y = formYears[i] || {};
    const amount = Number(y.optionBonus) || 0;
    if (i > 0 && amount > 0) {
      optionBonuses.push({
        exercise_season_year: startYear + i,
        bonus_amount: amount,
      });
    }
  }

  return { years, optionBonuses };
}

/**
 * The inverse of buildBidPayload() -- reconstructs the camelCase shape
 * validateBidDeion() and validateBidMinimumSalary() (lib/bidMath.js)
 * accept, folding each option bonus back onto its year by matching
 * exercise_season_year to that year's league_season_year.
 *
 * @param {{years:Array, optionBonuses:Array}} payload - what buildBidPayload() returned
 * @param {number} startYear
 * @param {number} totalYears
 * @param {number} voidYears
 * @param {number} signingBonusTotal
 * @returns {{startYear:number, signingBonusTotal:number, totalYears:number, voidYears:number, years:Array<{guaranteedSalary:number, nonGuaranteedSalary:number, rosterBonus:number, optionBonus:number}>}}
 */
export function payloadToValidatorShape(payload, startYear, totalYears, voidYears, signingBonusTotal) {
  const payloadYears = (payload && payload.years) || [];
  const optionBonuses = (payload && payload.optionBonuses) || [];

  const years = payloadYears.map((y) => {
    const matchingBonus = optionBonuses.find(
      (ob) => ob.exercise_season_year === y.league_season_year
    );
    return {
      guaranteedSalary: y.guaranteed_salary,
      nonGuaranteedSalary: y.non_guaranteed_salary,
      rosterBonus: y.roster_bonus,
      optionBonus: matchingBonus ? matchingBonus.bonus_amount : 0,
    };
  });

  return {
    startYear: Number(startYear),
    signingBonusTotal: Number(signingBonusTotal) || 0,
    totalYears: Number(totalYears) || 0,
    voidYears: Number(voidYears) || 0,
    years,
  };
}
