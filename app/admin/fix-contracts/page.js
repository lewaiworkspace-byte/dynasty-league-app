import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import { fetchAllRows } from '../../../lib/fetchAllRows';
import FixContractsTable from './FixContractsTable';

export const revalidate = 0;
export const metadata = { title: 'Fix Contracts' };

const PLAYER_ID_CHUNK = 100;

export default async function FixContractsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/fix-contracts');
  // Widened to co-commissioners August 25, 2026. Both Server Actions here --
  // the repair and the hard delete -- re-check independently.
  if (!isCommissionerOrCo(me)) redirect('/');

  const supabase = await createSupabaseServerClient();

  // EVERY CONTRACT, PAGED UNTIL EXHAUSTED (October 30, 2026; audit F2-1). This
  // read has no filter -- every status, every season -- so it grows without
  // limit, and a repair tool that silently drops contracts past PostgREST's
  // 1,000-row ceiling hides exactly the rows an officer came to fix. Newest
  // start_year first, as before; fetchAllRows appends `id` as the tiebreaker,
  // which makes the order unique so pages cannot overlap or skip.
  const [contractsResult, { data: teams, error: teamsError }] = await Promise.all([
    fetchAllRows(function () {
      return supabase
        .from('contracts')
        .select('id, player_id, team_id, contract_type, status, start_year, total_years, void_years, signing_bonus_total')
        .order('start_year', { ascending: false });
    }, 'id'),
    supabase.from('teams').select('id, name').order('name'),
  ]);
  const contracts = contractsResult.rows;

  // Look up ONLY the players these contracts reference.
  //
  // The previous version fetched the whole `players` table and built a map
  // from it. That silently broke once the Sleeper sync grew the table past
  // ~3,000 rows, because PostgREST caps an unbounded select at 1,000 rows
  // by default -- so any player outside that window rendered as "Unknown
  // player." It looked correct for a while only because the 130
  // rookie-backfill players were inserted first and sat inside the window.
  //
  // There will never be more distinct players here than there are contracts --
  // but the contracts read above is itself unbounded, so this lookup can pass
  // 1,000 rows too. It is chunked at 100 ids (a long .in() list makes a long
  // request URL, the same reason the waiver and free agency lookups chunk) and
  // each chunk pages until exhausted.
  const playerIds = [...new Set(contracts.map((c) => c.player_id).filter(Boolean))];

  const playerById = new Map();
  let playersError = null;
  for (let i = 0; i < playerIds.length && !playersError; i += PLAYER_ID_CHUNK) {
    const chunk = playerIds.slice(i, i + PLAYER_ID_CHUNK);
    const result = await fetchAllRows(function () {
      return supabase.from('players').select('id, full_name, position').in('id', chunk);
    }, 'id');
    result.rows.forEach((p) => playerById.set(p.id, p));
    playersError = result.error;
  }

  // A FAILED READ IS NOT AN EMPTY LIST. Any of the three failing would render a
  // short or mislabelled table -- contracts missing, "Unknown player", "?" for
  // a team -- that looks like a working one. Fail closed with the message.
  const loadError = contractsResult.error || teamsError || playersError;
  if (loadError) {
    return (
      <main className="page">
        <p className="page-actions"><a href="/">&larr; Home</a></p>
        <p className="eyebrow">Commissioner</p>
        <h1 className="team-name">Fix Contracts</h1>
        <p className="form-error">Couldn&apos;t load contracts: {loadError.message}</p>
      </main>
    );
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
