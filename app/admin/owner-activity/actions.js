'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// THIS FILE HOLDS TWO DIFFERENT GATES ON PURPOSE. Read which is which before
// changing any of them.
//
// loadOwnerActivity  -> commissioner OR co-commissioner. The activity report
//                       is operational, and commissioner_owner_activity()
//                       accepts both.
// loadOwnerRoles     -> COMMISSIONER ONLY.
// setCoCommissioner  -> COMMISSIONER ONLY.
//
// The appointment pair is narrower than the page that hosts it. A
// co-commissioner who could appoint co-commissioners could appoint themselves
// peers, and the role would stop being the commissioner's to give. Both read
// me.is_commissioner directly and must NEVER be switched to isCommissionerOrCo
// or to require_commissioner_or_co() -- set_co_commissioner() enforces
// commissioner-only in the database too, but that is the backstop, not the
// gate: reaching it means the owner gets a raw database error instead of a
// sentence they can act on.

export async function loadOwnerActivity() {
  // Real gate, not just UI hiding -- the page also checks this, but the
  // action must enforce it itself since Server Actions are callable
  // endpoints regardless of what the UI shows.
  //
  // Widened to co-commissioners August 25, 2026, alongside the page.
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) {
    throw new Error(COMMISSIONER_OR_CO_REFUSAL);
  }

  // Session client, NOT adminClient(). commissioner_owner_activity() is
  // SECURITY DEFINER and gates itself on require_commissioner_or_co() as of
  // August 25, 2026, which reads auth.uid(). Through the service-role client
  // auth.uid() is NULL and the function would correctly refuse. The
  // service-role client would also bypass RLS, which is exactly what must not
  // happen while a tier is open.
  //
  // This comment said require_commissioner() until August 25 and was read as
  // evidence the page had to stay commissioner-only. It was stale, and it cost
  // a recommendation. The database is the authority on which gate an RPC
  // carries; a comment is a copy, and copies go out of date.
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('commissioner_owner_activity');
  if (error) throw new Error(error.message);

  // No revalidatePath: nothing is written, and a cached snapshot of "who
  // logged in recently" is worse than useless. The button refetches instead.
  return data || [];
}

// The two actions below RETURN refusals rather than throwing them, per the
// project rule: Next.js masks thrown errors in production builds, so a
// thrown refusal reaches the commissioner as an unreadable generic string.
// The caller checks .ok; .catch is for transport failures only.
//
// loadOwnerActivity above still throws. It predates the rule and its caller
// is written to catch -- converting it means changing both together, which
// is a separate change from this one and is on the conversion backlog.

/**
 * Every owner, with their current role flags, for the appointment control.
 *
 * @returns {Promise<{ok:true, data:Array}|{ok:false, message:string}>}
 */
export async function loadOwnerRoles() {
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    return { ok: false, message: 'Only the commissioner can view owner roles.' };
  }

  const supabase = await createSupabaseServerClient();

  // Session client so RLS applies as the commissioner. If this comes back
  // empty for a commissioner, the policy on team_owners is the thing to look
  // at -- not this query.
  const { data: owners, error: ownersError } = await supabase
    .from('team_owners')
    .select('id, team_id, email, is_commissioner, is_co_commissioner')
    .order('email');

  if (ownersError) {
    return { ok: false, message: ownersError.message };
  }
  if (!owners || owners.length === 0) {
    return { ok: true, data: [] };
  }

  // Team names in a second query rather than a PostgREST embed. Two reasons:
  // the embed depends on a foreign key being exposed, and an owner whose
  // team_id is null (a login not yet linked to a team) drops out of an inner
  // embed silently. That owner is exactly the one worth seeing here.
  const { data: teams } = await supabase.from('teams').select('id, name');

  const teamName = {};
  (teams || []).forEach(function (t) {
    teamName[t.id] = t.name;
  });

  const rows = owners.map(function (o) {
    return {
      id: o.id,
      email: o.email,
      teamName: o.team_id ? teamName[o.team_id] || 'Unknown team' : 'No team linked',
      isCommissioner: Boolean(o.is_commissioner),
      isCoCommissioner: Boolean(o.is_co_commissioner),
    };
  });

  return { ok: true, data: rows };
}

/**
 * Grant or revoke the co-commissioner role. COMMISSIONER ONLY.
 *
 * set_co_commissioner() re-checks this in the database and writes the change
 * to commissioner_actions, so the grant appears in the public log at /actions
 * alongside every other commissioner decision.
 *
 * @returns {Promise<{ok:true, data:object}|{ok:false, message:string}>}
 */
export async function setCoCommissioner(teamOwnerId, enabled, reason) {
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    return {
      ok: false,
      message: 'Only the commissioner can appoint or remove a co-commissioner.',
    };
  }

  if (!teamOwnerId) {
    return { ok: false, message: 'Pick an owner first.' };
  }
  if (!reason || !reason.trim()) {
    return {
      ok: false,
      message: 'A reason is required — it appears in the public action log.',
    };
  }

  // The commissioner cannot demote themselves through this control. The role
  // being granted is co-commissioner, and is_commissioner is a different
  // column that this RPC does not touch -- but blocking the self-target here
  // keeps the UI from implying otherwise.
  if (teamOwnerId === me.id) {
    return {
      ok: false,
      message: 'You are the commissioner. The co-commissioner role is for someone else.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('set_co_commissioner', {
    p_team_owner_id: teamOwnerId,
    p_enabled: Boolean(enabled),
    p_reason: reason.trim(),
  });

  if (error) {
    // The database's message is the useful one -- pass it straight through.
    return {
      ok: false,
      message: error.message || 'The change was refused and nothing was saved.',
    };
  }

  // Every widened page's gate is read from the session at request time, so a
  // revoked co-commissioner loses access on their next navigation. These
  // revalidations just stop a cached admin page being served in the meantime.
  revalidatePath('/admin/owner-activity');
  revalidatePath('/actions');
  revalidatePath('/');

  return { ok: true, data: data || null };
}
