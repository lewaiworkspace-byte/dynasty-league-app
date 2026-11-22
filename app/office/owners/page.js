import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import Breadcrumbs from '../../../components/Breadcrumbs';
import OwnerInfoPanel from '../../../components/OwnerInfoPanel';

export const revalidate = 0;
export const metadata = { title: 'Owner directory' };

/**
 * THE OWNER DIRECTORY -- /office/owners. November 11, 2026 (UI test batch 7).
 *
 * Lewis, on the Team HQ design canvas, of the directory at the foot of Team
 * HQ's Overview: "drop this from the home page"; asked where it goes: "Owner
 * directory moves to the League Office, but adjusting the individual owner's
 * inputs is under Settings." So this page draws every owner's card READ-ONLY
 * (OwnerInfoPanel's editScope 'none': no Edit button on any card, one line
 * pointing to Settings), and /settings keeps the owner's own card and its
 * Edit button. Officer editing of another owner's card stays on
 * /admin/owner-activity. League Office's "Owner Contacts" tile opens it.
 *
 * READ WITH THE SESSION CLIENT. owner_directory() resolves the caller through
 * auth.uid() and makes every per-field masking decision itself (a field the
 * viewer may not see comes back null and is named in hidden_fields). Nothing
 * here decides who sees what. A failed read is passed to the panel, which says
 * so in red; it never renders as an empty directory.
 *
 * The gate is the same as League Office's: a linked owner or the read-only
 * observer (getCurrentViewer(), a page gate, never a write). The middleware
 * already refuses a visitor with no session.
 */
export default async function OwnerDirectoryPage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/office/owners');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('owner_directory');

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'League Office', href: '/office' }, { label: 'Owner directory' }]} />
      <p className="eyebrow">League Office</p>
      <h1>Owner directory</h1>
      <p className="subhead">How to reach every owner in the league.</p>
      <OwnerInfoPanel rows={data || []} loadError={error ? error.message : null} editScope="none" />
    </main>
  );
}
