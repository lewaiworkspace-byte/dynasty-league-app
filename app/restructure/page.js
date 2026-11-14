import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import RestructureForm from '../../components/RestructureForm';
import Breadcrumbs from '../../components/Breadcrumbs';
import ExplainButton from '../../components/ExplainButton';
import { RESTRUCTURE_ENABLED, RESTRUCTURE_DISABLED_MESSAGE } from '../../lib/featureFlags';

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

  // Switched off: explain rather than redirect. An owner who followed a link or
  // a bookmark deserves to know the feature exists and is temporarily off,
  // instead of being bounced to the home page with no reason -- which is the
  // failure the admin-link gating work was written to stop.
  if (!RESTRUCTURE_ENABLED) {
    return (
      <main className="page">
        <p className="page-actions"><a href="/">&larr; Home</a></p>
        <p className="eyebrow">EDFL</p>
        <h1>Restructure a Contract</h1>
        <div className="form-notice">{RESTRUCTURE_DISABLED_MESSAGE}</div>
      </main>
    );
  }

  // OPTION B (UI test batch 13, November 14, 2026): the GM's Office trail, a
  // plain "Restructure" heading and the explain icon. The explanation lives in
  // the icon's card, never as a paragraph on the page (ui-patterns.md).
  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'GM\u2019s Office', href: '/gm' }, { label: 'Restructure' }]} />
      <div className="edfl-explain-h edfl-explain-host rsb-h">
        <h1>Restructure</h1>
        <ExplainButton label="How a restructure works" title="How a restructure works">
          <ul>
            <li>
              Unpaid salary from this season becomes a new signing bonus, spread over the 2 to 5
              seasons you pick. This season&rsquo;s cap hit goes down; each later season of the
              spread goes up by its share.
            </li>
            <li>The original signing bonus is untouched, and no cash changes hands.</li>
            <li>
              Only amounts that pass every rule are offered: his PPV must go up, his cash this
              season must stay at or above the league minimum, and his real salary must still cover
              his bonus each season (the Deion Rule). The list shows the most each contract can
              free.
            </li>
            <li>The 30% Rule does not apply to a restructure.</li>
            <li>
              A spread longer than his contract adds void seasons to carry the bonus.
            </li>
          </ul>
        </ExplainButton>
      </div>
      <RestructureForm />
    </main>
  );
}
