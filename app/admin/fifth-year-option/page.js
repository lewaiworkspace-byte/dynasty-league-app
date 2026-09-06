import { redirect } from 'next/navigation';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import { loadFifthYearOptionBoard } from '../../fifth-year-option/actions';
import AdminFifthYearOptionPanel from './AdminFifthYearOptionPanel';

export const revalidate = 0;
export const metadata = { title: 'Fifth Year Option decisions' };

// THE COMMISSIONER'S SIDE OF THE FIFTH YEAR OPTION -- reversal, and nothing
// else.
//
// /fifth-year-option is a League surface and treats the commissioner as an
// ordinary owner: he decides on his own roster there like everybody else. The
// elevated ability -- undoing somebody's decision inside the 96-hour window --
// lives here, per the standing rule that a League page shows and does the same
// thing for every owner.
//
// This exists because reverse_fifth_year_option() shipped with an action
// wrapper and no caller. That is the exact shape of the August 27 trade-draft
// defect, where discard_trade_draft() sat unreachable behind a missing button
// until somebody noticed. The alternative was deleting the wrapper, which
// would have left a mistaken exercise correctable only by hand in SQL.
//
// IT READS THE SAME BOARD THE LEAGUE PAGE DOES. fifth_year_option_board()
// already returns every row with its decision attached, so there is no second
// query and no second shaping pass to keep in step. The rows are filtered to
// the decided ones here; the panel does not filter.
export default async function AdminFifthYearOptionPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/fifth-year-option');
  // Commissioner OR co-commissioner reaches the page. Whether either may
  // actually reverse is decided by reverse_fifth_year_option(), which holds
  // the officer check and the window -- see the panel.
  if (!isCommissionerOrCo(me)) redirect('/');

  const loaded = await loadFifthYearOptionBoard();

  const decided = loaded.ok
    ? (loaded.data.rows || []).filter(function (r) {
        return r.decision && r.decision.event_id;
      })
    : [];

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">Commissioner</p>
      <h1>Fifth Year Option decisions</h1>
      <p className="subhead">
        Every option decision on record, and the control to undo one. Owners make these on{' '}
        <a href="/fifth-year-option">Fifth Year Option</a>, which shows the same board without
        this control.
      </p>

      {!loaded.ok ? (
        <div className="form-error">{loaded.message}</div>
      ) : (
        <AdminFifthYearOptionPanel rows={decided} optionSeason={loaded.data.option_season} />
      )}
    </main>
  );
}
