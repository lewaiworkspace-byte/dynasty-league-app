import { cache } from 'react';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from './supabaseServerClient';
import { AUTH_UID_HEADER, NO_USER } from './authHeader';

/**
 * WHO IS SIGNED IN, ASKED ONCE PER REQUEST -- November 22, 2026 (UI test batch 40).
 *
 * Before this file, one page load asked Supabase Auth "who is this?" up to four times: once in
 * middleware.js, once in the app bar, once in getCurrentTeamOwner() and once more in
 * getCurrentViewer(). Each is a network round trip to the Auth server (measured: about 0.9 s on
 * average on the test site on November 22, under load), and each one queued behind the others.
 *
 * Now middleware.js asks (auth.getUser(), the call that verifies the token with the Auth server
 * and refreshes the session) and passes the answer on in one request header, AUTH_UID_HEADER
 * (lib/authHeader.js):
 * the user's id, or NO_USER when nobody is signed in. Server components, Server Actions and
 * route handlers read it here and make no Auth call of their own.
 *
 * THE HEADER CANNOT BE FORGED. middleware.js deletes any incoming copy of it on every request it
 * handles and writes its own, and its matcher covers every route that renders or acts. A header
 * that is not a UUID (or NO_USER) is ignored. If the header is absent -- a path the middleware
 * does not run on -- this falls back to auth.getUser(), exactly as before.
 *
 * WHAT IT RETURNS: { id } for a signed-in user, or null. Only the id: no caller reads anything
 * else from the Auth user (checked November 22, 2026). The DATABASE never trusts this value:
 * every read and write still carries the session's own token, which PostgREST verifies, and
 * auth.uid() inside a function is that token's subject, not this header.
 *
 * cache() makes every call in one render share one answer. Outside a render (where React's
 * cache is a pass-through) it is still one header read.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const memo = typeof cache === 'function' ? cache : (fn) => fn;

export const getAuthUser = memo(async function getAuthUser() {
  let fromMiddleware = null;
  try {
    fromMiddleware = headers().get(AUTH_UID_HEADER);
  } catch (e) {
    fromMiddleware = null;
  }

  if (fromMiddleware === NO_USER) return null;
  if (fromMiddleware && UUID.test(fromMiddleware)) return { id: fromMiddleware };

  // No usable header: ask Auth, as every caller did before batch 40.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
});
