import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import CashForm from './CashForm';
import { formatDate } from '../../../lib/formatDate';
import { formatMoney } from '../../../lib/formatMoney';

export const revalidate = 0;

export const metadata = { title: 'Manage Owner Cash' };

export default async function AdminCashPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/cash');
  // Widened to co-commissioners August 25, 2026.
  //
  // NOTE: the every-team ledger read below goes through the SESSION client,
  // so what a co-commissioner actually sees is decided by RLS on
  // team_cash_transactions, not by this redirect. If that policy still names
  // the commissioner alone, a co-commissioner reaches the page and sees an
  // empty or own-team-only ledger rather than a refusal. Verify in the
  // browser as a co-commissioner before trusting this page.
  if (!isCommissionerOrCo(me)) redirect('/');

  const supabase = await createSupabaseServerClient();
  const seasonYear = 2026;

  const [{ data: teams }, { data: balances }, { data: transactions }] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('team_cash_available').select('*').eq('season_year', seasonYear),
    // Commissioner sees every team's ledger -- RLS allows it for the
    // commissioner specifically.
    supabase
      .from('team_cash_transactions')
      .select('id, team_id, amount, category, note, created_at')
      .eq('season_year', seasonYear)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const balanceByTeam = new Map((balances || []).map((b) => [b.team_id, b]));
  const nameByTeam = new Map((teams || []).map((t) => [t.id, t.name]));

  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a></p>
      <p className="eyebrow">Commissioner</p>
      <h1 className="team-name">Manage Owner Cash — {seasonYear}</h1>

      <h2 className="section-heading">Current Balances</h2>
      <table className="ledger year-table">
        <thead>
          <tr>
            <th>Team</th>
            <th style={{ textAlign: 'right' }}>Starting</th>
            <th style={{ textAlign: 'right' }}>Adjustments</th>
            <th style={{ textAlign: 'right' }}>Spent</th>
            <th style={{ textAlign: 'right' }}>Available</th>
          </tr>
        </thead>
        <tbody>
          {(teams || []).map((t) => {
            const b = balanceByTeam.get(t.id);
            return (
              <tr key={t.id}>
                <td className="team-name">{t.name}</td>
                <td className="num" style={{ textAlign: 'right' }}>{b ? formatMoney(b.starting_cash) : '—'}</td>
                <td className="num" style={{ textAlign: 'right' }}>{b ? formatMoney(b.total_adjustments) : '—'}</td>
                <td className="num" style={{ textAlign: 'right' }}>{b ? formatMoney(b.cash_spent) : '—'}</td>
                <td
                  className={'num ' + (b && Number(b.cash_available) < 0 ? 'negative' : 'positive')}
                  style={{ textAlign: 'right', fontWeight: 600 }}
                >
                  {b ? formatMoney(b.cash_available) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="section-heading">Record a Transaction</h2>
      <CashForm teams={teams || []} seasonYear={seasonYear} />

      <h2 className="section-heading">Recent Transactions</h2>
      {(transactions || []).length === 0 ? (
        <p className="empty-note">No transactions recorded yet.</p>
      ) : (
        <table className="ledger year-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Team</th>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td>{formatDate(tx.created_at)}</td>
                <td className="team-name">{nameByTeam.get(tx.team_id) || '?'}</td>
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
