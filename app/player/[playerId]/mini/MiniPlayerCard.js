'use client';

import ExplainButton from '../../../../components/ExplainButton';
import { formatExactMoney } from '../../../../lib/formatMoney';
import { RosterFace } from '../../../team/[teamId]/RosterList';
import TeamDisc from '../../../../components/TeamDisc';
import { OwnActions, OtherActions } from '../CardActions';
import RosterSpot from '../RosterSpot';
import { contractTypeLabel } from '../cardHelpers';

// THE MINI PLAYER CARD's body -- UI test batch 10, redrawn in batch 34
// (November 21, 2026) to Lewis's player-card canvas. page.js reads; this draws.
//
// From the top (canvas, Nov 21):
//   THE HEADER: photo, name, "POS • TEAM · Bye Week N", "Owned by <team>" on
//     another owner's player, the status tags, and "Full player card ›" under
//     the name ("Place the link to the Full Player Card here"); then the team
//     logo ("make room for the EDFL team logo between this section and the
//     Name") and, on his own player, the Active / IR / PS control ("This
//     becomes the new way to move a player"; "Move it up and to the right and
//     shrink the size"). The control is RosterSpot.js, the batch 10-31 roster
//     spot block unchanged in what it does. Its warnings and confirm step take
//     the header's second row.
//   PROJECTED POINTS for the next five weeks, unchanged.
//   THE SEASON on one line: Starts, PPG, PPG trend, Total points ("cut this down
//     to starts, ppg, ppg trend, and total points all on one line"). The trend is
//     edfl_player_card_summary.trend_slope, the full card chart's dashed line,
//     in points a week; green up, red down; its "i" says so.
//   THE CONTRACT: "<season> contract" with "<Type> · Year X of Y" beside it
//     ("Spell out Year X of X"), then Cap hit and Cash on one line. The canvas's
//     "Amount saved" table waits on Lewis's ruling (how a cut and a trade are
//     figured) and is not drawn. The team-name line was removed ("Remove").
//   ACTIONS (batch 32), last. The old bottom link moved into the header.

function dec1(v) {
  if (v === null || v === undefined) return '–';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : '–';
}

function oppLabel(u) {
  if (u.no_team) return '';
  if (u.on_bye || !u.opponent) return '';
  if (u.is_neutral) return u.opponent + ' (N)';
  return (u.is_away ? '@' : '') + u.opponent;
}

export default function MiniPlayerCard(props) {
  const p = props.player;
  const c = props.contract;
  const taxi = props.taxi;

  const team = p.nfl_team || 'FA';
  const meta = p.position + ' • ' + team + (props.byeWeek ? ' · Bye Week ' + props.byeWeek : '');
  const s = props.stats;
  const sum = props.summary;

  const locked = taxi ? Boolean(taxi.locked !== null && taxi.locked !== undefined ? taxi.locked : taxi.eligibility_spent) : false;
  const lastDemotion = taxi && !locked ? Boolean(taxi.last_demotion_available) : false;

  const showSpot = Boolean(props.isMine && c && !props.onWaivers);

  // The trend: the summary's own season only (off-season it may name another).
  const trendOk =
    sum && sum.season_year === props.season && Number(sum.final_weeks) >= 2 && sum.trend_slope !== null && sum.trend_slope !== undefined;
  const slope = trendOk ? Number(sum.trend_slope) : null;
  const slopeText = slope === null || !Number.isFinite(slope) ? '–' : (slope > 0 ? '+' : '') + slope.toFixed(2);
  const slopeClass = slope === null ? '' : slope > 0 ? ' is-up' : slope < 0 ? ' is-down' : '';

  // "Year X of Y": the contract's own years, void years excluded (as the full card).
  let yearText = null;
  if (c && c.startYear && c.totalYears) {
    const k = props.season - Number(c.startYear) + 1;
    if (k >= 1 && k <= Number(c.totalYears)) yearText = 'Year ' + k + ' of ' + c.totalYears;
  }
  const typeLine = c
    ? [c.contractType ? contractTypeLabel(c.contractType) : null, yearText].filter(Boolean).join(' · ')
    : '';

  return (
    <div>
      <div className={'mpc-head33 edfl-explain-host' + (showSpot ? ' has-spot' : '')}>
        <span className="mpc-face33">
          <RosterFace big sleeperId={p.sleeper_player_id} name={p.full_name} />
        </span>
        <div className="mpc-id33">
          <h1 className="mpc-name">{p.full_name}</h1>
          <div className="mpc-meta">{meta}</div>
          {!props.isMine && c && c.teamName ? <div className="mpc-owned33">Owned by <b>{c.teamName}</b></div> : null}
          {c ? (
            <div className="mpc-tags">
              {c.isVoidYear ? <span className="void-tag">VOID YR</span> : null}
              {props.onWaivers ? <span className="void-tag ps-tag urgent">ON WAIVERS</span> : null}
              {taxi && taxi.warning ? (
                <span className={'void-tag ps-tag' + (locked ? ' spent' : lastDemotion ? ' urgent' : '')} title={taxi.warning}>
                  {locked
                    ? 'LOCKED TO ACTIVE ROSTER'
                    : taxi.weeks_used + ' OF ' + taxi.weeks_max + ' WEEKS' + (lastDemotion ? ' · LAST DEMOTION' : '')}
                </span>
              ) : null}
              {taxi && taxi.held ? (
                <span className="void-tag ps-tag held" title={taxi.hold_note || ''}>
                  HELD ON ACTIVE
                </span>
              ) : null}
              {taxi && taxi.poach_exempt ? <span className="void-tag ps-tag exempt">POACH EXEMPT</span> : null}
            </div>
          ) : null}
          <a className="mpc-cardlink33" href={'/player/' + p.id} data-full-card="">
            Full player card ›
          </a>
        </div>
        {c && props.holderAbbrev ? (
          <span className="mpc-logo33">
            <TeamDisc className="mpc-logo33-disc" abbrev={props.holderAbbrev} />
          </span>
        ) : null}
        {showSpot ? (
          <RosterSpot
            variant="mini"
            contract={{ id: c.id, rosterStatus: c.rosterStatus }}
            playerName={p.full_name}
            options={props.options}
            optionsError={props.optionsError}
            taxi={taxi}
          />
        ) : null}
      </div>

      <div className="mpc-box">
        <p className="mpc-boxh">Projected points, next {props.upcoming.length || 5} weeks</p>
        {props.upcomingError ? (
          <div className="form-error">The next weeks could not be read: {props.upcomingError}</div>
        ) : props.upcoming.length === 0 ? (
          <p className="empty-note">No league weeks left this season.</p>
        ) : (
          <div className="mpc-grid is-five">
            {props.upcoming.map(function (u, i) {
              const label = u.on_bye ? 'Bye' : u.proj_points === null || u.proj_points === undefined ? '–' : dec1(u.proj_points);
              return (
                <div key={u.week_number}>
                  <b className={u.on_bye ? 'is-quiet' : i === 0 ? 'is-now' : undefined}>{label}</b>
                  Wk {u.week_number}
                  <span className="mpc-opp">{oppLabel(u) || ' '}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mpc-box mpc-season33 edfl-explain-host">
        <p className="mpc-boxh">{props.season} season</p>
        {props.statsError || props.summaryError ? (
          <div className="form-error">The season could not be read: {props.statsError || props.summaryError}</div>
        ) : (
          <div className="mpc-grid">
            <div>
              <b>{sum && sum.weeks_active ? sum.weeks_counted + '/' + sum.weeks_active : '–'}</b>Starts
            </div>
            <div>
              <b>{s ? dec1(s.fppg) : '–'}</b>PPG
            </div>
            <div>
              <b className={'mpc-trend33' + slopeClass}>{slopeText}</b>
              <span className="mpc-lblrow33">
                PPG trend
                <ExplainButton label="How PPG trend is figured" title="PPG trend">
                  <p>
                    How much his weekly EDFL points are rising or falling
                    {trendOk && sum.first_final_week && sum.last_final_week
                      ? ', weeks ' + sum.first_final_week + '–' + sum.last_final_week
                      : ''}
                    , in points a week. It is the slope of the dashed trend line on the full card’s chart. Green
                    is up, red is down.
                  </p>
                </ExplainButton>
              </span>
            </div>
            <div>
              <b>{s ? dec1(s.fantasy_points) : '–'}</b>Total points
            </div>
          </div>
        )}
      </div>

      {c ? (
        <div className="mpc-box">
          <div className="mpc-ch33">
            <p className="mpc-boxh">{props.season} contract</p>
            {typeLine ? <span className="mpc-ctype33">{typeLine}</span> : null}
          </div>
          {props.contractError ? (
            <div className="form-error">The contract could not be read: {props.contractError}</div>
          ) : (
            <div className="mpc-money33">
              <span>
                Cap hit <b className="v-cap">{formatExactMoney(c.capCharge)}</b>
              </span>
              <span>
                Cash <b className="v-cash">{formatExactMoney(c.cashValue)}</b>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mpc-box">
          <p className="mpc-boxh">Contract</p>
          <p className="empty-note" style={{ margin: 0 }}>
            Not under contract in the league.
          </p>
        </div>
      )}

      {/* UI test batch 32 (Lewis, Nov 21: "Yes, add an Actions box"): the owner's own
          six buttons, or Watch / Trade / Poach / Claim on another owner's player. What the
          app cannot do yet is greyed (CardActions.js). Decides nothing. */}
      {!props.onWaivers || !props.isMine ? (
        <div className="mpc-box">
          <p className="mpc-boxh">Actions</p>
          {props.isMine ? (
            <OwnActions
              variant="mini"
              teamId={props.teamId}
              contractId={c ? c.id : null}
              tradeIcon={props.actions ? props.actions.tradeIcon : null}
            />
          ) : (
            <OtherActions
              playerId={p.id}
              name={p.full_name}
              canWatch={Boolean(props.canWatch)}
              watching={Boolean(props.actions && props.actions.watching)}
              tradeHref={
                props.actions && props.actions.tradeContractId && c ? '/trades/new?with=' + props.actions.tradeContractId : null
              }
              tradeIcon={props.actions ? props.actions.tradeIcon : null}
              poachHref={props.actions && props.actions.row && props.actions.row.action === 'poach' ? '/poaching?bid=' + p.id : null}
              claimHref={
                props.actions && props.actions.row && props.actions.row.action === 'claim' && props.actions.row.placement_id
                  ? '/players/claim/' + props.actions.row.placement_id
                  : null
              }
              error={props.actions ? props.actions.error : null}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
