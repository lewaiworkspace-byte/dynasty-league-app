import ComplianceCountdown from './ComplianceCountdown';

/**
 * COMPLIANCE ALERT -- the app-wide "you are about to be fined" strip.
 * October 1, 2026.
 *
 * Rendered by components/AppBar.js directly under the bar, on every page, for
 * a signed-in owner whose login is linked to a team. Nobody else ever sees
 * another team's alert: my_compliance_alert() reads auth.uid() and returns the
 * caller's own team only (the league-wide view is the Cap Sheet's Status
 * column, which predates this).
 *
 * WHAT THIS COMPONENT DOES NOT DO: decide anything. What is wrong, how to fix
 * it, the deadline and every dollar figure are composed in the database by
 * team_compliance_alert(), which reads the same view the Thursday sweep reads
 * and the same 6.7 fine predicate the cure check calls (SR-70). Money arrives
 * as text from edfl_money_text() and is printed verbatim (SR-23); deadlines
 * arrive as Eastern labels from edfl_et_label(). If a sentence reads wrong,
 * fix the function, not this file. The emails and Discord messages are built
 * from the same function, so the strip and the messages cannot disagree.
 *
 * WHEN IT SHOWS: only when at_risk is true -- the roster is out of compliance
 * now, or a measured violation is still inside its 20:00 cure window. A team
 * in compliance draws nothing at all; this strip is an alarm, not a status
 * badge. A FAILED READ SAYS SO, in a quiet line, because "you are fine" and
 * "we could not check" are different facts.
 *
 * The countdown is the only client piece (ComplianceCountdown). It ticks from
 * the deadline's ISO instant; it never formats a date.
 *
 * @param {object} server  the session Supabase client AppBar already holds
 */
export default async function ComplianceAlert({ server }) {
  let alert = null;
  let failed = false;
  try {
    const { data, error } = await server.rpc('my_compliance_alert');
    if (error) {
      console.error('my_compliance_alert failed:', error);
      failed = true;
    } else {
      alert = data;
    }
  } catch (e) {
    console.error('my_compliance_alert threw:', e);
    failed = true;
  }

  if (failed) {
    return (
      <div className="ntf-strip ntf-strip-unknown" role="status">
        Could not check your roster compliance just now. Open Team HQ to see it.
      </div>
    );
  }
  if (!alert || !alert.at_risk) return null;

  const items = Array.isArray(alert.items) ? alert.items : [];
  const live = items.filter(function (i) {
    return i.state !== 'fixed_pending';
  });
  const fixed = items.filter(function (i) {
    return i.state === 'fixed_pending';
  });
  const measured = live.some(function (i) {
    return i.state === 'measured';
  });

  return (
    <div className="ntf-strip ntf-strip-bad" role="alert">
      <div className="ntf-strip-row">
        <span className="ntf-strip-icon" aria-hidden="true">
          !
        </span>
        <div className="ntf-strip-main">
          <div className="ntf-strip-title">
            {measured
              ? alert.team_name + ' failed the weekly compliance check. You can still cut the fine.'
              : alert.team_name + ' is out of compliance and at risk of a fine.'}
          </div>
          <div className="ntf-strip-sub">
            {alert.soonest_deadline_at ? (
              <>
                Fix by <strong>{alert.soonest_deadline_label}</strong>
                <ComplianceCountdown deadline={alert.soonest_deadline_at} />
                {' · '}
              </>
            ) : null}
            At stake: <strong>{alert.total_if_missed_text}</strong>
          </div>
        </div>
        <a className="btn ntf-strip-fix" href={alert.team_path}>
          Fix it
        </a>
      </div>

      <details className="ntf-strip-details">
        <summary>
          What is wrong and how to fix it ({live.length} {live.length === 1 ? 'problem' : 'problems'})
        </summary>
        <ul className="ntf-items">
          {live.map(function (i) {
            return (
              <li className="ntf-item" key={i.key}>
                {(i.reasons || []).map(function (r, n) {
                  return (
                    <div className="ntf-item-reason" key={n}>
                      {r}
                    </div>
                  );
                })}
                {i.fix ? (
                  <div className="ntf-item-fix">
                    <span className="ntf-k">To fix</span> {i.fix}
                  </div>
                ) : null}
                <div className="ntf-item-money">
                  {i.state === 'measured' ? (
                    <>
                      <span className="ntf-k">Deadline</span> {i.deadline_label}. Still out then:{' '}
                      <strong>{i.fine_if_missed_text}</strong>. Fixed by you before then:{' '}
                      <strong>{i.fine_if_fixed_text}</strong> (Rule Book 6.7(b)).
                    </>
                  ) : i.deadline_label ? (
                    <>
                      <span className="ntf-k">Deadline</span> {i.deadline_label}. Fixed before then:{' '}
                      <strong>{i.fine_if_fixed_text}</strong>. Still out then:{' '}
                      <strong>{i.fine_if_missed_text}</strong>, cut to {i.late_cure_fine_text} if you then fix
                      it yourself by {i.late_cure_deadline_label}.
                    </>
                  ) : (
                    <>No compliance check is scheduled. Fix it anyway.</>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {fixed.length > 0 ? (
          <p className="ntf-strip-note">
            Already fixed this week, so {fixed.length === 1 ? 'that violation is' : 'those violations are'}{' '}
            {fixed[0].fine_if_fixed_text} each instead of the full fine.
          </p>
        ) : null}
        <p className="ntf-strip-note">
          Fines are imposed the following Tuesday at 4:00 PM ET and come out of Owner Cash (Rule Book
          6.7). <a href="/notifications">Choose how else you are warned</a>.
        </p>
      </details>
    </div>
  );
}
