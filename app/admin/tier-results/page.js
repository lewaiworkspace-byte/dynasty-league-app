import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import { formatDateTime } from '../../../lib/formatDate';

export const revalidate = 0;
export const metadata = { title: 'Tier Results' };

function tierState(tier) {
  if (tier.verified_at) return { label: 'Verified & published', color: 'var(--accent-gold)' };
  if (tier.resolved_at) return { label: 'Evaluated — awaiting verification', color: 'var(--accent-rust)' };
  if (new Date(tier.closes_at) <= new Date()) return { label: 'Closed — ready to evaluate', color: 'var(--accent-rust)' };
  if (new Date(tier.opens_at) <= new Date()) return { label: 'Open for bidding', color: 'var(--text-dim)' };
  return { label: 'Not yet open', color: 'var(--text-dim)' };
}

export default async function TierResultsIndex() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/tier-results');
  if (!me.is_commissioner) redirect('/');

  const supabase = await createSupabaseServerClient();
  const { data: tiers } = await supabase
    .from('auction_tiers')
    .select('id, season_year, tier_number, name, opens_at, closes_at, resolved_at, verified_at')
    .order('season_year', { ascending: false })
    .order('tier_number', { ascending: false });

  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a> · <a href="/bids">Auction</a></p>
      <p className="eyebrow">Commissioner</p>
      <h1 className="team-name">Tier Results</h1>

      {!tiers || tiers.length === 0 ? (
        <p className="empty-note">
          No tiers exist yet. <a href="/admin/new-tier">Build one</a>.
        </p>
      ) : (
        <table className="ledger year-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Season</th>
              <th>Closes</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => {
              const s = tierState(t);
              return (
                <tr key={t.id}>
                  <td className="team-name">{t.name}</td>
                  <td className="num">{t.season_year}</td>
                  <td>{formatDateTime(t.closes_at)}</td>
                  <td style={{ color: s.color }}>{s.label}</td>
                  <td><a href={'/admin/tier-results/' + t.id}>Manage →</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
