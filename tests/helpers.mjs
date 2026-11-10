// Shared assertions for the test suite.
//
// Every assertion here carries its own message, and that message is built
// only from the label and the two numbers. A control test can then name the
// exact text it expects to see, independent of how a given Node version
// words its built-in AssertionError.

import assert from 'node:assert/strict';

// PPV is never rounded and cap/cash are summed from floats, so a computed
// figure can sit a few ulps off its hand-derived value. 1e-9 is far tighter
// than any figure the league reads (two decimals) and far looser than
// floating-point noise.
export const TOLERANCE = 1e-9;

function show(n) {
  return typeof n === 'number' ? n.toFixed(6) : String(n);
}

/** Fails unless actual is a number within TOLERANCE of expected. */
export function assertClose(actual, expected, label) {
  if (typeof actual !== 'number' || !(Math.abs(actual - expected) <= TOLERANCE)) {
    throw new assert.AssertionError({
      message: label + ': expected ' + show(expected) + ', got ' + show(actual),
      actual,
      expected,
      operator: 'assertClose',
    });
  }
}

/** assertClose over two arrays of the same length, element by element. */
export function assertAllClose(actual, expected, label) {
  assert.strictEqual(actual.length, expected.length, label + ': length');
  expected.forEach((e, i) => assertClose(actual[i], e, label + '[' + i + ']'));
}

/** Fails unless actual === expected, with a message built the same way. */
export function assertExact(actual, expected, label) {
  if (actual !== expected) {
    throw new assert.AssertionError({
      message: label + ': expected ' + show(expected) + ', got ' + show(actual),
      actual,
      expected,
      operator: 'assertExact',
    });
  }
}
