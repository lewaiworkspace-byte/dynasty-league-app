'use client';

import { useEffect, useState } from 'react';
import PlayerLink from './PlayerLink';
import { formatExactMoney } from '../lib/formatMoney';
import {
  loadRestructureRoster,
  loadMaxRestructure,
  previewRestructure,
  submitRestructure,
} from '../app/restructure/actions';

// CONTRACT RESTRUCTURE. Converts unpaid current-season salary into a new
// signing bonus with its own proration window, leaving the original signing
// bonus untouched.
//
// NOT ONE FIGURE ON THIS SCREEN IS COMPUTED HERE. The slider bound, the
// binding limit, the cap saving, the per-season schedule, the dead-cap
// movement, the PPV delta and every rule verdict all arrive from
// max_restructure() and compute_restructure_charges(). There is no client
// mirror of the cap formula, the Deion Rule, the minimum salary or the PPV
// test, and there must not be one -- the database owns all four, and a second
// copy would drift the moment either side changed. The only arithmetic in this
// file is splitting a typed amount between the guaranteed and non-guaranteed
// buckets, which is input handling, not settlement.
//
// THE 30% RULE (5.22) DOES NOT APPLY TO A RESTRUCTURE. That is not an omission
// -- it is stated on screen so nobody adds a check for it later.
//
// Out-year cap position is DISPLAYED, NEVER BLOCKED. League policy is that an
// owner may run a future cap as tight as they like; the form's job is to make
// the consequence visible, not to refuse it.

const PRORATION_CHOICES = [2, 3, 4, 5];
const PREVIEW_DEBOUNCE_MS = 250;

// NO DISPLAY ROUNDING ANYWHERE ON THIS FORM (Addendum 3, September 4 2026).
//
// Whole dollars are enforced in the DATA -- a table constraint plus checks
// inside restructure_contract() -- not by formatting. Rounding here is how an
// owner reads "$1,500 of $1,500" while the database refuses them at 1500.33.
//
// A FRACTION ON SCREEN IS NOT AUTOMATICALLY A BUG:
//
//   INHERITED figures (cap_before, cap_after, dead_cap_before, dead_cap_after,
//   team_cap_before/after) may legitimately carry cents. 156 contract-year rows
//   across 48 active contracts hold signing-bonus proration from before the
//   whole-dollar rule -- Jonathan Taylor shows $296.33 and nothing is wrong.
//   Rule 1.9 is still open. inherited_note explains it on screen.
//
//   GENERATED figures (cap_change, per_season_charge, final_season_charge,
//   team_impact.change) are always whole. A fraction there IS a defect.
function money(v) {
  return formatExactMoney(v);
}

// Whole dollars on the way in, too. The database refuses a fractional amount
// outright ("EDFL money is whole dollars. 100.5 is not a whole number."), so
// the input never offers one: anything typed is floored before it is stored in
// state, which means the value submitted is the value on screen.
function wholeOrEmpty(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.max(0, Math.floor(n)));
}

// A database numeric arrives as a string. Null-safe, and it never rounds --
// nothing on this form rounds anything.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function testTone(verdict) {
  if (verdict === 'pass') return 'trade-verdict trade-verdict-ok';
  if (verdict === null || verdict === undefined) return 'trade-verdict';
  return 'trade-verdict trade-verdict-bad';
}

function testGlyph(verdict) {
  return verdict === 'pass' ? '✓ pass' : '✗ ' + String(verdict || 'fail');
}

export default function RestructureForm() {
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [rosterError, setRosterError] = useState('');

  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const [prorationYears, setProrationYears] = useState(3);
  const [maxInfo, setMaxInfo] = useState(null);
  const [maxError, setMaxError] = useState('');

  const [amount, setAmount] = useState('');
  const [fromGuaranteed, setFromGuaranteed] = useState('');

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(function () {
    setLoadingRoster(true);
    loadRestructureRoster()
      .then(function (r) {
        if (!r.ok) {
          setRosterError(r.message);
          return;
        }
        setRoster(r.data);
      })
      .catch(function (err) {
        setRosterError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setLoadingRoster(false);
      });
  }, []);

  // The slider bound moves with the proration span, so this refetches whenever
  // either the player or the span changes.
  useEffect(
    function () {
      if (!selected) {
        setMaxInfo(null);
        return;
      }
      setMaxError('');
      loadMaxRestructure(selected.contractId, prorationYears)
        .then(function (r) {
          if (!r.ok) {
            setMaxError(r.message);
            setMaxInfo(null);
            return;
          }
          setMaxInfo(r.data);
        })
        .catch(function (err) {
          setMaxError('Could not reach the server: ' + (err.message || 'unknown error'));
        });
    },
    [selected, prorationYears]
  );

  // Debounced live preview. compute_restructure_charges is read-only and the
  // brief says it is safe on every keystroke; the delay is to be polite to the
  // database rather than to protect anything.
  useEffect(
    function () {
      if (!selected) {
        setPreview(null);
        return undefined;
      }
      const amt = num(amount);
      if (amt === null || amt <= 0) {
        setPreview(null);
        setPreviewError('');
        return undefined;
      }
      const gtd = num(fromGuaranteed);
      const timer = setTimeout(function () {
        setPreviewing(true);
        setPreviewError('');
        previewRestructure(selected.contractId, amt, gtd === null ? 0 : gtd, prorationYears)
          .then(function (r) {
            if (!r.ok) {
              setPreviewError(r.message);
              setPreview(null);
              return;
            }
            setPreview(r.data);
          })
          .catch(function (err) {
            setPreviewError('Could not reach the server: ' + (err.message || 'unknown error'));
          })
          .finally(function () {
            setPreviewing(false);
          });
      }, PREVIEW_DEBOUNCE_MS);
      return function () {
        clearTimeout(timer);
      };
    },
    [selected, amount, fromGuaranteed, prorationYears]
  );

  function choosePlayer(p) {
    if (p.ineligibleReason) return;
    setSelected(p);
    setAmount('');
    setFromGuaranteed('');
    setPreview(null);
    setPreviewError('');
    setSubmitError('');
    setResult(null);
    setConfirming(false);
  }

  // Guaranteed-first, per the brief's default. The remainder falls to
  // non-guaranteed and is shown rather than hidden, so the split is never a
  // surprise at execution.
  //
  // CLAMPED TO unpaid_guaranteed. Without it the default trips a refusal the
  // owner did nothing to earn -- "This contract has only 0 of guaranteed salary
  // in 2026; you asked to convert 6 of it" -- on any contract whose current
  // season is all non-guaranteed. Guaranteed-first has to mean "as much as
  // exists", not "all of it".
  function setAmountGuaranteedFirst(next) {
    const whole = wholeOrEmpty(next);
    setAmount(whole);
    setConfirming(false);
    const amt = num(whole);
    if (amt === null) {
      setFromGuaranteed('');
      return;
    }
    const unpaidGtd =
      maxInfo && maxInfo.limits ? num(maxInfo.limits.unpaid_guaranteed) : null;
    if (unpaidGtd === null) {
      setFromGuaranteed(String(amt));
      return;
    }
    setFromGuaranteed(String(Math.min(amt, unpaidGtd)));
  }

  // The guaranteed field is clamped the same way when typed in directly.
  function setGuaranteedClamped(next) {
    const whole = wholeOrEmpty(next);
    setConfirming(false);
    const val = num(whole);
    if (val === null) {
      setFromGuaranteed('');
      return;
    }
    const amt = num(amount);
    const unpaidGtd =
      maxInfo && maxInfo.limits ? num(maxInfo.limits.unpaid_guaranteed) : null;
    let capped = val;
    if (unpaidGtd !== null) capped = Math.min(capped, unpaidGtd);
    if (amt !== null) capped = Math.min(capped, amt);
    setFromGuaranteed(String(Math.max(0, capped)));
  }

  function handleSubmit() {
    if (!selected) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setWorking(true);
    setSubmitError('');
    const gtd = num(fromGuaranteed);
    submitRestructure(
      selected.contractId,
      num(amount),
      gtd === null ? 0 : gtd,
      prorationYears,
      note
    )
      .then(function (r) {
        if (!r.ok) {
          // The database's refusal names the rule. Verbatim.
          setSubmitError(r.message);
          setConfirming(false);
          return;
        }
        setResult(r.data);
      })
      .catch(function (err) {
        setSubmitError('Could not reach the server: ' + (err.message || 'unknown error'));
        setConfirming(false);
      })
      .finally(function () {
        setWorking(false);
      });
  }

  if (loadingRoster) {
    return <p className="empty-note">Loading contracts and checking eligibility…</p>;
  }
  if (rosterError) {
    return <div className="form-error">{rosterError}</div>;
  }
  if (!roster) {
    return <p className="empty-note">No roster data came back.</p>;
  }

  const teamsInRoster = [];
  const seenTeams = {};
  roster.players.forEach(function (p) {
    if (!seenTeams[p.teamId]) {
      seenTeams[p.teamId] = true;
      teamsInRoster.push({ id: p.teamId, name: p.teamName });
    }
  });

  const needle = search.trim().toLowerCase();
  const visible = roster.players.filter(function (p) {
    if (teamFilter && p.teamId !== teamFilter) return false;
    if (needle && p.name.toLowerCase().indexOf(needle) === -1) return false;
    return true;
  });

  const teamCap = selected && roster.capByTeam ? roster.capByTeam[selected.teamId] : null;
  const seasons = preview && Array.isArray(preview.seasons) ? preview.seasons : [];
  const teamImpact = preview && Array.isArray(preview.team_impact) ? preview.team_impact : [];
  const anyProvisionalCeiling = teamImpact.some(function (t) {
    return t.ceiling_provisional === true;
  });
  const anyOverCeiling = teamImpact.some(function (t) {
    return t.over_ceiling === true;
  });
  const maxConvert = maxInfo ? num(maxInfo.max_convert) : null;
  const overMax = Boolean(preview && preview.over_max);
  const canSubmit =
    Boolean(selected) &&
    num(amount) !== null &&
    num(amount) > 0 &&
    Boolean(preview) &&
    preview.ok !== false &&
    !overMax &&
    !working;

  if (result) {
    return (
      <div>
        <div className="form-notice">
          <p>
            <strong>Restructured.</strong> {selected ? selected.name : 'The contract'} converted{' '}
            {money(num(amount))} of {roster.seasonYear} salary into a signing bonus over{' '}
            {prorationYears} seasons.
          </p>
          {result.void_years_added ? (
            <p className="empty-note">
              {result.void_years_added} void season(s) were added to carry the new proration.
            </p>
          ) : null}
          <p className="empty-note">
            Every screen that reads money is already correct — the cap sheet, the team page and
            the player card all read the same computed view, which folds the new bonus in.
          </p>
        </div>
        <div className="page-actions">
          <a className="btn" href="/cap-sheet">Cap Sheet</a>
          {selected && selected.playerId && (
            <a className="btn btn-quiet" href={'/player/' + selected.playerId}>Player card</a>
          )}
          <button
            type="button"
            className="btn btn-quiet"
            onClick={function () {
              setResult(null);
              setSelected(null);
              setAmount('');
              setFromGuaranteed('');
              setPreview(null);
              setNote('');
            }}
          >
            Restructure another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-heading">1. Pick a contract</h2>

      <div className="page-actions">
        {/*
          The team filter is for the commissioner and co-commissioner only. An
          ordinary owner is served only their own roster by the action, so a
          filter listing one team would be furniture.
        */}
        {roster.seesAllTeams && (
          <label>
            Team
            <select
              value={teamFilter}
              onChange={function (e) { setTeamFilter(e.target.value); }}
            >
              <option value="">All teams</option>
              {teamsInRoster.map(function (t) {
                return <option key={t.id} value={t.id}>{t.name}</option>;
              })}
            </select>
          </label>
        )}
        <label>
          Search
          <input
            type="text"
            value={search}
            onChange={function (e) { setSearch(e.target.value); }}
            placeholder="Player name"
          />
        </label>
      </div>

      <p className="empty-note">
        {visible.length} contract(s) shown
        {roster.seesAllTeams
          ? ' across every team — you are acting as commissioner.'
          : ' on your roster.'}{' '}
        A greyed row cannot be restructured; its reason is given beside it.
      </p>

      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th style={{ textAlign: 'right' }}>{roster.seasonYear} Cap Hit</th>
              <th>Eligibility</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(function (p) {
              const isSelected = selected && selected.contractId === p.contractId;
              return (
                <tr
                  key={p.contractId}
                  style={{
                    opacity: p.ineligibleReason ? 0.55 : 1,
                    background: isSelected ? 'var(--bg-elevated)' : undefined,
                  }}
                >
                  <td className="team-name" data-label="Player">
                    <PlayerLink playerId={p.playerId}>{p.name}</PlayerLink>
                    {p.position ? <span className="empty-note"> {p.position}</span> : null}
                  </td>
                  <td data-label="Team">{p.teamName}</td>
                  <td className="num v-cap col-num" data-label="Cap Hit">{money(p.capCharge)}</td>
                  <td data-label="Eligibility">
                    {p.ineligibleReason ? (
                      <span className="empty-note" title={p.ineligibleReason}>
                        {p.ineligibleReason}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={isSelected ? 'btn' : 'btn btn-quiet'}
                        onClick={function () { choosePlayer(p); }}
                      >
                        {isSelected ? 'Selected' : 'Restructure'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <>
          <h2 className="section-heading">2. {selected.name}</h2>

          <div className="pc-terms">
            <span className="pc-term">
              Player <strong>{selected.name}{selected.position ? ' · ' + selected.position : ''}</strong>
            </span>
            <span className="pc-term">Team <strong>{selected.teamName}</strong></span>
            <span className="pc-term">
              {roster.seasonYear} cap hit <strong>{money(selected.capCharge)}</strong>
            </span>
            {teamCap && (
              <>
                <span className="pc-term">
                  Team cap used <strong>{money(teamCap.cap_used)}</strong>
                </span>
                <span className="pc-term">
                  Cap room <strong>{money(teamCap.cap_space_remaining)}</strong>
                </span>
                <span className="pc-term">
                  Ceiling <strong>{money(teamCap.fantasy_salary_cap)}</strong>
                </span>
              </>
            )}
          </div>

          {roster.blockDaysLeft !== null && roster.blockDaysLeft !== undefined && (
            <p className={roster.blockDaysLeft <= 7 ? 'form-notice' : 'empty-note'}>
              {roster.blockDaysLeft > 0
                ? roster.blockDaysLeft + ' day(s) until the in-season cap block arms'
                : 'The in-season cap block has armed'}
              {roster.blockDate ? ' (' + roster.blockDate + ').' : '.'}
            </p>
          )}

          <h2 className="section-heading">3. How much</h2>

          <label>
            Prorate over
            <select
              value={String(prorationYears)}
              onChange={function (e) {
                setProrationYears(Number(e.target.value));
                setConfirming(false);
              }}
            >
              {PRORATION_CHOICES.map(function (y) {
                return <option key={y} value={String(y)}>{y} seasons</option>;
              })}
            </select>
          </label>

          {/*
            WHOLE DOLLARS DIVIDE UNEVENLY, AND THE FORM SAYS SO RATHER THAN
            LETTING THE SEASON TABLE LOOK WRONG. Every proration season takes
            floor(amount / years) and the FINAL one absorbs the remainder --
            100 over 3 is 33 / 33 / 34, summing to exactly 100. Naive
            per-season rounding would have drifted the league's existing
            proration by $21.
            proration_note is null when the amount divides evenly, so this
            appears only when there is something to explain.
          */}
          {preview && preview.proration_note && (
            <p className="form-notice">{preview.proration_note}</p>
          )}

          {maxError && <div className="form-error">{maxError}</div>}

          {maxInfo && maxInfo.eligible === false && (
            <div className="form-error">{maxInfo.reason}</div>
          )}

          {maxConvert !== null && maxConvert > 0 && (
            <>
              {/*
                step="1" on both, and max_convert is already an integer -- no
                flooring of the bound needed.
              */}
              <label>
                Convert from {roster.seasonYear} salary
                <input
                  type="number"
                  min="0"
                  max={String(maxConvert)}
                  step="1"
                  value={amount}
                  onChange={function (e) { setAmountGuaranteedFirst(e.target.value); }}
                />
              </label>

              <input
                type="range"
                min="0"
                max={String(maxConvert)}
                step="1"
                value={num(amount) === null ? '0' : amount}
                onChange={function (e) { setAmountGuaranteedFirst(e.target.value); }}
                style={{ width: '100%' }}
                aria-label="Amount to convert"
              />

              <p className="empty-note">
                Maximum {money(maxConvert)}
                {maxInfo.limits && maxInfo.limits.binding
                  ? ' — bound by ' + maxInfo.limits.binding
                  : ''}
                . Cap saved at that maximum: {money(maxInfo.cap_saved_at_max)}.
              </p>

              {maxInfo.limits && (
                <p className="empty-note">
                  Unpaid salary {money(maxInfo.limits.unpaid_salary)} — guaranteed{' '}
                  {money(maxInfo.limits.unpaid_guaranteed)}, non-guaranteed{' '}
                  {money(maxInfo.limits.unpaid_non_guaranteed)}.
                  {num(maxInfo.roster_bonus_excluded) ? (
                    <>
                      {' '}Roster bonus of {money(maxInfo.roster_bonus_excluded)} is excluded — it
                      converts September 2 and is not unpaid salary.
                    </>
                  ) : null}
                  {maxInfo.weeks_charged ? ' ' + maxInfo.weeks_charged + ' week(s) already charged.' : ''}
                </p>
              )}

              <label>
                From guaranteed
                <input
                  type="number"
                  min="0"
                  max={maxInfo && maxInfo.limits ? String(maxInfo.limits.unpaid_guaranteed) : undefined}
                  step="1"
                  value={fromGuaranteed}
                  onChange={function (e) { setGuaranteedClamped(e.target.value); }}
                />
              </label>
              <p className="empty-note">
                The remainder comes from non-guaranteed salary. Defaults to guaranteed-first and
                is clamped to what is actually unpaid and guaranteed
                {maxInfo && maxInfo.limits
                  ? ' (' + money(maxInfo.limits.unpaid_guaranteed) + ')'
                  : ''}
                , so a contract with none converts entirely from non-guaranteed. The database
                splits and re-checks it either way.
              </p>
            </>
          )}

          {previewError && <div className="form-error">{previewError}</div>}
          {preview && preview.ok === false && (
            <div className="form-error">{preview.refusal}</div>
          )}

          {preview && preview.ok !== false && (
            <>
              <h2 className="section-heading">4. What it does</h2>
              {previewing && <p className="empty-note">Recalculating…</p>}

              <div className="trade-cards">
                <article className="trade-card">
                  <header className="trade-card-head">
                    <h3 className="team-name">{roster.seasonYear} cap</h3>
                    <span className={testTone(overMax ? 'over max' : 'pass')}>
                      {overMax ? '✗ over maximum' : '✓ within maximum'}
                    </span>
                  </header>
                  <div className="trade-measure">
                    <div className="trade-measure-head">
                      <span className="trade-measure-label">Cap saved this season</span>
                    </div>
                    <div className="trade-measure-figures">
                      <span className="trade-measure-after v-cap">
                        {money(preview.cap_saved_current_season)}
                      </span>
                    </div>
                  </div>
                  <div className="trade-measure">
                    <div className="trade-measure-head">
                      <span className="trade-measure-label">New proration</span>
                    </div>
                    <div className="trade-measure-figures">
                      <span>{money(preview.per_season_charge)}</span>
                      <span className="trade-measure-arrow">×</span>
                      <span className="trade-measure-after">
                        {preview.proration_years} seasons
                      </span>
                    </div>
                    {/*
                      Shown only when the final season differs. An even split
                      needs no explanation and a repeated figure reads as an
                      error.
                    */}
                    {preview.final_season_charge !== null &&
                      preview.final_season_charge !== undefined &&
                      String(preview.final_season_charge) !== String(preview.per_season_charge) && (
                        <div className="trade-measure-limit">
                          final season {money(preview.final_season_charge)}
                        </div>
                      )}
                  </div>
                  <div className="trade-measure">
                    <div className="trade-measure-head">
                      <span className="trade-measure-label">Split</span>
                    </div>
                    <div className="trade-measure-figures">
                      <span>{money(preview.from_guaranteed)} gtd</span>
                      <span className="trade-measure-arrow">·</span>
                      <span>{money(preview.from_non_guaranteed)} non-gtd</span>
                    </div>
                  </div>
                </article>

                <article className="trade-card">
                  <header className="trade-card-head">
                    <h3 className="team-name">Rule checks</h3>
                  </header>
                  <div className="trade-measure">
                    <div className="trade-measure-head">
                      <span className="trade-measure-label">PPV must increase</span>
                      <span className={testTone(preview.ppv_test)}>
                        {testGlyph(preview.ppv_test)}
                      </span>
                    </div>
                    <div className="trade-measure-figures">
                      <span className="trade-measure-delta">
                        change {String(preview.ppv_delta)}
                      </span>
                    </div>
                  </div>
                  <div className="trade-measure">
                    <div className="trade-measure-head">
                      <span className="trade-measure-label">Minimum salary (5.6)</span>
                      <span className={testTone(preview.minimum_test)}>
                        {testGlyph(preview.minimum_test)}
                      </span>
                    </div>
                    <div className="trade-measure-figures">
                      <span>
                        {money(preview.cash_current_season_after)} cash after, minimum{' '}
                        {money(preview.minimum_salary)}
                      </span>
                    </div>
                  </div>
                  <div className="trade-measure">
                    <div className="trade-measure-head">
                      <span className="trade-measure-label">Deion Rule (5.21)</span>
                    </div>
                    <div className="trade-measure-figures">
                      {seasons.map(function (s) {
                        return (
                          <span key={'d' + s.season} className={testTone(s.deion)}>
                            {s.season} {testGlyph(s.deion)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="trade-measure">
                    <div className="trade-measure-head">
                      <span className="trade-measure-label">Cash</span>
                      <span className={testTone(preview.cash_neutral ? 'pass' : null)}>
                        {preview.cash_neutral ? '✓ no change' : '—'}
                      </span>
                    </div>
                    <div className="trade-measure-figures">
                      {/*
                        A restructure converts salary already owed this season
                        into a bonus paid this season, so cash spent is
                        identical before and after. There is no cash check to
                        add and nothing to adjust -- the sentence comes from the
                        database rather than being asserted here.
                      */}
                      <span title={preview.cash_note || ''}>
                        {preview.cash_note || 'Conversion is cash-neutral.'}
                      </span>
                    </div>
                  </div>
                  <footer className="trade-card-foot">
                    <span>
                      The 30% Rule (5.22) does not apply to a restructure — there is deliberately
                      no check for it.
                    </span>
                  </footer>
                </article>
              </div>

              {/*
                THE TEAM NUMBER COMES FIRST, because it is the one the owner is
                actually deciding on -- the contract's own cap line is detail
                underneath it.

                EVERY FIGURE HERE IS FROM team_impact. Do not sum seasons[] to
                get a team total and do not fetch the cap sheet separately: two
                routes to the same number disagree the moment anything else
                moves, and the owner would have no way to tell which was right.

                ceiling / room_after / over_ceiling are NULL for a season with
                no league_cap_settings row -- 2028 onward today. Those render as
                an em dash, never as zero: "no ceiling set" and "a ceiling of
                nothing" are opposite claims.
              */}
              <h3 className="section-heading">Team cap impact</h3>
              <div className="table-scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th style={{ textAlign: 'right' }}>Team cap before</th>
                      <th style={{ textAlign: 'right' }}>Team cap after</th>
                      <th style={{ textAlign: 'right' }}>Change</th>
                      <th style={{ textAlign: 'right' }}>Ceiling</th>
                      <th style={{ textAlign: 'right' }}>Room after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamImpact.map(function (t) {
                      const noCeiling = t.ceiling === null || t.ceiling === undefined;
                      return (
                        <tr key={'t' + t.season}>
                          <td data-label="Season">
                            {t.season}
                            {t.over_ceiling === true ? (
                              <span className="void-tag"> OVER</span>
                            ) : null}
                          </td>
                          <td className="num col-num" data-label="Team cap before">
                            {money(t.team_cap_before)}
                          </td>
                          <td className="num v-cap col-num" data-label="Team cap after">
                            {money(t.team_cap_after)}
                          </td>
                          <td className="num col-num" data-label="Change">{money(t.change)}</td>
                          <td className="num col-num" data-label="Ceiling">
                            {noCeiling ? '—' : money(t.ceiling)}
                            {t.ceiling_provisional ? <span className="void-tag"> *</span> : null}
                          </td>
                          <td className="num col-num" data-label="Room after">
                            {t.room_after === null || t.room_after === undefined
                              ? '—'
                              : money(t.room_after)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {anyProvisionalCeiling && (
                <p className="empty-note">
                  * That season&apos;s ceiling is provisional and has not been set by the
                  commissioner. Treat the room figure beside it as an estimate.
                </p>
              )}
              {anyOverCeiling && (
                <p className="form-notice">
                  This puts a season over its ceiling. That does not block the restructure —
                  league policy is that an owner may run a future cap as tight as they like, and
                  the database enforces the ceiling only in the current season once the in-season
                  block has armed.
                </p>
              )}
              {teamImpact.length === 0 && (
                <p className="empty-note">
                  No team cap impact came back with this preview.
                </p>
              )}

              <h3 className="section-heading">Cap by season, this contract</h3>
              <div className="table-scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th style={{ textAlign: 'right' }}>Cap before</th>
                      <th style={{ textAlign: 'right' }}>Cap after</th>
                      <th style={{ textAlign: 'right' }}>Change</th>
                      <th style={{ textAlign: 'right' }}>Salary after</th>
                      <th style={{ textAlign: 'right' }}>Proration after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map(function (s) {
                      return (
                        <tr key={'c' + s.season}>
                          <td data-label="Season">
                            {s.season}
                            {s.is_void ? <span className="void-tag"> VOID</span> : null}
                            {Number(s.season) > Number(roster.seasonYear) ? (
                              <span className="empty-note"> est.</span>
                            ) : null}
                          </td>
                          <td className="num col-num" data-label="Cap before">{money(s.cap_before)}</td>
                          <td className="num v-cap col-num" data-label="Cap after">{money(s.cap_after)}</td>
                          <td className="num col-num" data-label="Change">{money(s.cap_change)}</td>
                          <td className="num col-num" data-label="Salary after">{money(s.salary_after)}</td>
                          <td className="num col-num" data-label="Proration after">{money(s.proration_after)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/*
                DEAD MONEY IS ON SCREEN, NOT BEHIND A TOGGLE. It is the figure
                owners least expect to move in a restructure -- converting salary
                into proration pushes dead cap into later seasons, and an owner
                who only reads the cap saving will not see that until they try to
                cut the player.
              */}
              <h3 className="section-heading">Dead money if cut, by season</h3>
              <div className="table-scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th style={{ textAlign: 'right' }}>Dead cap before</th>
                      <th style={{ textAlign: 'right' }}>Dead cap after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map(function (s) {
                      return (
                        <tr key={'x' + s.season}>
                          <td data-label="Season">
                            {s.season}
                            {s.is_void ? <span className="void-tag"> VOID</span> : null}
                          </td>
                          <td className="num col-num" data-label="Dead cap before">
                            {money(s.dead_cap_before)}
                          </td>
                          <td className="num v-dead col-num" data-label="Dead cap after">
                            {money(s.dead_cap_after)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/*
                WHY A FIGURE ON THIS SCREEN HAS CENTS. Shown only when the
                contract actually carries pre-whole-dollar proration, so it
                explains a real oddity rather than pre-empting one nobody saw.
                The sentence comes from the response, not from here -- the
                database knows which contracts are affected and this file does
                not.
              */}
              {preview.has_inherited_fractional_proration && preview.inherited_note && (
                <p className="empty-note">{preview.inherited_note}</p>
              )}

              <p className="empty-note">
                Seasons after {roster.seasonYear} are marked <strong>est.</strong> — the{' '}
                {Number(roster.seasonYear) + 1} salary cap is provisional until the league year
                opens, so out-year cap room is an estimate. Out-year position is shown, never
                blocked: an owner may run a future cap as tight as they like.
              </p>

              <h2 className="section-heading">5. Execute</h2>

              <label>
                Note (optional)
                <input
                  type="text"
                  value={note}
                  onChange={function (e) { setNote(e.target.value); }}
                  disabled={working}
                />
              </label>

              {submitError && <div className="form-error">{submitError}</div>}

              {overMax && (
                <p className="form-error">
                  {money(num(amount))} is above the maximum of {money(maxConvert)}
                  {maxInfo && maxInfo.limits && maxInfo.limits.binding
                    ? ' (' + maxInfo.limits.binding + ')'
                    : ''}
                  .
                </p>
              )}

              {confirming && (
                <p className="empty-note">
                  This converts {money(num(amount))} of {roster.seasonYear} salary into a signing
                  bonus prorated over {preview.proration_years} seasons. It is reversible by the
                  commissioner for 96 hours. Press again to confirm.
                </p>
              )}

              <div className="page-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {working ? 'Working…' : confirming ? 'Confirm restructure' : 'Restructure'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
