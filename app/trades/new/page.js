import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import TradeDesk from './TradeDesk';
import Breadcrumbs from '../../../components/Breadcrumbs';

export const revalidate = 0;

export const metadata = { title: 'Find a Trade' };

// THE TRADE DESK -- UI test batch 14, November 14, 2026 (test site only).
//
// Lewis's picks on the GM's Office canvas (artifact 5bmj6LvaPwvXGGow9zrvbE):
// Find a Trade (TrF-390 on a phone, TrF-1280 "Trade desk" on a laptop) and the
// Trade Builder (TrG-390). On a phone the search and the builder are two views
// of this one page; from 1024px they sit side by side. The builder still
// proposes, previews and sends through the same database functions as before
// (propose_trade / update_trade_draft / trade_impact / trade_legality /
// trade_savings / submit_trade), so nothing about how a trade is judged moved.
//
// EVERY ASSET IS STILL OFFERED. The rosters come from edfl_trade_targets()
// with every team named, which returns every active contract with its rank,
// cap hit and seasons signed; a contract missing from that list would be a
// trade an owner cannot propose, so it PAGES UNTIL EXHAUSTED, as the old
// contract read did. Picks are read as before.

async function fetchAllRows(buildQuery, orderColumn) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    let q = buildQuery();
    if (orderColumn) q = q.order(orderColumn);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) return { rows: all, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { rows: all, error: null };
}

export default async function NewTradePage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/trades/new');

  const supabase = await createSupabaseServerClient();

  const [{ data: teams, error: teamsError }, { data: config }] = await Promise.all([
    supabase.from('teams').select('id, name, abbrev').order('name'),
    supabase.from('league_config').select('current_season_year').eq('id', true).single(),
  ]);
  const teamIds = (teams || []).map(function (t) { return t.id; });
  const seasonYear = config ? Number(config.current_season_year) : null;

  const [playersResult, picksResult, needsResult, capResult] = await Promise.all([
    teamIds.length > 0
      ? fetchAllRows(function () {
          return supabase.rpc('edfl_trade_targets', { p_team_ids: teamIds });
        }, null)
      : Promise.resolve({ rows: [], error: null }),
    fetchAllRows(function () {
      return supabase
        .from('draft_picks')
        .select('id, season_year, round, current_team_id, original_team_id, used_by_contract_id')
        .is('used_by_contract_id', null);
    }, 'id'),
    supabase.rpc('edfl_team_needs', { p_moves: null }),
    seasonYear
      ? supabase
          .from('team_cap_summary')
          .select('team_id, cap_space_remaining')
          .eq('league_season_year', seasonYear)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // The rosters and picks ARE the builder: if either fails the page says so and
  // offers nothing (L14). Needs and cap room only inform, so they fail open with
  // their own message in place.
  const loadError = teamsError || playersResult.error || picksResult.error || null;
  if (loadError) {
    return (
      <main className="page">
        <Breadcrumbs trail={[{ label: 'GM’s Office', href: '/gm' }, { label: 'Trade' }]} />
        <h1>Find a trade</h1>
        <p className="form-error">
          Couldn&apos;t load the rosters: {loadError.message}. Nothing was changed.
        </p>
      </main>
    );
  }

  const teamName = {};
  (teams || []).forEach(function (t) { teamName[t.id] = t.name; });

  const picks = picksResult.rows.map(function (p) {
    return {
      id: p.id,
      teamId: p.current_team_id,
      seasonYear: p.season_year,
      round: p.round,
      originalTeam: p.original_team_id === p.current_team_id ? null : teamName[p.original_team_id] || null,
    };
  });
  picks.sort(function (a, b) {
    if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
    return a.round - b.round;
  });

  const capRoom = {};
  (capResult.data || []).forEach(function (r) { capRoom[r.team_id] = r.cap_space_remaining; });

  return (
    <main className="page tdk-page">
      <Breadcrumbs trail={[{ label: 'GM’s Office', href: '/gm' }, { label: 'Trade' }]} />
      <TradeDesk
        teams={teams || []}
        players={playersResult.rows}
        picks={picks}
        needs={needsResult.error ? null : needsResult.data || []}
        needsError={needsResult.error ? needsResult.error.message || 'unknown error' : null}
        capRoom={capRoom}
        capError={capResult.error ? capResult.error.message || 'unknown error' : null}
        myTeamId={me.team_id}
        seasonYear={seasonYear}
      />
    </main>
  );
}
