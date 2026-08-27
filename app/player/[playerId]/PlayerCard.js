'use client';

import { useState } from 'react';
import { formatMoney } from '../../../lib/formatMoney';
import { n, contractTypeLabel } from './cardHelpers';
import ContractTab from './ContractTab';
import EarningsTab from './EarningsTab';
import TransactionsTab from './TransactionsTab';
import StatsTab from './StatsTab';
import MarketValueTab from './MarketValueTab';

// The Player Card shell: identity header, the three-figure stat strip, and
// the five top-level tabs. Modeled on a Spotrac player page, adapted to
// what the EDFL actually tracks.
//
// The header is deliberately rendered inside this client component rather
// than the server page so it never unmounts while tabs switch -- same
// reason TeamCapSheet owns its own tab state.

const TAB_CONTRACT = 'contract';
const TAB_EARNINGS = 'earnings';
const TAB_TRANSACTIONS = 'transactions';
const TAB_STATS = 'stats';
const TAB_VALUE = 'value';

const TABS = [
  { key: TAB_CONTRACT, label: 'Contract Details' },
  { key: TAB_EARNINGS, label: 'EDFL Earnings' },
  { key: TAB_TRANSACTIONS, label: 'Transactions' },
  { key: TAB_STATS, label: 'Statistics' },
  { key: TAB_VALUE, label: 'Market Value' },
];

export default function PlayerCard({
  leagueName,
  currentSeasonYear,
  header,
  contracts,
  years,
  livePreview,
  earnings,
  feed,
  valueHistory,
  capSettings,
}) {
  const [tab, setTab] = useState(TAB_CONTRACT);

  const hasHistory = Boolean(header.has_edfl_history);

  // The three Spotrac strip figures, from the database views:
  // current-season cap hit and cash from player_card_header; earnings to
  // date is what teams have actually been charged for this player -- cash
  // through the current season on active contracts, plus dead cash already
  // charged when a contract ended early. Charbonnet reads $4 here, not the
  // $14 his contract was written for; the full breakdown lives on the
  // EDFL Earnings tab.
  const capHit = n(header.current_season_cap);
  const cashNow = n(header.current_season_cash);
  const earnedToDate = earnings
    ? (n(earnings.cash_through_current_season) || 0) +
      (n(earnings.dead_cash_charged) || 0)
    : null;

  const identityBits = [];
  if (header.position) identityBits.push(header.position);
  if (header.nfl_team) identityBits.push(header.nfl_team);
  if (header.nfl_status && header.nfl_status !== 'Active') {
    identityBits.push(header.nfl_status);
  }

  return (
    <>
      <p className="eyebrow">{leagueName} · Player Card</p>
      <h1>{header.full_name}</h1>
      <p className="pc-ident">
        {identityBits.join(' · ') || 'Position unknown'}
        {header.current_team ? (
          <>
            {' · '}
            <a href={'/team/' + header.current_team_id}>{header.current_team}</a>
            {header.roster_status && header.roster_status !== 'active' ? (
              <span
                className={
                  'status status-live'
                }
                style={{ marginLeft: 8 }}
              >
                {header.roster_status === 'taxi' ? 'Taxi Squad' : 'IR'}
              </span>
            ) : null}
          </>
        ) : (
          ' · EDFL Free Agent'
        )}
      </p>

      <div className="stat-strip">
        <div>
          <div className="stat-label">{currentSeasonYear} Cap Hit</div>
          <div className="stat-value">{formatMoney(capHit)}</div>
        </div>
        <div>
          <div className="stat-label">{currentSeasonYear} Cash</div>
          <div className="stat-value">{formatMoney(cashNow)}</div>
        </div>
        <div>
          <div className="stat-label">EDFL Earnings To Date</div>
          <div className="stat-value">
            {hasHistory ? formatMoney(earnedToDate) : '—'}
          </div>
        </div>
        {header.current_contract_type ? (
          <div>
            <div className="stat-label">Contract Type</div>
            <div className="stat-value" style={{ fontSize: 15 }}>
              {contractTypeLabel(header.current_contract_type)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(function (t) {
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={'tab' + (tab === t.key ? ' is-active' : '')}
              onClick={function () {
                setTab(t.key);
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === TAB_CONTRACT && (
        <ContractTab
          header={header}
          contracts={contracts}
          years={years}
          livePreview={livePreview}
          capSettings={capSettings}
          currentSeasonYear={currentSeasonYear}
        />
      )}
      {tab === TAB_EARNINGS && (
        <EarningsTab
          header={header}
          earnings={earnings}
          contracts={contracts}
          years={years}
          currentSeasonYear={currentSeasonYear}
        />
      )}
      {tab === TAB_TRANSACTIONS && <TransactionsTab header={header} feed={feed} />}
      {tab === TAB_STATS && <StatsTab playerId={header.player_id} position={header.position} />}
      {tab === TAB_VALUE && (
        <MarketValueTab header={header} valueHistory={valueHistory} />
      )}
    </>
  );
}
