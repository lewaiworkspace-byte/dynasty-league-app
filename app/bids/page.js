import { supabase } from '../../lib/supabaseClient';

// Bid counts and tier windows must never be stale
export const revalidate = 0;

function formatWindow(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function interestTag(count) {
  if (count >= 5) return { label: 'Highly Competitive', color: 'var(--accent-rust)' };
  if (count >= 2) return { label: 'Heating Up', color: 'var(--accent-gold)' };
  return { label: 'Low Interest', color: 'var(--text-dim)' };
}

export default async function BidsPage() {
  const now = new Date().toISOString();

  const [{ data: tiers, error: tiersError }, { data: config }] = await Promise.all([
    supabase
      .from('auction_tiers')
      .select('id, season_year, tier_number, name, opens_at, closes_at')
      .is('resolved_at', null)
      .order('opens_at'),
    supabase.from('league_config').select('league_short_name').eq('id', true).single(),
  ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

  if (tiersError) {
    return (
      <main className="page">
        <p className="subhead"><a href="/">&larr; Home</a></p>
        <p className="eyebrow">{leagueName} · Free Agency</p>
        <h1>Blind Bid Auction</h1>
        <p className="subhead">Couldn&apos;t load tiers: {tiersError.message}</p>
      </main>
    );
  }

  const activeTier = (tiers || []).find((t) => t.opens_at <= now && t.closes_at >= now);
  const upcomingTiers = (tiers || []).filter((t) => t.opens_at > now);

  // No tier open right now
  if (!activeTier) {
    return (
      <main className="page">
        <p className="subhead"><a href="/">&larr; Home</a></p>
        <p className="eyebrow">{leagueName} · Free Agency</p>
        <h1>Blind Bid Auction</h1>
        <p className="subhead">No bidding tier is currently open.</p>
        {upcomingTiers.length > 0 && (
          <div className="assistant-box">
            <p className="empty-note" style={{ marginTop: 0 }}>Upcoming tiers:</p>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14 }}>
              {upcomingTiers.map((t) => (
                <li key={t.id}>
                  {t.name || `Tier ${t.tier_number}`} — opens {formatWindow(t.opens_at)}, closes{' '}
                  {formatWindow(t.closes_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    );
  }

  // Active tier: load its players and the anonymous interest counts
  const [{ data: tierPlayers, error: tpError }, { data: interest }] = await Promise.all([
    supabase
      .from('auction_tier_players')
      .select('player_id, players(id, full_name, position, nfl_team)')
      .eq('tier_id', activeTier.id),
    supabase.from('auction_interest').select('player_id, bid_count').eq('tier_id', activeTier.id),
  ]);

  const countByPlayer = new Map((interest || []).map((r) => [r.player_id, r.bid_count]));

  const rows = (tierPlayers || [])
    .map((tp) => ({
      playerId: tp.player_id,
      player: tp.players,
      bidCount: countByPlayer.get(tp.player_id) || 0,
    }))
    .sort((a, b) => (a.player?.full_name || '').localeCompare(b.player?.full_name || ''));

  return (
    <main className="page">
      <p className="subhead"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">{leagueName} · Free Agency · {activeTier.season_year}</p>
      <h1>{activeTier.name || `Tier ${activeTier.tier_number}`}</h1>
      <p className="subhead">
        Bidding open now — closes {formatWindow(activeTier.closes_at)}. Bid counts show how
        contested each player is; bid amounts and bidders stay sealed until the tier resolves.
      </p>

      {/* TODO(auth): once login is live, this page stays public but the Submit Bid
          links should route through login for anyone not signed in. */}

      {tpError && <p className="form-error">Couldn&apos;t load players: {tpError.message}</p>}

      <table className="ledger">
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>NFL Team</th>
            <th style={{ textAlign: 'right' }}>Bids Submitted</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId}>
              <td className="team-name">{r.player?.full_name || 'Unknown Player'}</td>
              <td>{r.player?.position || '—'}</td>
              <td>{r.player?.nfl_team || 'FA'}</td>
              <td className="num" style={{ textAlign: 'right' }}>
                {r.bidCount}
                <span
                  className="void-tag"
                  style={{ marginLeft: 8, color: interestTag(r.bidCount).color }}
                >
                  {interestTag(r.bidCount).label}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <a href={`/bids/${activeTier.id}/${r.playerId}`} className="btn">
                  Submit Bid
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="empty-note">
          This tier has no players assigned yet — the commissioner adds them from the tier
          builder.
        </p>
      )}
    </main>
  );
}
