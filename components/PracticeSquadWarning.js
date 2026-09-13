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

export default function PracticeSquadWarning(props) {
  const status = props.status;
  if (!status || !status.warning) return null;

  const tone = status.eligibility_spent
    ? ' spent'
    : Number(status.weeks_used) >= 2
      ? ' urgent'
      : '';

  const used = Number(status.weeks_used);
  const max = Number(status.weeks_max);
  const countable = Number.isFinite(used) && Number.isFinite(max);

  return (
    <p className={'form-notice ps-warning' + tone + (props.className ? ' ' + props.className : '')}>
      <strong>Practice squad eligibility</strong>
      {countable ? ' — ' + used + ' of ' + max + ' weeks on an active roster used. ' : ' — '}
      {status.warning}
    </p>
  );
}
