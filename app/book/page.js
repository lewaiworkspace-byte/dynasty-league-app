import { redirect } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import BookView from './BookView';

// Lines, locks, balances and the House move all week -- never cache.
export const revalidate = 0;
export const metadata = { title: 'The Book' };

/**
 * THE BOOK -- UI test batch 24, November 15, 2026. TEST SITE ONLY (BT-9).
 *
 * Lewis's approved Phase 1 design (canvas BpZzrSduVRZtxsfRu5D98e, version
 * 1794772617-41fa; handoff EDFL_Book_Design_Phase1_Handoff_2026-11-15.zip):
 * single bets on matchups -- spread, moneyline, total and each team's points --
 * with the bet slip, the weekly limit, Pete's Picks, locks, settlement, My bets,
 * the account and cash-out with tax, Records against the spread, and the House.
 * Players, Futures and parlays are placeholders until their phases.
 *
 * ONE URL, FIVE VIEWS. /book?view=board|bets|account|records|house, plus ?week=N
 * for the board's week pager, ?team=ABC for one team's record, and ?f= for the My
 * bets filter. Every change is a link (a server round trip): the figures move.
 *
 * WHO READS WHAT. Every book_ function is SECURITY DEFINER and granted to
 * authenticated only, so they are read through the SESSION client; the middleware
 * guarantees a session and the page gate below refuses anyone who is neither an
 * owner nor the observer. book_week_board(week) is the page's spine: it settles
 * what is due, posts the week's lines once the week is open (Tuesday 12:00 AM,
 * BT-61), and returns the board, the owner's limits, account, open bets and the
 * House. The other views add one read each. The teams list (anon, like
 * /matchups) only names the teams on settled bets.
 *
 * HOW EACH READ FAILS. The board read IS the page: if it fails the page says so
 * and draws nothing that could be taken for a line or a balance. A view's own
 * read failing shows that view's error and keeps the header.
 */

const VIEWS = ['board', 'bets', 'account', 'records', 'house'];

export default async function BookPage({ searchParams }) {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/book');

  const sp = searchParams || {};
  const view = VIEWS.indexOf(sp.view) >= 0 ? sp.view : 'board';
  const askedWeek = Number(sp.week);
  const week = Number.isInteger(askedWeek) && askedWeek > 0 ? askedWeek : null;

  const session = await createSupabaseServerClient();
  const [boardRes, teamsRes] = await Promise.all([
    session.rpc('book_week_board', { p_week: week }),
    supabase.from('teams').select('id, abbrev, name').order('abbrev'),
  ]);

  const board = boardRes.data || null;
  const teams = teamsRes.data || [];
  let extra = {};
  let extraError = null;

  if (!boardRes.error && board) {
    if (view === 'bets') {
      const r = await session.rpc('book_my_bets', { p_season: null });
      if (r.error) extraError = r.error.message;
      extra.bets = r.data || [];
    } else if (view === 'account' && board.account) {
      const bal = Number(board.account.balance);
      if (bal > 0) {
        const r = await session.rpc('book_cash_out_preview', { p_amount: bal });
        if (!r.error && r.data && r.data.ok) extra.endNow = r.data;
      }
    } else if (view === 'records') {
      const [a, g] = await Promise.all([
        session.rpc('book_ats', { p_season: null }),
        session.rpc('book_ats_games', { p_season: null }),
      ]);
      if (a.error) extraError = a.error.message;
      else if (g.error) extraError = g.error.message;
      extra.ats = a.data || [];
      extra.games = g.data || [];
    } else if (view === 'house') {
      const r = await session.rpc('book_house_history', { p_season: null });
      if (r.error) extraError = r.error.message;
      extra.history = r.data || [];
    }
  }

  return (
    <main className="page bk-page">
      <h1 className="bk-sr">The Book</h1>
      {boardRes.error || !board ? (
        <p className="empty-note">
          Couldn&apos;t open the Book: {boardRes.error ? boardRes.error.message : 'it sent back nothing'}
        </p>
      ) : (
        <BookView
          key={view + ':' + (board.week || '') + ':' + (sp.team || '') + ':' + (sp.f || '')}
          view={view}
          board={board}
          teams={teams}
          teamsError={teamsRes.error ? teamsRes.error.message : null}
          extra={extra}
          extraError={extraError}
          team={typeof sp.team === 'string' ? sp.team.toUpperCase() : null}
          filter={typeof sp.f === 'string' ? sp.f : 'all'}
          observer={!viewer.owner}
        />
      )}
    </main>
  );
}
