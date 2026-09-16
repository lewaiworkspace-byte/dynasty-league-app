'use server'

import { adminClient } from '../../../lib/supabaseAdmin'
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner'

const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl?active=true'
const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const BATCH_SIZE = 500
const READ_PAGE_SIZE = 1000 // PostgREST's default row ceiling

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// PostgREST caps an unbounded select at 1,000 rows and returns no error, so
// this has to page explicitly. The sync needs EVERY existing player to match
// against: with a truncated read, any player past the ceiling misses both
// the sleeper_player_id lookup and the name+position fallback below, and
// gets re-inserted as a duplicate. That compounds -- the duplicates grow the
// table, pushing more real players past the ceiling on the next run.
//
// Ordered by id so the pages can't overlap or skip rows; without an ORDER BY
// the row order across pages isn't guaranteed.
async function fetchAllExistingPlayers(supabase) {
  let from = 0
  let all = []
  for (;;) {
    const { data, error } = await supabase
      .from('players')
      .select('id, full_name, position, sleeper_player_id, gsis_id')
      .order('id')
      .range(from, from + READ_PAGE_SIZE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < READ_PAGE_SIZE) break
    from += READ_PAGE_SIZE
  }
  return all
}

async function syncSleeperPlayers() {
  const supabase = adminClient()

  const res = await fetch(SLEEPER_PLAYERS_URL)
  if (!res.ok) {
    throw new Error('Sleeper player pool fetch failed: ' + res.status + ' ' + res.statusText)
  }
  const allPlayers = await res.json()

  const existingPlayers = await fetchAllExistingPlayers(supabase)

  const bySleeperId = new Map()
  const byNamePosition = new Map()
  for (const p of existingPlayers) {
    if (p.sleeper_player_id) bySleeperId.set(p.sleeper_player_id, p)
    const key = normalizeName(p.full_name) + '|' + p.position
    if (!byNamePosition.has(key)) byNamePosition.set(key, [])
    byNamePosition.get(key).push(p)
  }

  const rowsToUpsert = []
  const rowsToInsert = []
  const ambiguousMatches = []
  let fetchedCount = 0

  // A GSIS ID ALREADY ON A ROW IS NEVER OVERWRITTEN (September 16, 2026).
  // Until then this sync wrote Sleeper's gsis_id over every linked row, and
  // Sleeper leaves it blank for many players -- so a run could blank ids the
  // player-identity merge had filled from the Sleeper-GSIS crosswalk, and could
  // replace a corrected id with Sleeper's wrong one (the Izzo/Conklin swap).
  // The database's id stands; Sleeper's is used only where the row has none,
  // and the players_fill_ids_from_crosswalk trigger fills the rest.
  function cleanGsis(value) {
    const v = typeof value === 'string' ? value.trim() : ''
    return v ? v : null
  }

  for (const [sleeperId, sp] of Object.entries(allPlayers)) {
    const position = sp.position
    if (!TRACKED_POSITIONS.includes(position)) continue

    const fullName = sp.full_name || ((sp.first_name ?? '') + ' ' + (sp.last_name ?? '')).trim()
    if (!fullName) continue
    fetchedCount++

    const already = bySleeperId.get(sleeperId)
    if (already) {
      rowsToUpsert.push({
        id: already.id,
        full_name: already.full_name,
        position: already.position,
        sleeper_player_id: sleeperId,
        gsis_id: already.gsis_id || cleanGsis(sp.gsis_id),
        nfl_team: sp.team,
        status: sp.status,
      })
      continue
    }

    const key = normalizeName(fullName) + '|' + position
    const candidates = (byNamePosition.get(key) || []).filter((c) => !c.sleeper_player_id)

    if (candidates.length === 1) {
      const match = candidates[0]
      rowsToUpsert.push({
        id: match.id,
        full_name: match.full_name,
        position: match.position,
        sleeper_player_id: sleeperId,
        gsis_id: match.gsis_id || cleanGsis(sp.gsis_id),
        nfl_team: sp.team,
        status: sp.status,
      })
    } else if (candidates.length > 1) {
      ambiguousMatches.push({ name: fullName, position, count: candidates.length })
    } else {
      rowsToInsert.push({
        full_name: fullName,
        position,
        sleeper_player_id: sleeperId,
        gsis_id: cleanGsis(sp.gsis_id),
        nfl_team: sp.team,
        status: sp.status,
      })
    }
  }

  const errors = []
  let updatedExisting = 0
  let inserted = 0

  for (const chunk of chunkArray(rowsToUpsert, BATCH_SIZE)) {
    const { error } = await supabase.from('players').upsert(chunk, { onConflict: 'id' })
    if (error) errors.push({ batch: 'update', message: error.message })
    else updatedExisting += chunk.length
  }

  for (const chunk of chunkArray(rowsToInsert, BATCH_SIZE)) {
    const { error } = await supabase.from('players').insert(chunk)
    if (error) errors.push({ batch: 'insert', message: error.message })
    else inserted += chunk.length
  }

  return { fetched: fetchedCount, updatedExisting, inserted, ambiguousMatches, errors }
}

export async function syncSleeperPlayersAction(prevState, formData) {
  // Server Actions are callable endpoints regardless of what the UI
  // renders -- the page's redirect alone doesn't protect this write path.
  // Returns the form's error-state shape rather than throwing, matching
  // how this useFormState action reports every other failure.
  //
  // WIDENED to the co-commissioner (September 16, 2026), implementing the
  // commissioner's ruling of September 8, 2026 that struck Technical Manual
  // Appendix A.2(c). This check is still the WHOLE gate: the write below runs
  // through adminClient(), and no database function stands behind it.
  const me = await getCurrentTeamOwner()
  if (!isCommissionerOrCo(me)) {
    return { status: 'error', message: COMMISSIONER_OR_CO_REFUSAL }
  }

  try {
    const results = await syncSleeperPlayers()
    return { status: 'done', results }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}
