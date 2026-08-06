import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import DelegationPanelActions from './DelegationPanelActions';
import YourBidsPanel from './YourBidsPanel';
import { formatDateTime, formatShortDateTime } from '../../lib/formatDate';

// Bid counts and tier windows must never be stale
export const revalidate = 0;

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

function hasValue(v) {
  return v !== null && v !== undefined;
}

// Renders for a logged-in owner viewing the currently-open tier only.
// Nothing at all for a logged-out visitor or an owner whose team_owners
// row isn't linked -- teamOwner null covers both cases, per
// getCurrentTeamOwner()'s own contract. This is the one part of /bids that
// reads the session; the rest of the page stays on the anon client so it
// stays public.
function DelegationPanel({ activeTier, teamOwner, delegationRows, settings, playerNames, tierIsOpen }) {
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

  // The exposure ceiling lives on bid_delegation_settings, one row per
  // (tier_id, team_id) -- NOT on the individual delegation rows. A missing
  // row is a real and expected state: it means this owner has authored
  // delegations but has never armed them, so there is no ceiling and
  // nothing has fired.
  const ceilingParts = [];
  if (settings) {
    if (hasValue(settings.max_bids)) {
      ceilingParts.push('max ' + settings.max_bids + ' bid' + (Number(settings.max_bids) === 1 ? '' : 's'));
    }
    if (hasValue(settings.max_total_cash)) {
      ceilingParts.push('max ' + formatMoney(settings.max_total_cash) + ' cash');
    }
    if (hasValue(settings.max_total_cap)) {
      ceilingParts.push('max ' + formatMoney(settings.max_total_cap) + ' cap');
    }
  }

  // armed_at is the authoritative "has this actually fired?" signal --
  // better than any per-row status count, since it records the moment the
  // slate was submitted rather than the state each delegation happens to
  // be sitting in.
  const armedAt = settings && settings.armed_at ? settings.armed_at : null;

  return (
    <div className="assistant-box" style={{ marginBottom: 32 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        Auto-Bid — {MODE_LABELS[mode] || mode || 'Unknown mode'}
      </p>

      <p
        className="empty-note"
        style={{ marginTop: 8, marginBottom: 4, color: armedAt ? 'var(--accent-gold)' : 'var(--text-dim)' }}
      >
        {armedAt
          ? 'Armed ' + formatDateTime(armedAt) + ' — these bids are submitted and sealed.'
          : 'Not armed yet — nothing has been submitted for this tier.'}
      </p>

      <p className="empty-note" style={{ marginTop: 4, marginBottom: 4 }}>
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

      {/* The rows table is a client component purely so the Cancel action
          can be wrapped in a try/catch -- see DelegationPanelActions.js.
          Everything above stays server-rendered. */}
      <DelegationPanelActions
        tierId={activeTier.id}
        tierIsOpen={tierIsOpen}
        rows={rows.map((d) => ({
          id: d.id,
          playerId: d.player_id,
          playerName: playerNames.get(d.player_id) || 'Unknown Player',
          status: d.status,
        }))}
      />

      <p className="empty-note" style={{ marginTop: 12 }}>
        Auto-Bid entries that have already been submitted are real sealed bids. Cancelling here
        would only remove the Auto-Bid entry, not the bid, so revise the bid directly instead.
      </p>
    </div>
  );
}

export default async function BidsPage() {
  const now = new Date().toISOString();

  const [{ data: tiers, error: tiersError }, { data: config }, { data: verifiedTiers }, teamOwner] =
    await Promise.all([
      supabase
        .from('auction_tiers')
        .select('id, season_year, tier_number, name, opens_at, closes_at, resolved_at')
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
                  {(t.name || 'Tier ' + t.tier_number) + ' — opens ' + formatShortDateTime(t.opens_at) + ', closes '}
                  {formatShortDateTime(t.closes_at)}
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

  // Whether bidding is genuinely live right now: inside the open window AND
  // not resolved. This is what gates the panel's Revise Bid link, since
  // submit_bid() refuses on both counts.
  //
  // Computed explicitly rather than inferred from activeTier existing. As
  // /bids is built today those are equivalent -- activeTier is only found
  // when opens_at <= now <= closes_at, and the query filters resolved
  // tiers out -- so this is belt-and-braces under the current structure.
  // It earns its keep in two ways regardless: the tier can close between
  // this render and the owner clicking, and the condition stays correct if
  // the panel is ever rendered outside the active-tier branch.
  const nowMs = Date.now();
  const tierIsOpen =
    !activeTier.resolved_at &&
    nowMs >= new Date(activeTier.opens_at).getTime() &&
    nowMs <= new Date(activeTier.closes_at).getTime();

  // Own-team delegation rows and settings for this tier, read through the
  // session-aware client so RLS applies as this owner -- both tables' RLS
  // is own-team-only with no commissioner clause, deliberately, since they
  // expose willingness-to-pay ceilings and the commissioner is a competing
  // owner. The admin client is never used here.
  let delegationRows = null;
  let delegationSettings = null;
  let ownBidRows = null;
  let withdrawalAllowance = 0;
  let withdrawalsUsed = 0;
  if (teamOwner) {
    const sessionSupabase = await createSupabaseServerClient();
    const [
      { data: delegations },
      { data: settingsRow },
      { data: ownBids },
      { data: allowanceValue },
      { count: usedCount },
    ] = await Promise.all([
      sessionSupabase
        .from('bid_delegations')
        .select('*')
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id)
        .order('priority'),
      // At most one row per (tier_id, team_id). Absent until the owner
      // arms for the first time.
      sessionSupabase
        .from('bid_delegation_settings')
        .select('max_bids, max_total_cash, max_total_cap, armed_at')
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id)
        .maybeSingle(),
      // This owner's own bids in the open tier. Nothing in the app showed
      // an owner their own bids as a list before this -- the only view was
      // one player at a time, prefilled into that player's bid form -- so
      // the Your Bids panel needs its own read. Sealed-bid RLS still
      // applies: this returns only this team's rows, exactly as the
      // per-player prefill query already does.
      sessionSupabase
        .from('bids')
        .select('id, player_id, status')
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id),
      // The allowance comes from the database, never from JavaScript. The
      // players-divided-by-five rule lives in tier_withdrawal_allowance()
      // and duplicating it here is exactly how the two would drift.
      sessionSupabase.rpc('tier_withdrawal_allowance', { p_tier_id: activeTier.id }),
      // Withdrawals used = rows in bid_withdrawals for this (tier, team).
      // head + exact count: the rows themselves are never displayed.
      sessionSupabase
        .from('bid_withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id),
    ]);
    delegationRows = delegations;
    delegationSettings = settingsRow;
    ownBidRows = ownBids;
    withdrawalAllowance = Number(allowanceValue) || 0;
    withdrawalsUsed = Number(usedCount) || 0;
  }

  return (
    <main className="page">
      <p className="subhead"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">{leagueName} · Free Agency · {activeTier.season_year}</p>
      <h1>{activeTier.name || 'Tier ' + activeTier.tier_number}</h1>
      <p className="subhead">
        Bidding open now — closes {formatShortDateTime(activeTier.closes_at)}. Bid counts show how
        contested each player is; bid amounts and bidders stay sealed until the tier resolves.
      </p>

      <DelegationPanel
        activeTier={activeTier}
        teamOwner={teamOwner}
        delegationRows={delegationRows}
        settings={delegationSettings}
        playerNames={playerNames}
        tierIsOpen={tierIsOpen}
      />

      {/* Directly beneath the Auto-Bid panel and above the public player
          table: both boxes concern this owner's position in this tier, a
          logged-out visitor sees neither, and an owner should see what
          they have already committed before scrolling into the list to
          commit more. Renders nothing when teamOwner is null or the owner
          has no bids in this tier. */}
      {teamOwner && (
        <YourBidsPanel
          tierIsOpen={tierIsOpen}
          allowance={withdrawalAllowance}
          used={withdrawalsUsed}
          rows={(ownBidRows || []).map((b) => ({
            id: b.id,
            playerName: playerNames.get(b.player_id) || 'Unknown Player',
            status: b.status,
          }))}
        />
      )}

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
