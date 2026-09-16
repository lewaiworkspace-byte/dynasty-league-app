'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { publishSeasonResults } from './actions'

// PUBLISH SEASON RESULTS (September 16, 2026).
//
// Publishing settles a season's EDFL record -- the Pro Bowl selections and the
// positional ranks the Fifth Year Option tiers are read from. It happens once a
// year, after the season is over and its stats are imported. NOTHING HERE
// DECIDES ANYTHING: publish_edfl_season_results() checks who is asking, refuses
// a season with no stats, and refuses to overwrite a published season unless
// told to. The status line per season is edfl_season_results_status()'s own
// `message`, shown verbatim.
//
// Republishing is a separate, two-step control because it can move a Fifth
// Year Option tier after an owner has already decided on it.

function statusData(row) {
  if (!row || !row.status || !row.status.ok) return null
  const d = row.status.data
  return Array.isArray(d) ? d[0] || null : d || null
}

export default function PublishResultsPanel(props) {
  const router = useRouter()
  const rows = Array.isArray(props.rows) ? props.rows : []
  const [busy, setBusy] = useState(null)
  const [armed, setArmed] = useState(null)
  const [notice, setNotice] = useState(null)
  const [failure, setFailure] = useState(null)

  function run(season, republish) {
    const key = season + (republish ? ':re' : ':new')
    if (armed !== key) {
      setArmed(key)
      setNotice(null)
      setFailure(null)
      return
    }
    setBusy(key)
    setNotice(null)
    setFailure(null)
    publishSeasonResults(season, republish)
      .then(function (res) {
        setBusy(null)
        setArmed(null)
        if (!res || !res.ok) {
          setFailure((res && res.message) || 'The season was not published and nothing changed.')
          return
        }
        const d = res.data || {}
        setNotice(
          'Published ' +
            season +
            ': ' +
            (d.rows != null ? d.rows : '?') +
            ' player-seasons, ' +
            (d.pro_bowl_selections != null ? d.pro_bowl_selections : '?') +
            ' Pro Bowl selections' +
            (d.republished ? ' (republished over the earlier record).' : '.') +
            ' The action log has the entry.'
        )
        router.refresh()
      })
      .catch(function (err) {
        setBusy(null)
        setArmed(null)
        setFailure(
          'Could not reach the server. Reload the page to see whether the season was published. (' +
            (err && err.message ? err.message : String(err)) +
            ')'
        )
      })
  }

  return (
    <div className="admin-form" style={{ marginTop: 32 }}>
      <h2 className="section-heading">Publish Season Results</h2>
      <p className="empty-note">
        Publishing settles a completed season&apos;s EDFL record: the Pro Bowl selections and the
        positional ranks that Fifth Year Option tiers are read from. Do it once, after the
        season&apos;s stats are imported. A published season does not move when stats change
        later &mdash; that is what keeps an option tier from shifting after an owner has decided.
      </p>

      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

      {rows.length === 0 && (
        <p className="empty-note">No completed season is available to publish.</p>
      )}

      {rows.length > 0 && (
        <table className="ledger">
          <thead>
            <tr>
              <th>Season</th>
              <th>Status</th>
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (row) {
              const d = statusData(row)
              const published = Boolean(d && d.published)
              const hasStats = Boolean(d && Number(d.stat_player_seasons) > 0)
              const newKey = row.season + ':new'
              const reKey = row.season + ':re'
              return (
                <tr key={row.season}>
                  <td data-label="Season">{row.season}</td>
                  <td data-label="Status">
                    {d && d.message ? (
                      d.message
                    ) : (
                      <span className="empty-note">
                        Status could not be read
                        {row.status && row.status.message ? ': ' + row.status.message : '.'}
                      </span>
                    )}
                  </td>
                  <td data-label="Action">
                    {!published && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy !== null || !hasStats}
                        title={hasStats ? '' : 'Import this season’s stats first.'}
                        onClick={function () {
                          run(row.season, false)
                        }}
                      >
                        {busy === newKey
                          ? 'Publishing…'
                          : armed === newKey
                          ? 'Confirm publish ' + row.season
                          : 'Publish ' + row.season}
                      </button>
                    )}
                    {published && (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={busy !== null}
                        onClick={function () {
                          run(row.season, true)
                        }}
                      >
                        {busy === reKey
                          ? 'Republishing…'
                          : armed === reKey
                          ? 'Confirm: overwrite the ' + row.season + ' record'
                          : 'Republish ' + row.season}
                      </button>
                    )}
                    {armed === reKey && busy === null && (
                      <p className="form-error" style={{ marginTop: 6 }}>
                        Republishing replaces the settled {row.season} record and can move a Fifth
                        Year Option tier after an owner has decided. Press again to confirm.
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
