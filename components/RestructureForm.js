'use client';

import { useEffect, useRef, useState } from 'react';
import ExplainButton from './ExplainButton';
import { RosterFace } from '../app/team/[teamId]/RosterList';
import { formatExactMoney } from '../lib/formatMoney';
import {
  loadRestructureRoster,
  loadMaxRestructure,
  previewRestructure,
  submitRestructure,
} from '../app/restructure/actions';

// CONTRACT RESTRUCTURE -- OPTION B, THE ONE-SCREEN CALCULATOR (UI test batch
// 13, November 14, 2026). Lewis's pick on the Claude Design canvas "EDFL GM's
// Office (test site) -- today and layout options" (artifact
// 5bmj6LvaPwvXGGow9zrvbE, board ResB-390), with his markups of Nov 13-14:
//   * Option B's one screen: pick the player, slide the amount, pick the
//     spread (2 to 5 seasons);
//   * Option A's "What it does" narrative and its CHANGE numbers on the
//     before-and-after bars ("I like this view, but I also like the change
//     numbers from Option A, please combine the 2 options");
//   * Option A's ending: a short note, then Cancel and "Restructure $NN".
//     NO REVIEW STEP: one press executes ("What additional 'review' happens if
//     you click this? If nothing, then I prefer the way option A is set up").
//   * NO RULE CHECKS SECTION. "The app should not offer a restructure that
//     doesn't meet all the rules ... this section isn't necessary" (Nov 13).
//     So the picker offers only contracts the database will restructure for
//     more than $0, the slider stops at max_restructure(), and a combination
//     the database would still refuse disables the button and says why. The
//     rule-check component is parked on the canvas for Contract Builder and
//     Contract Extensions (board Park-RuleChecks-390); do not bring it back
//     here.
//   * NO "LATER SEASONS ARE ESTIMATES" LINE. Future cap hits are exact (Lewis,
//     Nov 13: "future caps don't impact the cap hit from the restructure").
//     The old per-season "est." tag went with it.
//   * The per-season Deion Rule line is gone. It printed "x fail" for every
//     season because compute_restructure_charges() returns no `deion` field
//     (testGlyph(undefined)); the rule itself is enforced by max_restructure()
//     and two database triggers, never by this screen.
//
// NOT ONE FIGURE ON THIS SCREEN IS COMPUTED HERE. The slider bound, the cap
// change, the new bonus per season, every before-and-after cap hit, the cap
// room, the dead money and every verdict arrive from max_restructure() and
// compute_restructure_charges() (and the cap room before, from
// team_cap_summary via the roster loader). There is no client mirror of the
// cap formula, the Deion Rule, the minimum salary or the PPV test. The only
// arithmetic in this file is input handling (whole dollars, the
// guaranteed-first split) and drawing (bar widths as a share of the largest
// bar). SR-23.
//
// THE 30% RULE DOES NOT APPLY TO A RESTRUCTURE, and the explain card says so,
// so nobody adds a check for it later.
//
// Out-year cap position is DISPLAYED, NEVER BLOCKED. An owner may run a future
// cap as tight as they like; the form shows a season going over its ceiling
// and does not refuse it.

const SPREADS = [2, 3, 4, 5];
const DEFAULT_SPREAD = 3;
const PREVIEW_DEBOUNCE_MS = 250;

// NO DISPLAY ROUNDING ANYWHERE ON THIS FORM (Addendum 3, September 4 2026).
// Whole dollars are enforced in the DATA, not by formatting. An INHERITED
// figure (cap before/after, dead money, team cap) may legitimately carry cents
// from proration written before the whole-dollar rule; a GENERATED figure (the
// cap change, the new bonus per season) is always whole, and a fraction there
// IS a defect. formatExactMoney's consumer list names this form.
function money(v) {
  return formatExactMoney(v);
}

// A change, signed for reading: "-$42" becomes "−$42", "$21" becomes "+$21",
// zero stays "$0". String formatting only; the value is the database's.
function signed(v) {
  const n = num(v);
  if (n === null) return '—';
  const text = formatExactMoney(n);
  if (n < 0) return '−' + text.replace(/^-/, '');
  if (n > 0) return '+' + text;
  return text;
}

// Whole dollars on the way in. The database refuses a fractional amount
// outright, so the input never offers one.
function wholeOrEmpty(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.max(0, Math.floor(n)));
}

// A database numeric arrives as a string. Null-safe, and it never rounds.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "2026 to 2028", "2026 and 2027".
function spanWords(first, years) {
  const a = Number(first);
  const b = a + Number(years) - 1;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return Number(years) === 2 ? a + ' and ' + b : a + ' to ' + b;
}

function listWords(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

// Why a contract is not offered, in the owner's words. The eligibility reason
// is the database's sentence, verbatim. A zero maximum names the database's
// binding limit ("Deion Rule", "unpaid salary").
function notOfferedReason(p) {
  if (p.ineligibleReason) return p.ineligibleReason;
  if (p.maxError) return 'The most it could free could not be read: ' + p.maxError;
  if (p.maxBinding === 'unpaid salary') return 'No unpaid salary is left to convert this season.';
  if (p.maxBinding) return 'Nothing can be converted: limited by the ' + p.maxBinding + '.';
  return 'Nothing can be converted this season.';
}

function isOffered(p) {
  return Boolean(p.allowed) && !p.ineligibleReason && num(p.maxConvert) !== null && num(p.maxConvert) > 0;
}

// ONE FORM, TWO ROUTES. /restructure passes nothing and gets the own-roster
// loader; /admin/restructure passes its all-teams loader as loadRoster. Only
// WHICH CONTRACTS ARE OFFERED differs -- max_restructure,
// compute_restructure_charges and restructure_contract are the same calls on
// both routes, because the database already permits a commissioner to act on
// any team and enforces that itself.
export default function RestructureForm({ loadRoster }) {
  const fetchRoster = loadRoster || loadRestructureRoster;
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [rosterError, setRosterError] = useState('');

  const [pickerOpen, setPickerOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const [spread, setSpread] = useState(DEFAULT_SPREAD);
  const [maxInfo, setMaxInfo] = useState(null);
  const [maxError, setMaxError] = useState('');
  // The maximum the amount was last fitted to, so a new maximum can move an
  // amount that sat at the old one (kept outside state on purpose: it only
  // steers the next fit and never draws anything).
  const lastMaxRef = useRef(null);

  const [amount, setAmount] = useState('');

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const [working, setWorking] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(function () {
    setLoadingRoster(true);
    fetchRoster()
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

  // The slider's bound moves with the spread, so this refetches whenever the
  // player or the spread changes. The amount follows it: at the old maximum it
  // moves to the new one, above the new one it is clamped, otherwise it stays.
  useEffect(
    function () {
      if (!selected) {
        setMaxInfo(null);
        return;
      }
      setMaxError('');
      loadMaxRestructure(selected.contractId, spread)
        .then(function (r) {
          if (!r.ok) {
            setMaxError(r.message);
            setMaxInfo(null);
            return;
          }
          const nextMax = num(r.data && r.data.max_convert);
          const prevMax = lastMaxRef.current;
          lastMaxRef.current = nextMax;
          setMaxInfo(r.data);
          setAmount(function (cur) {
            const c = num(cur);
            if (nextMax === null) return cur;
            if (c === null || prevMax === null || c === prevMax || c > nextMax) {
              return String(nextMax);
            }
            return cur;
          });
        })
        .catch(function (err) {
          setMaxError('Could not reach the server: ' + (err.message || 'unknown error'));
        });
    },
    [selected, spread]
  );

  // Guaranteed-first, clamped to what is actually unpaid and guaranteed, so a
  // contract whose current season is all non-guaranteed converts from that
  // instead of tripping a refusal the owner did nothing to earn. The database
  // splits and re-checks it either way.
  const unpaidGtd = maxInfo && maxInfo.limits ? num(maxInfo.limits.unpaid_guaranteed) : null;
  const amt = num(amount);
  const fromGuaranteed =
    amt === null ? 0 : unpaidGtd === null ? amt : Math.min(amt, unpaidGtd);

  // Debounced live preview. compute_restructure_charges is read-only.
  useEffect(
    function () {
      if (!selected) {
        setPreview(null);
        return undefined;
      }
      if (amt === null || amt <= 0) {
        setPreview(null);
        setPreviewError('');
        return undefined;
      }
      const timer = setTimeout(function () {
        setPreviewing(true);
        setPreviewError('');
        previewRestructure(selected.contractId, amt, fromGuaranteed, spread)
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
    [selected, amt, fromGuaranteed, spread]
  );

  function choosePlayer(p) {
    if (!isOffered(p)) return;
    setSelected(p);
    setPickerOpen(false);
    setSearch('');
    setAmount('');
    lastMaxRef.current = null;
    setMaxInfo(null);
    setPreview(null);
    setPreviewError('');
    setSubmitError('');
    setResult(null);
  }

  function cancel() {
    setSelected(null);
    setPickerOpen(true);
    setAmount('');
    lastMaxRef.current = null;
    setMaxInfo(null);
    setPreview(null);
    setPreviewError('');
    setSubmitError('');
  }

  // ONE PRESS EXECUTES (Lewis: no review step). The button names the amount,
  // and it is drawn only once the preview for exactly that amount and spread
  // has come back clean.
  function handleSubmit() {
    if (!selected || !canSubmit) return;
    setWorking(true);
    setSubmitError('');
    submitRestructure(selected.contractId, amt, fromGuaranteed, spread, null)
      .then(function (r) {
        if (!r.ok) {
          // The database's refusal names the rule. Verbatim.
          setSubmitError(r.message);
          return;
        }
        setResult({ data: r.data, amount: amt, spread: spread, name: selected.name, playerId: selected.playerId });
      })
      .catch(function (err) {
        setSubmitError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setWorking(false);
      });
  }

  if (loadingRoster) {
    return <p className="empty-note">Loading your contracts and what each can free&hellip;</p>;
  }
  if (rosterError) {
    return <div className="form-error">{rosterError}</div>;
  }
  if (!roster) {
    return <div className="form-error">No contract data came back, so nothing can be offered.</div>;
  }

  const seasonYear = roster.seasonYear;

  if (result) {
    return (
      <div className="rsb">
        <div className="rsb-done">
          <p>
            <strong>Restructured.</strong> {result.name} converted {money(result.amount)} of{' '}
            {seasonYear} salary into a new bonus spread over {result.spread} seasons.
          </p>
          {result.data && result.data.void_years_added ? (
            <p className="rsb-sm">
              {result.data.void_years_added} void season(s) were added to carry the new bonus.
            </p>
          ) : null}
        </div>
        <div className="rsb-btns">
          {result.playerId ? (
            <a className="btn btn-quiet" href={'/player/' + result.playerId}>Player card</a>
          ) : (
            <a className="btn btn-quiet" href="/cap-sheet">Cap sheet</a>
          )}
          <button
            type="button"
            className="btn"
            onClick={function () {
              setResult(null);
              cancel();
              setLoadingRoster(true);
              fetchRoster()
                .then(function (r) {
                  if (r.ok) setRoster(r.data);
                  else setRosterError(r.message);
                })
                .catch(function (err) {
                  setRosterError('Could not reach the server: ' + (err.message || 'unknown error'));
                })
                .finally(function () {
                  setLoadingRoster(false);
                });
            }}
          >
            Restructure another
          </button>
        </div>
      </div>
    );
  }

  // ---- The picker: offered contracts first, most cap freed first ----------
  const players = Array.isArray(roster.players) ? roster.players : [];
  const offered = players.filter(isOffered);
  const notOffered = players.filter(function (p) { return !isOffered(p); });
  offered.sort(function (a, b) {
    const d = (num(b.capSavedAtMax) || 0) - (num(a.capSavedAtMax) || 0);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
  notOffered.sort(function (a, b) { return a.name.localeCompare(b.name); });

  const needle = search.trim().toLowerCase();
  function matches(p) {
    if (!needle) return true;
    return (
      p.name.toLowerCase().indexOf(needle) !== -1 ||
      (roster.seesAllTeams && String(p.teamName).toLowerCase().indexOf(needle) !== -1)
    );
  }
  const shownOffered = offered.filter(matches);
  const shownNot = notOffered.filter(matches);
  const showSearch = players.length > 12;

  function lineFor(p) {
    const parts = [];
    parts.push((p.position || '') + (p.nflTeam ? ' • ' + p.nflTeam : ''));
    if (roster.seesAllTeams) parts.push(p.teamName);
    parts.push('cap hit ' + money(p.capCharge));
    return parts.join(' · ');
  }

  // ---- The selected contract's preview, all from the database -------------
  const maxConvert = maxInfo ? num(maxInfo.max_convert) : null;
  const binding = maxInfo && maxInfo.limits ? maxInfo.limits.binding : null;
  const unpaid = maxInfo && maxInfo.limits ? num(maxInfo.limits.unpaid_salary) : null;
  const seasons = preview && Array.isArray(preview.seasons) ? preview.seasons : [];
  const teamImpact = preview && Array.isArray(preview.team_impact) ? preview.team_impact : [];
  const current = seasons.find(function (s) { return Number(s.season) === Number(seasonYear); }) || null;
  const currentTeam =
    teamImpact.find(function (t) { return Number(t.season) === Number(seasonYear); }) || null;
  const teamCap = selected && roster.capByTeam ? roster.capByTeam[selected.teamId] : null;

  // Seasons with a cap hit before or after; empty void seasons are dropped.
  const barRows = seasons.filter(function (s) {
    return (num(s.cap_before) || 0) !== 0 || (num(s.cap_after) || 0) !== 0;
  });
  let barTop = 0;
  barRows.forEach(function (s) {
    barTop = Math.max(barTop, num(s.cap_before) || 0, num(s.cap_after) || 0);
  });
  function width(v) {
    const n = num(v) || 0;
    if (barTop <= 0 || n <= 0) return '0%';
    return Math.max(1, (n / barTop) * 100).toFixed(1) + '%';
  }
  const voidYears = barRows.filter(function (s) { return s.is_void; }).map(function (s) { return String(s.season); });
  const overSeasons = teamImpact
    .filter(function (t) { return t.over_ceiling === true; })
    .map(function (t) { return String(t.season); });

  const overMax = Boolean(preview && preview.over_max);
  const refused = preview && preview.ok === false;
  const failedTests = [];
  if (preview && preview.ok !== false) {
    if (preview.ppv_test && preview.ppv_test !== 'pass') failedTests.push('it would not raise his PPV');
    if (preview.minimum_test && preview.minimum_test !== 'pass') {
      failedTests.push('it would take his ' + seasonYear + ' cash below the league minimum');
    }
  }
  const previewMatches =
    preview &&
    num(preview.amount) === amt &&
    Number(preview.proration_years) === Number(spread);
  const canSubmit =
    Boolean(selected) &&
    amt !== null &&
    amt > 0 &&
    Boolean(previewMatches) &&
    !refused &&
    !overMax &&
    failedTests.length === 0 &&
    !previewing &&
    !working;

  const finalDiffers =
    preview &&
    preview.final_season_charge !== null &&
    preview.final_season_charge !== undefined &&
    String(preview.final_season_charge) !== String(preview.per_season_charge);

  return (
    <div className="rsb">
      <div className="rsb-cols">
        <div className="rsb-col">
          <span className="rsb-fl">Player</span>
          <button
            type="button"
            className="rsb-sel"
            aria-expanded={pickerOpen ? 'true' : 'false'}
            aria-controls="rsb-picker"
            onClick={function () { setPickerOpen(!pickerOpen); }}
          >
            {selected ? (
              <>
                <RosterFace sleeperId={selected.sleeperId} name={selected.name} />
                <span className="rsb-sel-t">
                  <b>{selected.name}</b>
                  <span className="rsb-sm">
                    {lineFor(selected)}
                    {num(selected.capSavedAtMax) ? ' · up to ' + signed(-num(selected.capSavedAtMax)) : ''}
                  </span>
                </span>
              </>
            ) : (
              <span className="rsb-sel-t">
                <b>Choose a player</b>
                <span className="rsb-sm">Only contracts that can be restructured are offered</span>
              </span>
            )}
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={pickerOpen ? 'M5 12l5-5 5 5' : 'M5 8l5 5 5-5'} />
            </svg>
          </button>
          <div className="rsb-sm rsb-count">
            {offered.length} of {roster.seesAllTeams ? 'the league’s' : 'your'} {players.length}{' '}
            contracts can be restructured. The list opens sorted by the most cap freed.
          </div>

          {pickerOpen ? (
            <div className="rsb-picker" id="rsb-picker">
              {showSearch ? (
                <label className="rsb-search">
                  <span className="rsb-vh">Search players</span>
                  <input
                    type="search"
                    value={search}
                    placeholder={roster.seesAllTeams ? 'Player or team' : 'Player name'}
                    onChange={function (e) { setSearch(e.target.value); }}
                  />
                </label>
              ) : null}
              {shownOffered.length === 0 && shownNot.length === 0 ? (
                <p className="rsb-sm rsb-pad">No contract matches.</p>
              ) : null}
              {shownOffered.length > 0 ? (
                <ul className="rsb-list" aria-label="Contracts that can be restructured">
                  {shownOffered.map(function (p) {
                    const on = selected && selected.contractId === p.contractId;
                    return (
                      <li key={p.contractId}>
                        <button
                          type="button"
                          className={'rsb-row' + (on ? ' is-on' : '')}
                          aria-pressed={on ? 'true' : 'false'}
                          onClick={function () { choosePlayer(p); }}
                        >
                          <RosterFace sleeperId={p.sleeperId} name={p.name} />
                          <span className="rsb-id">
                            <span className="rsb-nm">{p.name}</span>
                            <span className="rsb-ln">{lineFor(p)}</span>
                          </span>
                          <span className="rsb-nu">
                            <span className="rsb-p">{signed(-num(p.capSavedAtMax))}</span>
                            <span className="rsb-q">up to</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {shownNot.length > 0 ? (
                <>
                  <div className="rsb-sub">Not offered</div>
                  <ul className="rsb-list is-off" aria-label="Contracts that cannot be restructured">
                    {shownNot.map(function (p) {
                      return (
                        <li key={p.contractId} className="rsb-row is-off">
                          <RosterFace sleeperId={p.sleeperId} name={p.name} />
                          <span className="rsb-id">
                            <span className="rsb-nm">{p.name}</span>
                            <span className="rsb-ln is-wrap">{notOfferedReason(p)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          {selected ? (
            <div className="rsb-card">
              <span className="rsb-fl rsb-fl-top">Convert from {seasonYear} salary</span>
              {maxError ? <div className="form-error">{maxError}</div> : null}
              {maxInfo && maxInfo.eligible === false ? (
                <div className="form-error">{maxInfo.reason}</div>
              ) : null}
              {maxInfo && maxConvert !== null && maxConvert <= 0 ? (
                <p className="rsb-note">
                  Nothing can be converted over {spread} seasons
                  {binding ? ': limited by the ' + binding : ''}. Try a longer spread.
                </p>
              ) : null}
              {maxInfo && maxConvert !== null && maxConvert > 0 ? (
                <>
                  <div className="rsb-amt">
                    <label className="rsb-amt-in">
                      <span className="rsb-vh">Amount to convert, in dollars</span>
                      <span aria-hidden="true">$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={String(maxConvert)}
                        step="1"
                        value={amount}
                        onChange={function (e) {
                          const w = wholeOrEmpty(e.target.value);
                          const n = num(w);
                          setAmount(n !== null && n > maxConvert ? String(maxConvert) : w);
                        }}
                      />
                    </label>
                    <span className="rsb-sm">
                      of <b>{money(maxConvert)}</b>{' '}
                      {binding === 'unpaid salary' || num(maxConvert) === unpaid ? 'unpaid' : 'allowed'}
                    </span>
                  </div>
                  <input
                    className="rsb-range"
                    type="range"
                    min="0"
                    max={String(maxConvert)}
                    step="1"
                    value={amt === null ? '0' : String(amt)}
                    aria-label="Amount to convert"
                    onChange={function (e) { setAmount(wholeOrEmpty(e.target.value)); }}
                  />
                  {binding && binding !== 'unpaid salary' && unpaid !== null && unpaid > maxConvert ? (
                    <div className="rsb-sm">
                      {money(unpaid)} is unpaid; the {binding} limits this spread to {money(maxConvert)}.
                    </div>
                  ) : null}
                </>
              ) : null}
              <span className="rsb-fl">Spread over</span>
              <div className="rsb-yrs" role="group" aria-label="Seasons to spread the new bonus over">
                {SPREADS.map(function (y) {
                  return (
                    <button
                      key={y}
                      type="button"
                      className={y === spread ? 'is-on' : ''}
                      aria-pressed={y === spread ? 'true' : 'false'}
                      onClick={function () { setSpread(y); }}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {selected ? (
          <div className="rsb-col">
            {previewError ? <div className="form-error">{previewError}</div> : null}
            {refused ? <div className="form-error">{preview.refusal}</div> : null}

            {preview && !refused ? (
              <>
                <div className="rsb-res" aria-live="polite" aria-busy={previewing ? 'true' : 'false'}>
                  <div className="rsb-eyb">What it does</div>
                  <div className="rsb-big-row">
                    <span className="rsb-big">{current ? signed(current.cap_change) : '—'}</span>
                    <span className="rsb-sm">on your {seasonYear} cap</span>
                  </div>
                  <div className="rsb-sm">
                    New bonus: <b>{money(preview.per_season_charge)}</b> a season,{' '}
                    {spanWords(seasonYear, preview.proration_years)}
                    {finalDiffers ? ' (' + money(preview.final_season_charge) + ' in the last)' : ''}.
                    {preview.cash_neutral ? ' Cash spent does not change.' : ''}
                  </div>
                  <div className="rsb-sm rsb-split">
                    Taken from {money(preview.from_guaranteed)} guaranteed and{' '}
                    {money(preview.from_non_guaranteed)} non-guaranteed salary.
                  </div>
                  {preview.proration_note ? <div className="rsb-sm rsb-split">{preview.proration_note}</div> : null}
                  {preview.void_note ? <div className="rsb-sm rsb-split">{preview.void_note}</div> : null}
                </div>

                <div className="rsb-card">
                  <div className="rsb-eyb-row edfl-explain-host">
                    <span className="rsb-eyb">His cap hit, before and after</span>
                    <ExplainButton label="How his cap hit before and after is worked out">
                      <ul>
                        <li>
                          Each season&rsquo;s cap hit, before and after, comes from the league&rsquo;s
                          own calculation for this exact amount and spread.
                        </li>
                        <li>
                          This season goes down by the salary converted, less this season&rsquo;s
                          share of the new bonus; each later season of the spread goes up by its
                          share.
                        </li>
                        <li>
                          A later season over its cap ceiling is shown, never blocked: you may run a
                          future cap as tight as you like.
                        </li>
                        {preview.has_inherited_fractional_proration && preview.inherited_note ? (
                          <li>{preview.inherited_note}</li>
                        ) : null}
                      </ul>
                    </ExplainButton>
                  </div>
                  <div className="rsb-bars">
                    <div className="rsb-brow is-head">
                      <span>Season</span>
                      <span />
                      <span className="rsb-v">Before<br />After</span>
                      <span className="rsb-c">Change</span>
                    </div>
                    {barRows.map(function (s) {
                      const ch = num(s.cap_change) || 0;
                      return (
                        <div className="rsb-brow" key={'b' + s.season}>
                          <span className="rsb-y">{s.season}</span>
                          <span className="rsb-t" aria-hidden="true">
                            <i className="is-before" style={{ width: width(s.cap_before) }} />
                            <i className="is-after" style={{ width: width(s.cap_after) }} />
                          </span>
                          <span className="rsb-v">
                            {money(s.cap_before)}
                            <br />
                            <b>{money(s.cap_after)}</b>
                          </span>
                          <span className={'rsb-c' + (ch < 0 ? ' is-dn' : ch > 0 ? ' is-up' : '')}>
                            {signed(s.cap_change)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rsb-leg">
                    <span><i className="is-before" />Before</span>
                    <span><i className="is-after" />After</span>
                    {voidYears.length > 0 ? (
                      <span>
                        {listWords(voidYears)} {voidYears.length === 1 ? 'is a void year' : 'are void years'}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="rsb-imp">
                  <div>
                    <span className="rsb-l">{seasonYear} cap room</span>
                    <b>{currentTeam && currentTeam.room_after !== null && currentTeam.room_after !== undefined ? money(currentTeam.room_after) : '—'}</b>
                    <span>{teamCap ? 'was ' + money(teamCap.cap_space_remaining) : ' '}</span>
                  </div>
                  <div>
                    <span className="rsb-l">Cash spent</span>
                    <b>{preview.cash_neutral ? 'No change' : money(preview.cash_current_season_after)}</b>
                    <span>{preview.cash_neutral ? 'bonus paid this season' : seasonYear + ' cash after'}</span>
                  </div>
                  <div>
                    <span className="rsb-l">Dead if cut</span>
                    <b>{current && current.cuttable !== false ? money(current.dead_cap_after) : '—'}</b>
                    <span>{current && current.cuttable !== false ? 'was ' + money(current.dead_cap_before) : ' '}</span>
                  </div>
                </div>

                {overSeasons.length > 0 ? (
                  <p className="rsb-note">
                    This puts your {listWords(overSeasons)} cap over its ceiling. That does not stop
                    the restructure.
                  </p>
                ) : null}
              </>
            ) : null}

            {overMax ? (
              <div className="form-error">
                {money(amt)} is above the most this spread allows, {money(maxConvert)}.
              </div>
            ) : null}
            {failedTests.length > 0 ? (
              <div className="form-error">
                This amount can&rsquo;t be offered: {listWords(failedTests)}. Change the amount or
                the spread.
              </div>
            ) : null}
            {submitError ? <div className="form-error">{submitError}</div> : null}

            <p className="rsb-sm rsb-foot">
              Money already paid never changes. Once it&rsquo;s done, only an officer can reverse
              it, and only for a short time.
            </p>
            <div className="rsb-btns">
              <button type="button" className="btn btn-quiet" onClick={cancel} disabled={working}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={handleSubmit} disabled={!canSubmit}>
                {working ? 'Working…' : 'Restructure ' + (amt ? money(amt) : '')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
