'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// ROBO GOODELL'S OFFICER ACTIONS. Spec: EDFL_RoboGoodell_Spec v1.0.
//
// draftMemoAction     -- goodell_memo_submit(body, delay)
// withdrawMemoAction  -- goodell_memo_withdraw(memo_id)
// setWireKindAction   -- goodell_kind_set(kind, enabled)
//
// ALL THREE USE THE SESSION CLIENT. Each database function gates on
// is_commissioner_or_co(auth.uid()), which is null through the service client
// and would refuse every call. The check below is the same one the portal page
// makes; it is there so the refusal is a sentence rather than a redirect.
//
// THE MASKING RULE. goodell_memo_submit() returns { ok, message } rather than
// throwing, because every one of its refusals is a thing the commissioner needs
// to read in words -- too long, not an officer, a delay that is not a delay.
// The action passes that sentence through unchanged. It never composes its own
// wording for a rule the database owns, and it never turns ok:false into a
// thrown error, which would surface as a stack trace on the page.
//
// NOTHING HERE POSTS TO DISCORD. The memo is queued; goodell_dispatch() on the
// five-minute cron is the only thing that ever calls goodell_say(). That is why
// a withdrawn memo is genuinely never said, and why "pull it" stops working the
// moment the sweep has run.

async function officer() {
  const me = await getCurrentTeamOwner();
  if (!me || !isCommissionerOrCo(me)) return null;
  return me;
}

function refusal() {
  return { status: 'error', message: COMMISSIONER_OR_CO_REFUSAL };
}

export async function draftMemoAction(prevState, formData) {
  const me = await officer();
  if (!me) return refusal();

  const body = String(formData.get('body') || '');
  const delay = String(formData.get('delay') || 'now');

  if (!body.trim()) {
    return { status: 'error', message: 'Write something first. Robo will not improvise.' };
  }

  const authed = await createSupabaseServerClient();
  const { data, error } = await authed.rpc('goodell_memo_submit', {
    p_body: body,
    p_delay: delay,
  });

  if (error) return { status: 'error', message: error.message };
  if (!data || data.ok !== true) {
    return { status: 'error', message: data && data.message ? data.message : 'The memo was refused.' };
  }

  revalidatePath('/admin/league-office');
  return { status: 'done', message: data.message };
}

export async function withdrawMemoAction(memoId) {
  const me = await officer();
  if (!me) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };

  const authed = await createSupabaseServerClient();
  const { data, error } = await authed.rpc('goodell_memo_withdraw', { p_memo_id: memoId });

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/league-office');
  return {
    ok: Boolean(data && data.ok),
    message: data && data.message ? data.message : 'Pulled.',
  };
}

export async function setWireKindAction(kind, enabled) {
  const me = await officer();
  if (!me) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };

  const authed = await createSupabaseServerClient();
  const { data, error } = await authed.rpc('goodell_kind_set', {
    p_kind: kind,
    p_enabled: enabled,
  });

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/league-office');
  return {
    ok: Boolean(data && data.ok),
    message: data && data.message ? data.message : 'Saved.',
  };
}
