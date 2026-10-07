import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { formatDateTime } from '../../lib/formatDate';

export const revalidate = 0;
export const metadata = { title: 'Commissioner Action Log' };

// THE ACTION TYPES, RECONCILED BY DIFF (SR-36), October 7, 2026.
//
// This map is one vocabulary written twice: the database writes action_type as free
// text, and this page names it. A type with no entry here shows its raw spelling, and
// until this reconciliation most of them did -- the map had stopped at the September 16
// calendar types while trades, rulings, reversals, poaching and free agency had all been
// logging for weeks.
//
// THE DIFF WAS TAKEN AGAINST TWO LISTS, NOT ONE:
//   1. every literal passed to log_commissioner_action() or inserted into
//      commissioner_actions by a database function, plus the four this repo passes
//      (three from the tier-results panel, injury_sync from the injury sync); and
//   2. every action_type already in the table, which adds the ones written once by
//      hand during a commissioner correction (commissioner_ruling, fines_cleared,
//      owner_proxy_access and _ended, trade_accepted_on_behalf, fa_test_data_removed,
//      waiver_claim_reversed).
// Types emitted by code but still at zero rows are labelled now, not on the day they
// first occur (cut_reversed, fifth_year_option_reversed, co_commissioner_revoked,
// trade_vetoed, prospect_class_rolled, poach_exemption_changed, taxi_hold_changed,
// owner_profile_edit).
//
// sleeper_sync and sleeper_sync_abandoned are kept: the Sleeper Sync page is retired
// (batch 3), but its 22 entries stay in the public log and still need a name.
const LABELS = {
  // Auction
  tier_evaluate: 'Tier evaluated',
  tier_verify: 'Tier verified',
  bid_pass_over: 'Win passed over',
  bid_delete: 'Bid deleted',
  // Contracts and rosters
  contract_delete: 'Contract deleted',
  cut_reversed: 'Release reversed',
  fifth_year_option_reversed: 'Fifth Year Option decision reversed',
  roster_status_changed: 'Roster spot changed',
  taxi_hold_changed: 'Active-roster hold changed',
  // Trades
  trade_executed: 'Trade executed',
  trade_accepted_on_behalf: 'Trade accepted on an owner\'s behalf',
  trade_vetoed: 'Trade disapproved',
  trade_reversed: 'Trade reversed',
  // Free agency, poaching and waivers
  fa_first_offer_award: 'Free agency first offer awarded',
  fa_window_resolved: 'Free agency window resolved',
  fa_test_data_removed: 'Test data removed',
  poach_window_resolved: 'Poach window resolved',
  poach_exemption_changed: 'Poaching exemption changed',
  waiver_claim_reversed: 'Waiver claim reversed',
  // Money
  cash_adjustment: 'Cash adjustment',
  fines_cleared: 'Fines cleared',
  // Rulings and officers
  commissioner_ruling: 'Commissioner ruling',
  co_commissioner_granted: 'Co-commissioner appointed',
  co_commissioner_revoked: 'Co-commissioner removed',
  owner_proxy_access: 'Proxy access opened',
  owner_proxy_access_ended: 'Proxy access ended',
  owner_profile_edit: 'Owner information edited',
  // Scores and seasons
  week_scores_corrected: 'Week scores corrected',
  week_scores_restated: 'Week scores restated',
  season_results_published: 'Season results published',
  prospect_class_rolled: 'Rookie draft class closed',
  // injury_sync is emitted by app/admin/injury-sync/actions.js and
  // app/api/cron/injury-sync/route.js, and only when a pull actually moved a
  // designation -- a no-change pull logs nothing, by ruling.
  injury_sync: 'Injury status pulled',
  // Player identity and the calendar (September 16, 2026; To-Do 6 and 9).
  player_identity_merged: 'Duplicate player merged',
  player_identity_corrected: 'Player identity corrected',
  player_gsis_backfill: 'Player IDs backfilled',
  calendar_week_saved: 'League week saved',
  calendar_weeks_generated: 'League weeks drafted',
  calendar_event_saved: 'Calendar entry saved',
  calendar_event_deleted: 'Calendar entry deleted',
  calendar_season_drafted: 'Next season calendar drafted',
  // Retired feature (batch 3); history only.
  sleeper_sync: 'Sleeper sync applied',
  sleeper_sync_abandoned: 'Sleeper sync abandoned',
};

// Rust for something removed or undone, gold for money and rulings. Everything else
// uses the ordinary text colour.
const COLORS = {
  contract_delete: 'var(--accent-rust)',
  bid_delete: 'var(--accent-rust)',
  calendar_event_deleted: 'var(--accent-rust)',
  trade_vetoed: 'var(--accent-rust)',
  trade_reversed: 'var(--accent-rust)',
  cut_reversed: 'var(--accent-rust)',
  fifth_year_option_reversed: 'var(--accent-rust)',
  waiver_claim_reversed: 'var(--accent-rust)',
  cash_adjustment: 'var(--accent-gold)',
  fines_cleared: 'var(--accent-gold)',
  commissioner_ruling: 'var(--accent-gold)',
};

// EVERY OWNER READS THE SAME LOG, AND NOTHING HERE IS OFFICER-ONLY. The whole point
// is that any owner can audit what the commissioner has done. The page has no gate of
// its own: since ruling R-7 the app has no public face, and middleware.js is the front
// door (access.md lists /actions among the thirteen routes it alone protects). The
// line under the heading said "public and requires no login" until October 7, 2026,
// which had stopped being true; do not add a page-level gate either.
export default async function ActionLogPage() {
  const supabase = await createSupabaseServerClient();

  const { data: actions, error } = await supabase
    .from('commissioner_actions')
    .select('id, action_type, target_type, summary, reason, snapshot, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a></p>
      <p className="eyebrow">Transparency</p>
      <h1 className="team-name">Commissioner Action Log</h1>
      <p className="subhead">
        Every administrative action taken in the app, newest first — rulings, reversals,
        deletions, cash adjustments, trades, and auction and free agency decisions, each with the
        reason given at the time. Every owner sees the same log.
      </p>

      {error && <div className="form-error">Couldn&apos;t load the log: {error.message}</div>}

      {!actions || actions.length === 0 ? (
        <p className="empty-note">No commissioner actions have been recorded yet.</p>
      ) : (
        actions.map((a) => (
          <div key={a.id} className="ledger" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ color: COLORS[a.action_type] || 'var(--text)' }}>
                {LABELS[a.action_type] || a.action_type}
              </strong>
              <span className="empty-note">{formatDateTime(a.created_at)}</span>
            </div>

            <p style={{ margin: '8px 0 4px' }}>{a.summary}</p>

            {a.reason && (
              <p className="empty-note" style={{ margin: 0, fontStyle: 'italic' }}>
                Reason: {a.reason}
              </p>
            )}

            {a.snapshot && (
              <details style={{ marginTop: 10 }}>
                <summary className="empty-note" style={{ cursor: 'pointer' }}>
                  What was recorded
                </summary>
                <pre
                  className="num"
                  style={{
                    fontSize: 12,
                    overflowX: 'auto',
                    background: 'var(--bg)',
                    padding: 10,
                    marginTop: 8,
                    border: '1px solid var(--border)',
                  }}
                >
                  {JSON.stringify(a.snapshot, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))
      )}
    </div>
  );
}
