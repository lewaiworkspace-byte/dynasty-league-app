// Single source of truth for the league minimum salary rule (rule book
// 1.9), covering BOTH halves of it: the floor amount, and what counts
// toward meeting it.
//
// THE RULE. Cash paid in any season must meet the league minimum. Cash is
// money actually paid out that season:
//   - guaranteed salary
//   - non-guaranteed salary
//   - roster bonus, in the season it triggers
//   - signing bonus IN FULL, Year 1 only -- it is paid once, up front
//   - option bonus, in the season it triggers
// Void years are exempt. Rookie and practice-squad contracts are exempt.
//
// TWO THINGS THAT DO NOT COUNT, and getting this wrong is what this
// module exists to prevent:
//   - The PRORATED signing bonus. Proration is an accounting device. The
//     money was paid in Year 1; no cash changes hands in Year 3 because of
//     it. Only the full amount, only in Year 1.
//   - The CAP CHARGE. An older version of this rule let a season satisfy
//     the minimum on either its cash value or its cap charge, whichever
//     was higher. That alternative is gone entirely. Cash only.
//
// How the old version failed, kept here because it is the exact mistake to
// avoid repeating: a generated 2-year bid had 2027 carrying guaranteed 3,
// non-guaranteed 2, roster bonus 3, prorated signing bonus 2. The client
// summed all four to 10 and passed it. The database summed the first two
// to 5 and rejected it. The correct figure is 8 -- salary plus roster
// bonus, no proration -- so the bid was illegal, and the client was wrong
// to pass it even though the database was right for the wrong reason.
//
// THREE PLACES, NOT TWO. The $9 base, the 5% escalation, AND the
// definition of cash above must all change together here and in the
// database (league_minimum_salary() and check_bid_minimum_salary()). The
// client needs them synchronously for live previews, which is why the
// duplication exists at all. Every JavaScript caller -- bidMath.js,
// contractMath.js, contractAssistant.js -- must go through seasonCash()
// below rather than summing its own components; four files each doing
// their own arithmetic is precisely what produced the bug above.

function ceilUp(n) {
  return Math.ceil(n - 1e-9);
}

/**
 * The floor itself: $9 in 2026, +5% per season, rounded up. Seasons before
 * 2026 return the 2026 floor rather than deflating backwards.
 */
export function leagueMinimumSalary(seasonYear) {
  const steps = Math.max((Number(seasonYear) || 0) - 2026, 0);
  return ceilUp(9 * Math.pow(1.05, steps));
}

/**
 * Cash actually paid out in one contract season. The signing bonus counts
 * in full in Year 1 and not at all afterwards; no prorated figure is read
 * or accepted by this function.
 *
 * The option bonus is counted in whatever season it is passed for. A
 * Year 1 option bonus is illegal, but that is a separate rule enforced by
 * its own database trigger -- suppressing it here would report a
 * minimum-salary failure for what is really an option-bonus placement
 * error, which is a confusing way to describe the problem.
 *
 * @param {object} params
 * @param {number} params.contractYearNumber - 1-based; only Year 1 gets the signing bonus
 * @param {number} [params.guaranteedSalary]
 * @param {number} [params.nonGuaranteedSalary]
 * @param {number} [params.rosterBonus]
 * @param {number} [params.signingBonusTotal] - the FULL total, not a per-year share
 * @param {number} [params.optionBonus] - the amount triggering in this season
 * @returns {number}
 */
export function seasonCash({
  contractYearNumber,
  guaranteedSalary,
  nonGuaranteedSalary,
  rosterBonus,
  signingBonusTotal,
  optionBonus,
}) {
  const isFirstYear = Number(contractYearNumber) === 1;
  return (
    (Number(guaranteedSalary) || 0) +
    (Number(nonGuaranteedSalary) || 0) +
    (Number(rosterBonus) || 0) +
    (isFirstYear ? Number(signingBonusTotal) || 0 : 0) +
    (Number(optionBonus) || 0)
  );
}

/**
 * Whether one season clears its own league minimum on cash. Callers that
 * need to report the shortfall should call seasonCash() and
 * leagueMinimumSalary() directly rather than inferring the numbers from a
 * false return.
 *
 * @param {object} params - seasonYear plus every seasonCash() field
 * @returns {boolean}
 */
export function meetsMinimumSalary({ seasonYear, ...cashFields }) {
  return seasonCash(cashFields) >= leagueMinimumSalary(seasonYear) - 1e-9;
}

/**
 * The rejection wording, shared so an owner sees the same explanation from
 * the client that the database would give them. Two different accounts of
 * the same rejection is its own kind of bug.
 */
export function minimumSalaryIssue(seasonYear, cash, minimum) {
  return (
    'Minimum salary: the ' +
    seasonYear +
    ' season pays ' +
    cash +
    ' in cash, but the league minimum is ' +
    minimum +
    '. Cash means salary (guaranteed or non-guaranteed) plus any bonus actually paid that ' +
    'season -- signing bonus in Year 1, or a roster or option bonus in the season it ' +
    'triggers. Prorated bonus and cap charge do not count.'
  );
}
