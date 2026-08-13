// Applies the Contract Assistant's option bonus recommendations onto a
// year array. Shared by all three builders.
//
// WHY THIS FILE EXISTS. The same guard was written out three times --
// BidForm.js, ContractForm.js and DelegateForm.js each looped the
// recommendations with an identical (idx >= 1 && idx < totalYears && slot
// exists) test, and DelegateForm's comment said outright that it mirrored
// BidForm "condition for condition." Three copies of one rule is three
// chances to drift, and they had already drifted in one respect: only
// BidForm tracked what it skipped. The other two dropped a recommendation
// that failed the guard silently, so an owner could be handed a contract
// quietly worth less than the assistant intended.
//
// The guard itself: an option bonus is valid in Year 2 onward of a REAL
// season only. Year 1 is rejected by a database trigger independently, and
// a void year can never carry one.

/**
 * @param {Array<object>} years - the year objects to apply onto. Not
 *   mutated; a new array is returned.
 * @param {Array<{yearOffset:number, amount:number}>} recommendations
 *   - yearOffset is a 0-based index into years, so offset 1 is Year 2.
 * @param {number} totalYears - real seasons only
 * @param {number} startYear - used to label applied/skipped by season
 * @returns {{ years:Array<object>, applied:Array<{season:number, amount:number}>, skipped:Array<{season:number, amount:number}> }}
 */
export function applyOptionRecommendations(years, recommendations, totalYears, startYear) {
  const next = (years || []).map((y) => ({ ...y }));
  const recs = recommendations || [];
  const T = Number(totalYears) || 0;
  const base = Number(startYear) || 0;

  const applied = [];
  const skipped = [];

  recs.forEach((rec) => {
    const idx = Number(rec.yearOffset);
    const amount = Number(rec.amount) || 0;
    const season = base + idx;

    if (idx >= 1 && idx < T && next[idx]) {
      next[idx] = { ...next[idx], optionBonus: amount };
      applied.push({ season, amount });
    } else {
      skipped.push({ season, amount });
    }
  });

  return { years: next, applied, skipped };
}

/**
 * What a void row actually says, described by WHAT IT CARRIES rather than
 * by why it exists.
 *
 * Both builders used to key this off voidReason alone, so an owner-elected
 * void year always read "signing-bonus proration only" -- even when an
 * option bonus's five-season window overlapped it, which it usually does,
 * because an elected void year sits immediately after the real years and
 * options start in Year 2. On the Dak Prescott example the 2029 row
 * charged $71.60, of which $41.60 was option money the label denied.
 *
 * The automatic rows were always right, because 5.10(b) excludes them from
 * signing-bonus proration, so there was nothing else they could be
 * carrying.
 *
 * @param {{proratedSigningBonus:number, optionProration:number}} row
 * @returns {string}
 */
export function voidRowLabel(row) {
  const signing = Number(row && row.proratedSigningBonus) || 0;
  const option = Number(row && row.optionProration) || 0;

  if (signing > 0 && option > 0) {
    return (
      'Void year — no real salary. Holds signing-bonus proration AND option bonus proration ' +
      'from an option whose five-season window reaches this far (5.10(b), 5.20(d)).'
    );
  }
  if (option > 0) {
    return 'Automatic void year — holds option bonus proration only, added by the league (5.20(d)).';
  }
  return 'Void year — no real salary, signing-bonus proration only.';
}

/**
 * The sentence both builders show after applying. One wording, one place.
 * Returns null when there is nothing to say.
 */
export function optionBonusApplyNote(applied, skipped) {
  const notes = [];
  const app = applied || [];
  const skip = skipped || [];

  if (app.length > 0) {
    notes.push(
      app.length +
        ' option bonus' +
        (app.length === 1 ? '' : 'es') +
        ' applied (' +
        app.map((a) => a.season + ': ' + a.amount).join(', ') +
        '). Each prorates over five seasons from its own year — the automatic VOID rows below ' +
        'are the seasons holding that proration. Your target PPV is met WITH these applied; ' +
        'removing them drops the deal below your target.'
    );
  }

  if (skip.length > 0) {
    notes.push(
      skip.length +
        ' recommendation' +
        (skip.length === 1 ? '' : 's') +
        ' could NOT be applied (option bonuses are only valid in Year 2 onward of a real ' +
        'season): ' +
        skip.map((s) => s.season + ': ' + s.amount).join(', ') +
        '. The deal is worth less than your target by that amount.'
    );
  }

  return notes.length > 0 ? notes.join(' ') : null;
}
