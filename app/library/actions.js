'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { findDoc } from '../../lib/library';

/**
 * LIBRARY FEEDBACK -- Server Actions. September 29, 2026.
 *
 * Three writes, each a thin call to one database function:
 *   library_feedback_submit    any owner, on any of the three documents
 *   library_feedback_withdraw  the author, while the item is still open
 *   library_feedback_respond   commissioner or co-commissioner
 *                              (require_commissioner_or_co() in the function)
 *
 * The DATABASE is the gate for all three. These actions check the session so
 * a signed-out caller gets a sentence instead of a Postgres error, and they
 * RETURN refusals rather than throwing them (CLAUDE.md ground rule 10): a
 * production build masks a thrown message, and the database's refusals are
 * written to be read by an owner.
 *
 * Visibility is a commissioner ruling (Sept 29 2026): every signed-in owner
 * sees every item. RLS on library_feedback enforces it, not this file.
 */

async function signedIn() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refusal(error, fallback) {
  const msg = error && error.message ? String(error.message) : '';
  return { ok: false, message: msg || fallback };
}

export async function submitLibraryFeedback(input) {
  try {
    const { supabase, user } = await signedIn();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again to leave feedback.' };

    const docSlug = input && input.docSlug;
    if (!findDoc(docSlug)) return { ok: false, message: 'Unknown document.' };

    const body = String((input && input.body) || '').trim();
    if (!body) return { ok: false, message: 'Write something before sending.' };
    if (body.length > 2000) return { ok: false, message: 'Feedback is limited to 2,000 characters.' };

    const sectionId = input && input.sectionId ? String(input.sectionId) : null;

    const { error } = await supabase.rpc('library_feedback_submit', {
      p_doc_slug: docSlug,
      p_doc_version: input && input.docVersion ? String(input.docVersion) : null,
      p_section_id: sectionId,
      p_section_label: sectionId && input.sectionLabel ? String(input.sectionLabel) : null,
      p_body: body,
    });
    if (error) return refusal(error, 'Your feedback could not be saved.');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'Your feedback could not be sent. Check your connection and try again.' };
  }
}

export async function withdrawLibraryFeedback(feedbackId) {
  try {
    const { supabase, user } = await signedIn();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };
    const { error } = await supabase.rpc('library_feedback_withdraw', { p_feedback_id: feedbackId });
    if (error) return refusal(error, 'That feedback could not be withdrawn.');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'The request did not go through. Check your connection and try again.' };
  }
}

export async function respondLibraryFeedback(feedbackId, response, resolve) {
  try {
    const { supabase, user } = await signedIn();
    if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };
    const text = String(response || '').trim();
    if (text.length > 2000) return { ok: false, message: 'A reply is limited to 2,000 characters.' };
    const { error } = await supabase.rpc('library_feedback_respond', {
      p_feedback_id: feedbackId,
      p_response: text || null,
      p_resolve: Boolean(resolve),
    });
    if (error) return refusal(error, 'The reply could not be saved.');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'The request did not go through. Check your connection and try again.' };
  }
}
