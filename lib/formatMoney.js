/**
 * The one money formatter for the whole app.
 *
 * WHY THIS FILE EXISTS. Before it, eleven separate formatMoney definitions
 * lived in eleven files, in six mutually incompatible groups. They differed
 * on every axis that matters:
 *
 *   - Null: some returned an em dash, some "$0", one an empty string.
 *   - Negatives: three of them applied Math.abs and SILENTLY DROPPED THE
 *     MINUS SIGN, rendering -50 as "$50".
 *   - Rounding: four rounded, one capped at two decimals, six printed
 *     whatever toLocaleString gave -- which for a raw Postgres numeric is
 *     "$426.333333".
 *   - Locale: six pinned 'en-US', four inherited the server or browser
 *     locale, so a European viewer saw "426,333" on one page and "426.333"
 *     on the next.
 *
 * The cost was concrete. Commit 56db266 fixed the $426.333 problem on
 * /cap-sheet only, because that was one copy of eleven. The identical defect
 * survived on /team/[teamId], where the same raw cap_charge values render --
 * and reappeared in the "of which dead money" row added in 769a772.
 *
 * THE RULE, set by commissioner decision August 22 2026:
 *
 *   Track money exactly. Display it in whole dollars.
 *
 * Every figure is rounded independently for display. A column of rounded
 * rows will therefore sometimes miss its rounded total by a dollar or two.
 * That is accepted and is how real cap sheets read. The rejected
 * alternative -- deriving totals by summing the rounded rows so they always
 * tie out -- would make the page's total disagree with team_cap_summary,
 * which is exactly the defect 769a772 was written to fix.
 *
 * ROUNDING IS STANDARD (half away from zero), NOT rule 1.9's round-up.
 * Rule 1.9 governs what the league CHARGES -- a contract's real obligation,
 * computed and stored by the database. This function displays a number that
 * has already been through that rule. Rounding up again here would apply
 * 1.9 twice and print figures above what anyone owes.
 *
 * THIS IS DISPLAY ONLY. It presumes nothing about the open
 * option-proration rounding question, which is about what the engine
 * charges (bonus_amount / 5.0 exactly) and has to be settled across
 * contract_year_computed, compute_cut_charges(), both client preview
 * modules and the 30% Rule together. Changing this file cannot affect any
 * of that.
 */

/**
 * Format a money value as whole dollars.
 *
 * @param {number|string|null|undefined} n
 * @returns {string} e.g. "$1,672", "-$4", "$0", or an em dash for no value
 */
export function formatMoney(n) {
  // No value is not the same as zero. A team with no cash budget row and a
  // team with a zero balance are different facts, and the em dash says so.
  if (n === null || n === undefined || n === '') return '\u2014';

  const num = Number(n);
  if (!Number.isFinite(num)) return '\u2014';

  // Round the magnitude, then reattach the sign. Math.round() alone breaks
  // symmetry on negatives -- it rounds toward positive infinity, so -0.5
  // becomes -0 while 0.5 becomes 1. Rounding the absolute value gives
  // half-away-from-zero in both directions, which is what a reader expects
  // of a dollar figure.
  const rounded = Math.round(Math.abs(num));

  // A small negative that rounds to zero must not print "-$0".
  const sign = num < 0 && rounded !== 0 ? '-' : '';

  // Locale pinned. An unpinned toLocaleString() resolves to the server
  // locale in a Server Component and the browser locale in a client one, so
  // the same number could render with different separators on adjacent
  // pages of the same app.
  return sign + '$' + rounded.toLocaleString('en-US');
}

/**
 * Signed variant for deltas, where a leading "+" carries meaning.
 * Same rounding and locale rules.
 *
 * @param {number|string|null|undefined} n
 * @returns {string} e.g. "+$120", "-$4", "$0"
 */
export function formatMoneyDelta(n) {
  if (n === null || n === undefined || n === '') return '\u2014';

  const num = Number(n);
  if (!Number.isFinite(num)) return '\u2014';

  const rounded = Math.round(Math.abs(num));
  if (rounded === 0) return '$0';

  return (num < 0 ? '-$' : '+$') + rounded.toLocaleString('en-US');
}

export default formatMoney;
