'use client';

import { useState } from 'react';
import { recordCashTransaction } from './actions';

export default function CashForm({ teams, seasonYear }) {
  const [teamId, setTeamId] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('adjustment');
  const [note, setNote] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setIsPending(true);
    try {
      await recordCashTransaction({ teamId, amount, category, note, seasonYear });
      setSaved(true);
      setAmount('');
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      {saved && (
        <p className="empty-note" style={{ color: 'var(--accent-gold)' }}>✓ Transaction recorded.</p>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="form-row">
        <label>
          Team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
            <option value="">— pick a team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <label>
          Amount
          <input
            type="number"
            step="1"
            required
            placeholder="e.g. 250 or -100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="cash_purchase">Cash purchase</option>
            <option value="penalty">Penalty</option>
            <option value="adjustment">Adjustment</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <label>
        Note (shown to the owner on their audit page)
        <input
          type="text"
          placeholder="e.g. Bought $250 cash ($10) — added to prize pool"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <p className="empty-note">
        Positive = credit (e.g. a cash purchase). Negative = deduction (e.g. a penalty).
      </p>

      <button type="submit" className="btn" disabled={isPending}>
        {isPending ? 'Saving…' : 'Record Transaction'}
      </button>
    </form>
  );
}
