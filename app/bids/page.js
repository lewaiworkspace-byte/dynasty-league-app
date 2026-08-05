import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { cancelDelegation } from './delegationActions';

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

const MODE_LABELS = {
  execute: 'Execute',
  propose: 'Propose',
  discretionary: 'Discretionary',
};

function formatMoney(n) {
  const v = Number(n) || 0;
  return '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
}

// Renders for a logged-in owner viewing the currently-open tier only.
// Nothing at all for a logged-out visitor or an owner whose team_owners
// row isn't linked -- teamOwner null covers both cases, per
// getCurrentTeamOwner()'s own contract. This is the one part of /bids that
// reads the session; the rest of the page stays on the anon client so it
// stays public.
function DelegationPanel({ activeTier, teamOwner, delegationRows, playerNames }) {
  if (!teamOwner) return null;

  const rows = delegationRows || [];

  if (rows.length === 0) {
    return (
      <div className="assistant-box" style={{ marginBottom: 32 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          Too busy to bid live? Set up Auto-Bid for this tier.
        </p>
        <p className="empty-note" style={{ marginTop: 8, marginBottom: 16 }}>
          Set a target for each player you're interested in and let it bid on your behalf when the
          tier closes.
        </p>
        <a href={'/bids/' + activeTier.id + '/delegate'} className="btn">
          Set Up Auto-Bid
        </a>
      </div>
    );
  }

  const mode = rows[0] ? rows[0].mode : null;

  const statusCounts = {};
  rows.forEach((d) => {
    const s = d.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  // Ceiling fields are read defensively -- if the delegation row shape
  // doesn't carry them the way this expects, the panel just omits the
  // ceiling line rather than erroring.
  const withMaxBids = rows.find((d) => d.max_bids !== null && d.max_bids !== undefined);
  const withMaxCash = rows.find((d) => d.max_total_cash !== null && d.max_total_cash !== undefined);
  const withMaxCap = rows.find((d) => d.max_total_cap !== null && d.max_total_cap !== undefined);

  const ceilingParts = [];
  if (withMaxBids) {
    ceilingParts.push('max ' + withMaxBids.max_bids + ' bid' + (withMaxBids.max_bids === 1 ? '' : 's'));
  }
  if (withMaxCash) {
    ceilingParts.push('max ' + formatMoney(withMaxCash.max_total_cash) + ' cash');
  }
  if (withMaxCap) {
    ceilingParts.push('max ' + formatMoney(withMaxCap.max_total_cap) + ' cap');
  }

  return (
    <div className="assistant-box" style={{ marginBottom: 32 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        Auto-Bid — {MODE_LABELS[mode] || mode || 'Unknown mode'}
      </p>
      <p className="empty-note" style={{ marginTop: 8, marginBottom: 4 }}>
        {rows.length + ' player' + (rows.length === 1 ? '' : 's') + ' queued · '}
        {ceilingParts.length > 0
          ? 'Worst-case exposure: ' + ceilingParts.join(', ')
          : 'No exposure ceiling set'}
      </p>
      <p className="empty-note" style={{ marginTop: 4, marginBottom: 16 }}>
        {Object.keys(statusCounts)
          .map((s) => s + ': ' + statusCounts[s])
          .join(' · ')}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <a href={'/bids/' + activeTier.id + '/delegate'} className="btn">
          Edit
        </a>
      </div>

      <table className="ledger year-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="team-name">{playerNames.get(d.player_id) || 'Unknown Player'}</td>
              <td>{d.status || 'unknown'}</td>
              <td style={{ textAlign: 'right' }}>
                <form action={cancelDelegation.bind(null, d.id)}>
                  <button type="submit" className="btn">
                    Cancel
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function BidsPage() {
  const now = new Date().toISOString();

  const [{ data: tiers, error: tiersError }, { data: config }, { data: verifiedTiers }, teamOwner] =
    await Promise.all([
      supabase
        .from('auction_tiers')
        .select('id, season_year, tier_number, name, opens_at, closes_at')
        .is('resolved_at', null)
        .order('opens_at'),
      supabase.from('league_config').select('league_short_name').eq('id', true).single(),
      // Separate query: the tier list above deliberately excludes resolved
      // tiers, so a verified tier never appears in it. Published results are
      // their own thing rather than a filter on that list.
      supabase
        .from('auction_tiers')
        .select('id, season_year, tier_number, name, verified_at')
        .not('verified_at', 'is', null)
        .order('verified_at', { ascending: false }),
      // Cheap and safe for a logged-out visitor -- returns null rather than
      // throwing. Fetched here so it's available to every branch below,
      // even though only the active-tier branch actually uses it.
      getCurrentTeamOwner(),
    ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

  const publishedResults = (verifiedTiers || []).length > 0 && (
    <section style={{ marginTop: 32 }}>
      <h2 className="section-heading">Published Results</h2>
      <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14 }}>
        {verifiedTiers.map((t) => (
          <li key={t.id} style={{ marginBottom: 6 }}>
            {(t.name || 'Tier ' + t.tier_number) + ' (' + t.season_year + ') —'}{' '}
            <a href={'/bids/results/' + t.id}>View Results</a>
          </li>
        ))}
      </ul>
    </section>
  );

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
                  {(t.name || 'Tier ' + t.tier_number) + ' — opens ' + formatWindow(t.opens_at) + ', closes '}
                  {formatWindow(t.closes_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {publishedResults}
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

  const playerNames = new Map(
    (tierPlayers || []).map((tp) => [tp.player_id, tp.players?.full_name || 'Unknown Player'])
  );

  // Own-team delegation rows for this tier, read through the session-aware
  // client so RLS applies as this owner -- bid_delegations' RLS is
  // own-team-only with no commissioner clause, deliberately, since the
  // table exposes willingness-to-pay ceilings and the commissioner is a
  // competing owner. The admin client is never used here.
  let delegationRows = null;
  if (teamOwner) {
    const sessionSupabase = await createSupabaseServerClient();
    const { data } = await sessionSupabase
      .from('bid_delegations')
      .select('*')
      .eq('tier_id', activeTier.id)
      .eq('team_id', teamOwner.team_id)
      .order('priority');
    delegationRows = data;
  }

  return (
    <main className="page">
      <p className="subhead"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">{leagueName} · Free Agency · {activeTier.season_year}</p>
      <h1>{activeTier.name || 'Tier ' + activeTier.tier_number}</h1>
      <p className="subhead">
        Bidding open now — closes {formatWindow(activeTier.closes_at)}. Bid counts show how
        contested each player is; bid amounts and bidders stay sealed until the tier resolves.
      </p>

      <DelegationPanel
        activeTier={activeTier}
        teamOwner={teamOwner}
        delegationRows={delegationRows}
        playerNames={playerNames}
      />

      {/* This page stays public; the Submit Bid links land on
          /bids/[tierId]/[playerId], which routes anyone not signed in
          through /login itself. */}

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
                <a href={'/bids/' + activeTier.id + '/' + r.playerId} className="btn">
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

      {publishedResults}
    </main>
  );
}
