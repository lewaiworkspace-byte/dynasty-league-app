import { supabase } from '../../../lib/supabaseClient';
import ContractForm from './ContractForm';

export const revalidate = 0;

export default async function NewContractPage() {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, name')
    .order('name');

  if (error) {
    return (
      <main className="page">
        <p className="eyebrow">Dynasty League · Admin</p>
        <h1>New Contract</h1>
        <p className="subhead">Couldn&apos;t load teams: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="eyebrow">Dynasty League · Admin</p>
      <h1>New Contract</h1>
      <p className="subhead">Add a signed contract for a player.</p>
      <ContractForm teams={teams || []} />
    </main>
  );
}
