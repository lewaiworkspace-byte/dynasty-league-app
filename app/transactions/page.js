import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { loadTransactionKinds, loadTeamsForFilter, loadTransactionPage } from './actions';
import TransactionLog from './TransactionLog';

export const revalidate = 0;
export const metadata = { title: 'League transactions' };

// THE LEAGUE TRANSACTION LOG. Every roster move in the league, for every member.
//
// LOGIN-GATED, NOT OFFICER-GATED. This is a League surface: every owner sees the
// same rows in the same order, and there is no control on it that only some
// owners get. The only gate is being a league member.
//
// WHAT IS DELIBERATELY NOT HERE. Auction bidding -- winning and losing bids --
// is public on verified tiers since the September 3 ruling, but it is 319 rows
// against 340 roster moves and would drown the thing this page is for. Losing
// bids belong on tier results and the player card. Commissioner corrections are
// out for the same reason and because rule 1.11 already presents
// commissioner_actions as their record.
//
// The filter list is read from the database rather than hardcoded, so a kind
// added to the log later appears in the control without an app change.
export default async function TransactionsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/transactions');

  const kinds = await loadTransactionKinds();
  const teams = await loadTeamsForFilter();
  const first = await loadTransactionPage({ sort: 'newest' });

  const failure =
    (!kinds.ok && kinds.message) ||
    (!teams.ok && teams.message) ||
    (!first.ok && first.message) ||
    null;

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">League</p>
      <h1>Transactions</h1>
      <p className="subhead">
        Every roster move in the league — signings, releases, trades, taxi and IR moves,
        restructures and option decisions. Auction bidding lives on the tier results pages.
      </p>

      {failure ? (
        <div className="form-error">{failure}</div>
      ) : (
        <TransactionLog
          initialRows={first.data.rows}
          initialCursorAt={first.data.cursorAt}
          initialCursorId={first.data.cursorId}
          pageSize={first.data.pageSize}
          kinds={kinds.data}
          teams={teams.data}
        />
      )}
    </main>
  );
}
