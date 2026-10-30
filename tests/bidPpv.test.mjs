// The bid PPV math: lib/ppvMath.js (the one client implementation of PPV
// weighting) and the PPV that lib/bidMath.js's computeBidPreview() shows
// on the bid form.
//
// PPV decides who wins a player (rule 6.1 reads bid_total_ppv), so these
// tests care most about three things the module headers promise: the full
// signing bonus lands in Year 1 and nowhere else, each component is
// weighted by its own contract year, and nothing is rounded.
//
// THE WEIGHTS. The app reads them from the ppv_weight_table rows, through
// buildWeightLookup(), on every page that shows PPV. This suite cannot
// reach the database, so it uses the client's copy of those rows,
// FALLBACK_WEIGHTS in lib/ppvMath.js, and the first group below pins that
// copy to the league's stated weights:
//
//   signing bonus    full value, Year 1 only
//   guaranteed       95 / 90 / 85 / 80 / 75 %   by contract year 1-5
//   non-guaranteed   30 / 20 / 15 / 10 /  5 %
//   roster bonus     50 / 40 / 30 / 20 / 10 %
//
// The option-bonus weights were not part of that statement. An expected
// figure that needs one reads it from FALLBACK_WEIGHTS.optionBonus rather
// than writing a number down, and no test pins those values.
//
// Expected values are otherwise worked out by hand from the figures above.
// None of this can say whether bid_total_ppv agrees; the database remains
// the authority.
//
// PPV does not depend on the date, so no test here pins the clock.
//
// Each describe block ends with a control test proving its check can fire.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { rowPpv, weightFor, buildWeightLookup, FALLBACK_WEIGHTS } from '../lib/ppvMath.js';
import { computeBidPreview } from '../lib/bidMath.js';
import { computeContractPreview } from '../lib/contractMath.js';
import { assertClose, assertAllClose, assertExact } from './helpers.mjs';

const WEIGHTS = FALLBACK_WEIGHTS;

// Read rather than restated; see the header.
const OPTION = FALLBACK_WEIGHTS.optionBonus;

// The ppv_weight_table row shape buildWeightLookup() reads, carrying the
// stated weights for years 1-5.
const TABLE_ROWS = [
  { contract_year_number: 1, guaranteed_weight: 0.95, non_guaranteed_weight: 0.3, roster_bonus_weight: 0.5, option_bonus_weight: OPTION[0] },
  { contract_year_number: 2, guaranteed_weight: 0.9, non_guaranteed_weight: 0.2, roster_bonus_weight: 0.4, option_bonus_weight: OPTION[1] },
  { contract_year_number: 3, guaranteed_weight: 0.85, non_guaranteed_weight: 0.15, roster_bonus_weight: 0.3, option_bonus_weight: OPTION[2] },
  { contract_year_number: 4, guaranteed_weight: 0.8, non_guaranteed_weight: 0.1, roster_bonus_weight: 0.2, option_bonus_weight: OPTION[3] },
  { contract_year_number: 5, guaranteed_weight: 0.75, non_guaranteed_weight: 0.05, roster_bonus_weight: 0.1, option_bonus_weight: OPTION[4] },
];

describe('the weights: FALLBACK_WEIGHTS, buildWeightLookup and weightFor', () => {
  test("the client's copy carries the league's stated weights", () => {
    assert.deepEqual(FALLBACK_WEIGHTS.guaranteed, [0.95, 0.9, 0.85, 0.8, 0.75]);
    assert.deepEqual(FALLBACK_WEIGHTS.nonGuaranteed, [0.3, 0.2, 0.15, 0.1, 0.05]);
    assert.deepEqual(FALLBACK_WEIGHTS.rosterBonus, [0.5, 0.4, 0.3, 0.2, 0.1]);
  });

  test('table rows become the same lookup the app would build from the database', () => {
    assert.deepEqual(buildWeightLookup(TABLE_ROWS), FALLBACK_WEIGHTS);
  });

  test('places rows by their year number, not their order, and reads numeric strings', () => {
    const shuffled = buildWeightLookup([
      { ...TABLE_ROWS[1], contract_year_number: '2', guaranteed_weight: '0.9' },
      TABLE_ROWS[0],
    ]);
    assert.deepEqual(shuffled.guaranteed, [0.95, 0.9]);
  });

  test('skips a row numbered below 1', () => {
    const lookup = buildWeightLookup([
      { contract_year_number: 0, guaranteed_weight: 9, non_guaranteed_weight: 9, roster_bonus_weight: 9, option_bonus_weight: 9 },
      TABLE_ROWS[0],
    ]);
    assert.deepEqual(lookup.guaranteed, [0.95]);
  });

  test('an empty or missing fetch falls back to FALLBACK_WEIGHTS itself', () => {
    assert.equal(buildWeightLookup([]), FALLBACK_WEIGHTS);
    assert.equal(buildWeightLookup(null), FALLBACK_WEIGHTS);
    assert.equal(buildWeightLookup(undefined), FALLBACK_WEIGHTS);
  });

  test('weightFor reads 1-based years and returns 0 beyond the table', () => {
    assertExact(weightFor(WEIGHTS, 'guaranteed', 1), 0.95, 'guaranteed Year 1');
    assertExact(weightFor(WEIGHTS, 'nonGuaranteed', 5), 0.05, 'non-guaranteed Year 5');
    assertExact(weightFor(WEIGHTS, 'rosterBonus', 3), 0.3, 'roster bonus Year 3');
    assertExact(weightFor(WEIGHTS, 'guaranteed', 6), 0, 'guaranteed Year 6');
    assertExact(weightFor(WEIGHTS, 'guaranteed', 0), 0, 'guaranteed Year 0');
  });

  test('weightFor falls back per component when a lookup lacks one', () => {
    assertExact(
      weightFor({ guaranteed: [1] }, 'nonGuaranteed', 1),
      0.3,
      'non-guaranteed Year 1 from fallback'
    );
  });

  test('control: an off-by-one year index would be caught', () => {
    // Year 2's guaranteed weight is 0.90; reading index 2 would give 0.85.
    assert.throws(
      () => assertExact(weightFor(WEIGHTS, 'guaranteed', 2), 0.85, 'guaranteed Year 2'),
      { name: 'AssertionError', message: 'guaranteed Year 2: expected 0.850000, got 0.900000' }
    );
  });
});

describe('rowPpv: one season', () => {
  const ALL_TEN = {
    signingBonusTotal: 10,
    guaranteedSalary: 10,
    nonGuaranteedSalary: 10,
    rosterBonus: 10,
    weights: WEIGHTS,
  };

  test('Year 1 credits the full signing bonus plus every weighted component', () => {
    // 10 + 10x0.95 + 10x0.30 + 10x0.50
    assertClose(rowPpv({ ...ALL_TEN, yearNumber: 1, isVoid: false }), 27.5, 'Year 1 PPV');
  });

  test('a later year gets no signing bonus, and weights shift with the year', () => {
    // 10x0.90 + 10x0.20 + 10x0.40
    assertClose(rowPpv({ ...ALL_TEN, yearNumber: 2, isVoid: false }), 15, 'Year 2 PPV');
    // 10x0.75 + 10x0.05 + 10x0.10
    assertClose(rowPpv({ ...ALL_TEN, yearNumber: 5, isVoid: false }), 9, 'Year 5 PPV');
  });

  test('an option bonus is weighted by its own exercise year', () => {
    for (const yearNumber of [2, 3, 4, 5]) {
      assertClose(
        rowPpv({ yearNumber, isVoid: false, optionBonus: 10, weights: WEIGHTS }),
        10 * OPTION[yearNumber - 1],
        'option-only PPV, Year ' + yearNumber
      );
    }
  });

  test('a void season is worth nothing, whatever it carries', () => {
    assertExact(rowPpv({ ...ALL_TEN, yearNumber: 1, isVoid: true }), 0, 'void Year 1 PPV');
    assertExact(
      rowPpv({ ...ALL_TEN, optionBonus: 10, yearNumber: 3, isVoid: true }),
      0,
      'void Year 3 PPV'
    );
  });

  test('a negative option bonus adds nothing and subtracts nothing', () => {
    assertClose(
      rowPpv({ ...ALL_TEN, optionBonus: -10, yearNumber: 2, isVoid: false }),
      15,
      'Year 2 PPV with negative option'
    );
  });

  test('is not rounded', () => {
    // 1.15 x 0.85
    assertClose(
      rowPpv({ yearNumber: 3, isVoid: false, guaranteedSalary: 1.15, weights: WEIGHTS }),
      0.9775,
      'Year 3 PPV'
    );
  });

  test('without weights it uses FALLBACK_WEIGHTS', () => {
    const { weights, ...noWeights } = ALL_TEN;
    assertClose(rowPpv({ ...noWeights, yearNumber: 1, isVoid: false }), 27.5, 'Year 1 PPV');
  });

  test('control: a Year 2 that kept the signing bonus would be caught', () => {
    assert.throws(
      () => assertClose(rowPpv({ ...ALL_TEN, yearNumber: 2, isVoid: false }), 25, 'Year 2 PPV'),
      { name: 'AssertionError', message: 'Year 2 PPV: expected 25.000000, got 15.000000' }
    );
  });
});

// Three real years and one owner void year, no option bonus.
const BID = {
  startYear: 2026,
  signingBonusTotal: 20,
  totalYears: 3,
  voidYears: 1,
  years: [
    { guaranteedSalary: 30, nonGuaranteedSalary: 10, rosterBonus: 0, optionBonus: 0 },
    { guaranteedSalary: 20, nonGuaranteedSalary: 10, rosterBonus: 10, optionBonus: 0 },
    { guaranteedSalary: 10, nonGuaranteedSalary: 0, rosterBonus: 0, optionBonus: 0 },
  ],
  weights: WEIGHTS,
};

// The same bid with a 10 option bonus exercising in Year 2; its five-season
// window extends the deal through Year 6.
const BID_WITH_OPTION = {
  ...BID,
  years: [BID.years[0], { ...BID.years[1], optionBonus: 10 }, BID.years[2]],
};

describe('computeBidPreview: total PPV', () => {
  test('per season and in total, with the void season worth nothing', () => {
    const { rows, totalPpv } = computeBidPreview(BID);
    assert.deepEqual(
      rows.map((r) => r.voidReason),
      [null, null, null, 'signing_bonus']
    );
    // 20 + 30x0.95 + 10x0.30 | 20x0.90 + 10x0.20 + 10x0.40 | 10x0.85 | void
    assertAllClose(
      rows.map((r) => r.ppv),
      [51.5, 24, 8.5, 0],
      'ppv'
    );
    assertClose(totalPpv, 84, 'totalPpv');
  });

  test('an option bonus adds value in its exercise year only; its void seasons add none', () => {
    const { rows, totalPpv } = computeBidPreview(BID_WITH_OPTION);
    assert.deepEqual(
      rows.map((r) => r.voidReason),
      [null, null, null, 'signing_bonus', 'option_bonus', 'option_bonus']
    );
    const option = 10 * OPTION[1];
    assertAllClose(
      rows.map((r) => r.ppv),
      [51.5, 24 + option, 8.5, 0, 0, 0],
      'ppv'
    );
    assertClose(totalPpv, 84 + option, 'totalPpv');
  });

  test('the signing bonus counts in full in Year 1, however many years it spans', () => {
    const shortSpan = computeBidPreview({ ...BID, voidYears: 0 });
    const longSpan = computeBidPreview({ ...BID, voidYears: 2 });
    assertClose(shortSpan.rows[0].ppv, 51.5, 'Year 1 PPV, no void years');
    assertClose(longSpan.rows[0].ppv, 51.5, 'Year 1 PPV, two void years');
    assertClose(longSpan.totalPpv, 84, 'totalPpv, two void years');
  });

  test('a Year 1 option bonus is dropped: no value, no window, no cash', () => {
    const years = [{ ...BID.years[0], optionBonus: 100 }, BID.years[1], BID.years[2]];
    const { rows, totalPpv } = computeBidPreview({ ...BID, years });
    assertExact(rows[0].optionBonus, 0, 'Year 1 option bonus');
    assertExact(rows.length, 4, 'row count');
    // 30 + 10 + the 20 signing bonus, and nothing for the option.
    assertExact(rows[0].cashValue, 60, 'Year 1 cash');
    assertClose(totalPpv, 84, 'totalPpv');
  });

  test('is not rounded: two bids 0.45 apart stay 0.45 apart', () => {
    const a = computeBidPreview({ ...BID, signingBonusTotal: 20.15 }).totalPpv;
    const b = computeBidPreview({ ...BID, signingBonusTotal: 20.6 }).totalPpv;
    assertClose(a, 84.15, 'totalPpv at 20.15');
    assertClose(b, 84.6, 'totalPpv at 20.60');
  });

  test('non-numeric form input counts as zero', () => {
    const years = [{ guaranteedSalary: '30', nonGuaranteedSalary: '' }, { guaranteedSalary: 'x' }];
    const { totalPpv } = computeBidPreview({
      startYear: 2026,
      signingBonusTotal: 0,
      totalYears: 2,
      voidYears: 0,
      years,
      weights: WEIGHTS,
    });
    // 30 x 0.95
    assertClose(totalPpv, 28.5, 'totalPpv');
  });

  test('omitting weights uses FALLBACK_WEIGHTS', () => {
    const { weights, ...noWeights } = BID;
    assertClose(computeBidPreview(noWeights).totalPpv, 84, 'totalPpv');
  });

  test('a bid with no years is worth nothing', () => {
    const { rows, totalPpv } = computeBidPreview({ ...BID, totalYears: 0, voidYears: 0, years: [] });
    assert.deepEqual(rows, []);
    assertExact(totalPpv, 0, 'totalPpv');
  });

  test('the contract builder computes the same PPV for the same structure', () => {
    const bid = computeBidPreview(BID_WITH_OPTION);
    const contract = computeContractPreview(BID_WITH_OPTION);
    assertAllClose(
      contract.rows.map((r) => r.ppv),
      bid.rows.map((r) => r.ppv),
      'contract ppv against bid ppv'
    );
    assertClose(contract.totalPpv, bid.totalPpv, 'contract totalPpv against bid totalPpv');
  });

  test('control: a total rounded up to 85 would be caught', () => {
    const { totalPpv } = computeBidPreview({ ...BID, signingBonusTotal: 20.15 });
    assert.throws(() => assertClose(totalPpv, 85, 'totalPpv'), {
      name: 'AssertionError',
      message: 'totalPpv: expected 85.000000, got 84.150000',
    });
  });
});
