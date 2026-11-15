import { redirect } from 'next/navigation';

/**
 * /scoreboard MOVED TO /matchups -- UI test batch 20, November 15, 2026.
 *
 * The Matchups tab (app/matchups/) replaced the Scoreboard: every week's five
 * games, your matchup on top and each box score a tap away. This route stays
 * so old links, bookmarks and the installed app's history still land
 * somewhere; it keeps no page of its own. The Matchup page
 * (/matchup/<week>/<id>) is unchanged.
 */
export default function ScoreboardMoved() {
  redirect('/matchups');
}
