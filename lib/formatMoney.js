/**
 * The money formatters for the whole app.
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
 * ---------------------------------------------------------------------------
 * ROUNDING DIRECTION -- commissioner ruling R-12, September 17 2026 (ET), which
 * adopts R-2 exactly as it was written.
 * THIS SUPERSEDES THE AUGUST 22 NOTE THAT USED TO SIT HERE.
 *
 *   Displayed money never flatters. A cost rounds UP. Room rounds DOWN.
 *
 * The August 22 note argued for plain half-away-from-zero on the grounds that
 * rule 1.9 governs what the league CHARGES, that the database has already
 * applied it, and that rounding up again here would apply 1.9 twice and print
 * figures above what anyone owes. That reasoning is about rule 1.9. R-12 is a
 * different rule about a different thing: not what is owed, but which way a
 * DISPLAY may err. It may not err in the reader's favour.
 *
 * The overstatement the old note worried about is real and it is at most 99
 * cents on a figure the database still holds exactly. The thing it was
 * protecting against -- a reader believing they owe more than they do -- is
 * strictly safer than the alternative, which is a reader believing they have
 * room they do not have and getting refused at the write.
 *
 * TWO CONSEQUENCES WORTH KNOWING, because they are the reason this is better
 * and not merely different:
 *
 *   1. USED AND ROOM STOP CONTRADICTING THE CEILING. ceil(used) + floor(room)
 *      can never exceed the cap, for any fractional value. Half-away could and
 *      did: 1,477.31 used and 22.69 room both round to 1,477 and 23, which sum
 *      to 1,500 by luck and would not have at other values.
 *   2. IT FIXES THE SR-22 FAILURE MODE FOR ROOM. A team at 1,500.33 against a
 *      1,500 cap has room of -0.33. Half-away printed "$0" -- exactly at the
 *      cap. floor(-0.33) is -1, so it prints "-$1" and the reader sees an
 *      overage. That is the failure SR-22 exists to describe.
 *
 * WHICH FUNCTION TO CALL. The direction is not a flag, because a flag gets
 * copied from the line above it. Each call site names what the figure IS:
 *
 *   formatCost   a charge, a salary, dead money, cash spent, a bid, a fine.
 *                Anything the league takes. Math.ceil on the signed value, so
 *                a charge never reads low and a credit never reads high.
 *   formatRoom   cap space, cash available, room under the spend floor.
 *                Anything the owner may still spend. Math.floor on the signed
 *                value, so room never reads high and an OVERAGE never reads
 *                small.
 *   formatMoney  neither -- a ledger figure that is a fact rather than a
 *                budget. A contract's total value, career earnings, a closed
 *                season's number. Half away from zero, unchanged.
 *
 * Both directional functions are Math.ceil / Math.floor on the SIGNED number,
 * not on the magnitude. That is what makes "never flatter" fall out in all
 * four quadrants rather than only for positives.
 *
 * MIGRATION. The existing call sites still use formatMoney and are correct
 * until moved deliberately -- a sweep of all of them is its own batch, because
 * each one has to be read to decide which of the three it is. Do not bulk
 * rename.
 *
 * THIS IS DISPLAY ONLY. It presumes nothing about the open option-proration
 * rounding question, which is about what the engine charges (bonus_amount /
 * 5.0 exactly) and has to be settled across contract_year_computed,
 * compute_cut_charges(), both client preview modules and the 30% Rule
 * together. Changing this file cannot affect any of that.
 */

/**
 * Turn any input into a finite number, or null when there is no value.
 * No value is not the same as zero: a team with no cash budget row and a team
 * with a zero balance are different facts, and the em dash says so.
 */
function toNumber(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  return num;
}

/**
 * Render an already-rounded integer with the sign and the pinned locale.
 *
 * Locale pinned. An unpinned toLocaleString() resolves to the server locale in
 * a Server Component and the browser locale in a client one, so the same
 * number could render with different separators on adjacent pages.
 *
 * A small negative that rounded to zero must not print "-$0".
 */
function render(rounded) {
  const abs = Math.abs(rounded);
  const sign = rounded < 0 && abs !== 0 ? '-' : '';
  return sign + '$' + abs.toLocaleString('en-US');
}

/**
 * Format a LEDGER money value as whole dollars, half away from zero.
 *
 * Use this only where the figure is neither a cost nor room -- a contract's
 * total value, career earnings, a settled season. For anything an owner is
 * charged use formatCost; for anything they may spend use formatRoom.
 *
 * @param {number|string|null|undefined} n
 * @returns {string} e.g. "$1,672", "-$4", "$0", or an em dash for no value
 */
export function formatMoney(n) {
  const num = toNumber(n);
  if (num === null) return '—';

  // Round the magnitude, then reattach the sign. Math.round() alone breaks
  // symmetry on negatives -- it rounds toward positive infinity, so -0.5
  // becomes -0 while 0.5 becomes 1. Rounding the absolute value gives
  // half-away-from-zero in both directions.
  const rounded = Math.round(Math.abs(num)) * (num < 0 ? -1 : 1);
  return render(rounded);
}

/**
 * Format a COST -- anything the league takes from an owner. Rounds UP.
 *
 * R-12: a displayed charge never reads lower than the real one. Math.ceil on
 * the signed value, so $4.20 charged prints "$5" and a $4.20 credit prints
 * "-$4" rather than "-$5" -- the conservative direction in both cases.
 *
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatCost(n) {
  const num = toNumber(n);
  if (num === null) return '—';
  return render(Math.ceil(num));
}

/**
 * Format ROOM -- anything an owner may still spend. Rounds DOWN.
 *
 * R-12: displayed room never reads higher than the real room, and an overage
 * never reads smaller than it is. Math.floor on the signed value, so $22.69
 * of space prints "$22" and being $0.33 over prints "-$1".
 *
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatRoom(n) {
  const num = toNumber(n);
  if (num === null) return '—';
  return render(Math.floor(num));
}

/**
 * Signed variant for deltas, where a leading "+" carries meaning.
 *
 * Deliberately NOT directional. A delta is a change that has already
 * happened, not a budget -- there is no direction that flatters. Half away
 * from zero, unchanged.
 *
 * @param {number|string|null|undefined} n
 * @returns {string} e.g. "+$120", "-$4", "$0"
 */
export function formatMoneyDelta(n) {
  const num = toNumber(n);
  if (num === null) return '—';

  const rounded = Math.round(Math.abs(num));
  if (rounded === 0) return '$0';

  return (num < 0 ? '-$' : '+$') + rounded.toLocaleString('en-US');
}

export default formatMoney;

/**
 * Money rendered EXACTLY as it arrived — no rounding, ever.
 *
 * WHY A SECOND FORMATTER EXISTS, when this file's whole purpose was to end up
 * with one. formatMoney() above rounds to whole dollars by the August 22
 * ruling, which is right for a cap sheet reading values that legitimately
 * carry cents. It is WRONG for a surface where the database guarantees whole
 * dollars, because there a fraction is a DEFECT and rounding hides it: the
 * reader sees "$1,500 of $1,500" while the database refuses them at 1500.33.
 * That exact failure is already recorded against the trade impact cards.
 *
 * R-12 DID NOT CHANGE THIS FUNCTION and must not. Exact is exact; there is no
 * direction to err in. Where a screen shows a figure that must agree digit for
 * digit with another screen or with a database refusal, it uses this one.
 *
 * So: whole numbers render clean ("$1,500"), and anything carrying a fraction
 * renders with cents ("$1,500.33") so it stays visible. Nothing is rounded in
 * either direction.
 *
 * A FRACTION IS NOT AUTOMATICALLY A BUG, and an earlier version of this note
 * said it was -- which would have sent someone hunting a defect that is not
 * there. The distinction on a restructure screen:
 *
 *   INHERITED -- cap_before, cap_after, dead_cap_before, dead_cap_after,
 *   team_cap_before/after. May legitimately be fractional: 156 contract-year
 *   rows across 48 active contracts carry signing-bonus proration from before
 *   the whole-dollar rule. Jonathan Taylor renders $296.33 and nothing is
 *   wrong. That is rule 1.9, still open.
 *
 *   GENERATED -- cap_change, per_season_charge, final_season_charge,
 *   void_acceleration_amount, team_impact.change. Always whole. A fraction
 *   HERE is a defect worth reporting.
 *
 * The response carries has_inherited_fractional_proration so a screen can say
 * which it is looking at rather than guessing.
 *
 * WHERE IT IS USED, and why the list is short. The restructure surfaces, and
 * as of September 4 2026 the team Overview grid in
 * app/team/[teamId]/TeamCapSheet.js. The team page joined the list because its
 * Overview totals now come straight from team_cap_by_season, and rounding them
 * would put the grid out of step with a real overage at the ceiling: Cash Over
 * Cap's 2026 cap hit is 1,461.666... against a 1,500 cap, and a team genuinely
 * over by cents must not read as exactly at it.
 *
 * A THIRD consumer joined on September 4 2026:
 * app/fifth-year-option/FifthYearOptionBoard.js. An option value out of
 * edfl_tag_values is whole by construction, so a fraction on one is a defect
 * and rounding would hide it -- the same argument as the restructure form.
 * The row's CURRENT cap charge sitting beside it comes from
 * contract_year_computed and may legitimately be fractional on one of the 48
 * contracts carrying pre-rule-1.9 proration, and it must agree exactly with
 * the team Overview grid showing the same number.
 *
 * That is the whole of the list: the restructure surfaces, the team Overview
 * grid, and the option board. Do not adopt it elsewhere to "fix" a fractional
 * figure -- those values are real, and formatCost / formatRoom are correct for
 * them. /cap-sheet deliberately still rounds, so the two pages show the same
 * underlying numbers at different precision. That difference is known and
 * accepted; do not reconcile it without a ruling.
 *
 * @param {number|string|null|undefined} n
 * @returns {string} "$1,500", "$1,500.33", "-$22", or an em dash for no value
 */
export function formatExactMoney(n) {
  const num = toNumber(n);
  if (num === null) return '—';

  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const hasFraction = abs !== Math.trunc(abs);

  if (!hasFraction) {
    return sign + '$' + abs.toLocaleString('en-US');
  }

  // Two places is enough to make cents visible; the point is that the reader
  // can SEE there is a fraction, not that every digit of a repeating decimal
  // reaches the screen.
  return (
    sign +
    '$' +
    abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
