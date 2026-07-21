// PPV weights, confirmed in CLAUDE.md -- do not change without asking.
const GUARANTEED_DECAY = [0.95, 0.9, 0.85, 0.8, 0.75];
const NON_GUARANTEED_DECAY = [0.3, 0.2, 0.15, 0.1, 0.05];
const ROSTER_BONUS_DECAY = [0.5, 0.4, 0.3, 0.2, 0.1];

export const PHILOSOPHIES = {
  front_loaded: 'Max Control – Bill Belichick/Patriots',
  back_loaded: 'Aggressive – Howie Roseman/Eagles',
  pay_as_you_go: 'Pay As You Go – Ted Thompson/Packers',
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Relative shape of each philosophy: how one unit of a scale factor (X)
// splits across signing bonus and per-year guaranteed / non-guaranteed
// salary. First-pass design meant to be tuned -- generated numbers stay
// fully editable in the form.
function shapeFor(philosophy, totalYears) {
  const g = new Array(totalYears).fill(0);
  const ng = new Array(totalYears).fill(0);
  let sb;

  if (philosophy === 'front_loaded') {
    // Big bonus + guarantee up front, then flat non-guaranteed money the
    // team can walk away from cheaply in later years.
    sb = 0.4;
    g[0] = 0.5;
    for (let i = 0; i < totalYears; i++) ng[i] = 0.15;
  } else if (philosophy === 'back_loaded') {
    // Smaller bonus, guaranteed + non-guaranteed salary escalating year
    // over year -- likely to need void years to clear the Deion Rule
    // in the early, lightly-paid seasons.
    sb = 0.25;
    for (let i = 0; i < totalYears; i++) {
      g[i] = 0.1 * (i + 1);
      ng[i] = 0.05 * (i + 1);
    }
  } else if (philosophy === 'pay_as_you_go') {
    // Minimal bonus, flat fully-guaranteed salary every year -- no cap
    // gimmicks, real cash paid as it's earned.
    sb = 0.05;
    for (let i = 0; i < totalYears; i++) {
      g[i] = 0.35;
      ng[i] = 0.05;
    }
  } else {
    throw new Error(`Unknown GM philosophy: ${philosophy}`);
  }

  return { sb, g, ng };
}

// Signing bonus counts at its full, undiscounted value, attributed
// entirely to Year 1 -- how it's amortized across contract/void years
// for cap purposes doesn't change the value the player actually banked.
// Guaranteed / non-guaranteed / roster bonus salary decay per year using
// CLAUDE.md's confirmed PPV weight table.
export function computeContractPPV({ signingBonusTotal, years }) {
  let ppv = Number(signingBonusTotal) || 0;
  years.forEach((y, idx) => {
    if (idx >= 5) return; // weight table only covers years 1-5
    ppv += (Number(y.guaranteedSalary) || 0) * GUARANTEED_DECAY[idx];
    ppv += (Number(y.nonGuaranteedSalary) || 0) * NON_GUARANTEED_DECAY[idx];
    ppv += (Number(y.rosterBonus) || 0) * ROSTER_BONUS_DECAY[idx];
  });
  return ppv;
}

// Deion Rule: a year's real salary (guaranteed + non-guaranteed) must be
// at least as much as that year's prorated signing bonus share, so a
// team can't write off almost the whole cap charge as bonus proration
// while paying next to nothing in actual salary that year. Only applies
// to real contract years -- void years carry no real salary by design.
function checkDeionRule(years, signingBonusTotal, totalYears, voidYears) {
  const totalRows = totalYears + voidYears;
  const proratedBonus = totalRows > 0 ? signingBonusTotal / totalRows : 0;
  const failingYears = [];
  for (let i = 0; i < totalYears; i++) {
    const realSalary = (years[i].guaranteedSalary || 0) + (years[i].nonGuaranteedSalary || 0);
    if (realSalary + 0.005 < proratedBonus) failingYears.push(i + 1);
  }
  return { ok: failingYears.length === 0, failingYears };
}

// Solves for a full veteran free agent contract that hits targetPPV for
// the given GM philosophy, using totalYears as a fixed input. Chooses
// the smallest number of void years (0 up to maxVoidYears) needed to
// satisfy the Deion Rule -- void years never change achieved PPV, they
// only spread the same signing bonus over more rows for cap purposes.
export function generateContract(targetPPV, totalYears, philosophy, maxVoidYears) {
  const totalYearsNum = Number(totalYears);
  if (!Number.isInteger(totalYearsNum) || totalYearsNum < 1 || totalYearsNum > 5) {
    throw new Error('totalYears must be an integer between 1 and 5.');
  }

  const target = Number(targetPPV) || 0;
  const maxVoid = Math.max(0, Math.min(Number(maxVoidYears) || 0, 5 - totalYearsNum));

  const { sb, g, ng } = shapeFor(philosophy, totalYearsNum);

  // PPV is linear in the scale factor, so it can be solved directly
  // rather than searched for.
  let ppvPerUnitScale = sb;
  for (let i = 0; i < totalYearsNum; i++) {
    ppvPerUnitScale += g[i] * GUARANTEED_DECAY[i] + ng[i] * NON_GUARANTEED_DECAY[i];
  }
  const scale = ppvPerUnitScale > 0 ? target / ppvPerUnitScale : 0;

  const signingBonusTotal = round2(sb * scale);
  const years = Array.from({ length: totalYearsNum }, (_, i) => ({
    guaranteedSalary: round2(g[i] * scale),
    nonGuaranteedSalary: round2(ng[i] * scale),
    rosterBonus: 0,
    optionBonus: 0,
  }));

  let voidYears = 0;
  let compliance = checkDeionRule(years, signingBonusTotal, totalYearsNum, voidYears);
  while (!compliance.ok && voidYears < maxVoid) {
    voidYears += 1;
    compliance = checkDeionRule(years, signingBonusTotal, totalYearsNum, voidYears);
  }

  const achievedPPV = round2(computeContractPPV({ signingBonusTotal, years }));

  return {
    signingBonusTotal,
    voidYears,
    years,
    achievedPPV,
    targetPPV: target,
    deionCompliant: compliance.ok,
    warning: compliance.ok
      ? null
      : `Even with the maximum ${maxVoid} void year${maxVoid === 1 ? '' : 's'}, this contract can't satisfy the Deion Rule in year${
          compliance.failingYears.length === 1 ? '' : 's'
        } ${compliance.failingYears.join(
          ', '
        )} — real salary is below that year's prorated signing bonus. Consider lowering the target PPV or raising real salary manually.`,
  };
}
