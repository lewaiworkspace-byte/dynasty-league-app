import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import TradeBuilder from './TradeBuilder';

export const revalidate = 0;

export const metadata = { title: 'Propose a Trade' };

// The builder needs every tradeable asset in the league, and "every" is the
// operative word: a contract missing from this list is a trade an owner cannot
// propose, with nothing on screen to say why. So both reads PAGE UNTIL
// EXHAUSTED rather than bound-and-warn. 233 active contracts and 120 picks sit
// under PostgREST's 1,000-row default ceiling today, which is exactly the
// condition that makes an unbounded select look correct right up until it
// silently truncates.
async function fetchAllRows(buildQuery, orderColumn) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await buildQuery()
      .order(orderColumn)
      .range(from, from + pageSize - 1);
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

  const contractsResult = await fetchAllRows(function () {
    return supabase
      .from('contracts')
      .select('id, team_id, player_id, start_year, total_years')
      .eq('status', 'active');
  }, 'id');

  const picksResult = await fetchAllRows(function () {
    return supabase
      .from('draft_picks')
      .select('id, season_year, round, current_team_id, original_team_id, used_by_contract_id')
      .is('used_by_contract_id', null);
  }, 'id');

  const playerIds = Array.from(
    new Set(contractsResult.rows.map(function (c) { return c.player_id; }).filter(Boolean))
  );

  const [{ data: teams }, playersResult] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    playerIds.length > 0
      ? fetchAllRows(function () {
          return supabase.from('players').select('id, full_name, position').in('id', playerIds);
        }, 'id')
      : Promise.resolve({ rows: [], error: null }),
  ]);

  const loadError =
    contractsResult.error || picksResult.error || playersResult.error || null;

  if (loadError) {
    return (
      <main className="page">
        <p className="page-actions"><a href="/trades">&larr; Trades</a></p>
        <h1>Propose a Trade</h1>
        <p className="form-error">
          Couldn&apos;t load the rosters: {loadError.message}. Nothing was changed.
        </p>
      </main>
    );
  }

  const playerName = {};
  const playerPos = {};
  playersResult.rows.forEach(function (p) {
    playerName[p.id] = p.full_name;
    playerPos[p.id] = p.position;
  });

  const teamNames = {};
  (teams || []).forEach(function (t) { teamNames[t.id] = t.name; });

  // Flattened for the client so the builder does no joining of its own.
  const contracts = contractsResult.rows.map(function (c) {
    return {
      id: c.id,
      teamId: c.team_id,
      playerId: c.player_id,
      name: playerName[c.player_id] || 'Unknown player',
      position: playerPos[c.player_id] || '',
    };
  });
  contracts.sort(function (a, b) { return a.name.localeCompare(b.name); });

  const picks = picksResult.rows.map(function (p) {
    return {
      id: p.id,
      teamId: p.current_team_id,
      seasonYear: p.season_year,
      round: p.round,
      // Worth showing: a pick a team acquired reads differently from its own.
      originalTeam: p.original_team_id === p.current_team_id ? null : teamNames[p.original_team_id] || null,
    };
  });
  picks.sort(function (a, b) {
    if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
    return a.round - b.round;
  });

  return (
    <main className="page">
      <p className="page-actions"><a href="/trades">&larr; Trades</a></p>
      <p className="eyebrow">EDFL</p>
      <h1>Propose a Trade</h1>

      <TradeBuilder
        teams={teams || []}
        contracts={contracts}
        picks={picks}
        myTeamId={me.team_id}
      />
    </main>
  );
}
