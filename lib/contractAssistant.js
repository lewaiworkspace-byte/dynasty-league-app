// Contract Assistant -- given a target PPV, contract length, and a GM
// philosophy, generates a complete, valid contract shape (signing bonus,
// void years, and guaranteed/non-guaranteed salary per year).
//
// The math: PPV is a linear function of total contract cash for any FIXED
// shape (fixed proportions of bonus vs. salary, fixed year-by-year weights).
// So for a given shape, we can compute a constant K = PPV per dollar of
// total cash, then solve total_cash = target_PPV / K directly.
//
// Three rules this version enforces:
// 1. Every dollar figure is rounded UP to a whole number (matches the
//    league's own money-rounding rule), never down.
// 2. Achieved PPV is always >= the target, never below. Rounding up alone
//    guarantees this in the normal case. In the rare case where the shape
//    can't satisfy the Deion Rule even at max void years, the bonus share
//    is reduced (a safer, less aggressive shape) AND total cash is
//    recalculated against that new shape -- so the target is still fully
//    met, not just approximated with less value.
// 3. The back-loaded ("Aggressive") philosophy uses a moderate signing
//    bonus, not an inflated one -- its real aggressiveness comes from a
//    RECOMMENDED option bonus schedule (years 2+), returned separately.
//    These can't be created automatically: a real option bonus needs a
//    real contract_id, which doesn't exist until after this contract is
//    saved. So they're a clear next-step recommendation, not silently
//    baked into the saved numbers.

const GW = { 1: 0.95, 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.75 };
const NGW = { 1: 0.30, 2: 0.20, 3: 0.15, 4: 0.10, 5: 0.05 };

function shapeTemplate(philosophy, T) {
  if (philosophy === 'front_loaded') {
    const bonusFraction = 0.15;
    const yearWeights = Array.from({ length: T }, (_, i) => T - i);
    const guarFrac =
      T === 1
        ? [0.85]
        : Array.from({ length: T }, (_, i) => 0.90 - 0.75 * (i / (T - 1)));
    return { bonusFraction, yearWeights, guarFrac };
  }
  if (philosophy === 'back_loaded') {
    const bonusFraction = 0.20;
    const yearWeights = Array.from({ length: T }, (_, i) => i + 1);
    const guarFrac = Array.from({ length: T }, () => 0.85);
    return { bonusFraction, yearWeights, guarFrac };
  }
  if (philosophy === 'pay_as_you_go') {
    const bonusFraction = 0.18;
    const yearWeights = Array.from({ length: T }, () => 1);
    const guarFrac = Array.from({ length: T }, () => 0.50);
    return { bonusFraction, yearWeights, guarFrac };
  }
  throw new Error('Unknown philosophy: ' + philosophy);
}

function normalize(arr) {
  const sum = arr.reduce((a, b) => a + b, 0);
  return arr.map((x) => x / sum);
}

function computeK(bonusFraction, yearWeights, guarFrac, T) {
  const weights = normalize(yearWeights);
  const remaining = 1 - bonusFraction;
  let K = bonusFraction * 1.0;
  for (let i = 0; i < T; i++) {
    const y = i + 1;
    K += remaining * weights[i] * (guarFrac[i] * GW[y] + (1 - guarFrac[i]) * NGW[y]);
  }
  return K;
}

function buildYearsRaw(totalCash, bonusFraction, yearWeights, guarFrac, T) {
  const weights = normalize(yearWeights);
  const signingBonus = totalCash * bonusFraction;
  const remaining = totalCash - signingBonus;
  const years = [];
  for (let i = 0; i < T; i++) {
    const yc = remaining * weights[i];
    years.push({ year: i + 1, guaranteed: yc * guarFrac[i], nonGuaranteed: yc * (1 - guarFrac[i]) });
  }
  return { signingBonus, years };
}

function ceilUp(n) {
  return Math.ceil(n - 1e-9);
}

function deionOk(signingBonus, years, span) {
  const prorated = ceilUp(signingBonus / span);
  return years.every((y) => ceilUp(y.guaranteed) + ceilUp(y.nonGuaranteed) >= prorated);
}

/**
 * @param {number} targetPPV
 * @param {number} totalYears - real contract years (1-5), manually chosen
 * @param {'front_loaded'|'back_loaded'|'pay_as_you_go'} philosophy
 * @param {number} maxVoidYears - contract's void year allowance (5 - totalYears)
 */
export function generateContract(targetPPV, totalYears, philosophy, maxVoidYears) {
  const T = totalYears;
  const { bonusFraction, yearWeights, guarFrac } = shapeTemplate(philosophy, T);
  const K = computeK(bonusFraction, yearWeights, guarFrac, T);
  const totalCash = targetPPV / K;

  let { signingBonus, years } = buildYearsRaw(totalCash, bonusFraction, yearWeights, guarFrac, T);

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
      const K2 = computeK(bf, yearWeights, guarFrac, T);
      const totalCash2 = targetPPV / K2;
      const rebuilt = buildYearsRaw(totalCash2, bf, yearWeights, guarFrac, T);
      if (deionOk(rebuilt.signingBonus, rebuilt.years, T + maxVoidYears)) {
        signingBonus = rebuilt.signingBonus;
        years = rebuilt.years;
        chosenVoid = maxVoidYears;
        compromiseNote = `Reduced the bonus share from ${Math.round(bonusFraction * 100)}% to ${Math.round(bf * 100)}% of the deal to stay compliant with the salary floor rule (a season's real salary must cover its prorated bonus) -- your full target PPV is still met.`;
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
  }));

  const achievedPPV =
    signingBonusTotal * 1.0 +
    yearsRounded.reduce((sum, y) => sum + y.guaranteedSalary * GW[y.year] + y.nonGuaranteedSalary * NGW[y.year], 0);

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

  return {
    signingBonusTotal,
    voidYears: chosenVoid,
    years: yearsRounded,
    achievedPPV: Math.round(achievedPPV * 100) / 100,
    targetPPV,
    compromiseNote,
    optionBonusRecommendations,
  };
}

export const PHILOSOPHY_LABELS = {
  front_loaded: 'Max Control – Bill Belichick/Patriots',
  back_loaded: 'Aggressive – Howie Roseman/Eagles',
  pay_as_you_go: 'Pay As You Go – Ted Thompson/Packers',
};
