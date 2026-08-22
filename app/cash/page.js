import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { formatDate } from '../../lib/formatDate';
import { formatMoney } from '../../lib/formatMoney';

export const revalidate = 0;

export const metadata = { title: 'My Cash Account' };

export default async function CashAuditPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/cash');

  const supabase = await createSupabaseServerClient();
  const seasonYear = 2026;

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
            <div className="num">{formatMoney(balance.cash_spent)}</div>
          </div>
          <div>
            <div className="empty-note">Available</div>
            <div
              className={'num ' + (Number(balance.cash_available) < 0 ? 'negative' : 'positive')}
              style={{ fontWeight: 600 }}
            >
              {formatMoney(balance.cash_available)}
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
