'use client';

import { useState, useMemo } from 'react';
import { submitBid } from './actions';
import { computeBidPreview, validateBidDeion, validateBidMinimumSalary } from '../../lib/bidMath';
import { leagueMinimumSalary } from '../../lib/leagueMinimum';
import { validateThirtyPercent } from '../../lib/thirtyPercentRule';
import { generateContract, PHILOSOPHY_LABELS } from '../../lib/contractAssistant';
import { buildBidPayload } from '../../lib/bidPayload';
import { formatDateTime } from '../../lib/formatDate';
import { applyOptionRecommendations, optionBonusApplyNote, voidRowLabel } from '../../lib/optionBonusApply';
import { deadCapBasisNote } from '../../lib/deadCapPreview';

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
    const season = Number(startYear) || new Date().getFullYear();
    // Weights are passed so the assistant can solve for a target that
    // INCLUDES the PPV of the option bonuses it is about to recommend.
    const result = generateContract(Number(targetPPV), t, philosophy, maxVoid, season, weights);

    setSigningBonusTotal(result.signingBonusTotal);
    setVoidYears(result.voidYears);

    // A bid carries real option bonuses as part of the submission, so the
    // recommendations get applied directly. They are sized against the 30%
    // Rule's remaining headroom (see lib/contractAssistant.js), so applying
    // all of them lands the bid exactly on the legal ceiling, never over
    // it -- and the assistant has already scaled the salary side down so
    // the two together hit the target rather than blowing past it.
    //
    // The guard lives in lib/optionBonusApply.js, shared with the other
    // two builders, so all three apply and report identically.
    const base = Array.from({ length: 5 }, emptyYear);
    result.years.forEach((y, idx) => {
      base[idx] = {
        guaranteedSalary: y.guaranteedSalary,
        nonGuaranteedSalary: y.nonGuaranteedSalary,
        rosterBonus: y.rosterBonus,
        optionBonus: 0,
      };
    });

    const applied = applyOptionRecommendations(
      base,
      result.optionBonusRecommendations,
      t,
      season
    );

    setYears(applied.years);
    setAssistantNote(optionBonusApplyNote(applied.applied, applied.skipped));
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
      // submitBid returns a result object rather than throwing. Next.js
      // masks every error thrown out of a Server Action in a production
      // build, replacing the message with a generic "an error occurred in
      // the Server Components render" string -- so a database refusal
      // arrived here unreadable. That matters most for the two refusals
      // with no client-side mirror above: the minimum legal bid PPV floor,
      // and a tier that closed while the form was open. Both are exactly
      // what an owner hits against a deadline.
      const result = await submitBid({
        tierId: tier.id,
        playerId: player.id,
        startYear: Number(startYear),
        totalYears: T,
        voidYears: V,
        signingBonusTotal: Number(signingBonusTotal) || 0,
        years: payload.years,
        optionBonuses: payload.optionBonuses,
      });

      if (result && result.ok) {
        setSubmitted(true);
      } else {
        // A refusal. Nothing was written -- submit_bid() is one
        // transaction. Never set submitted here: claiming success on a
        // refused bid is worse than the masked message was.
        setSubmitted(false);
        setError((result && result.message) || 'This bid was refused and was not submitted.');
      }
    } catch (err) {
      // Only genuine transport failures reach here now.
      setError(
        'Could not reach the server, so this bid was not submitted. Check your connection and ' +
          'try again — and reload before resubmitting, in case it landed. (' +
          (err && err.message ? err.message : String(err)) +
          ')'
      );
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
                  assistantResult.achievedTotalPPV +
                  ' (target was ' +
                  assistantResult.targetPPV +
                  '). ' +
                  assistantResult.compromiseNote
                : '✓ Generated — achieved PPV: ' +
                  assistantResult.achievedTotalPPV +
                  ' (target ' +
                  assistantResult.targetPPV +
                  ').'}
            </p>
          )}
          {assistantResult && assistantResult.targetDependsOnOptions && (
            <p className="empty-note">
              {'That total is ' +
                assistantResult.achievedPPV +
                ' from salary and signing bonus plus ' +
                assistantResult.optionBonusPPV +
                ' from the option bonuses filled in below. Delete an option bonus and the bid ' +
                'drops below your target.'}
            </p>
          )}
          {assistantResult && assistantResult.floorTopUpNote && (
            <p className="empty-note">{assistantResult.floorTopUpNote}</p>
          )}
          {assistantResult && assistantResult.thirtyPercentNote && (
            <p className="empty-note">{assistantResult.thirtyPercentNote}</p>
          )}
          {assistantResult && assistantResult.overshootsTarget && (
            <p className="empty-note" style={{ color: 'var(--accent-gold)' }}>
              This bid comes out {Math.round(assistantResult.overshootPct * 100)}% above your target PPV, and it
              can&apos;t come down: the league minimum salary floor in later years requires more real cash than a
              deal this size would otherwise carry. Consider a shorter deal or a higher target.
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
        <p className="subhead" style={{ marginBottom: 20, fontStyle: 'italic' }}>
          {deadCapBasisNote()}
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
              <th style={{ textAlign: 'right' }}>Dead Cap if Cut</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((p, idx) => {
              const isVoid = p.isVoid;
              return (
                <tr key={idx}>
                  <td className="team-name">
                    {p.seasonYear}
                    {isVoid && <span className="void-tag"> VOID</span>}
                  </td>
                  {isVoid ? (
                    <td colSpan={4} className="empty-note">
                      {voidRowLabel(p)}
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
                  <td className="num negative" style={{ textAlign: 'right' }}>
                    {(p.deadCapIfCut || 0).toFixed(2)}
                  </td>
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
              <td></td>
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
