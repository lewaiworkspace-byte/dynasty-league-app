'use client';

import { useState, useMemo } from 'react';
import { submitBid } from './actions';
import { computeBidPreview, validateBidDeion } from '../../lib/bidMath';

const emptyYear = () => ({
  guaranteedSalary: 0,
  nonGuaranteedSalary: 0,
  rosterBonus: 0,
  optionBonus: 0, // real, scheduled option bonus -- Year 2+ only
});

/**
 * @param {object} props
 * @param {{id:string, fullName:string, position:string}} props.player
 * @param {{id:string, name:string, closesAt:string}} props.tier
 * @param {object} props.weights - from buildWeightLookup(), fetched server-side
 * @param {object|null} props.initialBid - the owner's existing bid, if any.
 *   Submitting calls the same submit_bid() RPC either way -- it upserts on
 *   (tier_id, player_id, team_id) and resets submitted_at itself, so this
 *   component doesn't need to know which case it is.
 */
export default function BidForm({ player, tier, weights, initialBid }) {
  const [startYear, setStartYear] = useState(initialBid?.startYear ?? new Date().getFullYear());
  const [totalYears, setTotalYears] = useState(initialBid?.totalYears ?? 1);
  const [voidYears, setVoidYears] = useState(initialBid?.voidYears ?? 0);
  const [signingBonusTotal, setSigningBonusTotal] = useState(initialBid?.signingBonusTotal ?? 0);
  const [years, setYears] = useState(initialBid?.years ?? Array.from({ length: 5 }, emptyYear));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const totalRows = Math.min(5, T + V);
  const tierClosed = new Date() >= new Date(tier.closesAt);

  const preview = useMemo(
    () =>
      computeBidPreview({
        startYear: Number(startYear) || new Date().getFullYear(),
        signingBonusTotal: Number(signingBonusTotal) || 0,
        totalYears: T,
        voidYears: V,
        years,
        weights,
      }),
    [startYear, signingBonusTotal, T, V, years, weights]
  );

  function updateYearField(index, field, value) {
    setValidation(null);
    setYears((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function runValidation() {
    return validateBidDeion({
      startYear: Number(startYear) || new Date().getFullYear(),
      signingBonusTotal: Number(signingBonusTotal) || 0,
      totalYears: T,
      voidYears: V,
      years,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const fresh = runValidation();
    setValidation(fresh);
    if (!fresh.valid) {
      setError('This bid has validation issues listed below and was not submitted.');
      return;
    }

    const span = T + V;
    const yearsPayload = Array.from({ length: span }, (_, i) => {
      const isVoid = i >= T;
      const y = years[i] || {};
      return {
        contract_year_number: i + 1,
        league_season_year: Number(startYear) + i,
        prorated_signing_bonus: (Number(signingBonusTotal) || 0) / span,
        guaranteed_salary: isVoid ? 0 : Number(y.guaranteedSalary) || 0,
        non_guaranteed_salary: isVoid ? 0 : Number(y.nonGuaranteedSalary) || 0,
        roster_bonus: isVoid ? 0 : Number(y.rosterBonus) || 0,
        is_void_year: isVoid,
      };
    });

    const optionBonusesPayload = years
      .slice(0, T)
      .map((y, i) => ({ i, amount: Number(y.optionBonus) || 0 }))
      .filter((e2) => e2.i > 0 && e2.amount > 0) // Year 1 never carries one
      .map((e2) => ({
        exercise_season_year: Number(startYear) + e2.i,
        bonus_amount: e2.amount,
      }));

    setIsPending(true);
    try {
      await submitBid({
        tierId: tier.id,
        playerId: player.id,
        startYear: Number(startYear),
        totalYears: T,
        voidYears: V,
        signingBonusTotal: Number(signingBonusTotal) || 0,
        years: yearsPayload,
        optionBonuses: optionBonusesPayload,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPending(false);
    }
  }

  if (tierClosed) {
    return (
      <div className="page">
        <div className="ledger admin-form">
          <p className="form-error">
            Bidding for {tier.name} closed at {new Date(tier.closesAt).toLocaleString()}. This bid can
            no longer be submitted or revised.
          </p>
          <p><a href="/bids">← Back to Auction</a></p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="page-actions">
        <a href="/">← Home</a> · <a href="/bids">← Back to Auction</a>
      </p>

      <form className="admin-form" onSubmit={handleSubmit}>
        <p className="eyebrow">{tier.name}</p>
        <h1 className="team-name">
          Bid on {player.fullName} ({player.position})
        </h1>
        <p className="subhead" style={{ marginBottom: 20 }}>
          Bidding closes {new Date(tier.closesAt).toLocaleString()}. You can revise this bid as many
          times as you want before then — but each revision resets your tie-break position against
          any equal bid.
        </p>

        {submitted && (
          <p className="empty-note" style={{ color: 'var(--accent-gold)' }}>
            ✓ Bid submitted. You can keep revising it until the tier closes.
          </p>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-row">
          <label>
            Start Year
            <input type="number" value={startYear} onChange={(e) => setStartYear(e.target.value)} />
          </label>
          <label>
            Total Years
            <input
              type="number"
              min="1"
              max="5"
              value={totalYears}
              onChange={(e) => {
                setValidation(null);
                setTotalYears(e.target.value);
              }}
            />
          </label>
          <label>
            Void Years
            <input
              type="number"
              min="0"
              max={Math.max(0, 5 - T)}
              value={voidYears}
              onChange={(e) => {
                setValidation(null);
                setVoidYears(e.target.value);
              }}
            />
          </label>
          <label>
            Signing Bonus (Total)
            <input
              type="number"
              min="0"
              step="1"
              value={signingBonusTotal}
              onChange={(e) => {
                setValidation(null);
                setSigningBonusTotal(e.target.value);
              }}
            />
          </label>
        </div>

        <h2 className="section-heading">Year-by-Year Salary</h2>
        <p className="subhead" style={{ marginBottom: 8 }}>
          The signing bonus splits evenly across all {totalRows} year{totalRows === 1 ? '' : 's'}.
          Option Bonus is a real scheduled bonus (Year 2+ only) — it becomes cap-real the moment that
          season begins unless the player is cut first, then prorates forward from there.
        </p>

        <table className="ledger year-table">
          <thead>
            <tr>
              <th>Season</th>
              <th style={{ textAlign: 'right' }}>Guaranteed</th>
              <th style={{ textAlign: 'right' }}>Non-Guaranteed</th>
              <th style={{ textAlign: 'right' }}>Roster Bonus</th>
              <th style={{ textAlign: 'right' }}>Option Bonus</th>
              <th style={{ textAlign: 'right' }}>PPV</th>
              <th style={{ textAlign: 'right' }}>Cap</th>
              <th style={{ textAlign: 'right' }}>Cash</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRows }).map((_, idx) => {
              const isVoid = idx + 1 > T;
              const p = preview.rows[idx] || { ppv: 0, capCharge: 0, cashValue: 0 };
              return (
                <tr key={idx}>
                  <td className="team-name">
                    {Number(startYear) + idx}
                    {isVoid && <span className="void-tag"> VOID</span>}
                  </td>
                  {isVoid ? (
                    <td colSpan={4} className="empty-note">
                      Void year — no real salary, bonus proration only.
                    </td>
                  ) : (
                    <>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={years[idx]?.guaranteedSalary ?? 0}
                          onChange={(e) => updateYearField(idx, 'guaranteedSalary', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={years[idx]?.nonGuaranteedSalary ?? 0}
                          onChange={(e) => updateYearField(idx, 'nonGuaranteedSalary', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={years[idx]?.rosterBonus ?? 0}
                          onChange={(e) => updateYearField(idx, 'rosterBonus', e.target.value)}
                        />
                      </td>
                      <td>
                        {idx === 0 ? (
                          <span className="empty-note">— (Year 1)</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={years[idx]?.optionBonus ?? 0}
                            onChange={(e) => updateYearField(idx, 'optionBonus', e.target.value)}
                          />
                        )}
                      </td>
                    </>
                  )}
                  <td className="num" style={{ textAlign: 'right' }}>{(p.ppv || 0).toFixed(2)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{p.capCharge.toFixed(2)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{p.cashValue.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td colSpan={5} style={{ fontWeight: 600, textAlign: 'right', paddingRight: 12 }}>
                Bid Totals
              </td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                {preview.totalPpv.toFixed(2)}
              </td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                {preview.totalCap.toFixed(2)}
              </td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                {preview.totalCash.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="empty-note" style={{ marginTop: 8, fontStyle: 'italic' }}>
          Highest total PPV wins this player when {tier.name} closes. These numbers are your own bid
          only — nobody, including you, can see anyone else's bid until the tier closes.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
          <button type="button" className="btn" onClick={() => setValidation(runValidation())}>
            Recalculate &amp; Validate
          </button>
          <button type="submit" className="btn" disabled={isPending}>
            {isPending ? 'Submitting…' : initialBid ? 'Update Bid' : 'Submit Bid'}
          </button>
        </div>

        {validation && (
          <div
            className="assistant-box"
            style={{
              marginTop: 16,
              borderColor: validation.valid ? 'var(--accent-gold)' : 'var(--accent-rust)',
            }}
          >
            {validation.valid ? (
              <p className="empty-note" style={{ color: 'var(--accent-gold)', margin: 0 }}>
                ✓ Valid — every season's real salary covers its share of the signing bonus.
              </p>
            ) : (
              <>
                <p
                  className="empty-note"
                  style={{ color: 'var(--accent-rust)', marginTop: 0, marginBottom: 10 }}
                >
                  ✗ {validation.issues.length} issue{validation.issues.length === 1 ? '' : 's'} —
                  this bid will be rejected until they're fixed:
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14 }}>
                  {validation.issues.map((issue, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>{issue}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
