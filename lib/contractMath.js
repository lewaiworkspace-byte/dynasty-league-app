// Live cap / cash / dead-money preview for the contract builder -- mirrors
// the contract_year_computed database view's formulas exactly, so what the
// owner sees while building a contract matches what gets saved. This is
// useful regardless of whether the Contract Assistant was used; it applies
// to any manually-typed contract too.
//
// OPTION BONUS SEMANTICS CHANGED (Aug 2026, rule book v13 5.20): the
// per-year Option Bonus field is now a REAL scheduled option bonus,
// persisted to contract_option_bonuses by the server action. It prorates
// at (amount / 5) across exactly five seasons from its own exercise year,
// and the database automatically extends the contract with option void
// seasons to hold the full proration. This preview does the same: rows
// beyond the owner span (real + signing-bonus void years) are the
// automatic option void seasons, marked voidReason 'option_bonus', and
// they carry NO signing-bonus proration -- the signing bonus divides over
// the owner span only (5.10(b)). The old flat single-year treatment is
// gone; it matched a legacy column the app no longer writes.
//
// Roster bonus handling matches the database exactly: it's never prorated
// (always a flat, single-year amount), it only counts toward cap once its
// own season's September 2nd has passed, and -- the part that's easy to
// get wrong -- it NEVER spans forward into future years' dead-cap totals.
// A roster bonus for a future year the player would never reach after
// being cut was never actually committed, unlike signing bonus proration,
// guaranteed salary, or triggered option proration, which really do
// accelerate forward on a cut.

import { leagueMinimumSalary, seasonCash, minimumSalaryIssue } from './leagueMinimum';

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
 * @param {number} params.voidYears - owner-elected (signing bonus) void years
 * @param {Array<{guaranteedSalary:number, nonGuaranteedSalary:number, optionBonus:number, rosterBonus:number, proratedSigningBonus:number|null}>} params.years
 *   - array indexed 0..(totalYears-1) for real years. optionBonus on index
 *     1+ is a real scheduled bonus (Year 1 never valid). Void years have
 *     no entry.
 * @returns {{
 *   rows: Array<{ isVoid:boolean, voidReason:('signing_bonus'|'option_bonus'|null), seasonYear:number, proratedSigningBonus:number, capCharge:number, cashValue:number, deadCapIfCut:number, rosterBonusConverted:boolean }>,
 *   totalCap:number, totalCash:number
 * }}
 */
export function computeContractPreview({ startYear, signingBonusTotal, totalYears, voidYears, years }) {
  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const ownerSpan = T + V;
  if (ownerSpan === 0) return { rows: [], totalCap: 0, totalCash: 0 };

  // Real scheduled option bonuses: Year 2+ of real years only, mirroring
  // the database triggers. Their five-season windows decide how far the
  // automatic option void years extend the contract (5.20(d)).
  const options = [];
  for (let i = 1; i < T; i++) {
    const amount = Number(years[i] && years[i].optionBonus) || 0;
    if (amount > 0) options.push({ yearNumber: i + 1, amount });
  }
  const lastOptionWindow = options.reduce((m, ob) => Math.max(m, ob.yearNumber + 4), 0);
  const span = Math.max(ownerSpan, lastOptionWindow);

  // Signing bonus prorates over the OWNER span only -- real years plus
  // owner-elected void years. Automatic option void years never carry it
  // (rule book v13 5.7(a), 5.10(b)).
  const evenProration = signingBonusTotal / ownerSpan;
  const today = new Date();

  const rows = [];
  for (let i = 0; i < span; i++) {
    const yearNumber = i + 1;
    const isReal = yearNumber <= T;
    const isOwnerVoid = !isReal && yearNumber <= ownerSpan;
    const isOptionVoid = yearNumber > ownerSpan;
    const seasonYear = Number(startYear) + i;
    const yearData = isReal ? years[i] || {} : {};

    const proratedSigningBonus = isOptionVoid
      ? 0
      : isReal && yearData.proratedSigningBonus != null
        ? Number(yearData.proratedSigningBonus)
        : evenProration;

    const guaranteedSalary = isReal ? Number(yearData.guaranteedSalary) || 0 : 0;
    const nonGuaranteedSalary = isReal ? Number(yearData.nonGuaranteedSalary) || 0 : 0;
    // The option bonus SHOWN on a row is the one exercising that season
    // (Year 1 never valid); its cap effect is the prorated window below.
    const optionBonus = isReal && yearNumber >= 2 ? Number(yearData.optionBonus) || 0 : 0;
    const rosterBonus = isReal ? Number(yearData.rosterBonus) || 0 : 0;
    const rosterBonusConverted = today >= SEPT_2(seasonYear);
    const rosterBonusCounted = rosterBonusConverted ? rosterBonus : 0;

    // This season's share of every option bonus whose five-season window
    // covers it -- same clause as the contract_year_computed view.
    let optionProration = 0;
    options.forEach((ob) => {
      if (ob.yearNumber <= yearNumber && yearNumber <= ob.yearNumber + 4) {
        optionProration += ob.amount / 5;
      }
    });

    const capCharge = ceilUp(
      proratedSigningBonus + guaranteedSalary + nonGuaranteedSalary + optionProration + rosterBonusCounted
    );

    // The displayed Cash column is the same figure the league minimum is
    // measured against, so it goes through the same seasonCash() rather
    // than repeating the sum here. This is display, not rule evaluation --
    // but an independent copy of the arithmetic is how the two would drift
    // apart the next time the cash definition changes, which is the
    // failure this whole module exists to prevent. Cash-wise an option
    // bonus pays in full in its exercise season, which is what seasonCash
    // already does with it.
    const cashValue = ceilUp(
      seasonCash({
        contractYearNumber: yearNumber,
        guaranteedSalary,
        nonGuaranteedSalary,
        rosterBonus,
        signingBonusTotal,
        optionBonus,
      })
    );

    rows.push({
      isVoid: !isReal,
      voidReason: isOwnerVoid ? 'signing_bonus' : isOptionVoid ? 'option_bonus' : null,
      seasonYear,
      yearNumber,
      proratedSigningBonus,
      guaranteedSalary,
      nonGuaranteedSalary,
      optionBonus,
      rosterBonus,
      rosterBonusConverted,
      optionProration,
      capCharge,
      cashValue,
    });
  }

  // Dead cap if cut in season N, mirroring the view's dead_cap_if_cut:
  //   - every season >= N's prorated signing bonus and guaranteed salary
  //   - for each option bonus already triggered by N (exercise <= N,
  //     including N itself -- the same-season fix of Aug 11), its
  //     remaining slices from max(exercise, N) through exercise + 4
  //   - row N's own roster bonus, only if its Sept 2 has passed
  // Untriggered option bonuses (exercise > N) contribute nothing -- they
  // never happen (5.20(c)). Accumulated raw, rounded once at the end.
  for (let n = 0; n < rows.length; n++) {
    const yearNumber = n + 1;
    let dead = 0;
    for (let i = n; i < rows.length; i++) {
      dead += rows[i].proratedSigningBonus + rows[i].guaranteedSalary;
    }
    options.forEach((ob) => {
      if (ob.yearNumber <= yearNumber) {
        const from = Math.max(ob.yearNumber, yearNumber);
        const slices = ob.yearNumber + 4 - from + 1;
        dead += slices * (ob.amount / 5);
      }
    });
    dead += rows[n].rosterBonusConverted ? rows[n].rosterBonus : 0;
    rows[n].deadCapIfCut = ceilUp(dead);
  }

  const totalCap = rows.reduce((sum, r) => sum + r.capCharge, 0);
  const totalCash = rows.reduce((sum, r) => sum + r.cashValue, 0);

  return { rows, totalCap, totalCash };
}

/**
 * Checks whether a contract, as currently entered, would actually be
 * accepted by the database. Two SEPARATE rules, and the difference between
 * them is easy to blur while editing this function:
 *
 *   - The Deion Rule: a real year's salary must cover that year's PRORATED
 *     signing bonus. Proration is the entire point of this one. The
 *     database's contract-side check reads the salary columns on
 *     contract_years -- which no longer include an option bonus, since the
 *     legacy column is always written as zero -- so option bonuses are
 *     deliberately NOT counted here either. (The bid-side Deion check
 *     differs; see lib/bidMath.js.)
 *   - The league minimum salary (rule book 1.9): every real year must pay
 *     that season's floor IN CASH, where cash explicitly EXCLUDES the
 *     prorated signing bonus and the cap charge, and INCLUDES an option
 *     bonus in its exercise season. See lib/leagueMinimum.js.
 *
 * The 30% Rule (v13 5.22) is a third, separate check -- see
 * lib/thirtyPercentRule.js; the form runs it alongside this one.
 *
 * Both checks here can silently fail at save time with a raw database
 * error, since neither is visible just from looking at the Cap/Cash
 * columns.
 *
 * The minimum-salary half is skipped entirely for rookie and
 * practice_squad contracts, which rule book 1.9 exempts -- the one check
 * here that ISN'T universal across contract types, unlike the Deion Rule
 * check beside it.
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
    const optionBonus = i === 0 ? 0 : Number(y.optionBonus) || 0;

    // Deion Rule -- prorated, deliberately. Do not route this through
    // seasonCash(); the two rules measure different things.
    const salary = guaranteedSalary + nonGuaranteedSalary + rosterBonus;
    if (prorated > salary + 1e-9) {
      issues.push(
        seasonYear +
          ' (Year ' +
          (i + 1) +
          '): real salary is ' +
          salary.toFixed(2) +
          ", but this year's share of the signing bonus is " +
          prorated.toFixed(2) +
          ' — raise guaranteed, non-guaranteed, or roster bonus for this year, or lower the signing bonus / spread it over more years.'
      );
    }

    // League minimum -- cash only. No proration, no cap charge.
    if (!minimumSalaryExempt) {
      const min = leagueMinimumSalary(seasonYear);
      const cash = seasonCash({
        contractYearNumber: i + 1,
        guaranteedSalary,
        nonGuaranteedSalary,
        rosterBonus,
        signingBonusTotal,
        optionBonus,
      });
      if (cash < min - 1e-9) {
        issues.push(minimumSalaryIssue(seasonYear, cash, min));
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
