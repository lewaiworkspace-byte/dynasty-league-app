import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import OwnerActivityPanel from './OwnerActivityPanel';

export const revalidate = 0;

export const metadata = { title: 'Owner Login Activity' };

export default async function AdminOwnerActivityPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/owner-activity');
  if (!me.is_commissioner) redirect('/');

  // Nothing is read here on purpose. The panel loads on demand behind a
  // button so a page visit does not query the auth tables every time.
  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a></p>
      <p className="eyebrow">Commissioner</p>
      <h1 className="team-name">Owner Login Activity</h1>

      <p className="empty-note">
        Who has an account, when they last signed in, and who may need a nudge
        before an auction tier closes.
      </p>

      <OwnerActivityPanel />
    </div>
  );
}
