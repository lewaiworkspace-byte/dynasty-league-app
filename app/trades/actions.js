'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../lib/getCurrentTeamOwner';

// EVERY ACTION HERE RETURNS ITS REFUSAL. None throws for an expected
// condition. Next.js masks thrown errors in a production build, replacing the
// message with a generic "an error occurred in the Server Components render"
// string -- and the trade RPCs raise some of the most carefully worded refusals
// in the database. "Conflict of interest under 7.7(e): your own team is a party
// to this trade, so you must recuse" is a sentence an owner can act on. The
// generic string is not. The caller checks .ok and puts .message in
// .form-error; .catch is reserved for a dead network.
//
// THE DATABASE IS THE GATE. Every RPC below gates itself -- ownership, party
// membership, draft ownership, trade windows, trade-backs, cap and cash
// compliance, recusal. The checks in this file exist to produce a readable
// message one step earlier and to avoid a pointless round trip. Never treat
// this file as the authorization boundary.
//
// NOTHING HERE COMPUTES MONEY. trade_impact() returns every cap, cash and
// roster figure the UI shows. There is deliberately no JS mirror of it.

// The one SQLSTATE this file interprets. reverse_trade() raises EDFL1 for a
// compliance breach and the default P0001 for every other refusal, because
// p_force bypasses the compliance check and nothing else. See reverseTrade().
const ERRCODE_FORCEABLE = 'EDFL1';

// A trade touches two or three teams' cap and cash pages plus the public log,
// so the revalidation set is wide. Trades are rare; the pages are cheap.
function revalidateTradeSurfaces() {
  revalidatePath('/trades');
  revalidatePath('/trades/[tradeId]', 'page');
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/cap-sheet');
  revalidatePath('/cash');
  revalidatePath('/actions');
}

/**
 * Create a draft. A draft reserves nothing and is visible only to its
 * proposer; asset availability is re-checked at submit, not here.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function proposeDraft(assets, note) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to build a trade.' };
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    return { ok: false, message: 'A trade needs at least one asset.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('propose_trade', {
    p_assets: assets,
    p_note: note && note.trim() ? note.trim() : null,
    p_as_draft: true,
  });

  if (error) {
    return { ok: false, message: error.message || 'The draft could not be created.' };
  }
  revalidatePath('/trades');
  return { ok: true, data };
}

/**
 * Amend a draft in place. This is what keeps a builder session to exactly one
 * draft: the first Preview creates it, every later Preview updates it. Without
 * this the only way to re-price an edited trade would be discard-and-recreate,
 * which strands a draft every time a browser dies mid-edit.
 *
 * Draft only -- it refuses once the trade has been sent. Proposer only.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function updateDraft(tradeId, assets, note) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to edit a trade.' };
  }
  if (!tradeId) {
    return { ok: false, message: 'No draft to update.' };
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    return { ok: false, message: 'A trade needs at least one asset.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('update_trade_draft', {
    p_trade_id: tradeId,
    p_assets: assets,
    p_note: note && note.trim() ? note.trim() : null,
  });

  if (error) {
    return { ok: false, message: error.message || 'The draft could not be updated.' };
  }
  revalidatePath('/trades');
  return { ok: true, data };
}

/** Delete a draft. Drafts only -- a sent trade is declined, never deleted. */
export async function discardDraft(tradeId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('discard_trade_draft', { p_trade_id: tradeId });

  if (error) {
    return { ok: false, message: error.message || 'The draft could not be discarded.' };
  }
  revalidatePath('/trades');
  return { ok: true, data };
}

/**
 * Send a draft to the other owners. submit_trade() re-validates every asset
 * here rather than at draft time, because a draft reserves nothing and another
 * trade may have taken a player since it was saved. That refusal names the
 * problem and tells the owner to rebuild -- pass it through verbatim.
 */
export async function submitTrade(tradeId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to send a trade.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('submit_trade', { p_trade_id: tradeId });

  if (error) {
    return { ok: false, message: error.message || 'The trade could not be sent.' };
  }
  revalidateTradeSurfaces();
  return { ok: true, data };
}

/**
 * Accept, as one of the parties.
 *
 * THE LAST ACCEPTANCE FREEZES THE SETTLEMENT. When the final party accepts,
 * accept_trade() stamps effective_at, resolves the trade window at that
 * instant, and writes a settlement onto every player asset. Approval later
 * does not re-price anything. The returned effective_at is what the detail
 * page shows as the freeze point.
 */
export async function acceptTrade(tradeId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to accept a trade.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('accept_trade', { p_trade_id: tradeId });

  if (error) {
    return { ok: false, message: error.message || 'The trade could not be accepted.' };
  }
  revalidateTradeSurfaces();
  return { ok: true, data };
}

/** Decline, as one of the parties. Ends the trade for everyone. */
export async function declineTrade(tradeId, reason) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in as a team owner to decline a trade.' };
  }
  if (!reason || !reason.trim()) {
    return { ok: false, message: 'A reason is required so the other owners know why.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('decline_trade', {
    p_trade_id: tradeId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, message: error.message || 'The trade could not be declined.' };
  }
  revalidateTradeSurfaces();
  return { ok: true, data };
}

/**
 * Approve and execute. Commissioner OR co-commissioner (rule 7.7(c)).
 *
 * execute_trade() re-checks legality and post-trade compliance before moving
 * anything, and refuses under 7.7(e) if the approver's own team is a party.
 * The UI detects that conflict from the party list and hides this control
 * rather than letting an owner discover it as a refusal -- but the refusal is
 * still the real gate, and this action still surfaces it if it fires.
 */
export async function executeTrade(tradeId) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return {
      ok: false,
      message: 'This action requires commissioner or co-commissioner access.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('execute_trade', { p_trade_id: tradeId });

  if (error) {
    return { ok: false, message: error.message || 'The trade was refused and nothing was moved.' };
  }
  revalidateTradeSurfaces();
  return { ok: true, data };
}

/**
 * Veto, on competitive-balance grounds. COMMISSIONER ONLY.
 *
 * NOT isCommissionerOrCo, and that is not an oversight. Rule 7.7(c) shares
 * APPROVAL with the co-commissioner; 7.7(d) reserves the VETO to "the
 * commissioner and commissioner only". The two controls sit side by side on
 * the detail page with different gates, which is exactly the shape the
 * co-commissioner design anticipates: a page's gate does not cover everything
 * on it. Do not widen this to match the button next to it.
 *
 * veto_trade() also refuses when the commissioner's own team is a party --
 * 7.7(d) sends that case to a grievance vote instead.
 */
export async function vetoTrade(tradeId, reason) {
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    return { ok: false, message: 'Only the commissioner can veto a trade.' };
  }
  if (!reason || reason.trim().length < 10) {
    return {
      ok: false,
      message:
        'A veto needs a reason of at least 10 characters. It is logged and is appealable through the grievance process.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('veto_trade', {
    p_trade_id: tradeId,
    p_reason: reason.trim(),
  });

  if (error) {
    return { ok: false, message: error.message || 'The veto was refused and nothing was changed.' };
  }
  revalidateTradeSurfaces();
  return { ok: true, data };
}

/**
 * Reverse an executed trade. Commissioner OR co-commissioner.
 *
 * A THIRD GATE, DIFFERENT FROM THE OTHER TWO. Approval (7.7(c)) is shared and
 * recuses both roles from their own team under 7.7(e). Veto (7.7(d)) is the
 * commissioner alone. Reversal, by commissioner ruling of August 27, 2026, is
 * shared like approval but recuses only the CO-commissioner: the commissioner
 * may reverse a trade involving his own team, because reversing is undoing a
 * decision rather than making one, and a commissioner who approved something
 * in error must be able to take it back. reverse_trade() enforces that split
 * itself; isCommissionerOrCo here is the outer boundary, not the whole rule.
 *
 * THE RETURN CARRIES needsForce, AND THAT FLAG IS READ FROM THE SQLSTATE.
 * p_force bypasses the post-reversal compliance check and nothing else, so it
 * is only worth offering when compliance is what refused. reverse_trade()
 * raises EDFL1 for exactly that case and the default P0001 for all five
 * guards. Matching on message text instead would break silently the first
 * time anybody rewords a sentence.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string, needsForce?:boolean}>}
 */
export async function reverseTrade(tradeId, reason, force) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    return {
      ok: false,
      message: 'This action requires commissioner or co-commissioner access.',
    };
  }
  if (!tradeId) {
    return { ok: false, message: 'No trade to reverse.' };
  }
  if (!reason || reason.trim().length < 10) {
    return {
      ok: false,
      message:
        'A reversal needs a reason of at least 10 characters. It is published in the Commissioner Action Log.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('reverse_trade', {
    p_trade_id: tradeId,
    p_reason: reason.trim(),
    p_force: force === true,
  });

  if (error) {
    return {
      ok: false,
      needsForce: error.code === ERRCODE_FORCEABLE,
      message: error.message || 'The reversal was refused and nothing was changed.',
    };
  }
  revalidateTradeSurfaces();
  return { ok: true, data };
}

/**
 * The preview: every team's cap, cash and roster impact, plus any legality
 * problems. Both come straight from the database.
 *
 * Zero legality rows means legal. The detail strings name the player and cite
 * the rule, so they are rendered verbatim rather than paraphrased.
 *
 * @returns {Promise<{ok:true, impact:Array, legality:Array}|{ok:false, message:string}>}
 */
export async function loadTradePreview(tradeId) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'You must be signed in to preview a trade.' };
  }
  if (!tradeId) {
    return { ok: false, message: 'No trade to preview.' };
  }

  const supabase = await createSupabaseServerClient();
  const [impactResult, legalityResult] = await Promise.all([
    supabase.rpc('trade_impact', { p_trade_id: tradeId }),
    supabase.rpc('trade_legality', { p_trade_id: tradeId }),
  ]);

  if (impactResult.error) {
    return {
      ok: false,
      message: impactResult.error.message || 'The impact could not be calculated.',
    };
  }
  if (legalityResult.error) {
    return {
      ok: false,
      message: legalityResult.error.message || 'Rule legality could not be checked.',
    };
  }

  return {
    ok: true,
    impact: impactResult.data || [],
    legality: legalityResult.data || [],
  };
}
