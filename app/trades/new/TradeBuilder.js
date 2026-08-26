'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { proposeDraft, updateDraft, discardDraft, submitTrade, loadTradePreview } from '../actions';
import TradeImpactCards from '../TradeImpactCards';

// ONE DRAFT PER BUILDER SESSION.
//
// trade_impact() needs a trade_id, so Preview is a write: the first one calls
// propose_trade(as_draft=true) and every later one calls update_trade_draft on
// the same row. Before update_trade_draft existed the only way to re-price an
// edited trade was discard-and-recreate, which stranded a draft every time a
// browser died mid-edit. Holding one id for the session means an abandoned
// session leaves at most one draft, and that draft is visible and discardable
// under "Your drafts" on /trades.
//
// A DRAFT RESERVES NOTHING. Availability is checked by submit_trade() at send
// time, not here, because another owner may have traded a player away since
// this draft was saved. That refusal names the problem and says to rebuild --
// it is surfaced verbatim rather than pre-empted with a guess.
//
// NO CAP OR CASH ARITHMETIC LIVES IN THIS FILE. Every figure the preview shows
// comes back from trade_impact() through TradeImpactCards, which the detail
// page renders too, so what an owner sees here is what the commissioner sees
// at execution.

function assetKey(asset) {
  return asset.assetType + ':' + (asset.contractId || asset.draftPickId);
}

export default function TradeBuilder({ teams, contracts, picks, myTeamId }) {
  const router = useRouter();

  // Teams in the deal. The proposer's own team is always in it -- propose_trade
  // refuses a trade the proposing team is not a party to.
  const [involved, setInvolved] = useState(myTeamId ? [myTeamId] : []);
  const [assets, setAssets] = useState([]);
  const [note, setNote] = useState('');

  const [tradeId, setTradeId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [stale, setStale] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingSend, setConfirmingSend] = useState(false);

  function markStale() {
    setStale(true);
    setConfirmingSend(false);
  }

  function toggleTeam(teamId) {
    if (teamId === myTeamId) return;

    // Computed outside both setters rather than calling setAssets from inside
    // the setInvolved updater. An updater must be pure -- React can call it
    // twice in StrictMode and during concurrent re-renders, which would queue
    // the asset filter more than once.
    const next =
      involved.indexOf(teamId) >= 0
        ? involved.filter(function (t) { return t !== teamId; })
        : involved.concat([teamId]);

    setInvolved(next);
    // Drop any asset whose sender or destination just left the deal, or it
    // would reach propose_trade with a team nobody is a party to.
    setAssets(function (current) {
      return current.filter(function (a) {
        return next.indexOf(a.fromTeamId) >= 0 && (!a.toTeamId || next.indexOf(a.toTeamId) >= 0);
      });
    });
    markStale();
  }

  function addAsset(asset) {
    setAssets(function (prev) {
      if (prev.some(function (a) { return assetKey(a) === assetKey(asset); })) return prev;
      return prev.concat([asset]);
    });
    markStale();
  }

  function removeAsset(key) {
    setAssets(function (prev) {
      return prev.filter(function (a) { return assetKey(a) !== key; });
    });
    markStale();
  }

  function setDestination(key, toTeamId) {
    setAssets(function (prev) {
      return prev.map(function (a) {
        return assetKey(a) === key ? Object.assign({}, a, { toTeamId: toTeamId }) : a;
      });
    });
    markStale();
  }

  // The exact shape propose_trade / update_trade_draft expect. Built here and
  // nowhere else so there is one definition of it.
  function payload() {
    return assets.map(function (a) {
      const el = {
        asset_type: a.assetType,
        from_team_id: a.fromTeamId,
        to_team_id: a.toTeamId,
      };
      if (a.assetType === 'player') el.contract_id = a.contractId;
      else el.draft_pick_id = a.draftPickId;
      return el;
    });
  }

  const unrouted = assets.filter(function (a) { return !a.toTeamId; });
  const canPreview = assets.length > 0 && unrouted.length === 0 && involved.length >= 2;

  function handlePreview() {
    if (!canPreview) return;
    setBusy(true);
    setError('');

    const body = payload();
    const write = tradeId ? updateDraft(tradeId, body, note) : proposeDraft(body, note);

    write
      .then(function (result) {
        if (!result.ok) {
          setError(result.message);
          return null;
        }
        const id = tradeId || (result.data && result.data.trade_id);
        if (!id) {
          setError('The draft was saved but did not come back with an id. Reload and try again.');
          return null;
        }
        setTradeId(id);
        return loadTradePreview(id);
      })
      .then(function (previewResult) {
        if (!previewResult) return;
        if (!previewResult.ok) {
          setError(previewResult.message);
          return;
        }
        setPreview(previewResult);
        setStale(false);
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function handleSend() {
    if (!tradeId) return;
    if (!confirmingSend) {
      setConfirmingSend(true);
      return;
    }
    setBusy(true);
    setError('');
    submitTrade(tradeId)
      .then(function (result) {
        if (!result.ok) {
          setError(result.message);
          setConfirmingSend(false);
          return;
        }
        router.push('/trades/' + tradeId);
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
        setConfirmingSend(false);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function handleDiscard() {
    if (!tradeId) {
      setAssets([]);
      setPreview(null);
      setNote('');
      setStale(true);
      return;
    }
    setBusy(true);
    setError('');
    discardDraft(tradeId)
      .then(function (result) {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setTradeId(null);
        setAssets([]);
        setPreview(null);
        setNote('');
        setStale(true);
        setConfirmingSend(false);
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setBusy(false);
      });
  }

  const teamName = {};
  (teams || []).forEach(function (t) { teamName[t.id] = t.name; });

  const legalityBlocking = preview && preview.legality && preview.legality.length > 0;

  return (
    <div>
      {error && <div className="form-error">{error}</div>}

      <h2 className="section-heading">1. Who is involved</h2>
      <p className="empty-note">
        Your team is always part of a trade you propose. Pick at least one more.
      </p>
      <div className="page-actions">
        {(teams || []).map(function (t) {
          const on = involved.indexOf(t.id) >= 0;
          const isMe = t.id === myTeamId;
          return (
            <button
              key={t.id}
              type="button"
              className={on ? 'btn' : 'btn btn-quiet'}
              onClick={function () { toggleTeam(t.id); }}
              disabled={busy || isMe}
            >
              {t.name}
              {isMe ? ' (you)' : ''}
            </button>
          );
        })}
      </div>

      {involved.length >= 2 && (
        <>
          <h2 className="section-heading">2. What moves</h2>
          <div className="trade-cards">
            {involved.map(function (teamId) {
              const teamContracts = contracts.filter(function (c) { return c.teamId === teamId; });
              const teamPicks = picks.filter(function (p) { return p.teamId === teamId; });
              const chosen = assets.filter(function (a) { return a.fromTeamId === teamId; });
              const chosenKeys = chosen.map(assetKey);

              return (
                <article className="trade-card" key={teamId}>
                  <header className="trade-card-head">
                    <h3 className="team-name">{teamName[teamId]}</h3>
                  </header>

                  <label>
                    Add a player
                    <select
                      value=""
                      disabled={busy}
                      onChange={function (e) {
                        if (!e.target.value) return;
                        const c = teamContracts.find(function (x) { return x.id === e.target.value; });
                        if (c) {
                          addAsset({
                            assetType: 'player',
                            contractId: c.id,
                            label: c.name + (c.position ? ' (' + c.position + ')' : ''),
                            fromTeamId: teamId,
                            toTeamId: involved.length === 2
                              ? involved.find(function (t) { return t !== teamId; })
                              : '',
                          });
                        }
                        e.target.value = '';
                      }}
                    >
                      <option value="">Choose a player…</option>
                      {teamContracts.map(function (c) {
                        return (
                          <option
                            key={c.id}
                            value={c.id}
                            disabled={chosenKeys.indexOf('player:' + c.id) >= 0}
                          >
                            {c.name}
                            {c.position ? ' (' + c.position + ')' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label>
                    Add a draft pick
                    <select
                      value=""
                      disabled={busy}
                      onChange={function (e) {
                        if (!e.target.value) return;
                        const p = teamPicks.find(function (x) { return x.id === e.target.value; });
                        if (p) {
                          addAsset({
                            assetType: 'pick',
                            draftPickId: p.id,
                            label: p.seasonYear + ' round ' + p.round +
                              (p.originalTeam ? ' (from ' + p.originalTeam + ')' : ''),
                            fromTeamId: teamId,
                            toTeamId: involved.length === 2
                              ? involved.find(function (t) { return t !== teamId; })
                              : '',
                          });
                        }
                        e.target.value = '';
                      }}
                    >
                      <option value="">Choose a pick…</option>
                      {teamPicks.map(function (p) {
                        return (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={chosenKeys.indexOf('pick:' + p.id) >= 0}
                          >
                            {p.seasonYear} round {p.round}
                            {p.originalTeam ? ' (from ' + p.originalTeam + ')' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  {chosen.length === 0 ? (
                    <p className="empty-note">Sending nothing yet.</p>
                  ) : (
                    <ul className="trade-asset-list">
                      {chosen.map(function (a) {
                        const key = assetKey(a);
                        return (
                          <li key={key}>
                            <span>{a.label}</span>
                            <select
                              value={a.toTeamId || ''}
                              disabled={busy}
                              onChange={function (e) { setDestination(key, e.target.value); }}
                            >
                              <option value="">To which team?</option>
                              {involved
                                .filter(function (t) { return t !== teamId; })
                                .map(function (t) {
                                  return (
                                    <option key={t} value={t}>
                                      {teamName[t]}
                                    </option>
                                  );
                                })}
                            </select>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              onClick={function () { removeAsset(key); }}
                              disabled={busy}
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>

          <label>
            Note for the other owners (optional)
            <input
              type="text"
              value={note}
              onChange={function (e) { setNote(e.target.value); markStale(); }}
              disabled={busy}
            />
          </label>

          <h2 className="section-heading">3. Preview</h2>
          {unrouted.length > 0 && (
            <p className="empty-note">
              {unrouted.length} asset{unrouted.length === 1 ? ' still needs' : 's still need'} a
              destination team.
            </p>
          )}

          <div className="action-bar">
            <button
              type="button"
              className="btn"
              onClick={handlePreview}
              disabled={busy || !canPreview}
            >
              {busy ? 'Working…' : stale ? 'Preview' : 'Refresh preview'}
            </button>
            {tradeId && (
              <button type="button" className="btn btn-quiet" onClick={handleDiscard} disabled={busy}>
                Discard draft
              </button>
            )}
          </div>

          {preview && stale && (
            <p className="form-notice">
              You have changed the trade since this preview. Preview again before sending —
              the figures below are for the previous version.
            </p>
          )}

          {preview && (
            <TradeImpactCards rows={preview.impact} legality={preview.legality} />
          )}

          {preview && !stale && (
            <div className="action-bar">
              <button
                type="button"
                className="btn"
                onClick={handleSend}
                disabled={busy || legalityBlocking}
              >
                {busy
                  ? 'Working…'
                  : confirmingSend
                    ? 'Press again to send'
                    : 'Send to the other owners'}
              </button>
            </div>
          )}

          {legalityBlocking && (
            <p className="empty-note">
              This trade cannot be sent while it breaks a rule. Change the assets and preview
              again.
            </p>
          )}

          {confirmingSend && !legalityBlocking && (
            <p className="empty-note">
              Sending makes the trade visible to every owner and counts as your acceptance.
              The players and picks in it are checked again at that moment — if another trade
              has taken one since you built this, you will be told to rebuild.
            </p>
          )}
        </>
      )}
    </div>
  );
}
