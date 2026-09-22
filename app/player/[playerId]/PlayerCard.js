'use client';

import { useState } from 'react';
import { contractTypeLabel } from './cardHelpers';
import OverviewTab from './OverviewTab';
import ContractTab from './ContractTab';
import EarningsTab from './EarningsTab';
import TransactionsTab from './TransactionsTab';
import StatsTab from './StatsTab';
import MarketValueTab from './MarketValueTab';
import Breadcrumbs from '../../../components/Breadcrumbs';
import PracticeSquadWarning from '../../../components/PracticeSquadWarning';
import InjuryChip from '../../../components/InjuryChip';
import RosterStatusChip from '../../../components/RosterStatusChip';
import PlayerHeadshot from '../../../components/PlayerHeadshot';

/**
 * THE PLAYER CARD SHELL -- phase 2D-1.
 *
 * Identity, the Player Value Chart strip, and THREE tabs: Overview, Contract,
 * Stats. It had five, and the cut follows R-9's shape on Team HQ: a tab bar
 * that does not fit a phone is a tab bar nobody reads the end of.
 *
 * WHAT MOVED, AND WHY NOTHING WAS LOST:
 *
 *   Market Value   its headline is now the strip below the name -- total PPV,
 *                  per-year value, tier, and which chart edition said so.
 *                  Visible on every tab instead of behind one, which is what
 *                  it is for: it is the number an owner is comparing the
 *                  contract against while reading the contract. The history
 *                  chart is a block at the foot of Contract.
 *   EDFL Earnings  a block at the foot of Contract, "Career in the EDFL".
 *                  What he has been paid belongs beside what he costs.
 *   Transactions   a block at the foot of Overview.
 *
 * NO TAB COMPONENT WAS EDITED. Each of the five returns a bare fragment with
 * no chrome of its own, so re-hosting one is a matter of putting a heading
 * above it. That is deliberate: those files hold the restructure prose, the
 * void-year arithmetic and the feed's kind vocabulary, and a complete-file
 * rewrite of them to change a tab bar is the SR-38 hazard for no gain.
 *
 * The header is rendered in this client component rather than the server page
 * so it never unmounts while tabs switch -- the same reason TeamCapSheet owns
 * its own tab state.
 */

const TAB_OVERVIEW = 'overview';
const TAB_CONTRACT = 'contract';
const TAB_STATS = 'stats';

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
  taxiStatus,
  weeks,
  weeksError,
}) {
  const [tab, setTab] = useState(TAB_OVERVIEW);

  const identityBits = [];
  if (header.position) identityBits.push(header.position);
  if (header.nfl_team) identityBits.push(header.nfl_team);
  if (header.nfl_status && header.nfl_status !== 'Active') {
    identityBits.push(header.nfl_status);
  }

  // THE VALUE STRIP READS player_card_header, not player_value_history. The
  // view already carries the most recent edition's figures as chart_* columns,
  // so the strip is a read rather than a pick-the-first-row -- and it cannot
  // disagree with the history block on Contract, which reads the same source
  // one level down.
  const ppv = header.chart_total_ppv;
  const perYear = header.chart_per_year_value;
  const tier = header.chart_value_tier;
  const likelyYears = header.chart_likely_years;
  const chartLabel = header.chart_snapshot_label;
  const hasChart = ppv !== null && ppv !== undefined;

  // A PPV FIGURE IS NOT MONEY. It is the league's own valuation unit and is
  // rendered as the view returned it -- no dollar sign, no rounding. Running it
  // through a money formatter is the mistake CLAUDE.md records about headcounts
  // ("$26" for twenty-six players), one category over.
  function chartNum(v) {
    if (v === null || v === undefined) return '—';
    return String(v);
  }

  function TabButton(props) {
    return (
      <button
        type="button"
        className={'edfl-tab' + (tab === props.id ? ' is-on' : '')}
        aria-current={tab === props.id ? 'page' : undefined}
        onClick={function () {
          setTab(props.id);
        }}
      >
        {props.label}
      </button>
    );
  }

  return (
    <>
      {/* BREADCRUMBS -- above the name, first thing on the card.
          September 11, 2026. Replaces the "<- Return to Cap Sheet" link
          requested September 7; the Cap Sheet crumb keeps that link in the
          same place, first after Home.

          Note what this row is NOT. PlayerLink opens the card with
          target="_blank" (components/PlayerLink.js, August 27 ruling: the
          card is a reference document and a reader should not lose their
          place), so from a cap sheet row these links do not take anyone
          "back" -- the page they came from is still sitting in the tab they
          came from. The row is for the other ways onto this page: a pasted
          URL, a bookmark, a link followed from another card, the browser's
          own history on a phone.

          The team crumb reads header.current_team / current_team_id -- the
          same fields the identity line below renders, so the two always
          agree. A player with no current team (a free agent) has no label
          there, and Breadcrumbs skips an unlabelled entry. */}
      <Breadcrumbs
        trail={[
          { label: 'Cap Sheet', href: '/cap-sheet' },
          {
            label: header.current_team,
            href: header.current_team_id ? '/team/' + header.current_team_id : null,
          },
          { label: header.full_name },
        ]}
      />

      <p className="eyebrow">{leagueName} &middot; Player Card</p>
      {/* THE IDENTITY HEADER -- redesigned September 21 2026.

          Photo (Sleeper's full-size headshot; initials when Sleeper has none),
          the name, and one chip row: where he sits on the EDFL roster
          (Active / IR / Practice Squad -- shown for Active too, per the
          commissioner) and his Sleeper injury designation with the red cross,
          e.g. "Out — Hamstring". The same three pieces the roster row wears,
          from the same components, so the two screens cannot drift.

          Nothing here decides anything. injury_flagged / injury_label are
          player_card_header's, from edfl_injury_cross_shows() and
          edfl_injury_label() -- every Sleeper designation draws the cross,
          ruling of September 21. That is NOT rule 3.4(b) IR eligibility,
          which is edfl_injury_designation_qualifies(), a separate predicate.

          The chip replaces the old "Taxi Squad" pill: the rule book's word is
          Practice Squad, and the roster says Practice Squad. */}
      <div className="rp-hero">
        <PlayerHeadshot
          size="lg"
          sleeperPlayerId={header.sleeper_player_id}
          fullName={header.full_name}
        />
        <div className="rp-hero-text">
          <h1 className="rp-hero-name">{header.full_name}</h1>
          <p className="pc-ident">
            {identityBits.join(' · ') || 'Position unknown'}
            {header.current_team ? (
              <>
                {' · '}
                <a href={'/team/' + header.current_team_id}>{header.current_team}</a>
              </>
            ) : (
              ' · EDFL Free Agent'
            )}
            {header.current_contract_type ? (
              <>
                {' · '}
                {contractTypeLabel(header.current_contract_type)}
              </>
            ) : null}
          </p>
          {header.current_team || header.injury_flagged ? (
            <div className="rp-chips">
              {header.current_team ? (
                <RosterStatusChip size="lg" status={header.roster_status || 'active'} />
              ) : null}
              <InjuryChip
                size="lg"
                flagged={header.injury_flagged}
                label={header.injury_label}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Rule 3.3(i). Above the strip and outside the tabs, so it is visible
          whichever tab the reader is on -- the same reason the identity header
          lives in this shell. Renders nothing when the view has nothing to
          say. */}
      <PracticeSquadWarning status={taxiStatus} />

      {/* ---- THE PLAYER VALUE CHART STRIP ----
          On every tab, because it is what the contract below is being judged
          against. A player the chart has never listed gets no strip at all
          rather than three dashes -- "not on the chart" and "worth nothing"
          are different facts. */}
      {hasChart ? (
        <>
          <div className="edfl-counts is-wide">
            <div className="edfl-count">
              <div className="edfl-count-label">TOTAL PPV</div>
              <div className="edfl-count-value">{chartNum(ppv)}</div>
            </div>
            <div className="edfl-count">
              <div className="edfl-count-label">PER YEAR</div>
              <div className="edfl-count-value">{chartNum(perYear)}</div>
            </div>
            <div className="edfl-count">
              <div className="edfl-count-label">TIER</div>
              <div className="edfl-count-value pc-tier">{tier || '—'}</div>
            </div>
          </div>
          <p className="empty-note">
            Player Value Chart
            {chartLabel ? ' · ' + chartLabel : ''}
            {likelyYears ? ' · likely ' + likelyYears + ' years' : ''}
            {' · '}
            <a href="/values">the whole chart</a>
          </p>
        </>
      ) : null}

      <div className="edfl-tabs edfl-hq-tabs" role="tablist" aria-label="Player card sections">
        <TabButton id={TAB_OVERVIEW} label="Overview" />
        <TabButton id={TAB_CONTRACT} label="Contract" />
        <TabButton id={TAB_STATS} label="Stats" />
      </div>

      {tab === TAB_OVERVIEW && (
        <OverviewTab
          header={header}
          livePreview={livePreview}
          currentSeasonYear={currentSeasonYear}
          weeks={weeks}
          weeksError={weeksError}
          feed={feed}
        />
      )}

      {tab === TAB_CONTRACT && (
        <div>
          <ContractTab
            header={header}
            contracts={contracts}
            years={years}
            livePreview={livePreview}
            capSettings={capSettings}
            currentSeasonYear={currentSeasonYear}
          />

          {/* Was the EDFL Earnings tab. Unedited component, new home. */}
          <h2 className="section-heading">Career in the EDFL</h2>
          <EarningsTab
            header={header}
            earnings={earnings}
            contracts={contracts}
            years={years}
            currentSeasonYear={currentSeasonYear}
          />

          {/* Was the Market Value tab. Its headline is the strip above; this is
              the history behind it. */}
          <h2 className="section-heading">Market value history</h2>
          <MarketValueTab header={header} valueHistory={valueHistory} />
        </div>
      )}

      {tab === TAB_STATS && (
        <StatsTab playerId={header.player_id} position={header.position} />
      )}
    </>
  );
}
