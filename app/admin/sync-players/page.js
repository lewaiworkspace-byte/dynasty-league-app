import { redirect } from 'next/navigation'
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner'
import SyncForm from './SyncForm'

// Server-component wrapper so the page can be officer-gated --
// getCurrentTeamOwner() is server-only and the form itself is a client
// component (useFormState), same split /admin/import-stats already uses.
//
// WIDENED to the co-commissioner on September 16, 2026, implementing the
// ruling of September 8, 2026 that struck Technical Manual Appendix A.2(c).
// The page gate, the action gate and the home-page link widened together.
export const revalidate = 0

export default async function SyncPlayersPage() {
  const me = await getCurrentTeamOwner()
  if (!me) redirect('/login?next=/admin/sync-players')
  if (!isCommissionerOrCo(me)) redirect('/')

  return <SyncForm />
}
