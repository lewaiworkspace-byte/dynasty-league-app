'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { importSeasonAction } from './actions'

const SEASONS = [2021, 2022, 2023, 2024, 2025]
const initialState = { status: 'idle' }

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
