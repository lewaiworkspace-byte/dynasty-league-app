'use client';

// RULE 3.3(d)/(e) -- THE PRE-SIGNING PRACTICE SQUAD WARNING.
//
// Elevated players drop back to the practice squad automatically at Tuesday
// 00:00. An owner who fills a vacated slot on a Sunday can therefore be over
// the practice squad limit at Tuesday midnight through no visible fault of
// his own. This says so before he signs, not after.
//
// THIS IS A WARNING AND NEVER A BLOCK, and that is a rule, not a preference.
// 3.3(e): the automatic return is not an acquisition -- it restores a place
// the team already held -- so it is not limited by the practice squad
// maximum and it always completes. A team left over the limit by the return
// is out of compliance under 3.6 and has until the Thursday instant to cure
// it. Do not disable the submit button from this component, and do not add
// one that does.
//
// The three inputs are all database reads:
//   returning  rows from edfl_taxi_origin_actives(p_team_id)
//   psCount    team_inseason_compliance.ps_count
//   taxiMax    team_inseason_compliance.taxi_squad_size
// The only arithmetic here is addition and a subtraction against a limit the
// database supplied. No rule is re-implemented.

export default function TaxiReturnNotice(props) {
  const returning = props.returning || [];
  const n = returning.length;
  if (n === 0) return null;

  const psCount = Number(props.psCount);
  const taxiMax = Number(props.taxiMax);
  const known = Number.isFinite(psCount) && Number.isFinite(taxiMax);

  const after = known ? psCount + n + (props.addingPracticeSquad ? 1 : 0) : null;
  const over = known ? Math.max(after - taxiMax, 0) : 0;

  const names = returning
    .map(function (r) { return r.full_name; })
    .filter(Boolean);

  return (
    <p className={'form-notice ps-warning' + (over > 0 ? ' urgent' : '')}>
      <strong>
        {n === 1 ? '1 player returns' : n + ' players return'} to your practice squad Tuesday at 00:00.
      </strong>
      {names.length > 0 ? ' ' + names.join(', ') + '.' : ''}
      {known ? ' That takes you to ' + after + ' of ' + taxiMax + '.' : ''}
      {over > 0
        ? ' This signing puts you ' + over + (over === 1 ? ' over.' : ' over.')
        : ''}
      {' '}
      The return always completes &mdash; rule 3.3(e), it is not an acquisition and the practice
      squad maximum does not stop it. Being over is ordinary non-compliance under 3.6 and can be
      cured any time before the Thursday 00:00 instant.
    </p>
  );
}
