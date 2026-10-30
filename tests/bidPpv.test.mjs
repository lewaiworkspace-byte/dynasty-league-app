// The bid PPV math: lib/ppvMath.js (the one client implementation of PPV
// weighting) and the PPV that lib/bidMath.js's computeBidPreview() shows
// on the bid form.
//
// PPV decides who wins a player (rule 6.1 reads bid_total_ppv), so these
// tests care most about three things the module headers promise: the full
// signing bonus lands in Year 1 and nowhere else, each component is
// weighted by its own contract year, and nothing is rounded.
//
// Expected values are derived by hand from those headers using an invented
// weight table, so the tests check the arithmetic without restating the
// league's weights, which live in ppv_weight_table. The one test of the
// fallback path reads FALLBACK_WEIGHTS rather than copying its numbers.
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

// Invented for the test. Not the league's weights. The Year 1 option
// weight is deliberately non-zero, so a test can show the bid preview drops
// a Year 1 option bonus itself rather than relying on a zero weight.
const TABLE_ROWS = [
  { contract_year_number: 1, guaranteed_weight: 1, non_guaranteed_weight: 0.5, roster_bonus_weight: 0.25, option_bonus_weight: 0.5 },
  { contract_year_number: 2, guaranteed_weight: 0.8, non_guaranteed_weight: 0.4, roster_bonus_weight: 0.2, option_bonus_weight: 0.9 },
  { contract_year_number: 3, guaranteed_weight: 0.6, non_guaranteed_weight: 0.3, roster_bonus_weight: 0.15, option_bonus_weight: 0.7 },
  { contract_year_number: 4, guaranteed_weight: 0.4, non_guaranteed_weight: 0.2, roster_bonus_weight: 0.1, option_bonus_weight: 0.5 },
  { contract_year_number: 5, guaranteed_weight: 0.2, non_guaranteed_weight: 0.1, roster_bonus_weight: 0.05, option_bonus_weight: 0.3 },
];
const W = buildWeightLookup(TABLE_ROWS);

describe('buildWeightLookup and weightFor', () => {
  test('turns table rows into one array per component, indexed by year', () => {
    assert.deepEqual(W, {
      guaranteed: [1, 0.8, 0.6, 0.4, 0.2],
      nonGuaranteed: [0.5, 0.4, 0.3, 0.2, 0.1],
      rosterBonus: [0.25, 0.2, 0.15, 0.1, 0.05],
      optionBonus: [0.5, 0.9, 0.7, 0.5, 0.3],
    });
  });

  test('places rows by their year number, not their order, and reads numeric strings', () => {
    const shuffled = buildWeightLookup([
      { contract_year_number: '2', guaranteed_weight: '0.8', non_guaranteed_weight: 0.4, roster_bonus_weight: 0.2, option_bonus_weight: 0.9 },
      { contract_year_number: 1, guaranteed_weight: 1, non_guaranteed_weight: 0.5, roster_bonus_weight: 0.25, option_bonus_weight: 0 },
    ]);
    assert.deepEqual(shuffled.guaranteed, [1, 0.8]);
  });

  test('skips a row numbered below 1', () => {
    const lookup = buildWeightLookup([
      { contract_year_number: 0, guaranteed_weight: 9, non_guaranteed_weight: 9, roster_bonus_weight: 9, option_bonus_weight: 9 },
      TABLE_ROWS[0],
    ]);
    assert.deepEqual(lookup.guaranteed, [1]);
  });

  test('an empty or missing fetch falls back to FALLBACK_WEIGHTS itself', () => {
    assert.equal(buildWeightLookup([]), FALLBACK_WEIGHTS);
    assert.equal(buildWeightLookup(null), FALLBACK_WEIGHTS);
    assert.equal(buildWeightLookup(undefined), FALLBACK_WEIGHTS);
  });

  test('weightFor reads 1-based years and returns 0 beyond the table', () => {
    assertExact(weightFor(W, 'guaranteed', 1), 1, 'guaranteed Year 1');
    assertExact(weightFor(W, 'optionBonus', 5), 0.3, 'option Year 5');
    assertExact(weightFor(W, 'guaranteed', 6), 0, 'guaranteed Year 6');
    assertExact(weightFor(W, 'guaranteed', 0), 0, 'guaranteed Year 0');
  });

  test('weightFor falls back per component when a lookup lacks one', () => {
    const partial = { guaranteed: [1] };
    assertExact(
      weightFor(partial, 'nonGuaranteed', 1),
      FALLBACK_WEIGHTS.nonGuaranteed[0],
      'non-guaranteed Year 1 from fallback'
    );
  });

  test('control: an off-by-one year index would be caught', () => {
    // Year 2's guaranteed weight is 0.8; reading index 2 would give 0.6.
    assert.throws(() => assertExact(weightFor(W, 'guaranteed', 2), 0.6, 'guaranteed Year 2'), {
      name: 'AssertionError',
      message: 'guaranteed Year 2: expected 0.600000, got 0.800000',
    });
  });
});

describe('rowPpv: one season', () => {
  const ALL_TEN = {
    signingBonusTotal: 10,
    guaranteedSalary: 10,
    nonGuaranteedSalary: 10,
    rosterBonus: 10,
    optionBonus: 10,
    weights: W,
  };

  test('Year 1 credits the full signing bonus plus every weighted component', () => {
    // 10 + 10x1 + 10x0.5 + 10x0.25 + 10x0.5
    assertClose(rowPpv({ ...ALL_TEN, yearNumber: 1, isVoid: false }), 32.5, 'Year 1 PPV');
  });

  test('a later year gets no signing bonus, and weights shift with the year', () => {
    // 10x0.8 + 10x0.4 + 10x0.2 + 10x0.9
    assertClose(rowPpv({ ...ALL_TEN, yearNumber: 2, isVoid: false }), 23, 'Year 2 PPV');
    // 10x0.2 + 10x0.1 + 10x0.05 + 10x0.3
    assertClose(rowPpv({ ...ALL_TEN, yearNumber: 5, isVoid: false }), 6.5, 'Year 5 PPV');
  });

  test('a void season is worth nothing, whatever it carries', () => {
    assertExact(rowPpv({ ...ALL_TEN, yearNumber: 1, isVoid: true }), 0, 'void Year 1 PPV');
    assertExact(rowPpv({ ...ALL_TEN, yearNumber: 3, isVoid: true }), 0, 'void Year 3 PPV');
  });

  test('a negative option bonus adds nothing and subtracts nothing', () => {
    // 10x0.8 + 10x0.4 + 10x0.2
    assertClose(
      rowPpv({ ...ALL_TEN, optionBonus: -10, yearNumber: 2, isVoid: false }),
      14,
      'Year 2 PPV with negative option'
    );
  });

  test('is not rounded', () => {
    assertClose(
      rowPpv({ yearNumber: 3, isVoid: false, guaranteedSalary: 1.15, weights: W }),
      0.69,
      'Year 3 PPV'
    );
  });

  test('without weights it uses FALLBACK_WEIGHTS', () => {
    const f = FALLBACK_WEIGHTS;
    const expected =
      10 + 10 * f.guaranteed[0] + 10 * f.nonGuaranteed[0] + 10 * f.rosterBonus[0] + 10 * f.optionBonus[0];
    const { weights, ...noWeights } = ALL_TEN;
    assertClose(rowPpv({ ...noWeights, yearNumber: 1, isVoid: false }), expected, 'Year 1 PPV');
  });

  test('control: a Year 2 that kept the signing bonus would be caught', () => {
    assert.throws(
      () => assertClose(rowPpv({ ...ALL_TEN, yearNumber: 2, isVoid: false }), 33, 'Year 2 PPV'),
      { name: 'AssertionError', message: 'Year 2 PPV: expected 33.000000, got 23.000000' }
    );
  });
});

// Three real years and one owner void year; a 10 option bonus exercising in
// Year 2, whose five-season window extends the deal through Year 6.
const BID = {
  startYear: 2026,
  signingBonusTotal: 20,
  totalYears: 3,
  voidYears: 1,
  years: [
    { guaranteedSalary: 30, nonGuaranteedSalary: 10, rosterBonus: 0, optionBonus: 0 },
    { guaranteedSalary: 20, nonGuaranteedSalary: 10, rosterBonus: 10, optionBonus: 10 },
    { guaranteedSalary: 10, nonGuaranteedSalary: 0, rosterBonus: 0, optionBonus: 0 },
  ],
  weights: W,
};

describe('computeBidPreview: total PPV', () => {
  test('per season and in total, with void seasons worth nothing', () => {
    const { rows, totalPpv } = computeBidPreview(BID);
    assert.deepEqual(
      rows.map((r) => r.voidReason),
      [null, null, null, 'signing_bonus', 'option_bonus', 'option_bonus']
    );
    // 20 + 30x1 + 10x0.5 | 20x0.8 + 10x0.4 + 10x0.2 + 10x0.9 | 10x0.6 | voids
    assertAllClose(
      rows.map((r) => r.ppv),
      [55, 31, 6, 0, 0, 0],
      'ppv'
    );
    assertClose(totalPpv, 92, 'totalPpv');
  });

  test('the signing bonus counts in full in Year 1, however many years it spans', () => {
    const shortSpan = computeBidPreview({ ...BID, voidYears: 0 });
    const longSpan = computeBidPreview({ ...BID, voidYears: 2 });
    assertClose(shortSpan.rows[0].ppv, 55, 'Year 1 PPV, no void years');
    assertClose(longSpan.rows[0].ppv, 55, 'Year 1 PPV, two void years');
    assertClose(longSpan.totalPpv, 92, 'totalPpv, two void years');
  });

  test('a Year 1 option bonus is dropped even when its weight is not zero', () => {
    const years = [{ ...BID.years[0], optionBonus: 100 }, BID.years[1], BID.years[2]];
    const { rows, totalPpv } = computeBidPreview({ ...BID, years });
    assertExact(rows[0].optionBonus, 0, 'Year 1 option bonus');
    assertExact(rows.length, 6, 'row count');
    assertClose(totalPpv, 92, 'totalPpv');
  });

  test('is not rounded: two bids 0.45 apart stay 0.45 apart', () => {
    const a = computeBidPreview({ ...BID, signingBonusTotal: 20.15 }).totalPpv;
    const b = computeBidPreview({ ...BID, signingBonusTotal: 20.6 }).totalPpv;
    assertClose(a, 92.15, 'totalPpv at 20.15');
    assertClose(b, 92.6, 'totalPpv at 20.60');
  });

  test('non-numeric form input counts as zero', () => {
    const years = [{ guaranteedSalary: '30', nonGuaranteedSalary: '' }, { guaranteedSalary: 'x' }];
    const { totalPpv } = computeBidPreview({
      startYear: 2026,
      signingBonusTotal: 0,
      totalYears: 2,
      voidYears: 0,
      years,
      weights: W,
    });
    assertClose(totalPpv, 30, 'totalPpv');
  });

  test('omitting weights uses FALLBACK_WEIGHTS', () => {
    const f = FALLBACK_WEIGHTS;
    const expected =
      20 +
      30 * f.guaranteed[0] +
      10 * f.nonGuaranteed[0] +
      (20 * f.guaranteed[1] + 10 * f.nonGuaranteed[1] + 10 * f.rosterBonus[1] + 10 * f.optionBonus[1]) +
      10 * f.guaranteed[2];
    const { weights, ...noWeights } = BID;
    assertClose(computeBidPreview(noWeights).totalPpv, expected, 'totalPpv');
  });

  test('a bid with no years is worth nothing', () => {
    const { rows, totalPpv } = computeBidPreview({ ...BID, totalYears: 0, voidYears: 0, years: [] });
    assert.deepEqual(rows, []);
    assertExact(totalPpv, 0, 'totalPpv');
  });

  test('the contract builder computes the same PPV for the same structure', () => {
    const bid = computeBidPreview(BID);
    const contract = computeContractPreview(BID);
    assertAllClose(
      contract.rows.map((r) => r.ppv),
      bid.rows.map((r) => r.ppv),
      'contract ppv against bid ppv'
    );
    assertClose(contract.totalPpv, bid.totalPpv, 'contract totalPpv against bid totalPpv');
  });

  test('control: a total rounded up to 93 would be caught', () => {
    const { totalPpv } = computeBidPreview({ ...BID, signingBonusTotal: 20.15 });
    assert.throws(() => assertClose(totalPpv, 93, 'totalPpv'), {
      name: 'AssertionError',
      message: 'totalPpv: expected 93.000000, got 92.150000',
    });
  });
});
