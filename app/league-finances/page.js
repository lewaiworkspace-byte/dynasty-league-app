import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { formatDate } from '../../lib/formatDate';
import { formatCost, formatMoney } from '../../lib/formatMoney';

export const revalidate = 0;

export const metadata = { title: 'League Finances' };

// LEAGUE FINANCES (commissioner ruling PF-1 / PF-3, September 16 2026).
//
// SIGNED-IN OWNERS ONLY, ALL TEAMS ITEMISED, NOT PUBLIC. Any logged-in owner sees every
// fine in the league, named by team. A signed-out visitor is sent to /login -- the two
// views this page reads, league_fines and league_fund, carry no anon grant, so a public
// version of this page could only ever render empty.
//
// WHAT IS HERE TODAY: the League Fund, which is fines only for now. Every fine is a
// team_cash_transactions row with category 'fine' and a fine_kind -- 'compliance' (the
// cure-deadline fines) or 'poach' (Rule 5.17's $75, paid by the team that opened a poach
// window when the player stays on his rookie contract). The database refuses a fine
// without a kind, so the Kind column never has to guess. The commissioner will build out
// the rest of the page later; do not invent sections for it.
//
// Nothing here writes. Fines are posted by the database (fines_impose_due and the poach
// award engine), never from a form.
//
// ROUNDING DIRECTION -- R-12, applied here in phase 2E-2 (September 19 2026). The two
// figures on this page pull in opposite directions and only one of them moved.
//
//   A FINE IS A COST. R-12 names it: "a charge, a salary, dead money, cash spent, a bid,
//   a FINE." It rounds up, so what a team owes the league can never read low. Rule 5.17's
//   is $75 flat and rounds to itself; the compliance fines are the ones that can carry a
//   fraction.
//
//   THE LEAGUE FUND IS NOT ROOM, and calling it room would be the easy mistake. It is not
//   a budget anybody spends against -- no team is checked against it and the commissioner
//   does not draw from it on this page -- so it is a ledger balance and stays formatMoney.
//   If the fund ever becomes something the league PAYS OUT of, it becomes room and rounds
//   down; that is a ruling, not a refactor.
const KIND_LABELS = {
  compliance: 'Compliance',
  poach: 'Poaching',
};

export default async function LeagueFinancesPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/league-finances');

  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name, current_season_year')
    .eq('id', true)
    .single();
  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  const [{ data: fund, error: fundErr }, { data: fines, error: finesErr }] = await Promise.all([
    supabase
      .from('league_fund')
      .select('season_year, fines, balance')
      .eq('season_year', season)
      .maybeSingle(),
    // SR-29: filtered by season. Ten teams will not produce a thousand fines in a season.
    supabase
      .from('league_fines')
      .select('id, created_at, team_name, fine_amount, fine_kind, note')
      .eq('season_year', season)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const rows = fines || [];

  return (
    <main className="page">
      <p className="page-actions"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">{leagueName} &middot; {season}</p>
      <h1>League Finances</h1>
      <p className="subhead">
        Money paid into the league rather than spent on players. For now that is fines;
        more is to come.
      </p>

      {fundErr && <div className="form-error">{fundErr.message}</div>}
      {finesErr && <div className="form-error">{finesErr.message}</div>}

      <div className="stat-strip">
        <div>
          <div className="empty-note">League Fund &mdash; {season}</div>
          <div className="num" style={{ fontWeight: 600 }}>
            {formatMoney(fund ? fund.balance : 0)}
          </div>
        </div>
        <div>
          {/* league_fund.fines is a COUNT of fine rows; balance is the dollars. */}
          <div className="empty-note">Fines this season</div>
          <div className="num">{fund ? fund.fines : 0}</div>
        </div>
      </div>

      <h2 className="section-heading">Fines</h2>
      {!finesErr && rows.length === 0 && (
        <p className="empty-note">No fines have been posted this season.</p>
      )}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Team</th>
                <th>Kind</th>
                <th className="col-num">Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function (r) {
                return (
                  <tr key={r.id}>
                    <td data-label="Date">{formatDate(r.created_at)}</td>
                    <td data-label="Team">{r.team_name}</td>
                    <td data-label="Kind">{KIND_LABELS[r.fine_kind] || r.fine_kind}</td>
                    <td className="col-num" data-label="Amount">{formatCost(r.fine_amount)}</td>
                    <td data-label="Note">{r.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="row-note" style={{ marginTop: 24 }}>
        More is to come on this page. A fine also appears on the fined team&apos;s own cash
        account.
      </p>
    </main>
  );
}
