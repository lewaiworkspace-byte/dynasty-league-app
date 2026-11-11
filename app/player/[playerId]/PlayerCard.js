'use client';

import { useEffect, useRef, useState } from 'react';
import { contractTypeLabel, n } from './cardHelpers';
import ContractBox from './ContractBox';
import SeasonChart from './SeasonChart';
import TransactionsTab from './TransactionsTab';
import StatsTab from './StatsTab';
import Breadcrumbs from '../../../components/Breadcrumbs';
import PracticeSquadWarning from '../../../components/PracticeSquadWarning';
import InjuryCross from '../../../components/InjuryCross';
import { formatCost, formatMoney } from '../../../lib/formatMoney';
import { formatDate } from '../../../lib/formatDate';
import { headshotUrl, playerInitials } from '../../../lib/playerHeadshot';

/**
 * THE PLAYER CARD -- UI TEST BATCH 6, NOVEMBER 2026: ONE PAGE, NO TABS.
 *
 * Lewis's pick on the Claude Design canvas "EDFL Player Card (test site)",
 * artboards YOUR PICK: Option C (one page, jump buttons) with Option B's
 * "Contract, year by year" (October 29, 2026), and his notes on it through
 * November 10, 2026. Read back and approved November 10. Look only: no rule,
 * figure or money calculation changed, and no figure here is new.
 *
 * THE HEADER: his Sleeper headshot (initials when Sleeper has none), name,
 * identity line, and START RATE in place of the value strip (Lewis, Nov 9:
 * "Showing PPV here has no value. Instead show start % for the current
 * season. In the offseason show the start % for the previous season." and,
 * 9:22 PM, start = "he was a high enough scorer to have his score count").
 * The tier left the header (Nov 9: "Remove this, it isn't important"); it
 * stays in the Value box. The waiver note, the Taxi Squad / IR chip, the
 * injury cross and the practice squad warning are unchanged.
 *
 * THE BOXES, in Lewis's order (Oct 29, 11:37 and 11:38 PM): Actions, This
 * season, Contract, Value, Stats, History. Jump buttons wrap on a phone so
 * every one is on screen (Oct 29, 11:32 PM) and run down the left side from
 * 900px; the lit one follows the box in view.
 *
 * WHERE THE OLD TABS WENT:
 *   Overview   what he costs -> the Contract box's current-season card; his
 *              weekly scores -> This season (now a chart with projections and
 *              a trend); Transactions -> History, losing bids folded.
 *   Contract   the year-by-year summary -> the Contract box; everything else
 *              (Cap / Cash / Visual breakdowns, contract history, Career in
 *              the EDFL, Market value history) -> /player/<id>/contract,
 *              "Full contract details", unchanged.
 *   Stats      -> the Stats box, with Pos Rk after FPPG.
 *   Actions    -> the Actions box, still drawn only for the owner's own
 *              player and still deciding and writing nothing.
 *
 * The value strip's figures (total PPV, per year, tier) move to the Value
 * box, which reads the same player_card_header columns. PPV IS NOT MONEY: it
 * is drawn as a bare number with .v-ppv, never through a money formatter.
 */

const SEC_ACTIONS = 'actions';

function PlayerFace({ sleeperId, name }) {
  const [broken, setBroken] = useState(false);
  const imgRef = useRef(null);
  const url = headshotUrl(sleeperId, 'full');
  // An image that failed before React attached onError is caught on mount
  // (the roster rows' lesson, batch 5): no broken-image mark over the initials.
  useEffect(
    function () {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth === 0) setBroken(true);
    },
    [url]
  );
  return (
    <span className="edfl-pc-face" aria-hidden="true">
      <span className="edfl-pc-face-fallback">{playerInitials(name)}</span>
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          className="edfl-pc-face-img"
          src={url}
          alt=""
          onError={function () {
            setBroken(true);
          }}
        />
      ) : null}
    </span>
  );
}

function ppvNum(v) {
  if (v === null || v === undefined) return '—';
  return String(v);
}

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
  waiver,
  waiverError,
  summary,
  weeks,
  seasonError,
  isMine,
  initialTab,
}) {
  const mine = Boolean(isMine);

  const sections = [];
  if (mine) sections.push({ id: SEC_ACTIONS, label: 'Actions' });
  sections.push({ id: 'season', label: 'Season' });
  sections.push({ id: 'contract', label: 'Contract' });
  sections.push({ id: 'value', label: 'Value' });
  sections.push({ id: 'stats', label: 'Stats' });
  sections.push({ id: 'history', label: 'History' });

  const [active, setActive] = useState(sections[0].id);

  // ?tab=actions (the ••• on a roster row) lands on the Actions box.
  useEffect(function () {
    if (initialTab === SEC_ACTIONS && mine) {
      const el = document.getElementById('pc-' + SEC_ACTIONS);
      if (el) el.scrollIntoView({ block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The lit jump button follows the box in view.
  useEffect(function () {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const els = sections
      .map(function (s) {
        return document.getElementById('pc-' + s.id);
      })
      .filter(Boolean);
    const seen = {};
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          seen[e.target.id] = e.isIntersecting;
        });
        const first = sections.find(function (s) {
          return seen['pc-' + s.id];
        });
        if (first) setActive(first.id);
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    els.forEach(function (el) {
      io.observe(el);
    });
    return function () {
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

  function jump(id) {
    return function (e) {
      const el = document.getElementById('pc-' + id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(id);
    };
  }

  const identityBits = [];
  if (header.position) identityBits.push(header.position);
  if (header.nfl_team) identityBits.push(header.nfl_team);
  if (header.nfl_status && header.nfl_status !== 'Active') identityBits.push(header.nfl_status);

  // "Yr 1 of 3": the season of his current contract, from the header's own
  // start year and length.
  let contractYear = null;
  if (header.current_contract_id && header.current_contract_start && header.current_contract_years) {
    const k = currentSeasonYear - Number(header.current_contract_start) + 1;
    if (k >= 1 && k <= Number(header.current_contract_years)) {
      contractYear = 'Yr ' + k + ' of ' + header.current_contract_years;
    }
  }

  const startRate =
    summary && summary.start_rate_pct !== null && summary.start_rate_pct !== undefined ? summary : null;

  const seasonInProgress =
    summary &&
    summary.season_year === currentSeasonYear &&
    (weeks || []).some(function (w) {
      return !w.week_is_final;
    })
      ? summary.season_year
      : null;

  const seasonHeading =
    summary && summary.season_year && summary.season_year !== currentSeasonYear
      ? summary.season_year + ' season'
      : 'This season';

  // The Value box: the header's chart_* columns (the strip's old source) and
  // the editions behind them.
  const ppv = header.chart_total_ppv;
  const hasChart = ppv !== null && ppv !== undefined;
  const latest = valueHistory && valueHistory.length > 0 ? valueHistory[0] : null;
  const editions = (valueHistory || []).slice().reverse();

  const earnedToDate = earnings
    ? (n(earnings.cash_through_current_season) || 0) + (n(earnings.dead_cash_charged) || 0)
    : null;

  return (
    <>
      {/* The top row is not a way back (player-card.md): the card opens in a
          new tab, so this row is for pasted URLs, bookmarks and phone history.
          Home > his team > him; a free agent's has no team label, so it is
          Home > him (Breadcrumbs skips an unlabelled entry). No Cap Sheet
          crumb (Lewis, November 10, 2026; team/[teamId]/page.js). */}
      <Breadcrumbs
        trail={[
          {
            label: header.current_team,
            href: header.current_team_id ? '/team/' + header.current_team_id : null,
          },
          { label: header.full_name },
        ]}
      />

      <div className="edfl-pc">
        <div className="edfl-pc-head">
          <PlayerFace sleeperId={header.sleeper_player_id} name={header.full_name} />
          <div className="edfl-pc-id">
            <p className="edfl-pc-eyebrow">{leagueName} &middot; Player Card</p>
            <h1 className="edfl-pc-name">
              {header.full_name}
              {header.injury_flagged ? <InjuryCross className="inj-cross-lg" label={header.injury_label} /> : null}
            </h1>
            <p className="edfl-pc-ident">
              {identityBits.join(' · ') || 'Position unknown'}
              {header.current_team ? (
                <>
                  {' · '}
                  <a href={'/team/' + header.current_team_id}>{header.current_team}</a>
                  {/* On waivers outranks roster_status (ruling W-10; loadCard.js). */}
                  {waiver ? (
                    <span className="status status-live edfl-pc-chip">On waivers</span>
                  ) : header.roster_status && header.roster_status !== 'active' ? (
                    <span className="status status-live edfl-pc-chip">
                      {header.roster_status === 'taxi' ? 'Taxi Squad' : 'IR'}
                    </span>
                  ) : null}
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
            {startRate || contractYear ? (
              <p className="edfl-pc-rate">
                {startRate ? (
                  <span
                    title={
                      'Final ' +
                      startRate.season_year +
                      ' weeks in which his points counted in his EDFL team’s best-ball lineup, out of the final weeks he was on an EDFL active roster'
                    }
                  >
                    <strong>{startRate.start_rate_pct}%</strong> start rate {startRate.season_year} ({startRate.weeks_counted}{' '}
                    of {startRate.weeks_active} wks)
                  </span>
                ) : null}
                {contractYear ? <span>{contractYear}</span> : null}
              </p>
            ) : null}
          </div>
        </div>

        {waiver ? (
          <p className="empty-note">
            Waived by {header.current_team}
            {waiver.waivedAtLabel ? ' ' + waiver.waivedAtLabel : ''}. Claims resolve
            {waiver.runAtLabel
              ? ' at the ' + (waiver.runWeek ? 'Week ' + waiver.runWeek + ' ' : '') + 'waiver run, ' + waiver.runAtLabel
              : ' at the next waiver run'}
            . He holds no roster spot; his cap hit and cash stay with {header.current_team} until then.
          </p>
        ) : null}
        {waiverError ? (
          <p className="form-error">
            Waiver status could not be loaded: {waiverError}. If this player has been cut, the roster spot
            shown above may be the one he was cut from.
          </p>
        ) : null}
        {waiver ? null : <PracticeSquadWarning status={taxiStatus} />}

        <div className="edfl-pc-layout">
          <nav className="edfl-pc-jump" aria-label="Sections">
            {sections.map(function (s) {
              return (
                <a
                  key={s.id}
                  className={'edfl-pc-chipbtn' + (active === s.id ? ' is-on' : '')}
                  href={'#pc-' + s.id}
                  aria-current={active === s.id ? 'true' : undefined}
                  onClick={jump(s.id)}
                >
                  {s.label}
                </a>
              );
            })}
          </nav>

          <div className="edfl-pc-secs">
            {mine ? (
              <section className="edfl-pc-card" id={'pc-' + SEC_ACTIONS}>
                <div className="edfl-pc-sechead">
                  <h2 className="edfl-pc-h">What you can do with him</h2>
                </div>
                {/* Decides nothing and writes nothing; every door keeps its own
                    gate (player-card.md). UI test batch 10 (November 11, 2026):
                    Cut lands on the Roster tab with ?cut=<contract>, which
                    opens the Cut dialog there (the roster row no longer has a
                    Cut button); Move opens his Mini Player Card, whose Roster
                    spot buttons replaced the Move dialog. */}
                <div className="edfl-pc-actions">
                  <a className="edfl-pc-btn is-primary" href="/restructure" title="Turn salary into a signing bonus to free cap room.">
                    Restructure
                  </a>
                  {header.current_team_id ? (
                    <a
                      className="edfl-pc-btn"
                      href={
                        '/team/' +
                        header.current_team_id +
                        '?tab=roster' +
                        (header.current_contract_id ? '&cut=' + header.current_contract_id : '')
                      }
                      title="On your Roster tab: the Cut dialog shows dead money and savings before you confirm."
                    >
                      Cut
                    </a>
                  ) : null}
                  {header.current_team_id ? (
                    <a
                      className="edfl-pc-btn"
                      href={'/player/' + header.player_id + '/mini'}
                      title="His Mini Player Card: active roster, practice squad or injured reserve."
                    >
                      Move
                    </a>
                  ) : null}
                  <button type="button" className="edfl-pc-btn" disabled title="Add years to his contract. Not built yet.">
                    Extend · soon
                  </button>
                  <button type="button" className="edfl-pc-btn" disabled title="Tell the league he is available. Not built yet.">
                    Trade block · soon
                  </button>
                </div>
              </section>
            ) : null}

            <section className="edfl-pc-card" id="pc-season">
              <div className="edfl-pc-sechead">
                <h2 className="edfl-pc-h">{seasonHeading}</h2>
                <span className="edfl-pc-note">EDFL points · actual vs projected</span>
              </div>
              <SeasonChart weeks={weeks} summary={summary} seasonError={seasonError} />
            </section>

            <section className="edfl-pc-card" id="pc-contract">
              <div className="edfl-pc-sechead">
                <h2 className="edfl-pc-h">Contract, year by year</h2>
              </div>
              <ContractBox
                header={header}
                contracts={contracts}
                years={years}
                livePreview={livePreview}
                capSettings={capSettings}
                currentSeasonYear={currentSeasonYear}
              />
            </section>

            <section className="edfl-pc-card" id="pc-value">
              <div className="edfl-pc-sechead">
                <h2 className="edfl-pc-h">Value</h2>
                {header.chart_snapshot_label ? (
                  <span className="edfl-pc-note">{header.chart_snapshot_label} chart</span>
                ) : null}
              </div>
              {hasChart ? (
                <>
                  <div className="edfl-pc-three">
                    <div>
                      <span className="edfl-pc-label">Total PPV</span>
                      <b className="v-ppv">{ppvNum(ppv)}</b>
                    </div>
                    <div>
                      <span className="edfl-pc-label">Per year</span>
                      <b className="v-ppv">{ppvNum(header.chart_per_year_value)}</b>
                    </div>
                    <div>
                      <span className="edfl-pc-label">Rank</span>
                      <b>
                        {latest && latest.chart_rank
                          ? latest.chart_position
                            ? latest.chart_position + ' #' + latest.chart_rank
                            : '#' + latest.chart_rank
                          : '—'}
                      </b>
                    </div>
                  </div>
                  {editions.length >= 2 ? <ValueSpark editions={editions} /> : null}
                  <p className="edfl-pc-note">
                    {header.chart_value_tier ? header.chart_value_tier + ' tier' : 'No tier'}
                    {header.chart_likely_years ? ' · likely ' + header.chart_likely_years + ' years' : ''}
                    {editions.length > 0
                      ? ' · ' +
                        editions
                          .map(function (v) {
                            return formatDate(v.snapshot_as_of).replace(/, \d{4}$/, '') + ': ' + ppvNum(v.total_ppv);
                          })
                          .join(' → ')
                      : ''}
                    . <a href="/values">The whole chart</a>
                  </p>
                </>
              ) : (
                <p className="edfl-pc-note">
                  {header.full_name} is not on the Player Value Chart. <a href="/values">The whole chart</a>
                </p>
              )}
            </section>

            <section className="edfl-pc-card" id="pc-stats">
              <StatsTab
                playerId={header.player_id}
                position={header.position}
                seasonInProgress={seasonInProgress}
                renderHeader={function (onExport) {
                  return (
                    <div className="edfl-pc-sechead">
                      <h2 className="edfl-pc-h">Stats</h2>
                      {onExport ? (
                        <button type="button" className="edfl-pc-btn" onClick={onExport}>
                          Export to Excel
                        </button>
                      ) : null}
                    </div>
                  );
                }}
              />
            </section>

            <section className="edfl-pc-card" id="pc-history">
              <div className="edfl-pc-sechead">
                <h2 className="edfl-pc-h">History</h2>
              </div>
              <TransactionsTab header={header} feed={feed} foldBids={true} />
              {earnings ? (
                <p className="edfl-pc-note">
                  Career in the EDFL: earned to date {formatMoney(earnedToDate)} · still owed{' '}
                  {formatCost(earnings.cash_still_owed)} · career contract value{' '}
                  {formatMoney(earnings.career_contract_value)} · dead cash charged{' '}
                  {formatMoney(earnings.dead_cash_charged)} · {earnings.teams_played_for}{' '}
                  {Number(earnings.teams_played_for) === 1 ? 'team' : 'teams'}.
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

// PPV by chart edition, oldest to newest. A PPV is not money: bare numbers.
function ValueSpark({ editions }) {
  const vals = editions.map(function (v) {
    return n(v.total_ppv) || 0;
  });
  const max = Math.max.apply(null, vals);
  const min = Math.min.apply(null, vals);
  const span = max - min || 1;
  const pts = vals.map(function (v, i) {
    const x = 10 + (i * 280) / Math.max(1, vals.length - 1);
    const y = 66 - ((v - min) / span) * 52;
    return [x, y];
  });
  return (
    <svg
      className="edfl-pc-spark"
      viewBox="0 0 300 80"
      role="img"
      aria-label={
        'Total PPV by chart edition: ' +
        editions
          .map(function (v) {
            return ppvNum(v.total_ppv) + ' on ' + formatDate(v.snapshot_as_of);
          })
          .join(', ')
      }
    >
      <polyline
        fill="none"
        stroke="var(--c-ppv)"
        strokeWidth="3"
        points={pts
          .map(function (p) {
            return p[0].toFixed(1) + ',' + p[1].toFixed(1);
          })
          .join(' ')}
      />
      {pts.map(function (p, i) {
        return <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="var(--c-ppv)" />;
      })}
    </svg>
  );
}
