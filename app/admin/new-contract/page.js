import { redirect } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import ContractForm from './ContractForm';

export const revalidate = 0;

// NEW CONTRACTS STAY COMMISSIONER-ONLY. The restructure mode selector that
// briefly lived here was removed on September 4, 2026 when restructure opened
// to every owner: this page's gate is right for entering a contract and wrong
// for restructuring one, and an ordinary owner cannot reach the page at all.
// Restructure now lives at /restructure with a login-only gate. Do not put it
// back here.
export default async function NewContractPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/new-contract');
  // Widened to co-commissioners August 25, 2026.
  if (!isCommissionerOrCo(me)) redirect('/');

  const [{ data: teams, error }, { data: config }] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('league_config').select('league_short_name').eq('id', true).single(),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

  if (error) {
    return (
      <main className="page">
        <p className="eyebrow">{leagueName} · Admin</p>
        <h1>New Contract</h1>
        <p className="subhead">
          <a href="/">&larr; Home</a>
        </p>
        <p className="subhead">Couldn&apos;t load teams: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="eyebrow">{leagueName} · Admin</p>
      <h1>New Contract</h1>
      <p className="subhead">
        <a href="/">&larr; Home</a>
      </p>
      <p className="subhead">Add a signed contract for a player.</p>
      <ContractForm teams={teams || []} />
    </main>
  );
}
