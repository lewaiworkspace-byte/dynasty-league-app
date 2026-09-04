'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { loadRosterData } from '../../lib/restructureRoster';
// No isCommissionerOrCo import, deliberately. Nothing in this file may branch
// on the commissioner role: /restructure is a League surface and treats every
// owner the same. If that import reappears here, something has drifted.
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { RESTRUCTURE_ENABLED, RESTRUCTURE_DISABLED_MESSAGE } from '../../lib/featureFlags';

// CONTRACT RESTRUCTURE. Converts unpaid current-season salary into a NEW
// signing bonus with its own proration window, leaving the original signing
// bonus alone.
//
// OPEN TO EVERY OWNER ON THEIR OWN ROSTER (rule change, September 4, 2026).
// Commissioner and co-commissioner may act for any team, exactly as
// cut_player already works. There is deliberately NO commissioner check in
// this file: the database is the gate, and it distinguishes "not your roster"
// from "not eligible" with different messages that an owner needs to be able
// to tell apart. Adding an app-layer commissioner check back would collapse
// both into one refusal and lock out the people the rule change is for.
//
// These actions moved here from app/admin/new-contract/actions.js when the
// feature stopped being commissioner-only. That page keeps its commissioner
// gate; new contracts are still commissioner-only.
//
// NOTHING BELOW COMPUTES MONEY. Every figure the form shows comes back from
// max_restructure() or compute_restructure_charges(). There is deliberately no
// JS mirror of the cap-saving formula, the Deion Rule, the minimum salary or
// the PPV test -- the database owns all four and a client copy would drift.
//
// THE SESSION CLIENT, NEVER adminClient(). The restructure functions gate
// themselves on auth.uid(). Through the service-role client auth.uid() is
// NULL, and now that ordinary owners call these directly every single call
// would fail with "No owner record is linked to this login."
//
// All four RETURN their refusals rather than throwing.

// THE KILL SWITCH IS CHECKED HERE, NOT ONLY ON THE PAGE. Every action below
// starts with this. A Server Action is a callable endpoint regardless of what
// the page renders, so hiding the link and bouncing the route would still
// leave a live path to restructure_contract() -- which knows nothing about the
// flag and would run happily. This is the check that actually switches the
// feature off; the page and the home-page link are presentation.
function disabledRefusal() {
  return { ok: false, message: RESTRUCTURE_DISABLED_MESSAGE };
}

/**
 * Everything the picker needs, in one call.
 *
 * ALWAYS THE VIEWER'S OWN ROSTER, for everyone including the commissioner.
 * Other teams' players are ABSENT, not greyed: there is nothing an owner can
 * do with another roster here, and rendering them invites the question of why
 * they are refused. The commissioner's all-teams version is a different route
 * with a different gate -- /admin/restructure.
 *
 * The query and the eligibility pass live in lib/restructureRoster.js so both
 * routes run one implementation. The gate is what differs, and it stays out
 * here where it is visible.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function loadRestructureRoster() {
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to restructure.' };
  }

  const supabase = await createSupabaseServerClient();
  return loadRosterData(supabase, me.team_id, me.team_id);
}

/** The slider bound and the reason it sits where it does. */
export async function loadMaxRestructure(contractId, prorationYears) {
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('max_restructure', {
    p_contract_id: contractId,
    p_proration_years: Number(prorationYears),
  });

  if (error) {
    return { ok: false, message: error.message || 'The maximum could not be calculated.' };
  }
  return { ok: true, data: data };
}

/**
 * The live preview. Read-only and safe to call on every keystroke; the form
 * debounces it. Every number on screen comes from here.
 */
export async function previewRestructure(contractId, amount, fromGuaranteed, prorationYears) {
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('compute_restructure_charges', {
    p_contract_id: contractId,
    p_amount: Number(amount),
    p_from_guaranteed: Number(fromGuaranteed),
    p_proration_years: Number(prorationYears),
  });

  if (error) {
    return { ok: false, message: error.message || 'The preview could not be calculated.' };
  }
  return { ok: true, data: data };
}

/**
 * Execute.
 *
 * NO COMMISSIONER CHECK, DELIBERATELY. Every owner may restructure on their
 * own roster; restructure_contract() enforces that and names the owning team
 * when it refuses. An app-layer commissioner check here would turn "this
 * contract belongs to Awful Lot" into a generic access refusal and would lock
 * out the owners this route exists for.
 *
 * The database's refusals name the rule they enforce and are written to be
 * read by owners, so they are passed through verbatim.
 */
export async function submitRestructure(contractId, amount, fromGuaranteed, prorationYears, note) {
  // The one that matters. Everything above this only shows numbers; this
  // writes, and restructure_contract() would execute it.
  if (!RESTRUCTURE_ENABLED) return disabledRefusal();
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to restructure.' };
  }
  if (!contractId) {
    return { ok: false, message: 'Pick a player to restructure.' };
  }
  if (!(Number(amount) > 0)) {
    return { ok: false, message: 'Enter an amount to convert.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('restructure_contract', {
    p_contract_id: contractId,
    p_amount: Number(amount),
    p_from_guaranteed: Number(fromGuaranteed),
    p_proration_years: Number(prorationYears),
    p_note: note && note.trim() ? note.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      message: error.message || 'The restructure was refused and nothing was changed.',
    };
  }

  // A restructure moves cap and cash on every surface that reads
  // contract_year_computed, which folds the new bonus in already.
  revalidatePath('/restructure');
  revalidatePath('/cap-sheet');
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/player/[playerId]', 'page');
  revalidatePath('/cash');
  revalidatePath('/actions');

  return { ok: true, data: data };
}
