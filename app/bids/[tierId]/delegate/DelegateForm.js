'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { generateContract, PHILOSOPHY_LABELS } from '../../../../lib/contractAssistant';
import { buildBidPayload, payloadToValidatorShape } from '../../../../lib/bidPayload';
import { computeBidPreview, validateBidDeion, validateBidMinimumSalary } from '../../../../lib/bidMath';
import { upsertDelegation, armDelegations } from '../../delegationActions';
import { formatDateTime } from '../../../../lib/formatDate';

// bid_interest_levels is the source of truth for the label, description,
// multiplier AND display order (sort_order) of every interest level. Its
// primary key is the code column ('must_have' / 'target' / 'depth' / 'flyer').
//
// These constants DUPLICATE that table and exist only as a pre-load
// fallback, so a row still renders something sensible in the instant
// before the table's rows arrive (or if that fetch fails). The multipliers
// are league-fixed and never editable by an owner from either source. If
// the table's multipliers ever change, these go stale silently -- they are
// display-only and must never be used to compute a target, which is what
// the chart_bid_target RPC is for.
const INTEREST_LEVEL_FALLBACK_ORDER = ['must_have', 'target', 'depth', 'flyer'];
const INTEREST_LEVEL_FALLBACK = {
  must_have: { label: 'Must Have', description: '', multiplier: 1.25 },
  target: { label: 'Target', description: '', multiplier: 1.05 },
  depth: { label: 'Depth', description: '', multiplier: 0.9 },
  flyer: { label: 'Flyer', description: '', multiplier: 0.75 },
};

// Execute and Propose differ in exactly one thing: the starting state of
// the Include checkboxes. Nothing about how a bid is generated, validated
// or submitted changes between them. Anything more would be inventing
// behaviour the spec does not describe.
const MODE_OPTIONS = [
  {
    key: 'execute',
    label: 'Execute',
    description:
      'Set target PPV, years and philosophy per player -- the assistant builds the contract. ' +
      'Rows start unchecked, so you pick each player deliberately.',
  },
  {
    key: 'propose',
    label: 'Propose',
    description:
      'The system builds a suggested slate for you to review and approve. Every eligible player ' +
      'starts checked -- uncheck the ones you do not want.',
  },
  {
    key: 'discretionary',
    label: 'Discretionary',
    description: 'Reserved -- needs a player valuation table that does not exist yet.',
    disabled: true,
  },
];

// What makes a row ineligible for Propose auto-inclusion.
//
// THE LIVE-BID TEST IS submitted_bid_id, NOT status. This distinction is
// the whole point and is easy to get wrong: upsert_bid_delegation()'s
// ON CONFLICT DO UPDATE resets status to 'draft' but does NOT clear
// submitted_bid_id. So a row can sit at 'draft', 'failed' or 'skipped'
// while still pointing at a live bid -- revise a submitted delegation and
// it drops to 'draft' with the bid intact; re-arm and hit the exposure
// ceiling or a submit error and it lands at 'skipped' or 'failed', again
// with the bid intact. Keying on status === 'submitted' would miss every
// one of those.
//
// Why it matters: arm_bid_delegations() picks up a draft and
// submit_bid() upserts the bid with a fresh submitted_at, which is the
// tie-break on equal total PPV. Auto-checking a row whose bid is already
// standing and approving would resubmit it with a new timestamp and lose
// every tie it had already won -- without the owner touching that row.
//
// 'cancelled' is the one genuinely status-based exclusion: the owner
// already decided against this player, so do not resurrect it for them.
const PROPOSE_INELIGIBLE_STATUS = 'cancelled';

// True when this delegation still points at a bid that is standing.
function hasStandingBid(delegation) {
  return Boolean(delegation && delegation.submitted_bid_id);
}

// "More than a trivial amount" for the overshoot notice below. Rounding
// every dollar figure up already pushes a generated contract a few percent
// past its target, so a bare totalPpv > target test would fire on almost
// every row and become wallpaper. Both conditions together only trip on a
// real divergence -- in practice, applied option bonuses, which
// computeBidPreview() weights into PPV while generateContract()'s
// achievedPPV does not model at all.
const PPV_OVERSHOOT_MIN_PCT = 0.02;
const PPV_OVERSHOOT_MIN_ABS = 1;

function fmt(n) {
  return (Number(n) || 0).toFixed(2);
}

function hasValue(v) {
  return v !== null && v !== undefined;
}

// Ordered by the table's own sort_order. Falls back to the hardcoded order
// above only when the table hasn't loaded.
function buildInterestOptions(interestLevelRows) {
  const rows = interestLevelRows || [];
  if (rows.length === 0) {
    return INTEREST_LEVEL_FALLBACK_ORDER.map((code) => ({
      code,
      label: INTEREST_LEVEL_FALLBACK[code].label,
      description: INTEREST_LEVEL_FALLBACK[code].description,
      multiplier: INTEREST_LEVEL_FALLBACK[code].multiplier,
    }));
  }
  return rows
    .slice()
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((r) => ({
      code: r.code,
      label: r.label,
      description: r.description,
      multiplier: r.multiplier,
    }));
}

function findInterestOption(interestOptions, code) {
  const found = (interestOptions || []).find((o) => o.code === code);
  if (found) return found;
  const fb = INTEREST_LEVEL_FALLBACK[code];
  if (fb) return { code, label: fb.label, description: fb.description, multiplier: fb.multiplier };
  return { code, label: code, description: '', multiplier: null };
}

function buildInitialRows(players, alreadyBidSet) {
  return players.map((p) => ({
    playerId: p.id,
    fullName: p.fullName,
    position: p.position,
    nflTeam: p.nflTeam,
    alreadyBid: alreadyBidSet.has(p.id),
    included: false,
    interestLevel: 'target',
    // Throwaway starting length for the first chart_bid_target call --
    // that response's own likely_years then settles this to the chart's
    // real default (see the bootstrap comment in DelegateRow below).
    totalYears: 3,
    maxVoidYears: 2,
    philosophy: 'pay_as_you_go',
    targetPPV: null,
    chartDerivedTarget: null,
    chartInfo: null,
    chartLoading: false,
    chartError: null,
    hasBootstrapped: false,
    preview: null,
  }));
}

// One player's row. Owns its own chart_bid_target fetch (fires on interest
// level / total years change) and its own preview computation (fires on
// target PPV / total years / philosophy / max void years change),
// reporting the committed state up to the parent via onChange(patch)
// rather than the parent owning N independent async fetches itself.
function DelegateRow({
  row,
  priority,
  canMoveUp,
  canMoveDown,
  onMove,
  tier,
  weights,
  interestOptions,
  delegation,
  onChange,
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reference value + suggested target -- entirely from chart_bid_target,
  // never computed client-side. Skipped for a player already bid on
  // manually, since that row can never be included.
  useEffect(() => {
    if (row.alreadyBid) return;
    let cancelled = false;

    onChangeRef.current({ chartLoading: true, chartError: null });

    supabase
      .rpc('chart_bid_target', {
        p_tier_id: tier.id,
        p_player_id: row.playerId,
        p_total_years: Number(row.totalYears) || 1,
        p_interest_level: row.interestLevel,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          onChangeRef.current({ chartLoading: false, chartError: error.message });
          return;
        }
        // Length/interest change always re-derives and overwrites the
        // target -- per spec this is unconditional ("changing the length
        // MUST re-derive the target, not clear it"), not gated on whether
        // the owner has previously typed a custom number. The owner can
        // still hand-edit target PPV afterward without triggering another
        // RPC call (that input's onChange only touches targetPPV, not
        // interestLevel/totalYears), and that edit is what actually gets
        // submitted -- chartDerivedTarget vs. targetPPV divergence at
        // render time is how the row detects and displays an override.
        const patch = {
          chartInfo: data,
          chartLoading: false,
          chartError: null,
          chartDerivedTarget: data.suggested_target,
          targetPPV: data.suggested_target,
        };
        // First response for this row settles Total Years to the chart's
        // own likely_years -- this re-triggers this same effect once more
        // (totalYears changed), which then re-derives the target at the
        // corrected length. Every number here still comes from the RPC;
        // this is just which length to ask it about first.
        if (!row.hasBootstrapped && data.likely_years) {
          patch.totalYears = data.likely_years;
          patch.hasBootstrapped = true;
        }
        onChangeRef.current(patch);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.alreadyBid, row.totalYears, row.interestLevel, tier.id, row.playerId]);

  // Preview, in this exact order: generateContract() -> apply option bonus
  // recommendations -> buildBidPayload() -> payloadToValidatorShape() ->
  // validateBidDeion()/validateBidMinimumSalary() -> computeBidPreview().
  // Validates the round-tripped payload, not generateContract()'s raw
  // output -- generateContract() has a reachable path where it returns
  // without re-confirming Deion compliance, and validating after the
  // transform catches a buildBidPayload() bug here instead of at
  // submission.
  const preview = useMemo(() => {
    if (!row.included) return null;
    if (row.targetPPV === null || row.targetPPV === undefined || row.targetPPV === '') return null;
    const totalYears = Number(row.totalYears) || 0;
    if (totalYears < 1 || totalYears > 5) return null;

    const hardMaxVoid = Math.max(0, 5 - totalYears);
    const maxVoidYears = Math.min(Number(row.maxVoidYears) || 0, hardMaxVoid);

    const generated = generateContract(
      Number(row.targetPPV),
      totalYears,
      row.philosophy,
      maxVoidYears,
      tier.seasonYear
    );

    // generateContract()'s own year objects carry no optionBonus field at
    // all, so feeding them straight to buildBidPayload() would read
    // undefined, coerce to 0, and emit an empty optionBonuses array --
    // silently dropping every recommendation. That would make a
    // back-loaded delegated bid a materially different contract from the
    // same back-loaded bid built by hand in the bid form, which is exactly
    // what sharing buildBidPayload() between the two is supposed to
    // prevent.
    //
    // This mirrors BidForm.js's handleGenerateBid() condition for
    // condition: same idx >= 1 (Year 1 can never hold an option bonus, a
    // database trigger rejects it independently), same idx < totalYears
    // (real seasons only, never a void year), same slot-exists guard.
    const adjustedYears = generated.years.map((y) => ({
      guaranteedSalary: y.guaranteedSalary,
      nonGuaranteedSalary: y.nonGuaranteedSalary,
      rosterBonus: y.rosterBonus,
      optionBonus: 0,
    }));

    const recs = generated.optionBonusRecommendations || [];
    const appliedOptionBonuses = [];
    recs.forEach((rec) => {
      const idx = rec.yearOffset;
      if (idx >= 1 && idx < totalYears && adjustedYears[idx]) {
        adjustedYears[idx] = { ...adjustedYears[idx], optionBonus: rec.amount };
        appliedOptionBonuses.push({ season: Number(tier.seasonYear) + idx, amount: rec.amount });
      }
    });

    const payload = buildBidPayload({
      startYear: tier.seasonYear,
      totalYears,
      voidYears: generated.voidYears,
      signingBonusTotal: generated.signingBonusTotal,
      years: adjustedYears,
    });

    const validatorShape = payloadToValidatorShape(
      payload,
      tier.seasonYear,
      totalYears,
      generated.voidYears,
      generated.signingBonusTotal
    );

    const deion = validateBidDeion(validatorShape);
    const minimum = validateBidMinimumSalary(validatorShape);
    const issues = minimum.issues.concat(deion.issues);

    const bidPreview = computeBidPreview({
      startYear: tier.seasonYear,
      signingBonusTotal: generated.signingBonusTotal,
      totalYears,
      voidYears: generated.voidYears,
      years: adjustedYears,
      weights,
    });

    const target = Number(row.targetPPV);
    const overshoot = bidPreview.totalPpv - target;
    const overshoots =
      target > 0 && overshoot > PPV_OVERSHOOT_MIN_ABS && overshoot > target * PPV_OVERSHOOT_MIN_PCT;

    return {
      generated,
      payload,
      appliedOptionBonuses,
      totalPpv: bidPreview.totalPpv,
      totalCap: bidPreview.totalCap,
      totalCash: bidPreview.totalCash,
      issues,
      valid: issues.length === 0,
      overshoots,
      overshoot,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.included, row.targetPPV, row.totalYears, row.philosophy, row.maxVoidYears, tier.seasonYear, weights]);

  useEffect(() => {
    onChangeRef.current({ preview });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const info = findInterestOption(interestOptions, row.interestLevel);
  const chart = row.chartInfo;

  return (
    <div
      className="assistant-box"
      style={{
        marginBottom: 16,
        opacity: row.alreadyBid ? 0.6 : 1,
        borderColor:
          row.included && row.preview && !row.preview.valid ? 'var(--accent-rust)' : 'var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {row.included && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                type="button"
                className="btn"
                style={{ padding: '2px 8px', fontSize: 11 }}
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn"
                style={{ padding: '2px 8px', fontSize: 11 }}
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
              >
                ↓
              </button>
            </div>
          )}
          <div>
            {row.included && (
              <p className="empty-note" style={{ margin: 0 }}>{'Priority ' + priority}</p>
            )}
            <p className="team-name" style={{ margin: 0 }}>
              {row.fullName}{' '}
              <span className="empty-note" style={{ margin: 0 }}>
                {row.position + (row.nflTeam ? ' · ' + row.nflTeam : '')}
              </span>
            </p>
            {row.alreadyBid && (
              <p className="empty-note" style={{ color: 'var(--accent-rust)', marginTop: 4 }}>
                Already bid on manually — edit that bid directly instead of delegating this player.
              </p>
            )}
            {/* The warning keys on submitted_bid_id, not status: a row at
                'draft', 'failed' or 'skipped' can still point at a live
                bid, because upsert_bid_delegation() resets the status on
                conflict without clearing submitted_bid_id. Status is still
                worth showing, so it stays in the informational line. */}
            {!row.alreadyBid && delegation && (
              <p
                className="empty-note"
                style={{
                  marginTop: 4,
                  color: hasStandingBid(delegation) ? 'var(--accent-rust)' : 'var(--text-dim)',
                }}
              >
                {hasStandingBid(delegation)
                  ? 'Auto-Bid already has a bid standing on this player (entry is ' +
                    delegation.status +
                    '). Including him again resubmits that bid with a new timestamp, losing any tie on total PPV.'
                  : 'Existing Auto-Bid entry: ' + delegation.status + '.'}
              </p>
            )}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <input
            type="checkbox"
            checked={row.included}
            disabled={row.alreadyBid}
            onChange={(e) => onChange({ included: e.target.checked })}
          />
          Include
        </label>
      </div>

      {!row.alreadyBid && (
        <>
          <div className="form-row" style={{ marginTop: 16 }}>
            <label>
              Interest Level
              <select value={row.interestLevel} onChange={(e) => onChange({ interestLevel: e.target.value })}>
                {interestOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label + (hasValue(opt.multiplier) ? ' (' + opt.multiplier + 'x)' : '')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Total Years
              <input
                type="number"
                min="1"
                max="5"
                value={row.totalYears}
                onChange={(e) => onChange({ totalYears: e.target.value })}
              />
            </label>
            <label>
              GM Philosophy
              <select value={row.philosophy} onChange={(e) => onChange({ philosophy: e.target.value })}>
                {Object.entries(PHILOSOPHY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Max Void Years
              <input
                type="number"
                min="0"
                max={Math.max(0, 5 - (Number(row.totalYears) || 1))}
                value={row.maxVoidYears}
                onChange={(e) => onChange({ maxVoidYears: e.target.value })}
              />
            </label>
          </div>

          {info.description && <p className="empty-note" style={{ marginTop: 8 }}>{info.description}</p>}

          <div className="form-row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
            <label>
              Target PPV
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.targetPPV === null || row.targetPPV === undefined ? '' : row.targetPPV}
                onChange={(e) => onChange({ targetPPV: e.target.value })}
              />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            {row.chartLoading && <p className="empty-note">Loading chart reference…</p>}
            {row.chartError && (
              <p className="empty-note" style={{ color: 'var(--accent-rust)' }}>
                Couldn&apos;t load chart reference: {row.chartError}
              </p>
            )}
            {chart && !row.chartLoading && (
              <>
                <p className="empty-note" style={{ marginBottom: 4 }}>
                  {chart.on_chart
                    ? 'League reference value (not a recommendation): ' +
                      fmt(chart.chart_total_ppv) +
                      ' total PPV at ' +
                      chart.total_years +
                      ' yr' +
                      (Number(chart.total_years) === 1 ? '' : 's') +
                      ' (' +
                      fmt(chart.per_year_value) +
                      '/yr, likely deal ' +
                      chart.likely_years +
                      ' yr' +
                      (Number(chart.likely_years) === 1 ? '' : 's') +
                      ').'
                    : 'Not on the published chart — there is no league value for him. The suggested target is priced off the cheapest legal bid at this length, scaled by your interest level and never falling below that floor.'}
                </p>
                {hasValue(chart.minimum_legal_ppv) && (
                  <p className="empty-note" style={{ marginTop: 0, marginBottom: 4 }}>
                    {'Cheapest legal bid at this length: ' +
                      fmt(chart.minimum_legal_ppv) +
                      ' total PPV. No bid below that can be submitted.'}
                  </p>
                )}
                {hasValue(row.chartDerivedTarget) &&
                  Number(row.targetPPV) !== Number(row.chartDerivedTarget) && (
                    <p className="empty-note" style={{ marginTop: 0 }}>
                      {'Suggested target was ' + fmt(row.chartDerivedTarget) + '; you have overridden it.'}
                    </p>
                  )}
              </>
            )}
          </div>

          {row.included && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {!row.preview && <p className="empty-note">Enter a target PPV to generate a preview.</p>}
              {row.preview && (
                <>
                  <p className="empty-note" style={{ margin: 0 }}>
                    {'Achieved PPV: ' +
                      fmt(row.preview.generated.achievedPPV) +
                      ' · Total PPV: ' +
                      fmt(row.preview.totalPpv) +
                      ' · Cap: ' +
                      fmt(row.preview.totalCap) +
                      ' · Cash: ' +
                      fmt(row.preview.totalCash) +
                      ' · Void years used: ' +
                      row.preview.generated.voidYears}
                  </p>

                  {row.preview.appliedOptionBonuses.length > 0 && (
                    <p className="empty-note" style={{ marginTop: 8, marginBottom: 0 }}>
                      {row.preview.appliedOptionBonuses.length +
                        ' option bonus' +
                        (row.preview.appliedOptionBonuses.length === 1 ? '' : 'es') +
                        ' applied (' +
                        row.preview.appliedOptionBonuses
                          .map((a) => a.season + ': ' + a.amount)
                          .join(', ') +
                        ').'}
                    </p>
                  )}

                  {row.preview.overshoots && (
                    <p className="empty-note" style={{ color: 'var(--accent-rust)', marginTop: 8, marginBottom: 0 }}>
                      {'⚠ Real total PPV is ' +
                        fmt(row.preview.totalPpv) +
                        ', which is ' +
                        fmt(row.preview.overshoot) +
                        ' above your target of ' +
                        fmt(row.targetPPV) +
                        '. Option bonuses count toward PPV in the live bid math but are not modelled by the ' +
                        "assistant's target, so treat the total above as the real number — this is what gets submitted."}
                    </p>
                  )}

                  {row.preview.valid ? (
                    <p className="empty-note" style={{ color: 'var(--accent-gold)', marginTop: 8 }}>
                      ✓ Valid — this player can be included.
                    </p>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <p className="empty-note" style={{ color: 'var(--accent-rust)', margin: 0 }}>
                        ✗ This player cannot be included until these are fixed:
                      </p>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14 }}>
                        {row.preview.issues.map((issue, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {{id:string, name:string, seasonYear:number, closesAt:string}} props.tier
 * @param {Array<{id:string, fullName:string, position:string, nflTeam:string}>} props.players
 * @param {Array<string>} props.alreadyBidPlayerIds
 * @param {object} props.weights - from buildWeightLookup(), fetched server-side
 * @param {Array} props.interestLevelRows - raw bid_interest_levels rows
 */
export default function DelegateForm({
  tier,
  players,
  alreadyBidPlayerIds,
  existingDelegations,
  weights,
  interestLevelRows,
}) {
  const alreadyBidSet = useMemo(() => new Set(alreadyBidPlayerIds), [alreadyBidPlayerIds]);
  const [rows, setRows] = useState(() => buildInitialRows(players, alreadyBidSet));
  const [maxBids, setMaxBids] = useState('');
  const [maxTotalCash, setMaxTotalCash] = useState('');
  const [maxTotalCap, setMaxTotalCap] = useState('');
  const [mode, setMode] = useState('execute');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summary, setSummary] = useState(null);

  const interestOptions = useMemo(() => buildInterestOptions(interestLevelRows), [interestLevelRows]);

  // player_id -> this owner's whole existing delegation row in this tier.
  // The whole row, not just the status: eligibility and the per-row
  // warning both need submitted_bid_id as well. One row per
  // (tier, player, team), so one delegation per player.
  const delegationByPlayer = useMemo(() => {
    const map = new Map();
    (existingDelegations || []).forEach((d) => map.set(d.player_id, d));
    return map;
  }, [existingDelegations]);

  // Whether Propose may auto-CHECK this row. Deliberately narrower than
  // "can this row be included at all" -- an owner may still check any of
  // these by hand, which is exactly the revision path. See the comment on
  // PROPOSE_INELIGIBLE_STATUS above for why the live-bid test reads
  // submitted_bid_id rather than status.
  function proposeWouldCheck(row) {
    if (row.alreadyBid) return false;
    const delegation = delegationByPlayer.get(row.playerId);
    if (hasStandingBid(delegation)) return false;
    if (delegation && delegation.status === PROPOSE_INELIGIBLE_STATUS) return false;
    return true;
  }

  // Switching modes resets ONLY the Include checkboxes. Interest level,
  // length, philosophy and any hand-edited target survive untouched.
  function handleModeChange(nextMode) {
    setMode(nextMode);
    setRows((prev) =>
      prev.map((r) => ({ ...r, included: nextMode === 'propose' ? proposeWouldCheck(r) : false }))
    );
  }

  function updateRow(playerId, patch) {
    setRows((prev) => prev.map((r) => (r.playerId === playerId ? { ...r, ...patch } : r)));
  }

  // Swaps two rows' positions directly in the array (not just their
  // logical priority), so display order and priority order are always the
  // same thing -- rendering is a plain rows.map(), and priority for an
  // included row is just its position among included rows in that same
  // array. This is Up/Down buttons rather than drag-and-drop: this
  // codebase has no drag-and-drop library, and this environment has no way
  // to verify a drag interaction live, so buttons give the same reordering
  // capability without a new dependency or an unverifiable interaction.
  function moveRow(playerId, direction) {
    setRows((prev) => {
      const includedIds = prev.filter((r) => r.included).map((r) => r.playerId);
      const posInIncluded = includedIds.indexOf(playerId);
      if (posInIncluded === -1) return prev;
      const targetPos = posInIncluded + direction;
      if (targetPos < 0 || targetPos >= includedIds.length) return prev;

      const otherPlayerId = includedIds[targetPos];
      const arrayIdxA = prev.findIndex((r) => r.playerId === playerId);
      const arrayIdxB = prev.findIndex((r) => r.playerId === otherPlayerId);

      const next = prev.slice();
      const tmp = next[arrayIdxA];
      next[arrayIdxA] = next[arrayIdxB];
      next[arrayIdxB] = tmp;
      return next;
    });
  }

  const includedRows = rows.filter((r) => r.included);

  async function handleApprove() {
    setError(null);
    setSummary(null);

    if (includedRows.length === 0) {
      setError('Include at least one player before approving.');
      return;
    }
    const missingPreview = includedRows.filter((r) => !r.preview);
    if (missingPreview.length > 0) {
      setError(
        'Set a target PPV for every included player first: ' + missingPreview.map((r) => r.fullName).join(', ')
      );
      return;
    }
    const invalidRows = includedRows.filter((r) => !r.preview.valid);
    if (invalidRows.length > 0) {
      setError('Fix validation issues before approving: ' + invalidRows.map((r) => r.fullName).join(', '));
      return;
    }

    setIsSubmitting(true);
    try {
      for (let i = 0; i < includedRows.length; i++) {
        const r = includedRows[i];
        await upsertDelegation({
          tierId: tier.id,
          playerId: r.playerId,
          mode,
          priority: i + 1,
          totalYears: Number(r.totalYears),
          voidYears: r.preview.generated.voidYears,
          signingBonusTotal: r.preview.generated.signingBonusTotal,
          years: r.preview.payload.years,
          optionBonuses: r.preview.payload.optionBonuses,
          targetPpv: Number(r.targetPPV),
          philosophy: r.philosophy,
          generatedPpv: r.preview.generated.achievedPPV,
          previewTotalPpv: r.preview.totalPpv,
          previewTotalCap: r.preview.totalCap,
          previewTotalCash: r.preview.totalCash,
          assistantNote: r.preview.generated.compromiseNote || r.preview.generated.floorTopUpNote || null,
          validated: r.preview.valid,
          validationIssues: r.preview.issues,
          // Chart provenance -- what the league chart suggested, stored
          // alongside what the owner actually used. chartTotalPpv is
          // legitimately null for an off-chart player and must stay null
          // rather than becoming 0; the Server Action preserves that.
          interestLevel: r.interestLevel,
          chartTotalPpv: r.chartInfo ? r.chartInfo.chart_total_ppv : null,
          chartDerivedTarget: r.chartDerivedTarget,
        });
      }

      const armResult = await armDelegations({
        tierId: tier.id,
        maxBids: maxBids === '' ? null : Number(maxBids),
        maxTotalCash: maxTotalCash === '' ? null : Number(maxTotalCash),
        maxTotalCap: maxTotalCap === '' ? null : Number(maxTotalCap),
        note: null,
      });

      setSummary(armResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page">
      <p className="page-actions">
        <a href="/">← Home</a> · <a href="/bids">← Back to Auction</a>
      </p>

      <p className="eyebrow">{tier.name}</p>
      <h1 className="team-name">Set Up Auto-Bid</h1>
      <p className="subhead" style={{ marginBottom: 20 }}>
        Bidding closes {formatDateTime(tier.closesAt)}. Approving below submits real,
        sealed bids immediately — the same as bidding yourself.
      </p>

      {error && <div className="form-error">{error}</div>}

      <div className="admin-form">
        <h2 className="section-heading" style={{ marginTop: 0 }}>Worst-Case Exposure</h2>
        <p className="subhead" style={{ marginBottom: 16 }}>
          These are the totals if every delegated bid below wins. In a sealed, simultaneous auction
          the number of wins can&apos;t be capped at submission time — you don&apos;t know what
          you&apos;ll win, and you can&apos;t withdraw after close. This ceiling limits how bad the
          worst case can be, not how many bids will actually win.
        </p>
        <div className="form-row">
          <label>
            Max Bids
            <input
              type="number"
              min="0"
              step="1"
              placeholder="No limit"
              value={maxBids}
              onChange={(e) => setMaxBids(e.target.value)}
            />
          </label>
          <label>
            Max Total Cash
            <input
              type="number"
              min="0"
              step="1"
              placeholder="No limit"
              value={maxTotalCash}
              onChange={(e) => setMaxTotalCash(e.target.value)}
            />
          </label>
          <label>
            Max Total Cap
            <input
              type="number"
              min="0"
              step="1"
              placeholder="No limit"
              value={maxTotalCap}
              onChange={(e) => setMaxTotalCap(e.target.value)}
            />
          </label>
        </div>

        <h2 className="section-heading">Mode</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          {MODE_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
                flex: '1 1 220px',
                opacity: opt.disabled ? 0.5 : 1,
              }}
            >
              <input
                type="radio"
                name="mode"
                value={opt.key}
                checked={mode === opt.key}
                disabled={opt.disabled}
                onChange={() => handleModeChange(opt.key)}
                style={{ marginTop: 4 }}
              />
              <span>
                <strong style={{ display: 'block' }}>{opt.label}</strong>
                <span className="empty-note" style={{ margin: 0 }}>{opt.description}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="empty-note" style={{ marginTop: 0, marginBottom: 8 }}>
          Switching modes resets only the Include checkboxes. Interest level, length, philosophy
          and any target you have edited by hand are kept.
        </p>

        {mode === 'propose' && (
          <p className="empty-note" style={{ marginTop: 0, marginBottom: 16, color: 'var(--accent-rust)' }}>
            Players with a bid already standing, and players you cancelled, start unchecked.
            Checking a player whose bid is already standing resubmits it with a new timestamp,
            which loses any tie on total PPV.
          </p>
        )}

        <h2 className="section-heading">Players</h2>
        <p className="subhead" style={{ marginBottom: 16 }}>
          Pick an interest level and length for each player you want Auto-Bid to consider — the
          target PPV re-derives from the league chart automatically and stays editable. Include the
          ones you want delegated; priority controls which fires first if more than one wins.
        </p>

        {rows.map((r) => {
          const includedIndex = includedRows.findIndex((ir) => ir.playerId === r.playerId);
          return (
            <DelegateRow
              key={r.playerId}
              row={r}
              priority={includedIndex + 1}
              canMoveUp={includedIndex > 0}
              canMoveDown={includedIndex !== -1 && includedIndex < includedRows.length - 1}
              onMove={(direction) => moveRow(r.playerId, direction)}
              tier={tier}
              weights={weights}
              interestOptions={interestOptions}
              delegation={delegationByPlayer.get(r.playerId)}
              onChange={(patch) => updateRow(r.playerId, patch)}
            />
          );
        })}

        {players.length === 0 && <p className="empty-note">This tier has no players assigned yet.</p>}

        <div style={{ marginTop: 24 }}>
          <button type="button" className="btn" disabled={isSubmitting} onClick={handleApprove}>
            {isSubmitting
              ? 'Submitting…'
              : 'Approve — Submit ' + includedRows.length + ' Bid' + (includedRows.length === 1 ? '' : 's')}
          </button>
          <p className="empty-note" style={{ marginTop: 8 }}>
            Approving submits real, sealed bids immediately for every included player above — the
            same as bidding yourself. There is no scheduled or later-firing option; everything
            fires now.
          </p>
        </div>

        {summary && (
          <div className="assistant-box" style={{ marginTop: 16 }}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--accent-gold)' }}>Auto-Bid armed.</p>
            <p className="empty-note" style={{ marginTop: 8 }}>
              {(summary.fired || 0) +
                ' bid' +
                ((summary.fired || 0) === 1 ? '' : 's') +
                ' submitted · ' +
                (summary.skipped || 0) +
                ' skipped (exceeded the ceiling) · ' +
                (summary.failed || 0) +
                ' failed'}
            </p>
            <p className="empty-note" style={{ marginTop: 4 }}>
              {'Exposure if everything submitted here wins: ' +
                fmt(summary.exposure_cash) +
                ' cash, ' +
                fmt(summary.exposure_cap) +
                ' cap.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
