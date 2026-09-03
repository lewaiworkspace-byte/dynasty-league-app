import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { formatDate } from '../../../../lib/formatDate';
import { formatMoney } from '../../../../lib/formatMoney';

export const revalidate = 0;
export const metadata = { title: 'Auction Results' };

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

  // Reads from the published-results views. League decision of September 3,
  // 2026: results are TRANSPARENT -- every bid on a verified tier names its
  // team, winning or losing. What stays sealed is anything on a tier that is
  // not yet verified, and withdrawn bids; neither reaches these views.
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

  const exportBase = '/bids/results/' + tier.id + '/export?format=';

  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a> · <a href="/bids">← Auction</a></p>
      <p className="eyebrow">{tier.season_year} · Verified {formatDate(tier.verified_at)}</p>
      <h1 className="team-name">{tier.name} — Results</h1>
      <p className="subhead">
        Every bid is shown in full, with the bidding team named. Winners are highlighted.
      </p>

      {/* Public, like the page itself -- the exported data is already published here.
          NOTE ON FORMATS: the figures on this page are rounded to whole dollars, as
          they have been since the page was written. The CSV and XLSX downloads
          deliberately carry raw view values so results can be recomputed against.
          That split is intentional -- the page is the human-readable record and the
          downloads are the machine-readable one -- and it predates lib/formatMoney.
          Changing it means deciding what a published result IS, across all three
          formats at once, not adjusting one of them. */}
      <p className="page-actions">
        <a className="btn" href={exportBase + 'csv'}>Download CSV</a>
        <a className="btn" href={exportBase + 'xlsx'}>Download Excel</a>
        <a className="btn" href={exportBase + 'pdf'}>Download PDF</a>
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
                  <th style={{ textAlign: 'right' }}>Option Bonuses</th>
                  <th>Year-by-Year (G / NG / RB / Option)</th>
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
                        {b.team_name}
                        {b.is_winner && ' (winner)'}
                        {b.status === 'passed_over' && ' (passed over)'}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: b.is_winner ? 600 : 400 }}>
                        {Number(b.total_ppv ?? 0).toFixed(2)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {b.total_years}{b.void_years > 0 ? ' +' + b.void_years + 'v' : ''}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{formatMoney(b.signing_bonus_total)}</td>
                      {/* Option bonuses are a schedule, not a single figure: each one
                          is exercised in a named season under 5.20(c). The view
                          carries both the total and the schedule; the schedule is
                          what an owner needs to read the deal. */}
                      <td className="num" style={{ textAlign: 'right', fontSize: 13 }}>
                        {Number(b.option_bonus_total || 0) > 0 ? (
                          <>
                            <div>{formatMoney(b.option_bonus_total)} total</div>
                            {(b.option_bonuses || []).map((ob) => (
                              <div key={ob.exercise_season_year} style={{ color: 'var(--text-dim)' }}>
                                {ob.exercise_season_year}: {formatMoney(ob.bonus_amount)}
                              </div>
                            ))}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>—</span>
                        )}
                      </td>
                      <td className="num" style={{ fontSize: 13 }}>
                        {detail.map((d) => (
                          <div key={d.contract_year_number}>
                            {d.league_season_year}
                            {d.is_void_year ? ' (void)' : ''}: {formatMoney(d.guaranteed_salary)} /{' '}
                            {formatMoney(d.non_guaranteed_salary)} / {formatMoney(d.roster_bonus)} /{' '}
                            {formatMoney(d.option_bonus)}
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
