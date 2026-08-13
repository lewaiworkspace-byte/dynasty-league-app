// Shared dead-cap preview arithmetic -- the ONE place in the client that
// computes "what would this cost if the player were cut."
//
// WHY THIS FILE EXISTS. Before it, lib/contractMath.js held the only JS
// dead-cap implementation and lib/bidMath.js had none at all, so the bid
// builder showed no dead cap and the contract builder showed one that
// disagreed with the database. Copying the loop into bidMath.js would
// have made two implementations of a number that has to be identical on
// both screens. It is one function now, called by both.
//
// WHAT IT MIRRORS. contract_year_computed.dead_cap_if_cut, exactly:
//
//   every season from N forward: prorated signing bonus + guaranteed salary
// + for each option bonus already triggered by N (exercise <= N, N included):
//     its remaining slices, from max(exercise, N) through
//     LEAST(exercise + 4, the contract's last season)
//
// and nothing else.
//
// THE ROSTER BONUS IS NOT IN IT, and that is a deliberate correction, not
// an omission. contractMath.js used to add a roster bonus whenever
// today >= September 2 of that row's season. The database view has no
// roster-bonus term in dead_cap_if_cut at all. The two agreed only by
// calendar accident: every rosterBonusConverted flag evaluates false while
// today is before September 2, 2026, so no contract on the books had ever
// shown the difference. On September 2, 2026 the 2026 rows would have
// flipped and the builder would have started disagreeing with the
// database for any contract carrying a 2026 roster bonus.
//
// The rule settles which one was right. This figure answers "cut before
// March 1," and March 1 precedes that season's September 2, so the roster
// bonus was never earned and is not dead money. The database was correct.
//
// Note the asymmetry that remains, deliberately: an option bonus
// exercising in season N IS counted at N, because exercise <= N includes
// N itself. Under a strict before-March-1 reading that option is never
// exercised and should contribute nothing. The database and this module
// agree with each other and may both be wrong on that point -- it is an
// open rule question, and the fix is a view migration shipped together
// with a change here, never one side alone. Do not "correct" this in
// isolation.
//
// THIS IS A PREVIEW, NOT THE SETTLEMENT ENGINE. compute_cut_charges() in
// the database is the authority for a real cut and is date-aware. This
// module exists for contracts and bids that have no database row yet.

// The only cut basis implemented. Reserved as a parameter from day one so
// the owner-selectable cut date can arrive as a UI addition rather than a
// signature change across four call sites -- the same discipline
// cut_player() used when it reserved p_salary_obligation_transfers and
// p_to_team_id before Trade existed.
export const CUT_BASIS_BEFORE_MARCH_1 = 'before_march_1';

function ceilUp(n) {
  return Math.ceil(n - 1e-9);
}

/**
 * Dead cap if cut, for every season of a contract or bid.
 *
 * @param {object} params
 * @param {Array<{proratedSigningBonus:number, guaranteedSalary:number}>} params.rows
 *   - one entry per season in order, real and void alike, exactly as the
 *     preview builds them. Index 0 is contract year 1.
 * @param {Array<{yearNumber:number, amount:number}>} params.options
 *   - real scheduled option bonuses; yearNumber is the 1-based contract
 *     year the bonus exercises in.
 * @param {string} [params.cutBasis] - only CUT_BASIS_BEFORE_MARCH_1 is
 *   implemented. Any other value throws rather than silently computing
 *   something the database would not agree with.
 * @returns {number[]} dead cap per season, same order as rows, each
 *   rounded up once at the end.
 */
export function computeDeadCapByRow({ rows, options, cutBasis = CUT_BASIS_BEFORE_MARCH_1 }) {
  if (cutBasis !== CUT_BASIS_BEFORE_MARCH_1) {
    throw new Error(
      'Unsupported cut basis: ' +
        cutBasis +
        '. Only ' +
        CUT_BASIS_BEFORE_MARCH_1 +
        ' is implemented. An owner-selectable cut date needs a matching change in ' +
        'contract_year_computed and compute_cut_charges() before this module may return a ' +
        'different number than the database.'
    );
  }

  const list = rows || [];
  const obs = options || [];
  const lastYearNumber = list.length;
  const out = [];

  for (let n = 0; n < list.length; n++) {
    const yearNumber = n + 1;
    let dead = 0;

    // Everything still owed from this season forward.
    for (let i = n; i < list.length; i++) {
      dead += (Number(list[i].proratedSigningBonus) || 0) + (Number(list[i].guaranteedSalary) || 0);
    }

    // Option bonuses already triggered. An untriggered one (exercise > N)
    // never happens and contributes nothing (5.20(c)).
    obs.forEach((ob) => {
      const exercise = Number(ob.yearNumber) || 0;
      if (exercise > yearNumber) return;
      const from = Math.max(exercise, yearNumber);
      const through = Math.min(exercise + 4, lastYearNumber);
      const slices = through - from + 1;
      if (slices > 0) dead += slices * ((Number(ob.amount) || 0) / 5);
    });

    out.push(ceilUp(dead));
  }

  return out;
}

/**
 * Plain-language note describing the basis, for display next to the
 * column. Kept here so both forms say the same thing and neither drifts.
 */
export function deadCapBasisNote() {
  return (
    'Dead Cap if Cut assumes the player is cut BEFORE March 1 of that season — ' +
    'the start of the league year, before any roster bonus converts. It is an estimate for ' +
    'planning; the actual charge on a real cut is settled by the league engine at the moment ' +
    'the cut is made.'
  );
}
