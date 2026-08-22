'use client';

import { useState } from 'react';
import { evaluateTier, passOverWinner, verifyTier } from '../actions';
import { formatDateTime } from '../../../../lib/formatDate';
import { formatMoney } from '../../../../lib/formatMoney';

export default function TierResultsPanel({ tier, players, flags, recommendations = [] }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const flaggedTeams = flags.filter((f) => f.over_cap || f.over_cash);
  const hasFlags = flaggedTeams.length > 0;

  // The 24-hour window is a RULE BOOK obligation, not something the app
  // enforces -- it's shown here so the commissioner knows where the clock
  // stands, but nothing happens automatically when it expires. Passing a
  // win over is always a deliberate button press.
  const deadline = tier.resolvedAt
    ? new Date(new Date(tier.resolvedAt).getTime() + 24 * 60 * 60 * 1000)
    : null;
  const deadlinePassed = deadline ? new Date() > deadline : false;

  // Recommended pass-over order, per flagged team, most recent bid first.
  // Only shown for teams that are actually flagged.
  const recsByTeam = new Map();
  recommendations.forEach((r) => {
    if (!flaggedTeams.some((f) => f.team_id === r.teamId)) return;
    if (!recsByTeam.has(r.teamId)) recsByTeam.set(r.teamId, []);
    recsByTeam.get(r.teamId).push(r);
  });

  // Which bid is the single next recommended action for each flagged team.
  const nextActionBidIds = new Set(
    [...recsByTeam.values()].map((list) => list.find((r) => r.recommendOrder === 1)?.bidId).filter(Boolean)
  );

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      if (typeof result === 'number') {
        setMessage('Tier verified — ' + result + ' contract' + (result === 1 ? '' : 's') + ' created.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page">
      <p className="page-actions">
        <a href="/">← Home</a> · <a href="/admin/tier-results">← All Tiers</a>
      </p>
      <p className="eyebrow">Commissioner · {tier.seasonYear}</p>
      <h1 className="team-name">{tier.name}</h1>

      {error && <div className="form-error">{error}</div>}
      {message && (
        <p className="empty-note" style={{ color: 'var(--accent-gold)' }}>✓ {message}</p>
      )}

      {/* --- State + primary actions --- */}
      {!tier.isClosed ? (
        <div className="assistant-box">
          <p className="empty-note" style={{ margin: 0 }}>
            Bidding is still open until {formatDateTime(tier.closesAt)}. Bids are sealed
            from everyone — including you — until then. Nothing to resolve yet.
          </p>
        </div>
      ) : tier.verifiedAt ? (
        <div className="assistant-box" style={{ borderColor: 'var(--accent-gold)' }}>
          <p className="empty-note" style={{ margin: 0, color: 'var(--accent-gold)' }}>
            ✓ Verified {formatDateTime(tier.verifiedAt)}. Contracts are live and results
            are public. This tier is final — nothing further can be changed.
          </p>
        </div>
      ) : !tier.resolvedAt ? (
        <div className="assistant-box">
          <p style={{ marginTop: 0 }}>
            Bidding closed. Evaluating picks a winner for each player by highest total PPV (ties go
            to the earliest submission) and surfaces any cap or cash problems. <strong>No contracts
            are created yet</strong> — that only happens when you verify.
          </p>
          <button
            className="btn"
            disabled={busy !== null}
            onClick={() => run('evaluate', () => evaluateTier(tier.id))}
          >
            {busy === 'evaluate' ? 'Evaluating…' : 'Evaluate Tier'}
          </button>
        </div>
      ) : (
        <div
          className="assistant-box"
          style={{ borderColor: hasFlags ? 'var(--accent-rust)' : 'var(--accent-gold)' }}
        >
          <p style={{ marginTop: 0 }}>
            Evaluated {formatDateTime(tier.resolvedAt)}.
            {deadline && (
              <>
                {' '}Rule book deadline for owners to resolve flags:{' '}
                <strong style={{ color: deadlinePassed ? 'var(--accent-rust)' : 'var(--text)' }}>
                  {formatDateTime(deadline)}
                  {deadlinePassed ? ' (passed)' : ''}
                </strong>
                .
              </>
            )}
          </p>
          {hasFlags ? (
            <p className="empty-note" style={{ color: 'var(--accent-rust)', marginBottom: 0 }}>
              {flaggedTeams.length} team{flaggedTeams.length === 1 ? '' : 's'} flagged — resolve or
              pass over those wins before verifying.
            </p>
          ) : (
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => run('verify', () => verifyTier(tier.id))}
            >
              {busy === 'verify' ? 'Verifying…' : 'Verify Tier Results'}
            </button>
          )}
        </div>
      )}

      {/* --- Flags --- */}
      {tier.resolvedAt && !tier.verifiedAt && (
        <>
          <h2 className="section-heading">Flags</h2>
          {flags.length === 0 ? (
            <p className="empty-note">No winning bids to check.</p>
          ) : (
            <table className="ledger year-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th style={{ textAlign: 'right' }}>Cap After</th>
                  <th style={{ textAlign: 'right' }}>125% Limit</th>
                  <th style={{ textAlign: 'right' }}>Cash Needed</th>
                  <th style={{ textAlign: 'right' }}>Cash Available</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => {
                  const capAfter = Number(f.current_cap_used) + Number(f.incoming_cap);
                  const problems = [];
                  if (f.over_cap) problems.push('OVER CAP');
                  if (f.over_cash) problems.push('OVER CASH');
                  return (
                    <tr key={f.team_id}>
                      <td className="team-name">{f.teamName}</td>
                      <td className={'num ' + (f.over_cap ? 'negative' : '')} style={{ textAlign: 'right' }}>
                        {formatMoney(capAfter)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{formatMoney(f.cap_limit_125)}</td>
                      <td className={'num ' + (f.over_cash ? 'negative' : '')} style={{ textAlign: 'right' }}>
                        {formatMoney(f.incoming_cash)}
                      </td>
                      {/* cash_available goes genuinely negative when a team is
                          over, and this is the screen where that decides
                          whether a win gets passed over. The shared formatter
                          keeps the minus sign; three of the formatters it
                          replaced elsewhere did not. */}
                      <td className="num" style={{ textAlign: 'right' }}>{formatMoney(f.cash_available)}</td>
                      <td style={{ color: problems.length ? 'var(--accent-rust)' : 'var(--accent-gold)' }}>
                        {problems.length ? problems.join(' + ') : 'OK'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="empty-note" style={{ fontStyle: 'italic' }}>
            Flags recalculate on their own — if an owner buys cash on <a href="/admin/cash">Manage
            Owner Cash</a> or cuts salary, reload this page and the flag clears itself.
          </p>
        </>
      )}

      {/* --- Recommended adjustments --- */}
      {tier.resolvedAt && !tier.verifiedAt && recsByTeam.size > 0 && (
        <>
          <h2 className="section-heading">Recommended Adjustments</h2>
          <p className="subhead" style={{ marginBottom: 14 }}>
            Work each flagged owner&apos;s <strong>most recent</strong> winning bid first — that&apos;s
            the bid that pushed them over. Each row shows where they&apos;d land if that bid and
            everything more recent were surrendered.
          </p>

          {[...recsByTeam.entries()].map(([teamId, list]) => {
            const teamName = list[0]?.teamName || '?';
            const firstClearing = list.find((r) => r.clearsHere);
            return (
              <div key={teamId} style={{ marginBottom: 24 }}>
                <h3 className="team-name" style={{ marginBottom: 6 }}>{teamName}</h3>

                <p className="empty-note" style={{ marginTop: 0 }}>
                  {firstClearing
                    ? 'Surrendering their ' +
                      firstClearing.recommendOrder +
                      ' most recent win' +
                      (firstClearing.recommendOrder === 1 ? '' : 's') +
                      ' brings them into compliance.'
                    : 'Even surrendering every win in this tier would not bring them into compliance — they were already over before bidding. Worth a direct conversation.'}
                </p>

                <table className="ledger year-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Player</th>
                      <th>Bid Submitted</th>
                      <th style={{ textAlign: 'right' }}>Cap After</th>
                      <th style={{ textAlign: 'right' }}>Cash Needed After</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.bidId}>
                        <td className="num" style={{ fontWeight: r.recommendOrder === 1 ? 600 : 400 }}>
                          {r.recommendOrder === 1 ? '1 ← start here' : r.recommendOrder}
                        </td>
                        <td className="team-name">{r.playerName}</td>
                        <td className="empty-note">{formatDateTime(r.submittedAt)}</td>
                        <td
                          className={'num ' + (r.capAfter > r.capLimit ? 'negative' : 'positive')}
                          style={{ textAlign: 'right' }}
                        >
                          {formatMoney(r.capAfter)}
                        </td>
                        <td
                          className={'num ' + (r.cashNeededAfter > r.cashAvailable ? 'negative' : 'positive')}
                          style={{ textAlign: 'right' }}
                        >
                          {formatMoney(r.cashNeededAfter)}
                        </td>
                        <td style={{ color: r.clearsHere ? 'var(--accent-gold)' : 'var(--accent-rust)' }}>
                          {r.clearsHere ? 'Clears' : 'Still over'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          <p className="empty-note" style={{ fontStyle: 'italic' }}>
            This is a recommendation, not a restriction — you can pass over any win in any order.
            Note that passing a win over promotes the next-highest bid on that player, which may
            flag <em>that</em> team instead; reload after each action to see the new picture.
          </p>
        </>
      )}

      {/* --- Bids per player --- */}
      <h2 className="section-heading">
        {tier.isClosed ? 'Bids by Player' : 'Players in This Tier'}
      </h2>
      {players.length === 0 ? (
        <p className="empty-note">
          {tier.isClosed
            ? 'No bids were submitted in this tier.'
            : 'Bids are sealed until the tier closes.'}
        </p>
      ) : (
        players.map((p) => (
          <div key={p.playerId} style={{ marginBottom: 28 }}>
            <h3 className="team-name" style={{ marginBottom: 6 }}>
              {p.playerName} <span className="empty-note">{p.position}</span>
            </h3>
            <table className="ledger year-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th style={{ textAlign: 'right' }}>Total PPV</th>
                  <th style={{ textAlign: 'right' }}>Years</th>
                  <th style={{ textAlign: 'right' }}>Signing Bonus</th>
                  <th>Result</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.bids.map((b) => {
                  const teamFlag = flags.find((f) => f.team_id === b.teamId);
                  const isFlagged =
                    b.status === 'winner' && teamFlag && (teamFlag.over_cap || teamFlag.over_cash);
                  const isNextRecommended = nextActionBidIds.has(b.id);
                  return (
                    <tr key={b.id}>
                      <td className="team-name">{b.teamName}</td>
                      <td
                        className="num"
                        style={{ textAlign: 'right', fontWeight: b.status === 'winner' ? 600 : 400 }}
                      >
                        {b.totalPpv.toFixed(2)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {b.totalYears}{b.voidYears > 0 ? ' +' + b.voidYears + 'v' : ''}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{formatMoney(b.signingBonusTotal)}</td>
                      <td
                        style={{
                          color:
                            b.status === 'winner'
                              ? isFlagged
                                ? 'var(--accent-rust)'
                                : 'var(--accent-gold)'
                              : 'var(--text-dim)',
                        }}
                      >
                        {b.status === 'winner' && (isFlagged ? 'WINNER — FLAGGED' : 'WINNER')}
                        {b.status === 'lost' && 'Lost'}
                        {b.status === 'passed_over' && 'Passed over'}
                        {b.status === 'pending' && 'Not yet evaluated'}
                        {isNextRecommended && (
                          <span className="empty-note" style={{ display: 'block' }}>
                            recommended first
                          </span>
                        )}
                      </td>
                      <td>
                        {b.status === 'winner' && !tier.verifiedAt && tier.resolvedAt && (
                          <button
                            className="btn"
                            disabled={busy !== null}
                            onClick={() => {
                              if (
                                !confirm(
                                  'Pass this win over? ' +
                                    b.teamName +
                                    ' loses ' +
                                    p.playerName +
                                    ", and the next-highest bid becomes the winner. This can't be undone."
                                )
                              )
                                return;
                              run('pass-' + b.id, () => passOverWinner(tier.id, b.id));
                            }}
                          >
                            {busy === 'pass-' + b.id ? 'Passing…' : 'Pass Over'}
                          </button>
                        )}
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
