import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { readComplianceAlert } from '../../lib/complianceAlert';
import Breadcrumbs from '../../components/Breadcrumbs';
import ComplianceAlert from '../../components/ComplianceAlert';
import { ComingSoon } from '../../components/HubTiles';

export const revalidate = 0;
export const metadata = { title: 'Roster audit' };

/**
 * THE ROSTER AUDIT -- October 17, 2026 (UI test batch 1).
 *
 * Lewis, October 12: the compliance pill "will lead to a page with roster
 * audit showing them when and how they went out of compliance, potential
 * risk of fines or players not being eligible, and ... a solution to get the
 * roster back into compliance that is calculated via Claude." He later ruled
 * (same day): at risk means the potential fines and which players are
 * ineligible (the 26th man on a 25-man active roster scores no points); no
 * bot; one calculated fix.
 *
 * WHAT IS HERE TODAY. Everything but the fix already exists: the database's
 * my_compliance_alert() composes what is wrong, which players are ineligible
 * and why, every fine at stake and every deadline (SR-70), and
 * components/ComplianceAlert.js renders it. This page renders the same strip
 * with its details OPEN, for the owner's own team only. The CALCULATED FIX is
 * a placeholder until Lewis rules which fines it lists and whether a fix may
 * include a cut (see the Oct 12 session notes); it is not invented here.
 *
 * OWN TEAM ONLY. my_compliance_alert() reads auth.uid(); a login with no
 * team, or the observer, is told so rather than shown an empty all-clear.
 */
export default async function RosterAuditPage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/roster-audit');

  const teamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  let compliance = { alert: null, failed: false };
  if (teamId) {
    const server = await createSupabaseServerClient();
    compliance = await readComplianceAlert(server);
  }

  const atRisk = Boolean(compliance.alert && compliance.alert.at_risk);

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Roster audit' }]} />
      <p className="eyebrow">Your team</p>
      <h1>Roster audit</h1>
      <p className="subhead">
        Whether your roster meets the In-Season cap and roster rules, what it would cost if it
        did not, and how to fix it.
      </p>

      {!teamId ? (
        <p className="form-notice">Your login is not linked to a team, so there is no roster to audit.</p>
      ) : compliance.failed ? (
        <ComplianceAlert alert={null} failed={true} />
      ) : atRisk ? (
        <>
          <h2 className="section-heading">What is wrong</h2>
          <ComplianceAlert alert={compliance.alert} failed={false} open={true} />
        </>
      ) : (
        <div className="form-notice edfl-audit-ok">
          <strong>In compliance.</strong> Nothing on your roster is at risk of a fine, and every player
          is eligible to score. The limits and the position counts are on your{' '}
          <a href={'/team/' + teamId}>Team HQ</a>.
        </div>
      )}

      {teamId ? (
        <>
          <h2 className="section-heading" style={{ marginTop: 24 }}>
            Recommended fix
          </h2>
          <ComingSoon title="A calculated way back into compliance.">
            When the roster is out, this will list the moves that get it back in, worked out from
            the same rules the fines are charged under. Until it is built, the &ldquo;To fix&rdquo;
            line on each problem above says what the rule requires.
          </ComingSoon>
        </>
      ) : null}
    </main>
  );
}
