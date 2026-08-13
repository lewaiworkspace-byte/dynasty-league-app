'use server';
import { redirect } from 'next/navigation';
import { adminClient } from '../../../lib/supabaseAdmin';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
export async function createContract(payload) {
  // Server Actions are callable endpoints regardless of what the UI
  // renders -- the page's redirect alone doesn't protect this write path.
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can create contracts.');
  }
  const supabase = adminClient();
  // 1. Find an existing player by name, or create a new one
  let playerId;
  const { data: existingPlayer, error: findErr } = await supabase
    .from('players')
    .select('id')
    .ilike('full_name', payload.playerName.trim())
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (existingPlayer) {
    playerId = existingPlayer.id;
  } else {
    const { data: newPlayer, error: playerErr } = await supabase
      .from('players')
      .insert({
        full_name: payload.playerName.trim(),
        position: payload.position || null,
        nfl_team: payload.nflTeam || null,
      })
      .select('id')
      .single();
    if (playerErr) throw new Error(playerErr.message);
    playerId = newPlayer.id;
  }
  // 2. Create the contract
  const isFreeAgent = payload.contractType === 'veteran_free_agent';
  const voidYears = isFreeAgent ? Number(payload.voidYears) || 0 : 0;
  const totalYears = Number(payload.totalYears);
  const signingBonusTotal = Number(payload.signingBonusTotal) || 0;
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .insert({
      player_id: playerId,
      team_id: payload.teamId,
      contract_type: payload.contractType,
      start_year: Number(payload.startYear),
      total_years: totalYears,
      void_years: voidYears,
      draft_year: payload.draftYear ? Number(payload.draftYear) : null,
      draft_round: payload.draftRound ? Number(payload.draftRound) : null,
      draft_pick: payload.draftPick ? Number(payload.draftPick) : null,
      signing_bonus_total: signingBonusTotal,
    })
    .select('id')
    .single();
  if (contractErr) throw new Error(contractErr.message);
  // 3. Create one contract_years row per season (real years + owner-elected
  // void years). Signing bonus is split evenly unless a year carries an
  // exact proration (e.g. loaded from the rookie wage scale, which isn't an
  // even split). Every void row here is owner-elected, so it carries
  // void_reason 'signing_bonus' -- required by the void_reason_matches_flag
  // constraint (Aug 2026). Automatic option void years are NOT created
  // here: the database's rebuild_option_void_years trigger adds them (with
  // void_reason 'option_bonus') when the option bonuses are inserted in
  // step 4.
  //
  // contract_years.option_bonus is the LEGACY flat column: always written
  // as 0. Real option bonuses live in contract_option_bonuses (step 4);
  // writing the legacy column as well would double-charge the cap and hide
  // the money from the 30% Rule trigger, which reads only the real table.
  const totalRows = totalYears + voidYears;
  const proratedBonus = totalRows > 0 ? signingBonusTotal / totalRows : 0;
  const yearRows = payload.years.slice(0, totalRows).map((y, idx) => {
    const yearNumber = idx + 1;
    const isVoid = yearNumber > totalYears;
    const hasExactProration =
      y.proratedSigningBonus !== null && y.proratedSigningBonus !== undefined && y.proratedSigningBonus !== '';
    return {
      contract_id: contract.id,
      contract_year_number: yearNumber,
      league_season_year: Number(payload.startYear) + idx,
      prorated_signing_bonus: hasExactProration ? Number(y.proratedSigningBonus) : proratedBonus,
      guaranteed_salary: isVoid ? 0 : Number(y.guaranteedSalary) || 0,
      non_guaranteed_salary: isVoid ? 0 : Number(y.nonGuaranteedSalary) || 0,
      option_bonus: 0,
      roster_bonus: isVoid ? 0 : Number(y.rosterBonus) || 0,
      is_void_year: isVoid,
      void_reason: isVoid ? 'signing_bonus' : null,
    };
  });
  const { error: yearsErr } = await supabase.from('contract_years').insert(yearRows);
  if (yearsErr) throw new Error(yearsErr.message);
  // 4. Create the REAL option bonuses in contract_option_bonuses -- the
  // same table a winning bid's options land in. Year 2+ of real years
  // only; the database refuses Year 1 and void-season scheduling. This
  // insert is what fires rebuild_option_void_years (adding the automatic
  // option void seasons to contract_years) and the 30% Rule trigger.
  //
  // PostgREST calls are separate transactions: if this insert is rejected
  // (e.g. a 30% violation the client pre-check should have caught), the
  // contract and its years are already saved WITHOUT the option bonuses.
  // The error below says so explicitly rather than leaving the partial
  // state silent -- the commissioner can delete the contract via
  // commissioner_delete_contract and re-enter it.
  const optionRows = payload.years
    .slice(1, totalYears)
    .map((y, idx) => ({
      contract_id: contract.id,
      exercise_season_year: Number(payload.startYear) + idx + 1,
      bonus_amount: Number(y.optionBonus) || 0,
    }))
    .filter((r) => r.bonus_amount > 0);
  if (optionRows.length > 0) {
    const { error: obErr } = await supabase.from('contract_option_bonuses').insert(optionRows);
    if (obErr) {
      throw new Error(
        'Contract saved, but its option bonuses were REJECTED and are not attached: ' +
          obErr.message +
          ' — delete this contract from Fix Contracts and re-enter it once the issue is fixed.'
      );
    }
  }
  redirect('/cap-sheet');
}
