import { redirect } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import ContractModeSwitch from './ContractModeSwitch';

export const revalidate = 0;

export default async function NewContractPage({ searchParams }) {
  // ?mode=restructure opens straight into restructure mode, so the home page
  // can link to it by name. Read on the server and passed as a prop rather
  // than read client-side with useSearchParams, which would need a Suspense
  // boundary around the switch for no benefit.
  const sp = await searchParams;
  const initialMode = sp && sp.mode === 'restructure' ? 'restructure' : 'new';

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
      <h1>Contracts</h1>
      <p className="subhead">
        <a href="/">&larr; Home</a>
      </p>
      <ContractModeSwitch teams={teams || []} initialMode={initialMode} />
    </main>
  );
}
