import { redirect } from 'next/navigation';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import RestructureForm from '../../../components/RestructureForm';
import { loadAllTeamsRestructureRoster } from './actions';

export const revalidate = 0;
export const metadata = { title: 'Restructure (any team)' };

// RESTRUCTURE FOR ANY TEAM. The Admin counterpart to /restructure, which is a
// League surface and therefore serves every owner -- commissioner included --
// only their own roster.
//
// The same RestructureForm renders both. All that changes is the loader passed
// in: this one returns every active contract in the league, the League route's
// returns one roster. The preview and the execute call are identical on both,
// because restructure_contract() already permits a commissioner to act on any
// team and enforces that itself, exactly as cut_player does. Nothing about the
// money, the rules or the refusals differs between the two pages.
export default async function AdminRestructurePage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/restructure');
  if (!isCommissionerOrCo(me)) redirect('/');

  return (
    <main className="page">
      <p className="page-actions"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">Commissioner</p>
      <h1>Restructure (any team)</h1>
      <p className="subhead">
        Convert unpaid salary from this season into a signing bonus spread over later seasons,
        on any roster in the league. An owner does this for their own players on{' '}
        <a href="/restructure">Restructure a Contract</a>; every figure and every refusal here is
        identical, because it is the same form and the same engine.
      </p>

      <RestructureForm loadRoster={loadAllTeamsRestructureRoster} />
    </main>
  );
}
