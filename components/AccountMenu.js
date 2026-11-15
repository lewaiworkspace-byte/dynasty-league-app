'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import TeamDisc from './TeamDisc';

// THE TEAM LOGO IN THE TOP BAR, AND SIGNING OUT -- UI test batch 17,
// November 15, 2026. Lewis on the Players canvas ("PICK ONE" board, choice 1):
// "Remove the Sign out ... If an owner wants to sign out, they can click on
// their logo and it will create a popup box asking if they want to sign out"
// (approved as drawn: "This is good").
//
// So the owner's team logo sits at the right of the black bar, and tapping it
// opens a small box: the logo, "Sign out of EDFL?", Cancel and Sign out. The
// logo no longer opens Team HQ; the Roster button and Home still do.
//
// Signing out is SignOutButton.js's path exactly: signOut() through the
// BROWSER client (it writes the cookie the server reads), then a full page
// load to '/', whatever happened, so the server decides what the cookie is
// worth. SignOutButton.js stays for a signed-in login with no team (an
// observer or an unlinked email), who has no logo to tap.

export default function AccountMenu({ abbrev, teamName }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(
    function () {
      if (!open) return undefined;
      if (cancelRef.current) cancelRef.current.focus();
      function onKey(e) {
        if (e.key === 'Escape') close();
      }
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('keydown', onKey);
      };
    },
    [open]
  );

  function close() {
    setOpen(false);
    if (openerRef.current) openerRef.current.focus();
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // A network failure on the way out: the full load below re-reads the cookie.
    }
    window.location.assign('/');
  }

  const label = (teamName || abbrev || 'Your team') + ', sign out';

  return (
    <>
      <button
        type="button"
        ref={openerRef}
        className="edfl-acctbtn"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        title={teamName || undefined}
        onClick={function () {
          setOpen(true);
        }}
      >
        <TeamDisc className="edfl-acctdisc" abbrev={abbrev} fallback={teamName} />
      </button>

      {open ? (
        <>
          <div className="edfl-acct-scrim" onClick={close} aria-hidden="true" />
          <div className="edfl-acct-box" role="dialog" aria-modal="true" aria-labelledby="edfl-acct-title">
            <div className="edfl-acct-head">
              <TeamDisc className="edfl-acctdisc is-small" abbrev={abbrev} fallback={teamName} />
              <b id="edfl-acct-title">Sign out of EDFL?</b>
            </div>
            <div className="edfl-acct-btns">
              <button type="button" ref={cancelRef} className="edfl-acct-cancel" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="edfl-acct-go" onClick={signOut} disabled={busy}>
                {busy ? 'Signing out' : 'Sign out'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
