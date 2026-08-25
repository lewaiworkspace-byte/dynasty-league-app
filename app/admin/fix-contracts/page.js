import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import FixContractsTable from './FixContractsTable';

export const revalidate = 0;
export const metadata = { title: 'Fix Contracts' };

export default async function FixContractsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/fix-contracts');
  // Widened to co-commissioners August 25, 2026. Both Server Actions here --
  // the repair and the hard delete -- re-check independently.
  if (!isCommissionerOrCo(me)) redirect('/');

  const supabase = await createSupabaseServerClient();

  const [{ data: contracts }, { data: teams }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, player_id, team_id, contract_type, status, start_year, total_years, void_years, signing_bonus_total')
      .order('start_year', { ascending: false }),
    supabase.from('teams').select('id, name').order('name'),
  ]);

  // Look up ONLY the players these contracts reference.
  //
  // The previous version fetched the whole `players` table and built a map
  // from it. That silently broke once the Sleeper sync grew the table past
  // ~3,000 rows, because PostgREST caps an unbounded select at 1,000 rows
  // by default -- so any player outside that window rendered as "Unknown
  // player." It looked correct for a while only because the 130
  // rookie-backfill players were inserted first and sat inside the window.
  //
  // Scoping to the referenced ids can't hit that ceiling: there will never
  // be more distinct players here than there are contracts.
  const playerIds = [...new Set((contracts || []).map((c) => c.player_id).filter(Boolean))];

  let playerById = new Map();
  if (playerIds.length > 0) {
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, full_name, position')
      .in('id', playerIds);
    playerById = new Map((playerRows || []).map((p) => [p.id, p]));
  }

  const nameByTeam = new Map((teams || []).map((t) => [t.id, t.name]));

  const rows = (contracts || []).map((c) => ({
    id: c.id,
    playerName: playerById.get(c.player_id)?.full_name || 'Unknown player',
    position: playerById.get(c.player_id)?.position || '',
    teamName: nameByTeam.get(c.team_id) || '?',
    contractType: c.contract_type,
    status: c.status,
    startYear: c.start_year,
    totalYears: c.total_years,
    voidYears: c.void_years,
    signingBonusTotal: Number(c.signing_bonus_total),
  }));

  return <FixContractsTable rows={rows} teams={teams || []} />;
}
