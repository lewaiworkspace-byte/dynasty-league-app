import { createSupabaseServerClient } from '../../lib/supabaseServerClient';

export const revalidate = 0;
export const metadata = { title: 'Commissioner Action Log' };

const LABELS = {
  contract_delete: 'Contract deleted',
  bid_delete: 'Bid deleted',
  cash_adjustment: 'Cash adjustment',
  tier_evaluate: 'Tier evaluated',
  tier_verify: 'Tier verified',
  bid_pass_over: 'Win passed over',
};

const COLORS = {
  contract_delete: 'var(--accent-rust)',
  bid_delete: 'var(--accent-rust)',
  cash_adjustment: 'var(--accent-gold)',
};

// Deliberately public — no login gate. The whole point is that any owner
// (or anyone they choose to show it to) can audit what the commissioner
// has done. The underlying table has public SELECT RLS to match.
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
        Every administrative action taken in the app, newest first — deletions, cash adjustments,
        and auction decisions, each with the reason given at the time. This page is public and
        requires no login.
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
              <span className="empty-note">{new Date(a.created_at).toLocaleString()}</span>
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
