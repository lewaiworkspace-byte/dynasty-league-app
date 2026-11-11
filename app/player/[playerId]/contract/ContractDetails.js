'use client';

import ContractTab from '../ContractTab';
import EarningsTab from '../EarningsTab';
import MarketValueTab from '../MarketValueTab';
import Breadcrumbs from '../../../../components/Breadcrumbs';

// The Full contract details page's body -- UI test batch 6, November 2026.
// The three blocks are the old Contract tab's, in its order, with its
// headings; none of the three components is edited. The card's Contract box
// links here; this page links back.

export default function ContractDetails({
  leagueName,
  currentSeasonYear,
  header,
  contracts,
  years,
  livePreview,
  earnings,
  valueHistory,
  capSettings,
}) {
  const cardHref = '/player/' + header.player_id;
  return (
    <>
      <Breadcrumbs
        trail={[
          {
            label: header.current_team,
            href: header.current_team_id ? '/team/' + header.current_team_id : null,
          },
          { label: header.full_name, href: cardHref },
          { label: 'Contract details' },
        ]}
      />

      <p className="eyebrow">{leagueName} &middot; Player Card</p>
      <h1>{header.full_name}: full contract details</h1>
      <p className="edfl-pc-back">
        <a href={cardHref}>&larr; Back to {header.full_name}&rsquo;s card</a>
      </p>

      <ContractTab
        header={header}
        contracts={contracts}
        years={years}
        livePreview={livePreview}
        capSettings={capSettings}
        currentSeasonYear={currentSeasonYear}
      />

      <h2 className="section-heading">Career in the EDFL</h2>
      <EarningsTab
        header={header}
        earnings={earnings}
        contracts={contracts}
        years={years}
        currentSeasonYear={currentSeasonYear}
      />

      <h2 className="section-heading">Market value history</h2>
      <MarketValueTab header={header} valueHistory={valueHistory} />

      <p className="edfl-pc-back">
        <a href={cardHref}>&larr; Back to {header.full_name}&rsquo;s card</a>
      </p>
    </>
  );
}
