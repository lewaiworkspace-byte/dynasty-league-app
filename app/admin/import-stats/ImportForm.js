'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { importSeasonAction } from './actions'

const SEASONS = [2021, 2022, 2023, 2024, 2025]
const initialState = { status: 'idle' }

// The publish-status line, read defensively. edfl_season_results_status()
// returns one object carrying a ready-to-display `message`, but a jsonb RPC can
// also hand back an array or a null, and this renders in a client component
// where reading .message off a null would take the whole result panel down
// with it. The import itself has already succeeded by this point, so a courtesy
// line must never be the thing that hides it. Returns null when there is
// nothing to say, and the caller renders nothing.
function statusMessage(seasonResults) {
  if (!seasonResults || !seasonResults.ok) return null
  const d = Array.isArray(seasonResults.data) ? seasonResults.data[0] : seasonResults.data
  return d && d.message ? d.message : null
}

function SeasonButtons() {
  const { pending } = useFormStatus()
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {SEASONS.map((s) => (
        <button
          key={s}
          type="submit"
          name="season"
          value={s}
          className="btn"
          disabled={pending}
        >
          {pending ? 'Importing…' : 'Import ' + s}
        </button>
      ))}
    </div>
  )
}

export default function ImportForm() {
  const [state, formAction] = useFormState(importSeasonAction, initialState)

  return (
    <div className="admin-form">
      <h1>Import Historical NFL Stats</h1>
      <p className="empty-note">
        Downloads one season of game-by-game player stats from nflverse
        (QB/RB/WR/TE/K only) and loads it into the database. Import one
        season at a time — each takes up to a minute. Safe to re-run;
        existing rows are updated, not duplicated.
      </p>

      <form action={formAction}>
        <SeasonButtons />
      </form>

      {state.status === 'error' && (
        <div className="form-error">Import failed: {state.message}</div>
      )}

      {state.status === 'done' && (
        <div className="assistant-box">
          <p>Season {state.results.season} imported.</p>
          <p>Rows in source file: {state.results.csvRows.toLocaleString()}</p>
          <p>QB/RB/WR/TE/K rows: {state.results.trackedRows.toLocaleString()}</p>
          <p>Games recorded: {state.results.gamesUpserted.toLocaleString()}</p>
          <p>New players created: {state.results.playersCreated.toLocaleString()}</p>
          <p>Stat rows saved: {state.results.statRowsUpserted.toLocaleString()}</p>
          <p className="empty-note">Source: {state.results.sourceUrl}</p>

          {/* A PUBLISHED SEASON DOES NOT MOVE WHEN STATS ARE IMPORTED, and this
              line exists to say so rather than to warn about anything. An
              earlier version warned that a refresh had failed, against a
              function fyo_09 had already dropped -- there is no per-import
              obligation to report on.

              The message comes from edfl_season_results_status() and is written
              to be displayed verbatim; do not paraphrase it or rebuild the
              sentence from the counts beside it. If the status read itself
              fails, that is a courtesy note failing and carries no consequence,
              so it renders quietly -- the import result above it is complete
              and correct either way. */}
          {statusMessage(state.results.seasonResults) && (
            <p className="empty-note">{statusMessage(state.results.seasonResults)}</p>
          )}
          {state.results.seasonResults && !state.results.seasonResults.ok && (
            <p className="empty-note">
              The stats imported. Whether {state.results.season} is published could not be
              read: {state.results.seasonResults.message}
            </p>
          )}

          {Object.values(state.results.columnReport).includes('MISSING') && (
            <>
              <p className="form-error">
                Some stat categories were not found in the source file and
                imported as zero — report these so the mapping can be fixed:
              </p>
              <ul>
                {Object.entries(state.results.columnReport)
                  .filter(([, src]) => src === 'MISSING')
                  .map(([db]) => (
                    <li key={db}>{db}</li>
                  ))}
              </ul>
            </>
          )}

          {state.results.errors.length > 0 && (
            <>
              <p className="form-error">{state.results.errors.length} error(s):</p>
              <ul>
                {state.results.errors.map((e, i) => (
                  <li key={i}>{e.step}: {e.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
