'use client';

import { useState } from 'react';
import ContractForm from './ContractForm';
import RestructureForm from '../../../components/RestructureForm';

// A MODE SWITCH ON THE PAGE, NOT A CONTRACT TYPE.
//
// Restructure is deliberately NOT a contract_type enum value. contract_type
// drives the 30% exemption, PPV weighting, the minimum-salary exemptions and
// option-bonus eligibility -- a restructured veteran deal is still a veteran
// deal, and giving it its own type would change how four unrelated rules read
// it. This component only decides which form is on screen.
//
// The restructure roster loads on demand inside RestructureForm rather than as
// page data, because it costs one eligibility round trip per active contract
// and most visits to this page are here to enter a new contract.

const MODE_NEW = 'new';
const MODE_RESTRUCTURE = 'restructure';

export default function ContractModeSwitch({ teams, initialMode }) {
  const [mode, setMode] = useState(initialMode === MODE_RESTRUCTURE ? MODE_RESTRUCTURE : MODE_NEW);

  return (
    <div>
      {/*
        NOT .admin-form. That class makes every label a column-direction flex
        box and gives every input a 44px tap target with a border and a
        background -- correct for the contract form's text fields, wrong for a
        radio, which it turns into a large empty box above its own label.
        .modal-check is the row-shaped label/control pairing this needs.
      */}
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 20px' }}>
        <legend className="section-heading">What are you doing?</legend>
        <label className="modal-check">
          <input
            type="radio"
            name="contract-mode"
            value={MODE_NEW}
            checked={mode === MODE_NEW}
            onChange={function () { setMode(MODE_NEW); }}
          />
          <span>
            <strong>New Contract</strong>
            <span className="empty-note" style={{ display: 'block' }}>
              Enter a signed contract for a player.
            </span>
          </span>
        </label>
        <label className="modal-check">
          <input
            type="radio"
            name="contract-mode"
            value={MODE_RESTRUCTURE}
            checked={mode === MODE_RESTRUCTURE}
            onChange={function () { setMode(MODE_RESTRUCTURE); }}
          />
          <span>
            <strong>Restructure Existing Contract</strong>
            <span className="empty-note" style={{ display: 'block' }}>
              Convert unpaid current-season salary into a new signing bonus with its own
              proration window. The original signing bonus is untouched.
            </span>
          </span>
        </label>
      </fieldset>

      {mode === MODE_NEW ? <ContractForm teams={teams} /> : <RestructureForm />}
    </div>
  );
}
