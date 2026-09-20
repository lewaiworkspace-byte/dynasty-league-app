/**
 * PLAYER HEADSHOTS -- Phase 2G-2, September 20, 2026.
 *
 * THE ANSWER TO "HOW MUCH STORAGE WILL THIS COST": none. Not "a little" --
 * none. Sleeper serves a headshot for every player at a URL derived from his
 * Sleeper id, and `players.sleeper_player_id` has been in the database since
 * the first sync. Nothing is downloaded, nothing is stored, no column is
 * added and the Supabase free tier is not touched. The browser fetches the
 * image straight from Sleeper's CDN, exactly as it does on sleeper.app.
 *
 * Verified 2026-09-20: https://sleepercdn.com/content/nfl/players/thumb/4984.jpg
 * returns a live headshot.
 *
 * TWO SIZES, AND WHEN TO USE WHICH.
 *   thumb  -- the roster rows on the Matchup page. Twenty-five rows a side,
 *             fifty images on one screen; the full-size file would be a few
 *             megabytes of headshots for a 34px circle.
 *   full   -- the Player Card header, where it is the one image on the page.
 *
 * A MISSING HEADSHOT IS THE NORMAL CASE, NOT AN ERROR. Sleeper has no image
 * for most practice-squad and camp bodies, and answers 403 rather than a
 * placeholder. Every caller must therefore render the fallback -- the
 * player's initials -- underneath the image and let the image cover it only
 * once it has actually loaded. That is what `onError` hiding the <img> in
 * PlayerHeadshot does, and it is why the initials are not conditional.
 *
 * NO PLAYER WITHOUT A SLEEPER ID GETS A URL. Returning a guessable URL for a
 * null id would produce a request for /players/thumb/null.jpg on every row of
 * a page. Null in, null out, and the caller shows initials.
 */

const CDN = 'https://sleepercdn.com/content/nfl/players/';

export function headshotUrl(sleeperPlayerId, size) {
  if (!sleeperPlayerId) return null;
  const id = String(sleeperPlayerId).trim();
  if (!id || id === 'null' || id === 'undefined') return null;
  return CDN + (size === 'full' ? '' : 'thumb/') + id + '.jpg';
}

/**
 * Initials for the fallback disc. Two letters, from the first and last name
 * as `players.full_name` carries them; a single-word name gives one letter
 * rather than repeating it.
 */
export function playerInitials(fullName) {
  if (!fullName) return '';
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}
