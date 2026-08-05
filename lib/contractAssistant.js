// Contract Assistant -- given a target PPV, contract length, and a GM
// philosophy, generates a complete, valid contract shape.
//
// The math: PPV is a linear function of total contract cash for any FIXED
// shape (fixed proportions of bonus vs. salary vs. roster bonus, fixed
// year-by-year weights). So for a given shape, we can compute a constant
// K = PPV per dollar of total cash, then solve total_cash = target_PPV / K
// directly.
//
// Rules this version enforces:
// 1. Every dollar figure is rounded UP to a whole number, never down.
// 2. Achieved PPV is always >= the target, never below. In the rare case
//    where the shape can't satisfy the Deion Rule even at max void years,
//    the bonus share is reduced AND total cash is recalculated against
//    that new shape -- so the target is still fully met, just with a
//    less aggressive (and now compliant) shape.
// 3. Max Control (front-loaded) now genuinely uses roster bonuses in years
//    2+ -- the one real lever that gives an owner actual year-by-year exit
//    flexibility, which is the entire point of that philosophy. Year 1
//    never carries a roster bonus, matching the same real-world
//    convention as option bonuses (never used in Year 1 of a deal).
// 4. Aggressive (back-loaded) uses a moderate signing bonus, not an
//    inflated one -- its real aggressiveness comes from a RECOMMENDED
//    option bonus schedule (years 2+), returned separately, since a real
//    option bonus needs a real contract_id that doesn't exist until after
//    this contract is saved.
// 5. Every real year must also pay that season's league minimum salary IN
//    CASH -- see lib/leagueMinimum.js for what counts. Neither the
//    prorated signing bonus nor the cap charge counts toward it, which is
//    what separates this from the Deion check above: Deion is ABOUT
//    proration, this one ignores proration entirely. A low target PPV
//    combined with a shape that's thin in later years (Max Control's
//    roster-bonus-heavy tail is the usual case) can fall short here even
//    though PPV math alone is satisfied, because league-minimum
//    compliance is a real-dollar test, not a PPV one. Any shortfall gets
//    raised via non-guaranteed salary specifically -- the same dollars
//    satisfy the floor whichever bucket they land in, but non-guaranteed
//    carries a far lower PPV weight than guaranteed, so this is the
//    smallest possible push above the target. There's no matching
//    "infeasible below this PPV" refusal gate -- a naive sum of each
//    season's minimum salary looks like a natural floor but isn't one:
//    those dollars can be paid through non-guaranteed salary, which
//    counts fully for compliance but barely at all for PPV, so genuinely
//    unsatisfiable targets sit far below that naive number. Guarding
//    against the wrong number would reject valid low-PPV contracts, so
//    generation is never refused outright -- instead the achieved PPV is
//    compared back against the target, and overshootsTarget flags a gap
//    over 20% so it's visible in the UI instead of silent.

import { leagueMinimumSalary, seasonCash } from './leagueMinimum';

const GW = { 1: 0.95, 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.75 };
const NGW = { 1: 0.30, 2: 0.20, 3: 0.15, 4: 0.10, 5: 0.05 };
const RBW = { 1: 0.50, 2: 0.40, 3: 0.30, 4: 0.20, 5: 0.10 };

// Above this, the achieved PPV is flagged back to the UI rather than left
// silent -- see rule 5 above.
const OVERSHOOT_WARNING_THRESHOLD = 0.20;

function shapeTemplate(philosophy, T) {
  if (philosophy === 'front_loaded') {
    const bonusFraction = 0.15;
    const yearWeights = Array.from({ length: T }, (_, i) => T - i);
    const guarFrac = [];
    const rosterFrac = [];
    for (let y = 1; y <= T; y++) {
      if (y === 1) {
        guarFrac.push(0.85);
        rosterFrac.push(0.0);
      } else {
        guarFrac.push(0.35);
        rosterFrac.push(0.40);
      }
    }
    return { bonusFraction, yearWeights, guarFrac, rosterFrac };
  }
  if (philosophy === 'back_loaded') {
    return {
      bonusFraction: 0.20,
      yearWeights: Array.from({ length: T }, (_, i) => i + 1),
      guarFrac: Array.from({ length: T }, () => 0.85),
      rosterFrac: Array.from({ length: T }, () => 0),
    };
  }
  if (philosophy === 'pay_as_you_go') {
    return {
      bonusFraction: 0.18,
      yearWeights: Array.from({ length: T }, () => 1),
      guarFrac: Array.from({ length: T }, () => 0.50),
      rosterFrac: Array.from({ length: T }, () => 0),
    };
  }
  throw new Error('Unknown philosophy: ' + philosophy);
}

function normalize(arr) {
  const sum = arr.reduce((a, b) => a + b, 0);
  return arr.map((x) => x / sum);
}

function computeK(bonusFraction, yearWeights, guarFrac, rosterFrac, T) {
  const weights = normalize(yearWeights);
  const remaining = 1 - bonusFraction;
  let K = bonusFraction * 1.0;
  for (let i = 0; i < T; i++) {
    const y = i + 1;
    const g = guarFrac[i];
    const r = rosterFrac[i];
    const ng = 1 - g - r;
    K += remaining * weights[i] * (g * GW[y] + ng * NGW[y] + r * RBW[y]);
  }
  return K;
}

function buildYearsRaw(totalCash, bonusFraction, yearWeights, guarFrac, rosterFrac, T) {
  const weights = normalize(yearWeights);
  const signingBonus = totalCash * bonusFraction;
  const remaining = totalCash - signingBonus;
  const years = [];
  for (let i = 0; i < T; i++) {
    const yc = remaining * weights[i];
    const g = guarFrac[i];
    const r = rosterFrac[i];
    const ng = 1 - g - r;
    years.push({ year: i + 1, guaranteed: yc * g, nonGuaranteed: yc * ng, roster: yc * r });
  }
  return { signingBonus, years };
}

function ceilUp(n) {
  return Math.ceil(n - 1e-9);
}

function deionOk(signingBonus, years, span) {
  const prorated = ceilUp(signingBonus / span);
  // Roster bonus counts toward the salary side of the Deion test, same as
  // the real CBA rule (salary includes option, roster, and workout bonuses).
  return years.every((y) => ceilUp(y.guaranteed) + ceilUp(y.nonGuaranteed) + ceilUp(y.roster) >= prorated);
}

/**
 * @param {number} targetPPV
 * @param {number} totalYears - real contract years (1-5), manually chosen
 * @param {'front_loaded'|'back_loaded'|'pay_as_you_go'} philosophy
 * @param {number} maxVoidYears - contract's void year allowance (5 - totalYears)
 * @param {number} startYear - season the contract begins; league minimum
 *   salary escalates per season, so the floor check needs a real year, not
 *   just a relative contract-year number.
 */
export function generateContract(targetPPV, totalYears, philosophy, maxVoidYears, startYear) {
  const T = totalYears;
  const { bonusFraction, yearWeights, guarFrac, rosterFrac } = shapeTemplate(philosophy, T);
  const K = computeK(bonusFraction, yearWeights, guarFrac, rosterFrac, T);
  const totalCash = targetPPV / K;

  let { signingBonus, years } = buildYearsRaw(totalCash, bonusFraction, yearWeights, guarFrac, rosterFrac, T);

  let chosenVoid = null;
  for (let v = 0; v <= maxVoidYears; v++) {
    if (deionOk(signingBonus, years, T + v)) {
      chosenVoid = v;
      break;
    }
  }

  let compromiseNote = null;

  if (chosenVoid === null) {
    let bf = bonusFraction;
    while (bf > 0.03) {
      bf -= 0.02;
      const K2 = computeK(bf, yearWeights, guarFrac, rosterFrac, T);
      const totalCash2 = targetPPV / K2;
      const rebuilt = buildYearsRaw(totalCash2, bf, yearWeights, guarFrac, rosterFrac, T);
      if (deionOk(rebuilt.signingBonus, rebuilt.years, T + maxVoidYears)) {
        signingBonus = rebuilt.signingBonus;
        years = rebuilt.years;
        chosenVoid = maxVoidYears;
        compromiseNote =
          'Reduced the bonus share from ' +
          Math.round(bonusFraction * 100) +
          '% to ' +
          Math.round(bf * 100) +
          "% of the deal to stay compliant with the salary floor rule (a season's real salary, " +
          'including any roster bonus, must cover its prorated bonus) -- your full target PPV is ' +
          'still met.';
        break;
      }
    }
    if (chosenVoid === null) chosenVoid = maxVoidYears;
  }

  const signingBonusTotal = ceilUp(signingBonus);
  const yearsRounded = years.map((y) => ({
    year: y.year,
    guaranteedSalary: ceilUp(y.guaranteed),
    nonGuaranteedSalary: ceilUp(y.nonGuaranteed),
    rosterBonus: ceilUp(y.roster),
  }));

  // League minimum salary floor (rule 5 above), measured in CASH via the
  // shared seasonCash() -- see lib/leagueMinimum.js for the rule and for
  // why no file may sum its own components.
  //
  // This loop is what generated an illegal contract under the old
  // definition: it measured the shortfall against max(cash, cap), and the
  // cap figure included the prorated signing bonus. A season propped up by
  // proration therefore computed a smaller shortfall than it really had
  // and got topped up too little, producing a bid the database refused.
  // Neither proration nor cap charge appears here now. A season carrying a
  // roster bonus or a triggering option bonus needs LESS top-up than
  // before; a season that was leaning on proration needs MORE.
  const floorTopUps = [];
  yearsRounded.forEach((y, idx) => {
    const seasonYear = Number(startYear) + idx;
    const floor = leagueMinimumSalary(seasonYear);
    const cash = seasonCash({
      contractYearNumber: idx + 1,
      guaranteedSalary: y.guaranteedSalary,
      nonGuaranteedSalary: y.nonGuaranteedSalary,
      rosterBonus: y.rosterBonus,
      signingBonusTotal,
      optionBonus: y.optionBonus,
    });
    const shortfall = floor - cash;
    if (shortfall > 1e-9) {
      // Non-guaranteed rather than guaranteed, deliberately: the same
      // dollars satisfy the floor either way, but Year 5 guaranteed
      // carries a 75% PPV weight against non-guaranteed's 5%, so topping
      // up guaranteed would inflate the contract's PPV far more than
      // necessary. That reasoning is unaffected by the cash-only ruling.
      const raise = ceilUp(shortfall);
      y.nonGuaranteedSalary += raise;
      floorTopUps.push({ seasonYear, amount: raise });
    }
  });

  const floorTopUpNote =
    floorTopUps.length > 0
      ? "Raised non-guaranteed salary to clear that season's league minimum salary in cash: " +
        floorTopUps.map((t) => t.seasonYear + ' +$' + t.amount).join(', ') +
        '.'
      : null;

  const achievedPPV =
    signingBonusTotal * 1.0 +
    yearsRounded.reduce(
      (sum, y) =>
        sum + y.guaranteedSalary * GW[y.year] + y.nonGuaranteedSalary * NGW[y.year] + y.rosterBonus * RBW[y.year],
      0
    );

  const optionBonusRecommendations = [];
  if (philosophy === 'back_loaded') {
    for (const y of yearsRounded) {
      if (y.year >= 2 && y.guaranteedSalary > 0) {
        const amount = ceilUp(y.guaranteedSalary * 0.75);
        if (amount > 0) {
          optionBonusRecommendations.push({ yearOffset: y.year - 1, amount });
        }
      }
    }
  }

  const roundedAchievedPPV = Math.round(achievedPPV * 100) / 100;
  const overshootPct = targetPPV > 0 ? (roundedAchievedPPV - targetPPV) / targetPPV : 0;

  return {
    signingBonusTotal,
    voidYears: chosenVoid,
    years: yearsRounded,
    achievedPPV: roundedAchievedPPV,
    targetPPV,
    compromiseNote,
    floorTopUpNote,
    overshootPct: Math.round(overshootPct * 1000) / 1000,
    overshootsTarget: overshootPct > OVERSHOOT_WARNING_THRESHOLD,
    optionBonusRecommendations,
  };
}

export const PHILOSOPHY_LABELS = {
  front_loaded: 'Max Control – Bill Belichick/Patriots',
  back_loaded: 'Aggressive – Howie Roseman/Eagles',
  pay_as_you_go: 'Pay As You Go – Ted Thompson/Packers',
};
