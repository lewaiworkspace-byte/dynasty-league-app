/**
 * THE COMPLIANCE PILL -- October 17, 2026 (UI test batch 1).
 *
 * Lewis, October 12: "Shrink this to 'In Compliance' (green) or 'Out of
 * Compliance' (red). The owner can then click on it and it will lead to a
 * page with roster audit." So: one small pill under the league title on every
 * page, for a linked owner only, that opens /roster-audit.
 *
 * It renders what AppBar read once through lib/complianceAlert.js (the same
 * result the alert strip beneath it renders), and decides nothing:
 *   at_risk false   "In compliance", green
 *   at_risk true    "Out of compliance", red
 *   read failed     "Compliance unknown", grey -- never a fabricated green
 *
 * @param {object|null} alert   my_compliance_alert()'s result
 * @param {boolean}     failed  the read failed
 */
export default function CompliancePill({ alert, failed }) {
  let cls = 'edfl-cpill';
  let text = 'In compliance';
  let title = 'In compliance. Open the roster audit.';
  if (failed) {
    cls += ' is-unknown';
    text = 'Compliance unknown';
    title = 'Your roster compliance could not be checked just now. Open the roster audit.';
  } else if (alert && alert.at_risk) {
    cls += ' is-bad';
    text = 'Out of compliance';
    title = 'Out of compliance. Open the roster audit to see what is wrong and how to fix it.';
  } else {
    cls += ' is-good';
  }

  // The row it sits in (.edfl-cpill-row) is AppBar's since UI test batch 5
  // (October 22, 2026): the windows pill shares it (components/WindowsPill.js).
  return (
    <a className={cls} href="/roster-audit" title={title}>
      <span className="edfl-cpill-dot" aria-hidden="true" />
      <span>{text}</span>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 5l5 5-5 5" />
      </svg>
    </a>
  );
}
