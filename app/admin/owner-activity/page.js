import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import OwnerActivityPanel from './OwnerActivityPanel';
import CoCommissionerPanel from './CoCommissionerPanel';

export const revalidate = 0;

export const metadata = { title: 'Owner Login Activity' };

export default async function AdminOwnerActivityPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/owner-activity');
  // STAYS COMMISSIONER-ONLY -- deliberately NOT isCommissionerOrCo. This page
  // both reads the auth tables (whose RPC gates on require_commissioner()) and
  // hosts the control that grants the co-commissioner role. See actions.js.
  if (!me.is_commissioner) redirect('/');

  // Nothing is read here on purpose. The panel loads on demand behind a
  // button so a page visit does not query the auth tables every time.
  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a></p>
      <p className="eyebrow">Commissioner</p>
      <h1 className="team-name">Owner Administration</h1>

      <p className="empty-note">
        Who has an account, when they last signed in, and who may need a nudge
        before an auction tier closes.
      </p>

      <OwnerActivityPanel />

      <CoCommissionerPanel />
    </div>
  );
}
