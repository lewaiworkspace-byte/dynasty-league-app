import { redirect } from 'next/navigation';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import OwnerActivityPanel from './OwnerActivityPanel';
import CoCommissionerPanel from './CoCommissionerPanel';

export const revalidate = 0;

export const metadata = { title: 'Owner Administration' };

// TWO GATES ON ONE PAGE, AND THE INNER ONE IS NARROWER (August 25, 2026).
//
// The page itself is commissioner OR co-commissioner: the activity report is
// operational information -- who has an account and who needs a nudge before a
// tier closes -- and commissioner_owner_activity() accepts both.
//
// The co-commissioner appointment control below is COMMISSIONER ONLY, because
// a co-commissioner who could appoint co-commissioners could appoint
// themselves peers, and the role would stop being the commissioner's to give.
// So it gets its own gate rather than riding on the page's. Do NOT collapse
// the two, and do not assume the page gate covers everything rendered here.
export default async function AdminOwnerActivityPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/owner-activity');
  // Widened to co-commissioners August 25, 2026.
  if (!isCommissionerOrCo(me)) redirect('/');

  // Nothing is read here on purpose. The panel loads on demand behind a
  // button so a page visit does not query the auth tables every time.
  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a></p>
      <p className="eyebrow">{me.is_commissioner ? 'Commissioner' : 'Co-Commissioner'}</p>
      <h1 className="team-name">Owner Administration</h1>

      <p className="empty-note">
        Who has an account, when they last signed in, and who may need a nudge
        before an auction tier closes.
      </p>

      <OwnerActivityPanel />

      {/*
        COMMISSIONER ONLY, and narrower than the page gate immediately above --
        a co-commissioner can reach this page but must not reach this control.
        Withholding the component is not the gate, only the tidy half of it: a
        Server Action is a callable endpoint whatever the page renders, so
        loadOwnerRoles() and setCoCommissioner() each re-check commissioner-only
        themselves and return a refusal. See actions.js.
      */}
      {me.is_commissioner && <CoCommissionerPanel />}
    </div>
  );
}
