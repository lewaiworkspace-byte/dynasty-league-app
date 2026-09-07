'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

// SIGN OUT. September 7, 2026 -- the app had no logout at all until now.
// Owners share screens and borrow browsers, and the session cookie is
// long-lived, so "log in as somebody else" meant clearing site data.
//
// Signs out through the BROWSER client (lib/supabaseClient.js), which is
// createBrowserClient from @supabase/ssr and therefore writes the same
// auth cookie the server reads. A signOut() through any other client
// would clear a session the server never sees.
//
// ORDER MATTERS, and it is the mirror of app/login/page.js. refresh()
// first, so the Server Components -- the app bar among them -- re-render
// against the now-empty cookie; push('/') second, so an owner who was
// standing on a gated page when they signed out lands somewhere public
// instead of watching that page's own redirect bounce them to /login.
//
// The catch is not decoration. signOut() reaches the network, and a
// failed round trip must not leave the button stuck on "Signing out" with
// a cleared local session and no way forward. Whatever happened, we
// refresh and go home; the server is the one that decides what the cookie
// is worth.

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);

    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Network failure on the way out. Fall through: the refresh below
      // re-reads the cookie either way and the corner will tell the truth.
    }

    router.refresh();
    router.push('/');
  }

  return (
    <button type="button" className="theme-toggle" onClick={handleSignOut} disabled={busy}>
      {busy ? 'Signing out' : 'Sign Out'}
    </button>
  );
}
