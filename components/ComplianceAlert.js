import ComplianceCountdown from './ComplianceCountdown';

/**
 * COMPLIANCE ALERT -- the app-wide "you are about to be fined" strip.
 * October 1, 2026; re-cut October 4, 2026 for the Week 5 fine schedule.
 *
 * Rendered by components/AppBar.js directly under the bar, on every page, for
 * a signed-in owner whose login is linked to a team. Nobody else ever sees
 * another team's alert: my_compliance_alert() reads auth.uid() and returns the
 * caller's own team only.
 *
 * WHAT THIS COMPONENT DOES NOT DO: decide anything. The weekly roster fine,
 * the per-violation $25 fines, which players are over a limit, when each
 * deadline falls and every dollar figure are composed in the database by
 * team_compliance_alert(), from the same predicates the fine engine
 * (compliance_v2_due) charges with (SR-70). Money arrives as text and is
 * printed verbatim (SR-23); deadlines arrive as Eastern labels. If a sentence
 * reads wrong, fix the function, not this file. The emails, DMs and Robo
 * Goodell's callouts are built from the same function.
 *
 * THE SHAPE (October 4, 2026):
 *   roster_fine  null, or { state: 'upcoming'|'curable', week, deadline_label,
 *                full_text, cured_text, cure_label, ordinal }
 *   items[]      { key, label, reasons[], fix, deadline_label, fine_text,
 *                note, players[], grace_label, next_checkpoint_label } --
 *                players carry kickoff_label and ineligible (over a limit) or
 *                due_label (IR clock). Since October 9 2026 (F2-10 to F2-12)
 *                deadline_label is the next moment a $25 checkpoint charge
 *                attaches or becomes final, and the note says when it is
 *                cancelled; both are the database's sentences.
 *   ineligible[] players scoring 0 this week; assessed[] fines not yet taken
 *
 * WHEN IT SHOWS: only when at_risk is true. A team in compliance draws nothing.
 * A FAILED READ SAYS SO, in a quiet line, because "you are fine" and "we could
 * not check" are different facts.
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
  const rf = alert.roster_fine || null;
  const ineligible = Array.isArray(alert.ineligible) ? alert.ineligible : [];
  const assessed = Array.isArray(alert.assessed) ? alert.assessed : [];
  const curable = rf && rf.state === 'curable';

  return (
    <div className="ntf-strip ntf-strip-bad" role="alert">
      <div className="ntf-strip-row">
        <span className="ntf-strip-icon" aria-hidden="true">
          !
        </span>
        <div className="ntf-strip-main">
          <div className="ntf-strip-title">
            {curable
              ? alert.team_name +
                ' failed the Week ' +
                rf.week +
                ' compliance check. Fix it before the first game for ' +
                rf.cured_text +
                ' instead of ' +
                rf.full_text +
                '.'
              : alert.team_name + ' is out of compliance and at risk of a fine.'}
          </div>
          <div className="ntf-strip-sub">
            {alert.soonest_deadline_at ? (
              <>
                Next deadline <strong>{alert.soonest_deadline_label}</strong>
                <ComplianceCountdown deadline={alert.soonest_deadline_at} />
                {' · '}
              </>
            ) : null}
            Up to <strong>{alert.total_if_missed_text}</strong> at stake
          </div>
        </div>
        <a className="btn ntf-strip-fix" href={alert.team_path}>
          Fix it
        </a>
      </div>

      <details className="ntf-strip-details">
        <summary>
          What is wrong and how to fix it ({items.length} {items.length === 1 ? 'problem' : 'problems'})
        </summary>

        {rf ? (
          <p className="ntf-roster">
            <span className="ntf-k">Weekly roster fine</span>{' '}
            {curable ? (
              <>
                Fix everything before the first game kicks off, <strong>{rf.deadline_label}</strong>:{' '}
                <strong>{rf.cured_text}</strong> instead of <strong>{rf.full_text}</strong>.
              </>
            ) : (
              <>
                Still out at the Week {rf.week} deadline, <strong>{rf.deadline_label}</strong>:{' '}
                <strong>{rf.full_text}</strong>, cut to <strong>{rf.cured_text}</strong> if you then fix it
                before the first game kicks off ({rf.cure_label}).
              </>
            )}{' '}
            Roster fine No. {rf.ordinal} this season.
          </p>
        ) : null}

        <ul className="ntf-items">
          {items.map(function (i) {
            const players = Array.isArray(i.players) ? i.players : [];
            return (
              <li className="ntf-item" key={i.key}>
                <div className="ntf-item-label">{i.label}</div>
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
                {i.deadline_label ? (
                  <div className="ntf-item-money">
                    <span className="ntf-k">Next $25 deadline</span> {i.deadline_label}:{' '}
                    <strong>{i.fine_text}</strong> if still out.
                  </div>
                ) : null}
                {players.length > 0 ? (
                  <ul className="ntf-players">
                    {players.map(function (p, n) {
                      return (
                        <li key={n}>
                          <strong>{p.name}</strong>
                          {p.nfl_team ? ' (' + p.nfl_team + ')' : ''}
                          {i.key === 'ir_undesignated'
                            ? p.due_label
                              ? ' -- $25 at ' + p.due_label + ' unless he is moved or designated.'
                              : ''
                            : p.ineligible
                              ? ' -- scores 0 this week.'
                              : p.kickoff_label
                                ? ' -- scores 0 if you are still over at his kickoff, ' + p.kickoff_label + '.'
                                : ''}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {i.note ? <div className="ntf-item-note">{i.note}</div> : null}
              </li>
            );
          })}
        </ul>

        {ineligible.length > 0 ? (
          <p className="ntf-strip-note">
            <span className="ntf-k">Scoring 0 this week</span>{' '}
            {ineligible
              .map(function (p) {
                return p.name + ' (' + p.label + ')';
              })
              .join('; ')}
          </p>
        ) : null}
        {assessed.length > 0 ? (
          <p className="ntf-strip-note">
            <span className="ntf-k">Already assessed</span>{' '}
            {assessed
              .map(function (a) {
                return a.label + ' ' + a.fine_text + ', collected ' + a.impose_label;
              })
              .join('; ')}
          </p>
        ) : null}
        <p className="ntf-strip-note">
          Fines are collected the following Tuesday at 4:00 PM ET from Owner Cash (Rule Book 6.7).{' '}
          <a href="/settings#notifications">Choose how else you are warned</a>.
        </p>
      </details>
    </div>
  );
}
