import { unstable_cache } from 'next/cache';
import { supabase } from './supabaseClient';

/**
 * THE LEAGUE'S SHORT NAME, READ AT MOST ONCE EVERY FIVE MINUTES -- November 22, 2026
 * (UI test batch 40).
 *
 * Every page read league_config.league_short_name twice (the tab title in app/layout.js and the
 * app bar), on every load, for a name that changes perhaps once a season. This keeps one copy in
 * Next's data cache for five minutes. A signed-in app bar does not use it at all: it gets the
 * name from edfl_topbar_state() in the same call as everything else.
 *
 * A failed read THROWS inside the cached function, so a failure is never cached; the caller
 * gets null and falls back to its own default.
 *
 * Read through the anon client, as both readers did before. Nothing else may be cached this way
 * without a ruling on how stale it may be: never a figure, a deadline or a status.
 */

const readLeagueShortName = unstable_cache(
  async function () {
    const { data, error } = await supabase
      .from('league_config')
      .select('league_short_name')
      .eq('id', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data && data.league_short_name) || null;
  },
  ['edfl-league-short-name'],
  { revalidate: 300 }
);

export async function getLeagueShortName() {
  try {
    return await readLeagueShortName();
  } catch (e) {
    console.error('league_short_name read failed:', e);
    return null;
  }
}
