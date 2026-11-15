import { supabase } from '../../lib/supabaseClient';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import Breadcrumbs from '../../components/Breadcrumbs';
import DraftPicksBoard from './DraftPicksBoard';

// Picks move whenever a trade executes -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Draft Board' };

// THE LEAGUE DRAFT BOARD (UI test batch 18, November 15, 2026). Same route and
// the same read as the Draft Picks page it replaces; Lewis's "League Draft
// Board" canvas (Nov 14-15) decided how it looks. Its door is League Office
// (a tile there); the Analyst's Office tile and the site index still reach it.
// Reference only: nothing on this page writes, and there is no action, form or
// Server Action behind it. Picks are traded on /trades.
//
// READ WITH THE SIGNED-IN CLIENT, NOT THE ANON ONE -- and this is the opposite
// of /scoreboard, which reads as anon on purpose.
//
// draft_pick_board is granted to `authenticated` only. It reads
// player_transaction_feed, which calls winning_bid_link -- a Class B function
// under EDFL_DB_Convention_FunctionGrants_v1.0, deliberately revoked from anon.
// A non-invoker view does not protect that: a function call is not a
// range-table entry, so its ACL is checked against whoever runs the query.
// Read with the module-level anon client this page fails with
// "permission denied for function winning_bid_link", for everyone, always.
// Verified against the live database.
//
// Do NOT fix that by granting winning_bid_link to anon. It widens bid
// visibility to settle a display question -- SR-12 in reverse. Whether this
// board should be readable signed-out is a commissioner ruling, not a bug.
//
// NO ROW CEILING, DELIBERATELY. CLAUDE.md names two correct answers to
// PostgREST's silent 1,000-row cap -- bound-and-warn and page-until-exhausted
// -- and says a bare .limit(n) is neither, because it only relocates the
// invisible ceiling. This read is bounded by construction instead: the view holds
// one row per pick per season, 250 today, and grows by 40 a season. It reaches
// 1,000 rows around the 2045 draft. If picks ever become per-player or
// per-round-split, this needs page-until-exhausted, not a bigger number.
//
// THE TRI-GRAPHS are joined from teams (id, abbrev), as the League page does,
// never derived from a name. They draw the team logos (components/TeamDisc.js).
export default async function DraftPicksPage() {
  const [{ data: config }, viewer, teamsRes] = await Promise.all([
    supabase
      .from('league_config')
      .select('league_short_name, current_season_year')
      .eq('id', true)
      .single(),
    getCurrentViewer(),
    supabase.from('teams').select('id, abbrev'),
  ]);

  // An owner OR a read-only observer (October 6, 2026) may read the board. The name
  // is kept because everything below already tests it; it means "may read" now.
  const teamOwner = Boolean(viewer.owner || viewer.observer);
  const myTeamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  const season = config?.current_season_year || 2026;

  const abbrevById = {};
  (teamsRes.data || []).forEach(function (t) {
    abbrevById[t.id] = t.abbrev || '';
  });

  let rows = [];
  let loadError = null;

  if (teamOwner) {
    const authed = await createSupabaseServerClient();
    const { data, error } = await authed
      .from('draft_pick_board')
      .select(
        'pick_id, season_year, round, pick_number, overall_pick, pick_label, draft_completed, order_set,' +
          ' original_team_id, original_team_name, current_team_id, current_team_name, pick_changed_hands,' +
          ' player_id, player_name, player_position, player_current_team_id, player_current_team_name,' +
          ' player_status'
      )
      .order('season_year', { ascending: true })
      .order('sort_key', { ascending: true });
    rows = data || [];
    // CAPTURED, NOT DISCARDED. An empty board rendered silently reads as "the
    // league has no draft picks", which is a plausible-looking wrong answer.
    loadError = error ? error.message : null;
  }

  return (
    <main className="page edfl-db-page">
      <Breadcrumbs trail={[{ label: 'League Office', href: '/office' }, { label: 'Draft Board' }]} />
      <h1 className="it-visually-hidden">Draft Board</h1>

      {!teamOwner && (
        <p className="empty-note">
          Sign in to see the draft board. It reads league transaction history, which is not
          available to signed-out visitors.
        </p>
      )}

      {teamOwner && loadError && (
        <p className="form-error">
          Couldn&apos;t load the draft board: {loadError}. Nothing below is answering the
          question &mdash; do not read it as an empty board.
        </p>
      )}

      {teamOwner && !loadError && rows.length === 0 && (
        <p className="empty-note">No draft picks are on record.</p>
      )}

      {teamOwner && !loadError && rows.length > 0 && (
        <DraftPicksBoard
          rows={rows}
          initialSeason={season}
          abbrevById={abbrevById}
          myTeamId={myTeamId}
        />
      )}
    </main>
  );
}
