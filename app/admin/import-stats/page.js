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
// TWO PANELS, TWO LISTS, ONE SOURCE (October 5, 2026). Import offers every
// completed league year plus the season in progress; Publish offers completed
// years only. Both lists come from importableSeasons() -- the same call the
// actions check against -- so the buttons and the gates cannot disagree. If
// the list cannot be read the page says so and draws no buttons, rather than
// guessing a year.
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
        <h1>Import NFL Stats</h1>
        <p className="form-error">
          The list of completed seasons could not be read: {allowed.message}
        </p>
      </div>
    )
  }

  const statuses = await loadSeasonStatuses(allowed.completed)

  return (
    <>
      <ImportForm seasons={allowed.seasons} currentSeason={allowed.currentSeason} />
      <PublishResultsPanel rows={statuses} />
    </>
  )
}
