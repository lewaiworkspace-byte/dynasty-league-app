// The 30% Rule (rule book v13 5.22) -- client-side mirror of the database's
// check_contract_30pct_rule() / check_bid_30pct_rule() deferred triggers.
// The database is the authority; this exists so an owner sees the problem
// before submitting instead of in a raw rejection (the Deion pattern).
//
// Compensation for a season = guaranteed + non-guaranteed + roster bonus +
// a (bonus_amount / 5) share of every REAL option bonus whose five-season
// proration window covers it. Signing bonus -- the payment AND its
// proration -- is excluded entirely. Each season may exceed the
// immediately preceding season by at most 30% of Year 1 compensation. The
// allowed step is fixed by Year 1 and does not compound. Decreases are
// always allowed.
//
// The horizon deliberately runs past the last owner-entered year: an
// option bonus prorates into automatically-created void seasons (5.20(d)),
// and the database trigger sums over those rows. A void season's
// compensation is option proration only, which can never exceed the season
// before it, so the longer horizon cannot create violations -- it exists
// so these are the same numbers the trigger sums, not an approximation.
//
// Exemptions mirror the database exactly: rookie and fifth_year_option
// contract types. Grandfathering (contracts.exempt_30pct) applies only to
// eight rows that already exist in the database -- nothing built in a form
// is ever grandfathered, so it has no client-side representation.

function num(v) {
  return Number(v) || 0;
}

/**
 * Per-season compensation, over the full horizon the database trigger sees.
 *
 * @param {object} params
 * @param {number} params.startYear
 * @param {number} params.totalYears - real years (option bonuses live on
 *   years[1..T-1]; Year 1 can never carry one)
 * @param {number} params.voidYears - owner-elected (signing bonus) void years
 * @param {Array<{guaranteedSalary:number, nonGuaranteedSalary:number, rosterBonus:number, optionBonus:number}>} params.years
 * @returns {Array<{yearNumber:number, seasonYear:number, comp:number}>}
 */
export function computeCompensationBySeason({ startYear, totalYears, voidYears, years }) {
  const T = num(totalYears);
  const V = num(voidYears);
  const start = num(startYear);

  const options = [];
  for (let i = 1; i < T; i++) {
    const amount = num(years[i] && years[i].optionBonus);
    if (amount > 0) options.push({ yearNumber: i + 1, amount });
  }
  const lastOptionWindow = options.reduce((m, ob) => Math.max(m, ob.yearNumber + 4), 0);
  const span = Math.max(T + V, lastOptionWindow);

  const rows = [];
  for (let i = 0; i < span; i++) {
    const yearNumber = i + 1;
    let comp = 0;
    if (yearNumber <= T) {
      const y = years[i] || {};
      comp += num(y.guaranteedSalary) + num(y.nonGuaranteedSalary) + num(y.rosterBonus);
    }
    options.forEach((ob) => {
      if (ob.yearNumber <= yearNumber && yearNumber <= ob.yearNumber + 4) {
        comp += ob.amount / 5;
      }
    });
    rows.push({ yearNumber, seasonYear: start + i, comp });
  }
  return rows;
}

/**
 * Client-side 30% Rule check. Same tolerance as the database (+0.0001).
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateThirtyPercent({ startYear, totalYears, voidYears, years, contractType }) {
  if (contractType === 'rookie' || contractType === 'fifth_year_option') {
    return { valid: true, issues: [] };
  }

  const comp = computeCompensationBySeason({ startYear, totalYears, voidYears, years });
  if (comp.length < 2) return { valid: true, issues: [] };

  const y1 = comp[0].comp;
  const maxStep = 0.3 * y1;
  const issues = [];

  for (let i = 1; i < comp.length; i++) {
    const step = comp[i].comp - comp[i - 1].comp;
    if (step > maxStep + 0.0001) {
      issues.push(
        comp[i].seasonYear +
          ' (Year ' +
          comp[i].yearNumber +
          '): compensation rises by ' +
          step.toFixed(2) +
          ' over the prior season, but the 30% Rule caps every raise at ' +
          maxStep.toFixed(2) +
          ' (30% of Year 1 compensation, ' +
          y1.toFixed(2) +
          '). Signing bonus is excluded from this test; option bonuses count at one-fifth per season of their window. Lower this season, raise earlier seasons, or raise Year 1.'
      );
    }
  }

  return { valid: issues.length === 0, issues };
}
