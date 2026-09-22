'use client';

// RULE 3.3(i) -- THE THREE-WEEK PRACTICE SQUAD WARNING.
//
// NOTHING IN THIS FILE DECIDES ANYTHING, and nothing in it composes a
// sentence. The warning text is taxi_eligibility_status.warning, rendered
// verbatim, for the same reason ComplianceBanner prints the view's reasons
// verbatim: the rule moved once already (the count is keyed on player_id
// rather than contract_id so a trade cannot hand a player a fresh three
// weeks) and the wording will move again. Fix the view, not this file.
//
// The view returns NULL in `warning` whenever there is nothing to say, which
// is the render condition -- not weeks_used, not contract_type. A contract
// that is neither rookie nor practice_squad gets NULL, EXCEPT where the
// player has already spent his eligibility: that branch is evaluated first
// and is keyed on the player, so a man who burned his three weeks and now
// holds a veteran contract still carries the sentence. That is correct. The
// limit follows the player, not the paper.
//
// Tone is the only judgement made here, and it is cosmetic.
//
// SINCE SEPTEMBER 15, 2026 THREE WEEKS DO NOT END ELIGIBILITY. They buy one
// last demotion; the player is LOCKED onto the active roster on his fourth
// promotion or fourth counted week. The view's `locked` column is that state
// (`eligibility_spent` is its older name, kept by the view for readers like
// this one), and `last_demotion_available` is the three-week state where the
// owner still has a choice -- the urgent tone belongs there, not at two weeks.
//
// SEPTEMBER 21, 2026: the view also composes `hold_note` (rule 3.3(d)(i)) when
// the owner is holding the player on the active roster through the Tuesday
// return. It is a second sentence under the same heading, rendered verbatim
// like `warning`, and it is a render condition on its own: a held player with
// no weeks counted yet has a hold_note and no warning, and the owner should
// still see why the Tuesday return did not move him.

function isLocked(status) {
  if (status.locked !== undefined && status.locked !== null) return Boolean(status.locked);
  return Boolean(status.eligibility_spent);
}

function lastDemotion(status) {
  if (isLocked(status)) return false;
  if (status.last_demotion_available !== undefined && status.last_demotion_available !== null) {
    return Boolean(status.last_demotion_available);
  }
  return Number(status.weeks_used) >= 3;
}

export default function PracticeSquadWarning(props) {
  const status = props.status;
  if (!status || (!status.warning && !status.hold_note)) return null;

  const tone = isLocked(status) ? ' spent' : lastDemotion(status) ? ' urgent' : '';

  const used = Number(status.weeks_used);
  const max = Number(status.weeks_max);
  const countable = Number.isFinite(used) && Number.isFinite(max);

  return (
    <p className={'form-notice ps-warning' + tone + (props.className ? ' ' + props.className : '')}>
      <strong>Practice squad eligibility</strong>
      {countable ? ' — ' + used + ' of ' + max + ' weeks on an active roster used. ' : ' — '}
      {status.warning}
      {status.hold_note && (
        <>
          {status.warning ? ' ' : ''}
          {status.hold_note}
        </>
      )}
    </p>
  );
}
