'use client';

import { useState, useMemo } from 'react';
import { submitBid } from './actions';
import { computeBidPreview, validateBidDeion, validateBidMinimumSalary } from '../../lib/bidMath';
import { leagueMinimumSalary } from '../../lib/leagueMinimum';
import { validateThirtyPercent } from '../../lib/thirtyPercentRule';
import { generateContract, PHILOSOPHY_LABELS } from '../../lib/contractAssistant';
import { buildBidPayload } from '../../lib/bidPayload';
import { formatDateTime } from '../../lib/formatDate';

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

  // Contract Assistant -- same generator the commissioner's New Contract
  // form uses, so a bid built here is shaped by the same philosophies as a
  // hand-entered contract.
  const [targetPPV, setTargetPPV] = useState(50);
  const [philosophy, setPhilosophy] = useState('pay_as_you_go');
  const [assistantResult, setAssistantResult] = useState(null);
  const [assistantNote, setAssistantNote] = useState(null);

  const T = Number(totalYears) || 0;
  const V = Number(voidYears) || 0;
  const tierClosed = new Date() >= new Date(tier.closesAt);

  // The preview's rows array decides how many seasons render: the owner
  // span (real + signing-bonus void years) plus any automatic option void
  // seasons the scheduled option bonuses require -- up to nine total,
  // mirroring the database (rule book v13 5.7, 5.20). A reloaded 9-year
  // bid therefore shows all nine rows, not the first five.
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
    const args = {
      startYear: Number(startYear) || new Date().getFullYear(),
      signingBonusTotal: Number(signingBonusTotal) || 0,
      totalYears: T,
      voidYears: V,
      years,
    };
    // Three independent rules, all enforced by database triggers too. Run
    // all of them so a bidder sees every problem at once rather than
    // fixing one and immediately hitting the next.
    const deion = validateBidDeion(args);
    const minimum = validateBidMinimumSalary(args);
    const thirty = validateThirtyPercent(args);
    return {
      valid: deion.valid && minimum.valid && thirty.valid,
      issues: [...minimum.issues, ...deion.issues, ...thirty.issues],
    };
  }

  function handleGenerateBid() {
    const t = Number(totalYears);
    if (!t || t < 1 || t > 5) {
      setError('Set Total Years between 1 and 5 before generating a bid.');
      return;
    }
    setError(null);

    const maxVoid = Math.max(0, 5 - t);
    const result = generateContract(
      Number(targetPPV),
      t,
      philosophy,
      maxVoid,
      Number(startYear) || new Date().getFullYear()
    );

    setSigningBonusTotal(result.signingBonusTotal);
    setVoidYears(result.voidYears);

    // Unlike the old New Contract form -- which could only LIST the
    // assistant's option bonus recommendations -- a bid carries real
    // option bonuses as part of the submission, so they get applied
    // directly here. They're sized against the 30% Rule's remaining
    // headroom (see lib/contractAssistant.js), so applying all of them
    // lands the bid exactly on the legal ceiling, never over it.
    //
    // Year 1 can never hold an option bonus (enforced by a database
    // trigger as well), so any recommendation landing there is skipped
    // and reported rather than silently dropped.
    const recs = result.optionBonusRecommendations || [];
    const applied = [];
    const skipped = [];

    setYears(() => {
      const next = Array.from({ length: 5 }, emptyYear);
      result.years.forEach((y, idx) => {
        next[idx] = {
          guaranteedSalary: y.guaranteedSalary,
          nonGuaranteedSalary: y.nonGuaranteedSalary,
          rosterBonus: y.rosterBonus,
          optionBonus: 0,
        };
      });
      recs.forEach((rec) => {
        const idx = rec.yearOffset;
        if (idx >= 1 && idx < t && next[idx]) {
          next[idx] = { ...next[idx], optionBonus: rec.amount };
          applied.push({ season: Number(startYear) + idx, amount: rec.amount });
        } else {
          skipped.push(rec);
        }
      });
      return next;
    });

    const notes = [];
    if (applied.length > 0) {
      notes.push(
        applied.length +
          ' option bonus' +
          (applied.length === 1 ? '' : 'es') +
          ' applied (' +
          applied.map((a) => a.season + ': ' + a.amount).join(', ') +
          "). Because a bid counts real option bonuses toward PPV, your Bid Totals below will read HIGHER than the assistant's target — treat the Bid Totals row as the real number. Each bonus prorates over five seasons from its own year; the automatic VOID rows below hold that proration."
      );
    }
    if (skipped.length > 0) {
      notes.push(
        skipped.length +
          ' recommendation' +
          (skipped.length === 1 ? '' : 's') +
          ' could not be applied (option bonuses are only valid in Year 2 onward of a real season).'
      );
    }
    setAssistantNote(notes.length > 0 ? notes.join(' ') : null);

    setAssistantResult(result);
    setValidation(null);
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

    const payload = buildBidPayload({
      startYear,
      totalYears: T,
      voidYears: V,
      signingBonusTotal,
      years,
    });

    setIsPending(true);
    try {
      await submitBid({
        tierId: tier.id,
        playerId: player.id,
        startYear: Number(startYear),
        totalYears: T,
        voidYears: V,
        signingBonusTotal: Number(signingBonusTotal) || 0,
        years: payload.years,
        optionBonuses: payload.optionBonuses,
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
            Bidding for {tier.name} closed at {formatDateTime(tier.closesAt)}. This bid can
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
          Bidding closes {formatDateTime(tier.closesAt)}. You can revise this bid as many
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

        <div className="form-notice">
          Void years here apply to signing bonus only. Adding void years stretches your signing
          bonus proration across more seasons, up to five total. Option bonuses add their own void
          years automatically when scheduled — those are separate, don&apos;t count against this
          limit, and never carry signing bonus proration.
        </div>

        {/* --- Contract Assistant --- */}
        <div className="assistant-box">
          <h2 className="section-heading" style={{ marginTop: 0 }}>
            Bid Assistant
          </h2>
          <p className="subhead" style={{ marginBottom: 16 }}>
            Not sure how to structure this offer? Set Total Years above, then enter a target PPV and
            pick a philosophy — the assistant builds a complete, rule-compliant bid for you to
            review and adjust. Everything it fills in stays editable.
          </p>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <label>
              Target PPV
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetPPV}
                onChange={(e) => setTargetPPV(e.target.value)}
              />
            </label>
            <label>
              GM Philosophy
              <select value={philosophy} onChange={(e) => setPhilosophy(e.target.value)}>
                {Object.entries(PHILOSOPHY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" onClick={handleGenerateBid}>
              Generate Bid
            </button>
          </div>

          {assistantResult && (
            <p
              className="empty-note"
              style={{
                color: assistantResult.compromiseNote ? 'var(--accent-rust)' : 'var(--accent-gold)',
              }}
            >
              {assistantResult.compromiseNote
                ? '⚠ Achieved PPV: ' +
                  assistantResult.achievedPPV +
                  ' (target was ' +
                  assistantResult.targetPPV +
                  '). ' +
                  assistantResult.compromiseNote
                : '✓ Generated — achieved PPV: ' +
                  assistantResult.achievedPPV +
                  ' (target ' +
                  assistantResult.targetPPV +
                  ').'}
            </p>
          )}
          {assistantResult && assistantResult.floorTopUpNote && (
            <p className="empty-note">{assistantResult.floorTopUpNote}</p>
          )}
          {assistantResult && assistantResult.thirtyPercentNote && (
            <p className="empty-note">{assistantResult.thirtyPercentNote}</p>
          )}
          {assistantResult && assistantResult.overshootsTarget && (
            <p className="empty-note" style={{ color: 'var(--accent-rust)' }}>
              ⚠ That&apos;s {Math.round(assistantResult.overshootPct * 100)}% above your target PPV — the league
              minimum salary floor in later years required more real cash than this shape would otherwise carry.
              Consider a shorter deal, a higher target, or a different philosophy.
            </p>
          )}

          {assistantNote && (
            <p className="empty-note" style={{ marginTop: 8 }}>
              {assistantNote}
            </p>
          )}

          <p className="empty-note" style={{ fontStyle: 'italic', marginBottom: 0 }}>
            The assistant is a starting point, not a valuation — it doesn&apos;t know what this
            player is worth or what anyone else is bidding.
          </p>
        </div>

        <h2 className="section-heading">Year-by-Year Salary</h2>
        <p className="subhead" style={{ marginBottom: 8 }}>
          The signing bonus splits evenly across the {T + V} year{T + V === 1 ? '' : 's'} you chose
          above (real + void). Option Bonus is a real scheduled bonus (Year 2+ only) — it becomes
          cap-real the moment that season begins unless the player is cut first, then prorates over
          five seasons from its own year; any automatic VOID rows below are the seasons holding
          that proration. Every real season must pay at least the league minimum IN CASH — the
          prorated signing bonus and the cap charge don&apos;t count toward it
          (${leagueMinimumSalary(Number(startYear) || new Date().getFullYear())} in{' '}
          {Number(startYear) || new Date().getFullYear()}, rising about 5% a season).
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
            {preview.rows.map((p, idx) => {
              const isVoid = p.isVoid;
              const isOptionVoid = p.voidReason === 'option_bonus';
              return (
                <tr key={idx}>
                  <td className="team-name">
                    {p.seasonYear}
                    {isVoid && <span className="void-tag"> VOID</span>}
                  </td>
                  {isVoid ? (
                    <td colSpan={4} className="empty-note">
                      {isOptionVoid
                        ? 'Automatic void year — holds option bonus proration only, added by the league (5.20(d)).'
                        : 'Void year — no real salary, signing-bonus proration only.'}
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
          only — nobody, including you, can see anyone else&apos;s bid until the tier closes.
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
                ✓ Valid — passes the Deion Rule, the league minimum, and the 30% Rule.
              </p>
            ) : (
              <>
                <p
                  className="empty-note"
                  style={{ color: 'var(--accent-rust)', marginTop: 0, marginBottom: 10 }}
                >
                  ✗ {validation.issues.length} issue{validation.issues.length === 1 ? '' : 's'} —
                  this bid will be rejected until they&apos;re fixed:
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
