import { redirect } from 'next/navigation'
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner'
import ImportForm from './ImportForm'
import PublishResultsPanel from './PublishResultsPanel'
import { importableSeasons, loadSeasonStatuses } from './actions'

// Route segment config: allow up to 60s for the import Server Action
// (fetching and processing a full-season nflverse file takes a while)
export const maxDuration = 60
export const revalidate = 0

// WIDENED to the co-commissioner on September 16, 2026, implementing the
// ruling of September 8, 2026 that struck Technical Manual Appendix A.2(c).
// The page gate, both action gates and the home-page link widened together.
//
// TWO PANELS, ONE LIST OF SEASONS. The seasons that may be imported and the
// seasons that may be published are the same list -- every completed league
// year -- and both come from importableSeasons(), so the buttons and the
// actions' own checks cannot disagree. If the list cannot be read the page
// says so and draws no buttons, rather than guessing a year.
export default async function ImportStatsPage() {
  const me = await getCurrentTeamOwner()
  if (!me) redirect('/login?next=/admin/import-stats')
  if (!isCommissionerOrCo(me)) redirect('/')

  const allowed = await importableSeasons()
  if (!allowed.ok) {
    return (
      <div className="admin-form">
        <p className="subhead">
          <a href="/">&larr; Home</a>
        </p>
        <h1>Import Historical NFL Stats</h1>
        <p className="form-error">
          The list of completed seasons could not be read: {allowed.message}
        </p>
      </div>
    )
  }

  const statuses = await loadSeasonStatuses(allowed.seasons)

  return (
    <>
      <ImportForm seasons={allowed.seasons} />
      <PublishResultsPanel rows={statuses} />
    </>
  )
}
