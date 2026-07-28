'use server'

import { adminClient } from '../../../lib/supabaseAdmin'

const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl?active=true'
const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const BATCH_SIZE = 500

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

async function syncSleeperPlayers() {
  const supabase = adminClient()

  const res = await fetch(SLEEPER_PLAYERS_URL)
  if (!res.ok) {
    throw new Error('Sleeper player pool fetch failed: ' + res.status + ' ' + res.statusText)
  }
  const allPlayers = await res.json()

  const { data: existingPlayers, error: existingError } = await supabase
    .from('players')
    .select('id, full_name, position, sleeper_player_id')

  if (existingError) throw existingError

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
        gsis_id: sp.gsis_id || null,
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
        gsis_id: sp.gsis_id || null,
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
        gsis_id: sp.gsis_id || null,
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
  try {
    const results = await syncSleeperPlayers()
    return { status: 'done', results }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}
