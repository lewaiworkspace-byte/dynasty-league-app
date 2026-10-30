// lib/contractMath.js -- the contract builder's live preview
// (computeContractPreview) and its pre-save check (validateContract).
//
// Expected values are derived by hand from the formulas in the headers of
// lib/contractMath.js, lib/deadCapPreview.js and lib/ppvMath.js. They pin
// what the client computes. They cannot say whether the database agrees:
// contract_year_computed and the contract triggers remain the authority.
//
// PPV figures use the league's weights. The app reads them from the
// ppv_weight_table rows through buildWeightLookup(); this suite cannot reach
// the database, so it uses the client's copy, FALLBACK_WEIGHTS in
// lib/ppvMath.js. tests/bidPpv.test.mjs pins that copy's guaranteed,
// non-guaranteed and roster-bonus weights to the league's stated figures:
// 95/90/85/80/75%, 30/20/15/10/5% and 50/40/30/20/10% by contract year.
// The option-bonus weights were not part of that statement, so an
// expected figure that needs one reads it from FALLBACK_WEIGHTS instead of
// writing a number down.
//
// The preview reads today's date to decide whether a roster bonus has
// converted (September 2 of its season). Every preview test pins the clock,
// so the suite gives the same answer on any day it runs.
//
// Each describe block ends with a control test proving its check can fire.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computeContractPreview, validateContract } from '../lib/contractMath.js';
import { FALLBACK_WEIGHTS } from '../lib/ppvMath.js';
import { assertClose, assertAllClose, assertExact } from './helpers.mjs';

const WEIGHTS = FALLBACK_WEIGHTS;

// The Year 2 option-bonus weight, read rather than restated; see the header.
const OPTION_WEIGHT_YEAR_2 = FALLBACK_WEIGHTS.optionBonus[1];

// Local-time dates, matching the module's own new Date(year, 8, 2).
const JULY_1_2026 = new Date(2026, 6, 1);
const SEPT_3_2027 = new Date(2027, 8, 3);

function pinClock(t, when) {
  t.mock.timers.enable({ apis: ['Date'], now: when });
}

function year(fields) {
  return {
    guaranteedSalary: 0,
    nonGuaranteedSalary: 0,
    optionBonus: 0,
    rosterBonus: 0,
    proratedSigningBonus: null,
    ...fields,
  };
}

function pick(rows, key) {
  return rows.map((r) => r[key]);
}

// Three real years and one owner-elected void year; a roster bonus in
// Year 2; no option bonus. Signing bonus 12 over an owner span of 4 = 3.
const PLAIN = {
  startYear: 2026,
  signingBonusTotal: 12,
  totalYears: 3,
  voidYears: 1,
  years: [
    year({ guaranteedSalary: 20, nonGuaranteedSalary: 5 }),
    year({ guaranteedSalary: 15, nonGuaranteedSalary: 5, rosterBonus: 4 }),
    year({ guaranteedSalary: 10 }),
  ],
  weights: WEIGHTS,
};

// Two real years, a 10 option bonus exercising in Year 2. Its five-season
// window runs Years 2-6, so the deal extends with four automatic option
// void seasons. Signing bonus 10 over the owner span of 2 = 5.
const WITH_OPTION = {
  startYear: 2026,
  signingBonusTotal: 10,
  totalYears: 2,
  voidYears: 0,
  years: [year({ guaranteedSalary: 10 }), year({ guaranteedSalary: 10, optionBonus: 10 })],
  weights: WEIGHTS,
};

describe('computeContractPreview: plain contract with an owner void year', () => {
  test('labels each season and its void reason', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows } = computeContractPreview(PLAIN);
    assert.deepEqual(pick(rows, 'seasonYear'), [2026, 2027, 2028, 2029]);
    assert.deepEqual(pick(rows, 'isVoid'), [false, false, false, true]);
    assert.deepEqual(pick(rows, 'voidReason'), [null, null, null, 'signing_bonus']);
  });

  test('prorates the signing bonus evenly over real and owner void years', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows } = computeContractPreview(PLAIN);
    assertAllClose(pick(rows, 'proratedSigningBonus'), [3, 3, 3, 3], 'proration');
  });

  test('cap: proration + salary, roster bonus held back before September 2', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows, totalCap } = computeContractPreview(PLAIN);
    // 3+20+5, 3+15+5 (roster 4 not yet converted), 3+10, 3
    assert.deepEqual(pick(rows, 'capCharge'), [28, 23, 13, 3]);
    assert.deepEqual(pick(rows, 'rosterBonusConverted'), [false, false, false, false]);
    assertExact(totalCap, 67, 'totalCap');
  });

  test('cap: a roster bonus counts once its season reaches September 2', (t) => {
    pinClock(t, SEPT_3_2027);
    const { rows, totalCap } = computeContractPreview(PLAIN);
    assert.deepEqual(pick(rows, 'rosterBonusConverted'), [true, true, false, false]);
    assert.deepEqual(pick(rows, 'capCharge'), [28, 27, 13, 3]);
    assertExact(totalCap, 71, 'totalCap');
  });

  test('cash: full signing bonus in Year 1, roster bonus whatever the date', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows, totalCash } = computeContractPreview(PLAIN);
    // 20+5+12, 15+5+4, 10, void 0
    assert.deepEqual(pick(rows, 'cashValue'), [37, 24, 10, 0]);
    assertExact(totalCash, 71, 'totalCash');
  });

  test('PPV: signing bonus in Year 1 only, each component weighted by its year', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows, totalPpv } = computeContractPreview(PLAIN);
    // 12 + 20x0.95 + 5x0.30 | 15x0.90 + 5x0.20 + 4x0.40 | 10x0.85 | void
    assertAllClose(pick(rows, 'ppv'), [32.5, 16.1, 8.5, 0], 'ppv');
    assertClose(totalPpv, 57.1, 'totalPpv');
  });

  test('dead cap: proration + guaranteed from each season forward, no roster bonus', (t) => {
    // Pinned after September 2, 2027, so the Year 2 roster bonus has
    // converted for cap -- and still adds nothing to dead cap.
    pinClock(t, SEPT_3_2027);
    const { rows } = computeContractPreview(PLAIN);
    // rows owe 23, 18, 13, 3
    assert.deepEqual(pick(rows, 'deadCapIfCut'), [57, 34, 16, 3]);
  });

  test('control: a total PPV one cent off would be caught', (t) => {
    pinClock(t, JULY_1_2026);
    const { totalPpv } = computeContractPreview(PLAIN);
    assert.throws(() => assertClose(totalPpv, 57.11, 'totalPpv'), {
      name: 'AssertionError',
      message: 'totalPpv: expected 57.110000, got 57.100000',
    });
  });
});

describe('computeContractPreview: option bonus and automatic void seasons', () => {
  test('extends the deal to the end of the option window', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows } = computeContractPreview(WITH_OPTION);
    assert.deepEqual(pick(rows, 'seasonYear'), [2026, 2027, 2028, 2029, 2030, 2031]);
    assert.deepEqual(pick(rows, 'voidReason'), [
      null,
      null,
      'option_bonus',
      'option_bonus',
      'option_bonus',
      'option_bonus',
    ]);
  });

  test('automatic option void seasons carry no signing bonus', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows } = computeContractPreview(WITH_OPTION);
    assertAllClose(pick(rows, 'proratedSigningBonus'), [5, 5, 0, 0, 0, 0], 'proration');
  });

  test('cap: one fifth of the option bonus in each season of its window', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows, totalCap } = computeContractPreview(WITH_OPTION);
    assertAllClose(pick(rows, 'optionProration'), [0, 2, 2, 2, 2, 2], 'optionProration');
    assert.deepEqual(pick(rows, 'capCharge'), [15, 17, 2, 2, 2, 2]);
    assertExact(totalCap, 40, 'totalCap');
  });

  test('cash and PPV: the option bonus counts in full in its exercise season only', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows, totalCash, totalPpv } = computeContractPreview(WITH_OPTION);
    assert.deepEqual(pick(rows, 'cashValue'), [20, 20, 0, 0, 0, 0]);
    assertExact(totalCash, 40, 'totalCash');
    // 10 + 10x0.95 | 10x0.90 + 10 x the Year 2 option weight
    const year2 = 9 + 10 * OPTION_WEIGHT_YEAR_2;
    assertAllClose(pick(rows, 'ppv'), [19.5, year2, 0, 0, 0, 0], 'ppv');
    assertClose(totalPpv, 19.5 + year2, 'totalPpv');
  });

  test('dead cap: an option bonus counts from its own exercise season onward', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows } = computeContractPreview(WITH_OPTION);
    // Year 1: 15 + 15, option not yet triggered. Year 2: 15 + five slices of
    // 2. Years 3-6: the slices that remain.
    assert.deepEqual(pick(rows, 'deadCapIfCut'), [30, 25, 8, 6, 4, 2]);
  });

  test('a Year 1 option bonus is ignored: no window, no value', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows, totalPpv, totalCap } = computeContractPreview({
      ...PLAIN,
      years: [year({ ...PLAIN.years[0], optionBonus: 50 }), PLAIN.years[1], PLAIN.years[2]],
    });
    assertExact(rows.length, 4, 'row count');
    assertExact(rows[0].optionBonus, 0, 'Year 1 option bonus shown');
    assertClose(totalPpv, 57.1, 'totalPpv');
    assertExact(totalCap, 67, 'totalCap');
  });

  test('control: a contract that stopped at its owner span would be caught', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows } = computeContractPreview(WITH_OPTION);
    assert.throws(() => assertExact(rows.length, 2, 'row count'), {
      name: 'AssertionError',
      message: 'row count: expected 2.000000, got 6.000000',
    });
  });
});

describe('computeContractPreview: rounding and edge cases', () => {
  // Signing bonus 10 over three years: 3.333... a season.
  const THIRDS = {
    startYear: 2026,
    signingBonusTotal: 10,
    totalYears: 3,
    voidYears: 0,
    years: [year({ guaranteedSalary: 1 }), year({ guaranteedSalary: 1 }), year({ guaranteedSalary: 1 })],
    weights: WEIGHTS,
  };

  test('cap rounds up per row and the total sums the rounded rows', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows, totalCap } = computeContractPreview(THIRDS);
    // 4.333... each, rounded up to 5. Raw total would be 13.
    assert.deepEqual(pick(rows, 'capCharge'), [5, 5, 5]);
    assertExact(totalCap, 15, 'totalCap');
  });

  test('PPV is not rounded', (t) => {
    pinClock(t, JULY_1_2026);
    const { totalPpv } = computeContractPreview(THIRDS);
    // 10 + 1x0.95 | 1x0.90 | 1x0.85
    assertClose(totalPpv, 12.7, 'totalPpv');
  });

  test('a per-year proration overrides the even split on real years only', (t) => {
    pinClock(t, JULY_1_2026);
    const { rows } = computeContractPreview({
      ...PLAIN,
      years: [year({ ...PLAIN.years[0], proratedSigningBonus: 6 }), PLAIN.years[1], PLAIN.years[2]],
    });
    assertAllClose(pick(rows, 'proratedSigningBonus'), [6, 3, 3, 3], 'proration');
    assertExact(rows[0].capCharge, 31, 'Year 1 cap');
  });

  test('no years at all returns an empty preview', (t) => {
    pinClock(t, JULY_1_2026);
    assert.deepEqual(
      computeContractPreview({ startYear: 2026, signingBonusTotal: 5, totalYears: 0, voidYears: 0, years: [] }),
      { rows: [], totalPpv: 0, totalCap: 0, totalCash: 0 }
    );
  });

  test('control: a total that summed raw rows instead of rounded ones would be caught', (t) => {
    pinClock(t, JULY_1_2026);
    const { totalCap } = computeContractPreview(THIRDS);
    assert.throws(() => assertExact(totalCap, 13, 'totalCap'), {
      name: 'AssertionError',
      message: 'totalCap: expected 13.000000, got 15.000000',
    });
  });
});

// The sentence validateContract() reports when a real year's salary does
// not cover its prorated signing bonus, written out here so a rewording is
// caught.
function deion(season, yearNumber, salary, share) {
  return (
    season +
    ' (Year ' +
    yearNumber +
    '): real salary is ' +
    salary +
    ", but this year's share of the signing bonus is " +
    share +
    ' — raise guaranteed, non-guaranteed, or roster bonus for this year, or lower the signing ' +
    'bonus / spread it over more years.'
  );
}

function shortfall(season, cash, minimum) {
  return (
    'Minimum salary: the ' +
    season +
    ' season pays ' +
    cash +
    ' in cash, but the league minimum is ' +
    minimum +
    '. Cash means salary (guaranteed or non-guaranteed) plus any bonus actually paid that ' +
    'season -- signing bonus in Year 1, or a roster or option bonus in the season it ' +
    'triggers. Prorated bonus and cap charge do not count.'
  );
}

describe('validateContract: the Deion Rule', () => {
  // Signing bonus 20 over two years = 10 a season; each year pays exactly 10.
  const EVEN = {
    startYear: 2026,
    signingBonusTotal: 20,
    totalYears: 2,
    voidYears: 0,
    years: [year({ guaranteedSalary: 10 }), year({ guaranteedSalary: 10 })],
  };

  test('salary exactly covering the prorated share passes', () => {
    assert.deepEqual(validateContract(EVEN), { valid: true, issues: [] });
  });

  test('roster bonus counts toward covering the share', () => {
    const years = [EVEN.years[0], year({ guaranteedSalary: 5, rosterBonus: 5 })];
    assert.deepEqual(validateContract({ ...EVEN, years }), { valid: true, issues: [] });
  });

  test('an option bonus does not count toward covering the share', () => {
    // Year 2 pays 10 in cash (5 + option 5), so the minimum is met; the
    // contract-side Deion check reads salary columns only, so it fails.
    const years = [EVEN.years[0], year({ guaranteedSalary: 5, optionBonus: 5 })];
    assert.deepEqual(validateContract({ ...EVEN, years }), {
      valid: false,
      issues: [
        '2027 (Year 2): real salary is 5.00, but this year\'s share of the signing bonus is ' +
          '10.00 — raise guaranteed, non-guaranteed, or roster bonus for this year, or lower ' +
          'the signing bonus / spread it over more years.',
      ],
    });
  });

  test('void years spread the bonus thinner and are not checked themselves', () => {
    // 30 over 2 real + 1 void = 10 a season.
    assert.deepEqual(validateContract({ ...EVEN, signingBonusTotal: 30, voidYears: 1 }), {
      valid: true,
      issues: [],
    });
  });

  test('a per-year proration override is what the check measures', () => {
    const years = [year({ guaranteedSalary: 10, proratedSigningBonus: 15 }), EVEN.years[1]];
    assert.deepEqual(validateContract({ ...EVEN, years }), {
      valid: false,
      issues: [deion(2026, 1, '10.00', '15.00')],
    });
  });

  test('the Deion Rule still applies to rookie and practice squad contracts', () => {
    const years = [EVEN.years[0], year({ guaranteedSalary: 4 })];
    for (const contractType of ['rookie', 'practice_squad']) {
      assert.deepEqual(validateContract({ ...EVEN, years, contractType }), {
        valid: false,
        issues: [deion(2027, 2, '4.00', '10.00')],
      });
    }
  });

  test('control: two cents more signing bonus fires on both years', () => {
    // 20.02 over two years is 10.01 a season, one cent more than each pays.
    assert.deepEqual(validateContract({ ...EVEN, signingBonusTotal: 20.02 }), {
      valid: false,
      issues: [deion(2026, 1, '10.00', '10.01'), deion(2027, 2, '10.00', '10.01')],
    });
  });
});

describe('validateContract: the league minimum salary', () => {
  // No signing bonus; each year pays exactly its season's floor.
  const AT_FLOOR = {
    startYear: 2026,
    signingBonusTotal: 0,
    totalYears: 2,
    voidYears: 0,
    years: [year({ guaranteedSalary: 9 }), year({ guaranteedSalary: 10 })],
  };

  test('each year paying exactly its floor passes', () => {
    assert.deepEqual(validateContract(AT_FLOOR), { valid: true, issues: [] });
  });

  test('the header example fails 2027 at 8: proration does not count as cash', () => {
    // lib/leagueMinimum.js's worked example, as a contract. Signing bonus 4
    // over two years prorates 2 a season, which covers the Deion Rule and
    // adds nothing to 2027's cash.
    const contract = {
      ...AT_FLOOR,
      signingBonusTotal: 4,
      years: [
        year({ guaranteedSalary: 9 }),
        year({ guaranteedSalary: 3, nonGuaranteedSalary: 2, rosterBonus: 3 }),
      ],
    };
    assert.deepEqual(validateContract(contract), {
      valid: false,
      issues: [shortfall(2027, 8, 10)],
    });
  });

  test('a Year 1 signing bonus counts in full toward Year 1 cash', () => {
    // Year 1 salary 5 alone is short of 9; with the 10 signing bonus it is 15.
    const contract = {
      ...AT_FLOOR,
      signingBonusTotal: 10,
      years: [year({ guaranteedSalary: 5 }), year({ guaranteedSalary: 10 })],
    };
    assert.deepEqual(validateContract(contract), { valid: true, issues: [] });
  });

  test('an option bonus counts as cash in its exercise season', () => {
    const years = [AT_FLOOR.years[0], year({ guaranteedSalary: 5, optionBonus: 5 })];
    assert.deepEqual(validateContract({ ...AT_FLOOR, years }), { valid: true, issues: [] });
  });

  test('a Year 1 option bonus does not count as cash', () => {
    const years = [year({ guaranteedSalary: 5, optionBonus: 4 }), AT_FLOOR.years[1]];
    assert.deepEqual(validateContract({ ...AT_FLOOR, years }), {
      valid: false,
      issues: [shortfall(2026, 5, 9)],
    });
  });

  test('rookie and practice squad contracts are exempt', () => {
    const years = [year({ guaranteedSalary: 1 }), year({ guaranteedSalary: 1 })];
    for (const contractType of ['rookie', 'practice_squad']) {
      assert.deepEqual(validateContract({ ...AT_FLOOR, years, contractType }), {
        valid: true,
        issues: [],
      });
    }
  });

  test('every other contract type, and none at all, is checked', () => {
    const years = [year({ guaranteedSalary: 1 }), AT_FLOOR.years[1]];
    for (const contractType of [undefined, 'standard', 'Rookie']) {
      assert.deepEqual(validateContract({ ...AT_FLOOR, years, contractType }), {
        valid: false,
        issues: [shortfall(2026, 1, 9)],
      });
    }
  });

  test('void years are exempt', () => {
    assert.deepEqual(
      validateContract({ ...AT_FLOOR, totalYears: 1, voidYears: 1, years: [AT_FLOOR.years[0]] }),
      { valid: true, issues: [] }
    );
  });

  test('control: one cent under the 2026 floor fires', () => {
    const years = [year({ guaranteedSalary: 8.99 }), AT_FLOOR.years[1]];
    assert.deepEqual(validateContract({ ...AT_FLOOR, years }), {
      valid: false,
      issues: [shortfall(2026, 8.99, 9)],
    });
  });
});
