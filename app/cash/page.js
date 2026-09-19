import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { formatDate } from '../../lib/formatDate';
import { formatCost, formatMoney, formatRoom } from '../../lib/formatMoney';

export const revalidate = 0;

export const metadata = { title: 'My Cash Account' };

// ---------------------------------------------------------------------------
// ROUNDING DIRECTION -- R-12, applied here in phase 2E-2 (September 19 2026).
//
// The strip holds four figures and only two of them are directional.
//
//   Starting Cash    formatMoney  the budget the league granted at the start
//                                 of the season. Settled history; nobody is
//                                 checked against it.
//   Adjustments      formatMoney  a signed total of changes that have already
//                                 happened. R-12 is explicit that a delta has
//                                 no direction that flatters.
//   Cash Spent       formatCost   R-12 names "cash spent". Rounds up.
//   Available        formatRoom   what is left to spend, and the one figure on
//                                 this page an owner acts on. Rounds down, so
//                                 it never reads higher than the real balance
//                                 and an overdraft never reads as zero.
//
// The four will not always tie: start + adjustments - spent can miss the
// displayed Available by a dollar. R-12 accepts that in as many words -- "a
// column of rounded rows will sometimes miss its rounded total" -- and the
// alternative is an Available figure that reads high, which is the one failure
// this page cannot afford. The database holds all four exactly.
//
// TRANSACTION AMOUNTS stay formatMoney: each row is a movement that already
// happened, of a size the league recorded, and no owner budgets against a
// single line of their own history.
// ---------------------------------------------------------------------------

export default async function CashAuditPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/cash');

  const supabase = await createSupabaseServerClient();

  // THE SEASON IS READ, NEVER WRITTEN IN. This page said `2026` until
  // September 16, 2026, which would have kept showing last season's account
  // from the March 1, 2027 rollover onward. league_config is public-read; if the
  // read fails the page says so instead of guessing a year.
  const { data: config, error: configError } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .maybeSingle();
  const seasonYear = config ? config.current_season_year : null;
  if (!seasonYear) {
    return (
      <div className="page">
        <p className="page-actions"><a href="/">← Home</a></p>
        <h1 className="team-name">Cash Account</h1>
        <p className="form-error">
          The current season could not be read
          {configError ? ': ' + configError.message : ''}. Nothing is shown rather than the wrong
          season&apos;s account.
        </p>
      </div>
    );
  }

  const [{ data: team }, { data: balance }, { data: transactions }] = await Promise.all([
    supabase.from('teams').select('name').eq('id', me.team_id).maybeSingle(),
    supabase
      .from('team_cash_available')
      .select('*')
      .eq('team_id', me.team_id)
      .eq('season_year', seasonYear)
      .maybeSingle(),
    // RLS scopes this to the logged-in owner's own team automatically --
    // no explicit team filter needed, but included anyway for clarity.
    supabase
      .from('team_cash_transactions')
      .select('id, amount, category, note, created_at')
      .eq('team_id', me.team_id)
      .eq('season_year', seasonYear)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a></p>
      <p className="eyebrow">{team?.name || 'My Team'}</p>
      <h1 className="team-name">Cash Account — {seasonYear}</h1>

      {balance ? (
        <div className="stat-strip">
          <div>
            <div className="empty-note">Starting Cash</div>
            <div className="num">{formatMoney(balance.starting_cash)}</div>
          </div>
          <div>
            <div className="empty-note">Adjustments</div>
            <div className="num">{formatMoney(balance.total_adjustments)}</div>
          </div>
          <div>
            <div className="empty-note">Cash Spent</div>
            <div className="num">{formatCost(balance.cash_spent)}</div>
          </div>
          <div>
            <div className="empty-note">Available</div>
            <div
              className={'num ' + (Number(balance.cash_available) < 0 ? 'negative' : 'positive')}
              style={{ fontWeight: 600 }}
            >
              {formatRoom(balance.cash_available)}
            </div>
          </div>
        </div>
      ) : (
        <p className="empty-note">No cash budget has been set for your team this season yet.</p>
      )}

      <h2 className="section-heading">Transaction History</h2>
      {(transactions || []).length === 0 ? (
        <p className="empty-note">
          No adjustments have been made to your account — your available cash is your starting
          budget minus contract spending.
        </p>
      ) : (
        <table className="ledger year-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td>{formatDate(tx.created_at)}</td>
                <td>{tx.category.replace('_', ' ')}</td>
                <td
                  className={'num ' + (Number(tx.amount) < 0 ? 'negative' : 'positive')}
                  style={{ textAlign: 'right' }}
                >
                  {formatMoney(tx.amount)}
                </td>
                <td className="empty-note">{tx.note || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
