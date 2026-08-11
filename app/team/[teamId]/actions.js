'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// Both RPCs enforce their own rules in the database -- ownership, the
// September 1 opening gate, the auction block, the League Reset freeze, and
// the June 1st designation allowance all live in cut_player() and
// compute_cut_charges(). The checks here exist for clearer error messages,
// not as the only gate. Never rely on this file alone for authorization.

export async function previewCut(contractId, useJune1Designation) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    throw new Error('You must be signed in to preview a cut.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('compute_cut_charges', {
    p_contract_id: contractId,
    p_june1_designation: Boolean(useJune1Designation),
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function executeCut(contractId, useJune1Designation, note) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    throw new Error('You must be signed in to cut a player.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('cut_player', {
    p_contract_id: contractId,
    p_june1_designation: Boolean(useJune1Designation),
    p_salary_obligation_transfers: false,
    p_to_team_id: null,
    p_note: note && note.trim() ? note.trim() : null,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/team/' + me.team_id);
  revalidatePath('/cap-sheet');
  revalidatePath('/cash');

  return data;
}
