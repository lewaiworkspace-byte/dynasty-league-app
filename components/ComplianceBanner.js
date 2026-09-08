import { EASTERN_TIME_ZONE } from '../lib/formatDate';

/**
 * IN-SEASON COMPLIANCE BANNER — rule 3.6, and the rules it points at.
 *
 * WHAT THIS COMPONENT DOES NOT DO: decide anything. Every test, every
 * threshold and every sentence of every reason is composed by the
 * team_inseason_compliance view. This file chooses a colour and prints what
 * the database said.
 *
 * That is deliberate and it is the whole design. The reasons carry money
 * ("over the salary cap by $43.93"), and money is never formatted in
 * JavaScript on this project (SR-23) -- the view calls edfl_money_text(),
 * which mirrors formatExactMoney() exactly, so the team page and the Cap
 * Sheet cannot drift into saying two different things about the same team.
 * If a sentence reads wrong, fix the view, not this file.
 *
 * WHAT IT IS TESTING, so nobody has to go read the view to find out:
 *
 *   Cap      5.5(f)   cap_used (dead money included) vs the season ceiling
 *   Roster   3.1/3.2  active roster <= 25
 *   PS       3.3(a)   practice squad <= 7
 *   PS       3.3(b)   at most 3 of those not on rookie contracts
 *   IR       3.4(a)   injured reserve <= league_config.ir_slots
 *   Position 3.5      at most 3 QB and 3 K on the active roster
 *   Lineup   3.1      enough bodies to field 1 QB, 2 RB, 4 WR, 2 TE,
 *                     2 FLEX and 1 K
 *
 * BEING UNDER 25 IS NOT A FAILURE, by commissioner ruling of September 8
 * 2026. A short roster is out of compliance only when it cannot fill the
 * starting lineup above. Two teams sat at 20 and 17 when this shipped and
 * both are green. Do not "fix" that.
 *
 * THE BANNER SHOWS BEFORE THE DEADLINE, also by that ruling. In the run-up
 * to the In-Season boundary it reads as a warning naming the actual instant;
 * after the boundary it reads in the present tense. roster_enforcement_active
 * on the view row is what switches the wording -- never a date literal here.
 */

const EM_DASH = '—';

/**
 * "8:00 PM ET, Tuesday, September 8, 2026".
 *
 * lib/formatDate.js's formatDateTime() renders "Sep 8, 2026, 8:00 PM ET",
 * which is right for a log line and wrong for a deadline an owner has to act
 * on -- the commissioner asked for the weekday, because "Tuesday" is what
 * makes it land. The zone constant is imported rather than repeated so this
 * cannot drift from the rest of the app.
 */
function formatDeadline(ts) {
  if (ts === null || ts === undefined || ts === '') return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const time = d.toLocaleString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
  const day = d.toLocaleString('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return time + ' ET, ' + day;
}

// Styling rides the design system's own status tokens rather than new
// globals.css rules, so the banner is correct in light and dark on the day it
// ships and stays correct if the palette moves. --st-good-* and --st-bad-*
// are the same three-token sets .status-good and .status-bad already use.
function wrapStyle(compliant) {
  const key = compliant ? 'good' : 'bad';
  return {
    border: '1px solid var(--st-' + key + '-br)',
    background: 'var(--st-' + key + '-bg)',
    borderRadius: '4px',
    padding: '14px 16px',
    margin: '0 0 20px',
  };
}

function headStyle(compliant) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    color: 'var(--st-' + (compliant ? 'good' : 'bad') + '-fg)',
    fontWeight: 600,
    fontSize: '15px',
  };
}

const listStyle = {
  margin: '10px 0 0',
  paddingLeft: '20px',
  color: 'var(--text)',
  fontSize: '14px',
  lineHeight: 1.6,
};

const footStyle = {
  margin: '10px 0 0',
  fontSize: '12px',
  color: 'var(--text-dim)',
  lineHeight: 1.5,
};

/**
 * Full banner. Renders above the tabs on a team page, so it is visible on
 * Overview, Roster and Owner Info alike rather than only on the grid.
 *
 * @param {object|null} row   one row of team_inseason_compliance
 * @param {string|null} error message from a failed read, if any
 */
export default function ComplianceBanner({ row, error }) {
  // A FAILED READ SAYS SO. The team page already learned this the hard way:
  // a swallowed error let the Overview totals fall back to dead money alone
  // and look like a real answer. A compliance banner that quietly renders
  // green because the query failed would be the same defect with worse
  // consequences, so there is no green fallback anywhere in this file.
  if (error) {
    return (
      <div className="form-error">
        Compliance status could not be loaded: {error}. This page is not telling you whether
        this roster is legal {EM_DASH} check with the commissioner.
      </div>
    );
  }

  if (!row) {
    return (
      <div className="form-notice">
        No compliance row exists for this team in the current season, so compliance is not being
        reported here.
      </div>
    );
  }

  const compliant = Boolean(row.compliant);
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];
  const active = Boolean(row.roster_enforcement_active);
  const deadline = formatDeadline(row.roster_deadline_at);

  // A red banner with nothing under it would be worse than useless. The view
  // guarantees reasons is non-empty whenever compliant is false, but the page
  // should not fall over if that ever stops being true.
  const shown = reasons.length > 0 ? reasons : compliant ? [] : ['Reason not reported.'];

  return (
    <div style={wrapStyle(compliant)}>
      <div style={headStyle(compliant)}>
        <span className={'status ' + (compliant ? 'status-good' : 'status-bad')}>
          {compliant ? 'In Compliance' : 'Not In Compliance'}
        </span>
        <span>
          {compliant
            ? 'This roster meets the In-Season cap and roster rules.'
            : 'This roster does not meet the In-Season cap and roster rules.'}
        </span>
      </div>

      {!compliant && (
        <ul style={listStyle}>
          {shown.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <p style={footStyle}>
        {deadline === null ? (
          <>
            The In-Season boundary is not on the League Calendar for this season, so no deadline
            can be stated here. Rules 3.6(a) and 5.5(f).
          </>
        ) : active ? (
          <>
            In-Season rules have applied since {deadline} {EM_DASH} rules 3.6(a) and 5.5(f).
          </>
        ) : compliant ? (
          <>
            In-Season rules take effect at {deadline}. Rosters are measured at that moment under
            rule 3.6(a), and the cap hard block arms under 5.5(f). This is where you stand right
            now, not a guarantee about then.
          </>
        ) : (
          <>
            This has to be fixed by {deadline}, when rosters are measured under rule 3.6(a) and the
            cap hard block arms under 5.5(f). After that the commissioner brings a non-compliant
            roster into compliance by cutting most-recently-acquired players first.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Compact form for the league-wide Cap Sheet: the chip, and the reasons under
 * it. Same row, same sentences, no second opinion.
 */
export function ComplianceChip({ row }) {
  if (!row) return <span className="status status-off">Unknown</span>;

  const compliant = Boolean(row.compliant);
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];

  return (
    <div>
      <span className={'status ' + (compliant ? 'status-good' : 'status-bad')}>
        {compliant ? 'Compliant' : 'Not Compliant'}
      </span>
      {!compliant && reasons.length > 0 && (
        <div className="row-note bad">
          {reasons.map((r, i) => (
            <div key={i}>{r}</div>
          ))}
        </div>
      )}
    </div>
  );
}
