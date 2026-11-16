import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import Breadcrumbs from '../../components/Breadcrumbs';
import OwnerCashView from './OwnerCashView';

// Salary is charged every Tuesday and the Book moves money any day -- never cache.
export const revalidate = 0;
export const metadata = { title: 'Owner Cash Accounting' };

/**
 * OWNER CASH ACCOUNTING -- UI test batch 26, November 15, 2026 (was "Cash Account").
 *
 * Lewis's approved design: Option A of the Owner Cash Accounting canvas
 * (YHL8z13zcDgpD1zC7tzsXg, version 1794798048-a878). One statement: Owner Cash
 * left to spend split between the Team Budget and the Betting Budget, the Team
 * Budget as revenue and expenses, the Betting Budget, a five-season cash flow,
 * the Cash Windows, and a ledger split between revenue and expenses in which
 * salary is a row per week (Rule Book 5.18(a): fourteen equal weekly shares of
 * guaranteed and non-guaranteed salary, charged each Tuesday) with a running
 * balance and the weeks still to come shown as scheduled.
 *
 * ONE READ. owner_cash_statement(p_season, p_what_if) (test database, migrations
 * owner_cash_01..03) is SECURITY DEFINER, granted to authenticated only, and
 * resolves the team from auth.uid(), so it is read through the SESSION client.
 * Every figure on the page comes from it; the page adds nothing up (SR-23). The
 * five-season chart scales its bars to the largest figure it draws; that is
 * geometry, never a displayed amount.
 *
 * THE WHAT-IF. Owner Cash for future seasons is voted each off-season (Rule Book
 * 10.2), so it is unknown. An owner may type a planning figure (?whatif=); the
 * database works out what would be left against each season's committed cash.
 * Nothing is stored and there is no default (open ruling: keep it or remove it).
 *
 * The ledger's filter (?f=) and "see all" (?all=1) are links, a server round trip.
 *
 * HOW IT FAILS. The statement IS the page: a failed read draws a banner and no
 * figure that could pass for a balance.
 */

const FILTERS = ['all', 'salary', 'bonuses', 'dead', 'book', 'fines'];

function readWhatIf(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return n;
}

export default async function OwnerCashPage({ searchParams }) {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/cash');

  const sp = searchParams || {};
  const filter = FILTERS.indexOf(sp.f) >= 0 ? sp.f : 'all';
  const showAll = sp.all === '1';
  const whatIf = readWhatIf(sp.whatif);

  const crumbs = <Breadcrumbs trail={[{ label: 'Owner’s Suite', href: '/owner' }, { label: 'Owner Cash Accounting' }]} />;

  if (!viewer.owner || !viewer.owner.team_id) {
    return (
      <main className="page oc-page">
        {crumbs}
        <p className="empty-note">Owner Cash Accounting shows a team&rsquo;s own account. This login is not linked to a team.</p>
      </main>
    );
  }

  const session = await createSupabaseServerClient();
  const { data, error } = await session.rpc('owner_cash_statement', { p_season: null, p_what_if: whatIf });

  if (error || !data) {
    return (
      <main className="page oc-page">
        {crumbs}
        <p className="form-error">
          Your Owner Cash statement could not be read{error ? ': ' + error.message : ''}. Nothing is shown rather than a
          balance that might be wrong.
        </p>
      </main>
    );
  }

  return (
    <main className="page oc-page">
      {crumbs}
      <OwnerCashView st={data} filter={filter} showAll={showAll} whatIf={whatIf} />
    </main>
  );
}
