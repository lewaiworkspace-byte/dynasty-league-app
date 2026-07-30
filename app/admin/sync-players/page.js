import { redirect } from 'next/navigation'
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner'
import SyncForm from './SyncForm'

// Server-component wrapper so the page can be commissioner-gated --
// getCurrentTeamOwner() is server-only and the form itself is a client
// component (useFormState), same split /admin/import-stats already uses.
export const revalidate = 0

export default async function SyncPlayersPage() {
  const me = await getCurrentTeamOwner()
  if (!me) redirect('/login?next=/admin/sync-players')
  if (!me.is_commissioner) redirect('/')

  return <SyncForm />
}
