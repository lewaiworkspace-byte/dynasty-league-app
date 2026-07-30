import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';

export const revalidate = 0;
export const metadata = { title: 'Auction Results' };

function formatMoney(n) {
  const v = Number(n) || 0;
  return `$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
}

const READ_PAGE_SIZE = 1000; // PostgREST's default row ceiling

// PostgREST caps an unbounded select at 1,000 rows and returns no error, so
// this has to page explicitly. This view is one row per bid per contract
// year, which reaches the ceiling at ordinary tier sizes -- 20 players x 10
// teams bidding 5-year deals is exactly 1,000. Truncation here would drop
// year-by-year detail off the published results page with nothing to show
// that anything was missing.
//
// Ordered so the pages can't overlap or skip rows; without an ORDER BY the
// row order across pages isn't guaranteed.
async function fetchAllResultYears(supabase, tierId) {
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('auction_tier_result_years')
      .select('*')
      .eq('tier_id', tierId)
      .order('bid_id')
      .order('contract_year_number')
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < READ_PAGE_SIZE) break;
    from += READ_PAGE_SIZE;
  }
  return all;
}

// Deliberately separate from the /bids listing rather than folded into it --
// /bids links here for verified tiers via a small additive query rather than
// this page's content living inside that file.
export default async function AuctionResultsPage({ params }) {
  const { tierId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tier } = await supabase
    .from('auction_tiers')
    .select('id, name, season_year, verified_at')
    .eq('id', tierId)
    .maybeSingle();

  if (!tier) {
    return <div className="page"><p className="form-error">No such tier.</p></div>;
  }

  if (!tier.verified_at) {
    return (
      <div className="page">
        <p className="page-actions"><a href="/">← Home</a> · <a href="/bids">← Auction</a></p>
        <h1 className="team-name">{tier.name}</h1>
        <p className="empty-note">
          Results for this tier aren't published yet. Bids stay sealed until the commissioner has
          resolved any cap or cash issues and verified the results.
        </p>
      </div>
    );
  }

  // Reads from the anonymized views -- the raw bids table stays sealed, so
  // there's no path here that could leak a losing bidder's identity.
  const [{ data: results }, years] = await Promise.all([
    supabase
      .from('auction_tier_results')
      .select('*')
      .eq('tier_id', tierId)
      .order('player_name'),
    fetchAllResultYears(supabase, tierId),
  ]);

  const yearsByBid = new Map();
  (years || []).forEach((y) => {
    if (!yearsByBid.has(y.bid_id)) yearsByBid.set(y.bid_id, []);
    yearsByBid.get(y.bid_id).push(y);
  });

  const byPlayer = new Map();
  (results || []).forEach((r) => {
    if (!byPlayer.has(r.player_id)) {
      byPlayer.set(r.player_id, { name: r.player_name, position: r.position, bids: [] });
    }
    byPlayer.get(r.player_id).bids.push(r);
  });

  const players = [...byPlayer.values()].map((p) => ({
    ...p,
    bids: p.bids.sort((a, b) => Number(b.total_ppv) - Number(a.total_ppv)),
  }));

  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a> · <a href="/bids">← Auction</a></p>
      <p className="eyebrow">{tier.season_year} · Verified {new Date(tier.verified_at).toLocaleDateString()}</p>
      <h1 className="team-name">{tier.name} — Results</h1>
      <p className="subhead">
        Every bid is shown in full. Winning teams are named; losing bids stay anonymous.
      </p>

      {players.length === 0 ? (
        <p className="empty-note">No bids were submitted in this tier.</p>
      ) : (
        players.map((p, pi) => (
          <div key={pi} style={{ marginBottom: 32 }}>
            <h2 className="section-heading" style={{ marginBottom: 6 }}>
              {p.name} <span className="empty-note">{p.position}</span>
            </h2>
            <table className="ledger year-table">
              <thead>
                <tr>
                  <th>Bidder</th>
                  <th style={{ textAlign: 'right' }}>Total PPV</th>
                  <th style={{ textAlign: 'right' }}>Years</th>
                  <th style={{ textAlign: 'right' }}>Signing Bonus</th>
                  <th>Year-by-Year (G / NG / RB)</th>
                </tr>
              </thead>
              <tbody>
                {p.bids.map((b) => {
                  const detail = (yearsByBid.get(b.bid_id) || []).sort(
                    (x, y) => x.contract_year_number - y.contract_year_number
                  );
                  return (
                    <tr key={b.bid_id}>
                      <td className="team-name" style={{ color: b.is_winner ? 'var(--accent-gold)' : 'var(--text-dim)' }}>
                        {b.is_winner ? b.team_name : 'Anonymous'}
                        {b.status === 'passed_over' && ' (passed over)'}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: b.is_winner ? 600 : 400 }}>
                        {Number(b.total_ppv ?? 0).toFixed(2)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {b.total_years}{b.void_years > 0 ? ` +${b.void_years}v` : ''}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{formatMoney(b.signing_bonus_total)}</td>
                      <td className="num" style={{ fontSize: 13 }}>
                        {detail.map((d) => (
                          <div key={d.contract_year_number}>
                            {d.league_season_year}
                            {d.is_void_year ? ' (void)' : ''}: {formatMoney(d.guaranteed_salary)} /{' '}
                            {formatMoney(d.non_guaranteed_salary)} / {formatMoney(d.roster_bonus)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
