import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import RestructureForm from '../../components/RestructureForm';

export const revalidate = 0;

export const metadata = { title: 'Restructure a Contract' };

// LOGIN ONLY -- NO COMMISSIONER CHECK, DELIBERATELY (rule change, Sep 4 2026).
//
// Restructure used to live on /admin/new-contract, which is commissioner-gated
// at both the page layer and the action layer. That gate became wrong for this
// feature the moment every owner could restructure on their own roster: an
// ordinary owner could not reach the page at all. So the feature moved here
// and the mode selector came off that page. New contracts stay
// commissioner-only and /admin/new-contract is untouched apart from losing the
// selector.
//
// Whose contracts an owner may act on is decided in the database, by
// restructure_contract() and can_restructure(), which name the owning team
// when they refuse. This page adds no check of its own beyond requiring a
// login -- there is nothing here to gate that the database does not gate
// better, and an app-layer check would only turn a specific refusal into a
// generic one.
export default async function RestructurePage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/restructure');

  return (
    <main className="page">
      <p className="page-actions"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">EDFL</p>
      <h1>Restructure a Contract</h1>
      <p className="subhead">
        Convert unpaid salary from this season into a signing bonus spread over later seasons.
        The original signing bonus is untouched, and no cash changes hands.
      </p>
      <RestructureForm />
    </main>
  );
}
