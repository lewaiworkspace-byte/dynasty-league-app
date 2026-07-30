import { redirect } from 'next/navigation'
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner'
import ImportForm from './ImportForm'

// Route segment config: allow up to 60s for the import Server Action
// (fetching and processing a full-season nflverse file takes a while)
export const maxDuration = 60
export const revalidate = 0

export default async function ImportStatsPage() {
  const me = await getCurrentTeamOwner()
  if (!me) redirect('/login?next=/admin/import-stats')
  if (!me.is_commissioner) redirect('/')

  return <ImportForm />
}
