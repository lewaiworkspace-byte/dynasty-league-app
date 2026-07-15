'use client';

import { useState, useTransition } from 'react';
import { createContract } from './actions';

const emptyYear = () => ({
  guaranteedSalary: 0,
  nonGuaranteedSalary: 0,
  optionBonus: 0,
  rosterBonus: 0,
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

  const isRookieType = contractType === 'rookie' || contractType === 'fifth_year_option';
  const isFreeAgent = contractType === 'veteran_free_agent';
  const effectiveVoidYears = isFreeAgent ? Number(voidYears) || 0 : 0;
  const totalRows = Math.min(7, Number(totalYears) + effectiveVoidYears);

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
            Void Years (0-2)
            <input
              type="number"
              min="0"
              max="2"
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

      {isRookieType && (
        <div className="form-row">
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
        </div>
      )}

      <h2 className="section-heading">Year-by-Year Salary</h2>
      <p className="subhead" style={{ marginBottom: 20 }}>
        Signing bonus is split evenly across all {totalRows} year{totalRows === 1 ? '' : 's'}{' '}
        automatically — enter guaranteed / non-guaranteed salary and any bonuses per season below.
      </p>

      <table className="ledger year-table">
        <thead>
          <tr>
            <th>Season</th>
            <th style={{ textAlign: 'right' }}>Guaranteed</th>
            <th style={{ textAlign: 'right' }}>Non-Guaranteed</th>
            <th style={{ textAlign: 'right' }}>Option Bonus</th>
            <th style={{ textAlign: 'right' }}>Roster Bonus</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRows }).map((_, idx) => {
            const isVoid = idx + 1 > Number(totalYears);
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
              </tr>
            );
          })}
        </tbody>
      </table>

      <button type="submit" className="btn" disabled={isPending} style={{ marginTop: 32 }}>
        {isPending ? 'Saving…' : 'Save Contract'}
      </button>
    </form>
  );
}
