import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { formatShortDateTime } from '../../../../lib/formatDate';
import { formatCost } from '../../../../lib/formatMoney';
import { loadWaiverState } from '../../../waivers/actions';
import { RosterFace } from '../../../team/[teamId]/RosterList';
import ClaimSheet from './ClaimSheet';

export const revalidate = 0;

// THE CLAIM SHEET -- UI test batch 11, November 11, 2026.
//
// Lewis on the Players canvas (Waivers board, Nov 11 5:28 PM): "Replace this
// with 'Claim' then the player card should pop up with contract tab and a box
// verifying that the owner understands if they win the claim they inherit the
// contract." Approved as drawn (8:10 PM), with the box's wording read back
// against Rule Book 5.15(i) and agreed (8:26 PM): "If I win this claim, I take
// on his salary from the waive onward, including the full week I get him. His
// signing bonus stays with <waiving team>."
//
// It opens in the pop-up sheet from a row's Claim button (SheetHost knows
// /players/claim/<placement>). The player card has had no tabs since batch 6,
// so the sheet shows his header and the contract a claimant takes on.
//
// WHAT HE TAKES ON is edfl_waiver_claim_preview(): the receiver side of
// compute_trade_charges(), the same call waiver_settle_claim() makes at the
// run, so the figures are the engine's, never this page's. The cut options and
// the submit are the Waiver Wire page's own (loadWaiverState, submitClaim):
// one path into submit_waiver_claim(), which decides everything on submit.
// Any failed read shows its message and no form (L14).

export default async function ClaimPage({ params }) {
  const { placementId } = params;
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/players/claim/' + placementId);

  if (!viewer.owner) {
    return (
      <main className="page mpc-page">
        <h1 className="mpc-name">Place a claim</h1>
        <p className="pl-sm">Only a team owner can place a waiver claim.</p>
      </main>
    );
  }

  const state = await loadWaiverState();
  if (!state.ok) {
    return (
      <main className="page mpc-page">
        <h1 className="mpc-name">Place a claim</h1>
        <div className="form-error">The waiver wire could not be read: {state.message}</div>
      </main>
    );
  }
  const wireRow = state.data.live
    ? (state.data.wire || []).find(function (w) {
        return w.placement_id === placementId;
      })
    : null;
  if (!wireRow) {
    return (
      <main className="page mpc-page">
        <h1 className="mpc-name">Place a claim</h1>
        <p className="pl-sm">This player is not on the wire for the next run.</p>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: player }, previewRes] = await Promise.all([
    supabase
      .from('players')
      .select('id, full_name, position, nfl_team, sleeper_player_id')
      .eq('id', wireRow.player_id)
      .maybeSingle(),
    supabase.rpc('edfl_waiver_claim_preview', { p_placement_id: placementId }),
  ]);

  const years = previewRes.error ? [] : previewRes.data || [];
  const first = years[0] || null;
  const waivedBy = (first && first.waived_by_team_name) || wireRow.waived_by || 'the team that waived him';
  const runWeek = first ? first.run_week : state.data.nextRun ? state.data.nextRun.week_number : null;
  const runAt = first ? first.run_at : state.data.nextRun ? state.data.nextRun.runs_at : null;
  const existing = (state.data.myClaims || []).find(function (c) {
    return c.placement_id === placementId;
  });
  // Bonus columns are drawn only when a season carries one. Every figure is
  // the database's; nothing is added up here (SR-23).
  const showRoster = years.some(function (y) {
    return Number(y.roster_bonus) !== 0;
  });
  const showOption = years.some(function (y) {
    return Number(y.option_bonus) !== 0;
  });
  const name = player ? player.full_name : wireRow.player_name;

  return (
    <main className="page mpc-page pl-claim">
      <div className="mpc-head">
        <RosterFace big sleeperId={player ? player.sleeper_player_id : null} name={name} />
        <div>
          <div className="pl-eyb">Place a claim{runWeek ? ' · Week ' + runWeek + ' run' : ''}</div>
          <h1 className="mpc-name">{name}</h1>
          <div className="mpc-meta">
            {(player ? player.position : wireRow.position) || ''} &bull; {(player ? player.nfl_team : wireRow.nfl_team) || 'FA'}
            {' · waived by '}
            {waivedBy}
          </div>
        </div>
      </div>

      <div className="mpc-box">
        <p className="mpc-boxh">Contract · what you take on if you win</p>
        {previewRes.error ? (
          <div className="form-error">His contract could not be read: {previewRes.error.message}</div>
        ) : years.length === 0 ? (
          <p className="pl-sm">No salary remains on his contract.</p>
        ) : (
          <>
            <div className="table-scroll">
            <table className="pl-ctab">
              <thead>
                <tr>
                  <th scope="col">Season</th>
                  <th scope="col">Gtd</th>
                  <th scope="col">Non-gtd</th>
                  {showRoster ? <th scope="col">Roster bonus</th> : null}
                  {showOption ? <th scope="col">Option bonus</th> : null}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {years.map(function (y) {
                  return (
                    <tr key={y.season}>
                      <th scope="row">{y.season}</th>
                      <td>{formatCost(y.guaranteed_salary)}</td>
                      <td>{formatCost(y.non_guaranteed_salary)}</td>
                      {showRoster ? <td>{formatCost(y.roster_bonus)}</td> : null}
                      {showOption ? <td>{formatCost(y.option_bonus)}</td> : null}
                      <td>
                        <b>{formatCost(y.season_total)}</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <p className="pl-sm">
              His salary from the waive onward, as the run would settle it. His signing bonus stays with {waivedBy}.
              {runAt ? ' The run is ' + formatShortDateTime(runAt) + '.' : ''}
            </p>
            <a className="pl-link" href={'/player/' + wireRow.player_id + '/contract'}>
              Full contract details
            </a>
          </>
        )}
      </div>

      {previewRes.error ? null : (
        <ClaimSheet
          placementId={placementId}
          playerName={name}
          waivedBy={waivedBy}
          roster={state.data.roster || []}
          existingCut={existing ? existing.cut_contract_id || '' : ''}
          alreadyClaimed={Boolean(existing)}
        />
      )}
    </main>
  );
}
