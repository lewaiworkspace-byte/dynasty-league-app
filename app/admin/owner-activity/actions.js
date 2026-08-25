'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// THIS PAGE STAYS COMMISSIONER-ONLY. Every check below reads
// me.is_commissioner directly and must NOT be switched to isCommissionerOrCo.
//
// Two separate reasons, and either one alone would be enough:
//   1. commissioner_owner_activity() gates itself on require_commissioner(),
//      which is unchanged and strict. A widened page would load and then
//      refuse -- worse than not loading.
//   2. set_co_commissioner() is how the role is granted. A co-commissioner
//      who could appoint co-commissioners could appoint themselves peers,
//      and the role would no longer be the commissioner's to give.

export async function loadOwnerActivity() {
  // Real gate, not just UI hiding -- the page also checks this, but the
  // action must enforce it itself since Server Actions are callable
  // endpoints regardless of what the UI shows.
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can view owner login activity.');
  }

  // Session client, NOT adminClient(). commissioner_owner_activity() is
  // SECURITY DEFINER and gates itself on require_commissioner(), which reads
  // auth.uid(). Through the service-role client auth.uid() is NULL and the
  // function would correctly refuse. The service-role client would also
  // bypass RLS, which is exactly what must not happen while a tier is open.
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
