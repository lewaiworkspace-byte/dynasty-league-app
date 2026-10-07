'use client';

import { useState } from 'react';
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
// A FULL PAGE LOAD TO '/', the mirror of app/login/page.js (October 7, 2026,
// batch 3). This used to be router.refresh() then router.push('/'), and a soft
// navigation does not re-render the root layout, so the app bar could keep
// showing the signed-out team's name. window.location.assign('/') asks the
// server afresh with the now-empty cookie: the app bar re-renders, and '/'
// sends a signed-out reader to the login page instead of leaving them on the
// gated page they signed out from.
//
// The catch is not decoration. signOut() reaches the network, and a
// failed round trip must not leave the button stuck on "Signing out" with
// a cleared local session and no way forward. Whatever happened, we load
// '/' afresh; the server is the one that decides what the cookie is worth.

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);

    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Network failure on the way out. Fall through: the load below
      // re-reads the cookie either way and the corner will tell the truth.
    }

    window.location.assign('/');
  }

  return (
    <button type="button" className="theme-toggle" onClick={handleSignOut} disabled={busy}>
      {busy ? 'Signing out' : 'Sign Out'}
    </button>
  );
}
