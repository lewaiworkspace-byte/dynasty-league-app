'use server';

import { redirect } from 'next/navigation';
import { adminClient } from '../../../lib/supabaseAdmin';

export async function createContract(payload) {
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

  // 3. Create one contract_years row per season (real years + void years).
  // Signing bonus is split evenly unless a year carries an exact proration
  // (e.g. loaded from the rookie wage scale, which isn't an even split).
  const totalRows = totalYears + voidYears;
  const proratedBonus = totalRows > 0 ? signingBonusTotal / totalRows : 0;

  const yearRows = payload.years.slice(0, totalRows).map((y, idx) => {
    const yearNumber = idx + 1;
    const isVoid = yearNumber > totalYears;
    const hasExactProration =
      y.signingBonusProration !== null && y.signingBonusProration !== undefined && y.signingBonusProration !== '';
    return {
      contract_id: contract.id,
      contract_year_number: yearNumber,
      league_season_year: Number(payload.startYear) + idx,
      prorated_signing_bonus: hasExactProration ? Number(y.signingBonusProration) : proratedBonus,
      guaranteed_salary: isVoid ? 0 : Number(y.guaranteedSalary) || 0,
      non_guaranteed_salary: isVoid ? 0 : Number(y.nonGuaranteedSalary) || 0,
      option_bonus: isVoid ? 0 : Number(y.optionBonus) || 0,
      roster_bonus: isVoid ? 0 : Number(y.rosterBonus) || 0,
      is_void_year: isVoid,
    };
  });

  const { error: yearsErr } = await supabase.from('contract_years').insert(yearRows);
  if (yearsErr) throw new Error(yearsErr.message);

  redirect('/');
}
