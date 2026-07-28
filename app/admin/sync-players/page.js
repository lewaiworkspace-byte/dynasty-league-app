'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { syncSleeperPlayersAction } from './actions'

const initialState = { status: 'idle' }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? 'Syncing… this can take a minute' : 'Sync Sleeper Player Pool'}
    </button>
  )
}

export default function SyncPlayersPage() {
  const [state, formAction] = useFormState(syncSleeperPlayersAction, initialState)

  return (
    <div className="admin-form">
      <p className="subhead">
        <a href="/">&larr; Home</a>
      </p>
      <h1>Sync Sleeper Player Pool</h1>
      <p className="empty-note">
        Pulls Sleeper&apos;s full player list (QB/RB/WR/TE/K), links it to
        existing players by name where possible, and adds anyone new. Safe
        to re-run — already-linked players are refreshed, not duplicated.
      </p>

      <form action={formAction}>
        <SubmitButton />
      </form>

      {state.status === 'error' && (
        <div className="form-error">Sync failed: {state.message}</div>
      )}

      {state.status === 'done' && (
        <div className="assistant-box">
          <p>Fetched (QB/RB/WR/TE/K): {state.results.fetched}</p>
          <p>Linked to existing players: {state.results.updatedExisting}</p>
          <p>New players inserted: {state.results.inserted}</p>

          {state.results.ambiguousMatches.length > 0 && (
            <>
              <p className="form-error">
                {state.results.ambiguousMatches.length} name(s) matched more
                than one existing player and were skipped — needs manual
                review:
              </p>
              <ul>
                {state.results.ambiguousMatches.map((m, i) => (
                  <li key={i}>
                    {m.name} ({m.position}) — {m.count} matches
                  </li>
                ))}
              </ul>
            </>
          )}

          {state.results.errors.length > 0 && (
            <>
              <p className="form-error">{state.results.errors.length} error(s):</p>
              <ul>
                {state.results.errors.map((e, i) => (
                  <li key={i}>{e.batch}: {e.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
