'use client';

import { useState, useTransition, useMemo } from 'react';
import { createContract } from './actions';
import { supabase } from '../../../lib/supabaseClient';
import { generateContract, PHILOSOPHY_LABELS } from '../../../lib/contractAssistant';
import { computeContractPreview } from '../../../lib/contractMath';

const emptyYear = () => ({
  guaranteedSalary: 0,
  nonGuaranteedSalary: 0,
  optionBonus: 0,
  rosterBonus: 0,
  proratedSigningBonus: null, // null = let the server evenly divide the total
});

export default function ContractForm({ teams }) {
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [playerName, setPlayerName] = useState('');
  const [position, setPosition] = useState('WR');
  const [nflTeam, setNflTeam] = useState('');
  const [contractType, setContractType] = useState('veteran_free_agent');
  const [startYear, setStartYear] = useState(2026);
  const [totalYears, setTotalYears] = useState(1);
  const [voidYears, setVoidYears] = useState(0);
  const [draftYear, setDraftYear] = useState('');
  const [draftRound, setDraftRound] = useState('');
  const [draftPick, setDraftPick] = useState('');
  const [signingBonusTotal, setSigningBonusTotal] = useState(0);
  const [years, setYears] = useState(Array.from({ length: 7 }, emptyYear));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [wageScaleStatus, setWageScaleStatus] = useState(null); // null | 'loading' | 'loaded' | 'not_found' | 'error'

  const [targetPPV, setTargetPPV] = useState(50);
  const [philosophy, setPhilosophy] = useState('pay_as_you_go');
  const [assistantResult, setAssistantResult] = useState(null);

  const isRookieType = contractType === 'rookie' || contractType === 'fifth_year_option';
  const isFreeAgent = contractType === 'veteran_free_agent';
  const effectiveVoidYears = isFreeAgent ? Number(voidYears) || 0 : 0;
  const totalRows = Math.min(7, Number(totalYears) + effectiveVoidYears);

  const preview = useMemo(
    () =>
      computeContractPreview({
        startYear: Number(startYear) || 2026,
        signingBonusTotal: Number(signingBonusTotal) || 0,
        totalYears: Number(totalYears) || 0,
        voidYears: effectiveVoidYears,
        years,
      }),
    [signingBonusTotal, totalYears, effectiveVoidYears, years, startYear]
  );

  function handleGenerateContract() {
    const T = Number(totalYears);
    const maxVoid = Math.max(0, 5 - T);
    const result = generateContract(Number(targetPPV), T, philosophy, maxVoid);

    setSigningBonusTotal(result.signingBonusTotal);
    setVoidYears(result.voidYears);

    setYears((prev) => {
      const next = Array.from({ length: 7 }, emptyYear);
      result.years.forEach((y, idx) => {
        next[idx] = {
          guaranteedSalary: y.guaranteedSalary,
          nonGuaranteedSalary: y.nonGuaranteedSalary,
          optionBonus: 0,
          rosterBonus: y.rosterBonus,
          proratedSigningBonus: null, // let the server prorate evenly across real + void years
        };
      });
      return next;
    });

    setAssistantResult(result);
  }

  async function handleLoadWageScale() {
    setWageScaleStatus('loading');
    try {
      const dy = Number(draftYear);
      const dr = Number(draftRound);
      const dp = Number(draftPick);

      const { data: slot, error: slotErr } = await supabase
        .from('rookie_wage_scale_slots')
        .select('*')
        .eq('draft_year', dy)
        .eq('round', dr)
        .eq('pick', dp)
        .maybeSingle();

      if (slotErr) throw slotErr;
      if (!slot) {
        setWageScaleStatus('not_found');
        return;
      }

      const { data: yearRows, error: yearsErr } = await supabase
        .from('rookie_wage_scale_years')
        .select('*')
        .eq('draft_year', dy)
        .eq('round', dr)
        .eq('pick', dp)
        .order('contract_year_number');

      if (yearsErr) throw yearsErr;

      setSigningBonusTotal(slot.signing_bonus_total);
      setTotalYears(slot.kept_years);
      setStartYear(2026);

      setYears((prev) => {
        const next = Array.from({ length: 7 }, emptyYear);
        (yearRows || []).forEach((y, idx) => {
          next[idx] = {
            guaranteedSalary: y.guaranteed_salary,
            nonGuaranteedSalary: y.non_guaranteed_salary,
            optionBonus: 0,
            rosterBonus: y.roster_bonus,
            proratedSigningBonus: y.prorated_signing_bonus,
          };
        });
        return next;
      });

      setWageScaleStatus('loaded');
    } catch (err) {
      console.error(err);
      setWageScaleStatus('error');
    }
  }

  function updateYearField(index, field, value) {
    setYears((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createContract({
          teamId,
          playerName,
          position,
          nflTeam,
          contractType,
          startYear,
          totalYears,
          voidYears: effectiveVoidYears,
          draftYear: isRookieType ? draftYear : '',
          draftRound: isRookieType ? draftRound : '',
          draftPick: isRookieType ? draftPick : '',
          signingBonusTotal,
          years,
        });
      } catch (err) {
        setError(err.message);
      }
    });
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}

      <div className="form-row">
        <label>
          Team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Contract Type
          <select value={contractType} onChange={(e) => setContractType(e.target.value)}>
            <option value="veteran_free_agent">Veteran Free Agent</option>
            <option value="rookie">Rookie</option>
            <option value="fifth_year_option">5th Year Option</option>
            <option value="practice_squad">Practice Squad</option>
          </select>
        </label>
      </div>

      <div className="form-row">
        <label>
          Player Name
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="e.g. Ja'Marr Chase"
            required
          />
        </label>

        <label>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="QB">QB</option>
            <option value="RB">RB</option>
            <option value="WR">WR</option>
            <option value="TE">TE</option>
            <option value="K">K</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label>
          NFL Team
          <input
            type="text"
            value={nflTeam}
            onChange={(e) => setNflTeam(e.target.value)}
            placeholder="e.g. CIN"
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Start Year
          <input
            type="number"
            value={startYear}
            onChange={(e) => setStartYear(e.target.value)}
            required
          />
        </label>

        <label>
          Real Years (1-5)
          <input
            type="number"
            min="1"
            max="5"
            value={totalYears}
            onChange={(e) => setTotalYears(e.target.value)}
            required
          />
        </label>

        {isFreeAgent && (
          <label>
            Void Years (0-{Math.max(0, 5 - Number(totalYears))})
            <input
              type="number"
              min="0"
              max={Math.max(0, 5 - Number(totalYears))}
              value={voidYears}
              onChange={(e) => setVoidYears(e.target.value)}
            />
          </label>
        )}

        <label>
          Signing Bonus (total)
          <input
            type="number"
            min="0"
            step="0.01"
            value={signingBonusTotal}
            onChange={(e) => setSigningBonusTotal(e.target.value)}
          />
        </label>
      </div>

      {isFreeAgent && (
        <div className="assistant-box">
          <h2 className="section-heading" style={{ marginTop: 0 }}>
            Contract Assistant
          </h2>
          <p className="subhead" style={{ marginBottom: 16 }}>
            Not sure how to structure this deal? Enter a target PPV and pick a philosophy —
            the assistant builds a complete, valid contract for you to review and adjust below.
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
            <button type="button" className="btn" onClick={handleGenerateContract}>
              Generate Contract
            </button>
          </div>
          {assistantResult && (
            <p className="empty-note" style={{ color: assistantResult.compromiseNote ? 'var(--accent-rust)' : 'var(--accent-gold)' }}>
              {assistantResult.compromiseNote
                ? `⚠ Achieved PPV: ${assistantResult.achievedPPV} (target was ${assistantResult.targetPPV}). ${assistantResult.compromiseNote}`
                : `✓ Generated — achieved PPV: ${assistantResult.achievedPPV} (target ${assistantResult.targetPPV}). Everything below is fully editable before you save.`}
            </p>
          )}
          {assistantResult && assistantResult.optionBonusRecommendations.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="empty-note" style={{ color: 'var(--accent-gold)', marginBottom: 6 }}>
                Recommended option bonuses (Roseman-style) — add these after saving, once this
                contract has a real ID to attach them to:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14 }}>
                {assistantResult.optionBonusRecommendations.map((rec, i) => (
                  <li key={i}>
                    Year {rec.yearOffset + 1} ({Number(startYear) + rec.yearOffset}): exercise an
                    option bonus of {rec.amount}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {isRookieType && (
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <label>
            Draft Year
            <input type="number" value={draftYear} onChange={(e) => setDraftYear(e.target.value)} />
          </label>
          <label>
            Draft Round
            <input type="number" value={draftRound} onChange={(e) => setDraftRound(e.target.value)} />
          </label>
          <label>
            Draft Pick
            <input type="number" value={draftPick} onChange={(e) => setDraftPick(e.target.value)} />
          </label>
          {contractType === 'rookie' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                className="btn"
                onClick={handleLoadWageScale}
                disabled={wageScaleStatus === 'loading'}
              >
                {wageScaleStatus === 'loading' ? 'Loading…' : 'Load from Wage Scale'}
              </button>
              {wageScaleStatus === 'loaded' && (
                <span className="empty-note" style={{ color: 'var(--accent-gold)' }}>
                  ✓ Loaded — bonus, years, and salary auto-filled below
                </span>
              )}
              {wageScaleStatus === 'not_found' && (
                <span className="empty-note" style={{ color: 'var(--accent-rust)' }}>
                  No wage scale entry for that year/round/pick
                </span>
              )}
              {wageScaleStatus === 'error' && (
                <span className="empty-note" style={{ color: 'var(--accent-rust)' }}>
                  Couldn&apos;t load wage scale — check the console for details
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <h2 className="section-heading">Year-by-Year Salary</h2>
      <p className="subhead" style={{ marginBottom: 8 }}>
        Signing bonus is split evenly across all {totalRows} year{totalRows === 1 ? '' : 's'}{' '}
        automatically — enter guaranteed / non-guaranteed salary and any bonuses per season below.
      </p>
      <p className="subhead" style={{ marginBottom: 20, fontStyle: 'italic' }}>
        Cap / Cash / Dead Cap columns update live as you type, using each season's real date — a
        roster bonus only counts toward Cap and Dead Cap once that season's September 2nd has
        passed.
      </p>

      <table className="ledger year-table">
        <thead>
          <tr>
            <th>Season</th>
            <th style={{ textAlign: 'right' }}>Guaranteed</th>
            <th style={{ textAlign: 'right' }}>Non-Guaranteed</th>
            <th style={{ textAlign: 'right' }}>Option Bonus</th>
            <th style={{ textAlign: 'right' }}>Roster Bonus</th>
            <th style={{ textAlign: 'right' }}>Cap Charge</th>
            <th style={{ textAlign: 'right' }}>Cash</th>
            <th style={{ textAlign: 'right' }}>Dead Cap if Cut</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRows }).map((_, idx) => {
            const isVoid = idx + 1 > Number(totalYears);
            const p = preview.rows[idx] || { capCharge: 0, cashValue: 0, deadCapIfCut: 0 };
            return (
              <tr key={idx}>
                <td className="team-name">
                  {Number(startYear) + idx}
                  {isVoid && <span className="void-tag"> VOID</span>}
                </td>
                {isVoid ? (
                  <td colSpan={4} className="empty-note">
                    Void year — no real salary, cap-only bonus proration.
                  </td>
                ) : (
                  <>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={years[idx].guaranteedSalary}
                        onChange={(e) => updateYearField(idx, 'guaranteedSalary', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={years[idx].nonGuaranteedSalary}
                        onChange={(e) => updateYearField(idx, 'nonGuaranteedSalary', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={years[idx].optionBonus}
                        onChange={(e) => updateYearField(idx, 'optionBonus', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={years[idx].rosterBonus}
                        onChange={(e) => updateYearField(idx, 'rosterBonus', e.target.value)}
                      />
                    </td>
                  </>
                )}
                <td className="num" style={{ textAlign: 'right' }}>{p.capCharge.toFixed(2)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{p.cashValue.toFixed(2)}</td>
                <td className="num negative" style={{ textAlign: 'right' }}>{p.deadCapIfCut.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--border)' }}>
            <td colSpan={5} style={{ fontWeight: 600, textAlign: 'right', paddingRight: 12 }}>
              Contract Totals
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

      <button type="submit" className="btn" disabled={isPending} style={{ marginTop: 32 }}>
        {isPending ? 'Saving…' : 'Save Contract'}
      </button>
    </form>
  );
}
