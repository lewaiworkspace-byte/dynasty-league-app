import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { loadFifthYearOptionBoard } from './actions';
import FifthYearOptionBoard from './FifthYearOptionBoard';

export const revalidate = 0;

export const metadata = { title: 'Fifth Year Option' };

// LOGIN ONLY -- NO COMMISSIONER CHECK, DELIBERATELY.
//
// Every owner sees the whole board; an owner may act only on players on his
// own roster. That split is enforced in the database -- the board returns
// can_decide per row, and exercise/decline refuse a foreign roster by name --
// exactly as /restructure works. This page adds nothing beyond requiring a
// login, because there is nothing here to gate that the database does not gate
// better, and an app-layer check would turn a specific refusal into a generic
// one.
//
// A LEAGUE SURFACE, so it treats the commissioner as an ordinary owner
// (standing rule, September 4 2026). The board's is_officer flag is NOT read
// by this page or by the board component: officer-only reversal is a separate
// control that does not exist yet, and when it is built it belongs in the
// Admin section, not here. Do not use is_officer to widen what this page can
// do -- that is the mistake /restructure had to be corrected for on the day it
// shipped.
export default async function FifthYearOptionPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/fifth-year-option');

  const loaded = await loadFifthYearOptionBoard();

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">EDFL</p>
      <h1>Fifth Year Option</h1>
      <p className="subhead">
        Every Round 1 rookie whose option decision is open. The whole league sees the same
        board; you can act on the players on your own roster. Exercising adds a new,
        fully guaranteed one-year contract alongside the rookie deal that still covers this
        season.
      </p>

      {!loaded.ok ? (
        <div className="form-error">{loaded.message}</div>
      ) : (
        <FifthYearOptionBoard board={loaded.data} />
      )}
    </main>
  );
}
