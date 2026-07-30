import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import FixContractsTable from './FixContractsTable';

export const revalidate = 0;
export const metadata = { title: 'Fix Contracts' };

export default async function FixContractsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/fix-contracts');
  if (!me.is_commissioner) redirect('/');

  const supabase = await createSupabaseServerClient();

  const [{ data: contracts }, { data: teams }, { data: players }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, player_id, team_id, contract_type, status, start_year, total_years, void_years, signing_bonus_total')
      .order('start_year', { ascending: false }),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('players').select('id, full_name, position'),
  ]);

  const nameByTeam = new Map((teams || []).map((t) => [t.id, t.name]));
  const playerById = new Map((players || []).map((p) => [p.id, p]));

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
