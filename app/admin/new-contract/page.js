import { supabase } from '../../../lib/supabaseClient';
import ContractForm from './ContractForm';

export const revalidate = 0;

export default async function NewContractPage() {
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
        <p className="subhead">Couldn&apos;t load teams: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="eyebrow">{leagueName} · Admin</p>
      <h1>New Contract</h1>
      <p className="subhead">Add a signed contract for a player.</p>
      <ContractForm teams={teams || []} />
    </main>
  );
}
