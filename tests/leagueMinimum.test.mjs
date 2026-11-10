// lib/leagueMinimum.js -- the league minimum salary floor (rule book 1.9),
// what counts as cash toward it, and the sentence an owner is shown when a
// season falls short.
//
// Expected values are derived by hand from the formulas in that module's
// header ($9 in 2026, +5% a season, rounded up; cash = salary + roster
// bonus + option bonus + the full signing bonus in Year 1 only). They pin
// what the client computes. They say nothing about the database, which
// this suite cannot reach: league_minimum_salary() and
// check_bid_minimum_salary() remain the authority, and a change to the
// rule changes this file in the same commit as the module.
//
// Each describe block ends with a control test proving its check can fire.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leagueMinimumSalary,
  seasonCash,
  meetsMinimumSalary,
  minimumSalaryIssue,
} from '../lib/leagueMinimum.js';
import { assertExact } from './helpers.mjs';

// The fixed half of the shortfall sentence, written out here rather than
// borrowed from the module, so a rewording is caught.
const CASH_DEFINITION =
  '. Cash means salary (guaranteed or non-guaranteed) plus any bonus actually paid that ' +
  'season -- signing bonus in Year 1, or a roster or option bonus in the season it ' +
  'triggers. Prorated bonus and cap charge do not count.';

function shortfall(season, cash, minimum) {
  return (
    'Minimum salary: the ' +
    season +
    ' season pays ' +
    cash +
    ' in cash, but the league minimum is ' +
    minimum +
    CASH_DEFINITION
  );
}

// The worked example in lib/leagueMinimum.js's header: Year 2 of a 2-year
// bid starting 2026, carrying guaranteed 3, non-guaranteed 2, roster bonus
// 3 and a prorated signing bonus of 2. Correct cash is 8; the old client
// summed all four to 10 and passed it.
const HEADER_EXAMPLE = {
  contractYearNumber: 2,
  guaranteedSalary: 3,
  nonGuaranteedSalary: 2,
  rosterBonus: 3,
  signingBonusTotal: 4,
  proratedSigningBonus: 2,
};

describe('leagueMinimumSalary: the floor', () => {
  test('is 9 in 2026 and escalates 5% a season, rounded up', () => {
    // 9 x 1.05^n: 9, 9.45, 9.9225, 10.418625, 10.939556, 11.486534
    const expected = { 2026: 9, 2027: 10, 2028: 10, 2029: 11, 2030: 11, 2031: 12 };
    for (const [season, floor] of Object.entries(expected)) {
      assertExact(leagueMinimumSalary(Number(season)), floor, 'floor for ' + season);
    }
  });

  test('compounds on the unrounded figure, not on the previous rounded floor', () => {
    // Compounding the rounded 2027 floor (10 x 1.05 = 10.5) would give 11 in
    // 2028. Compounding 9 twice gives 9.9225, which rounds to 10.
    assertExact(leagueMinimumSalary(2028), 10, 'floor for 2028');
  });

  test('seasons before 2026 return the 2026 floor rather than deflating', () => {
    assertExact(leagueMinimumSalary(2025), 9, 'floor for 2025');
    assertExact(leagueMinimumSalary(2000), 9, 'floor for 2000');
  });

  test('accepts a numeric string and treats a non-number as 2026 or earlier', () => {
    assertExact(leagueMinimumSalary('2029'), 11, "floor for '2029'");
    assertExact(leagueMinimumSalary(undefined), 9, 'floor for undefined');
    assertExact(leagueMinimumSalary('not a year'), 9, "floor for 'not a year'");
  });

  test('control: a floor that rounded down instead of up would be caught', () => {
    // 9.45 rounded down is 9. The check must reject that figure for 2027.
    assert.throws(() => assertExact(leagueMinimumSalary(2027), 9, 'floor for 2027'), {
      name: 'AssertionError',
      message: 'floor for 2027: expected 9.000000, got 10.000000',
    });
  });
});

describe('seasonCash: what counts as cash', () => {
  test('Year 1 counts the full signing bonus alongside salary and bonuses', () => {
    const cash = seasonCash({
      contractYearNumber: 1,
      guaranteedSalary: 3,
      nonGuaranteedSalary: 2,
      rosterBonus: 1,
      signingBonusTotal: 10,
      optionBonus: 0,
    });
    assertExact(cash, 16, 'Year 1 cash');
  });

  test('a later year does not count the signing bonus at all', () => {
    const cash = seasonCash({
      contractYearNumber: 2,
      guaranteedSalary: 3,
      nonGuaranteedSalary: 2,
      rosterBonus: 1,
      signingBonusTotal: 10,
      optionBonus: 0,
    });
    assertExact(cash, 6, 'Year 2 cash');
  });

  test('an option bonus counts in the season it is passed for', () => {
    const cash = seasonCash({ contractYearNumber: 3, guaranteedSalary: 5, optionBonus: 4 });
    assertExact(cash, 9, 'Year 3 cash with option bonus');
  });

  test('the header example is 8: a prorated signing bonus is never read', () => {
    assertExact(seasonCash(HEADER_EXAMPLE), 8, 'header example cash');
  });

  test('missing and non-numeric fields count as zero', () => {
    assertExact(seasonCash({ contractYearNumber: 2 }), 0, 'empty season');
    assertExact(
      seasonCash({ contractYearNumber: 2, guaranteedSalary: 'abc', nonGuaranteedSalary: '4' }),
      4,
      'non-numeric guaranteed, string non-guaranteed'
    );
  });

  test("a contract year number of '1' as a string is still Year 1", () => {
    assertExact(
      seasonCash({ contractYearNumber: '1', signingBonusTotal: 7 }),
      7,
      "cash for year '1'"
    );
  });

  test('control: the old figure of 10 for the header example would be caught', () => {
    assert.throws(() => assertExact(seasonCash(HEADER_EXAMPLE), 10, 'header example cash'), {
      name: 'AssertionError',
      message: 'header example cash: expected 10.000000, got 8.000000',
    });
  });
});

describe('meetsMinimumSalary and minimumSalaryIssue', () => {
  // meetsMinimumSalary() returns a bare boolean. Where it fails, the test
  // also checks the exact sentence the validators would show an owner for
  // the same season, built the way the module tells callers to build it.
  function reportFor(seasonYear, cashFields) {
    return minimumSalaryIssue(seasonYear, seasonCash(cashFields), leagueMinimumSalary(seasonYear));
  }

  test('a season paying exactly the floor passes', () => {
    assert.equal(
      meetsMinimumSalary({ seasonYear: 2026, contractYearNumber: 2, guaranteedSalary: 9 }),
      true
    );
  });

  test('a Year 1 signing bonus can carry the season on its own', () => {
    assert.equal(
      meetsMinimumSalary({ seasonYear: 2026, contractYearNumber: 1, signingBonusTotal: 9 }),
      true
    );
  });

  test('floating-point dust below the floor still passes', () => {
    assert.equal(
      meetsMinimumSalary({
        seasonYear: 2026,
        contractYearNumber: 2,
        guaranteedSalary: 9 - 1e-12,
      }),
      true
    );
  });

  test('the header example fails 2027, with the exact sentence', () => {
    const fields = { ...HEADER_EXAMPLE };
    assert.equal(meetsMinimumSalary({ seasonYear: 2027, ...fields }), false);
    assert.equal(reportFor(2027, fields), shortfall(2027, 8, 10));
  });

  test('the sentence, written out in full', () => {
    assert.equal(
      minimumSalaryIssue(2027, 8, 10),
      'Minimum salary: the 2027 season pays 8 in cash, but the league minimum is 10. ' +
        'Cash means salary (guaranteed or non-guaranteed) plus any bonus actually paid that ' +
        'season -- signing bonus in Year 1, or a roster or option bonus in the season it ' +
        'triggers. Prorated bonus and cap charge do not count.'
    );
  });

  test('the sentence prints cash unrounded', () => {
    assert.equal(minimumSalaryIssue(2026, 7.5, 9), shortfall(2026, 7.5, 9));
  });

  test('control: one cent short of the floor fails, with the exact sentence', () => {
    const fields = { contractYearNumber: 2, guaranteedSalary: 8.99 };
    assert.equal(meetsMinimumSalary({ seasonYear: 2026, ...fields }), false);
    assert.equal(
      reportFor(2026, fields),
      'Minimum salary: the 2026 season pays 8.99 in cash, but the league minimum is 9' +
        CASH_DEFINITION
    );
  });
});
