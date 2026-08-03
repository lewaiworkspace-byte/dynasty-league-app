// Single source of truth for the league minimum salary floor (rule book
// 1.9): $9 in 2026, +5% per season, rounded up. Seasons before 2026 return
// the 2026 floor rather than deflating backwards.
//
// bidMath.js and contractAssistant.js both need this value, and neither
// should depend on the other -- bidMath.js's option-bonus math is
// deliberately separate from contractMath.js's, and contractAssistant.js
// feeds both the New Contract form and the Bid Assistant. This module
// exists so the constant lives in exactly one client-side place; the
// database has its own copy (`league_minimum_salary()`), which is the
// second and only other place it should ever need to change.

function ceilUp(n) {
  return Math.ceil(n - 1e-9);
}

export function leagueMinimumSalary(seasonYear) {
  const steps = Math.max((Number(seasonYear) || 0) - 2026, 0);
  return ceilUp(9 * Math.pow(1.05, steps));
}
