'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * THE INSTALL PROMPT. Phase 2F, September 19, 2026.
 * Commissioner ruling M-1: the want is the app on an owner's phone, installed
 * as simply as possible. This component is where nearly all of that work is.
 *
 * TWO PLATFORMS, AND THEY ARE NOT SYMMETRICAL.
 *
 *   Android: Chrome fires beforeinstallprompt. We swallow Chrome's own bar and
 *   show one button. Tapping it opens the native install sheet. Two taps, no
 *   instructions.
 *
 *   iOS: Apple provides NO install prompt and NO API to trigger one. This is
 *   the single unavoidable friction in the whole plan and nothing removes it
 *   -- not Capacitor, not a store binary, nothing short of the $99/yr path
 *   that ruling M-1 closed. What we can do is make the three taps unmissable,
 *   with the Share glyph drawn inline so it matches the button the owner is
 *   looking at.
 *
 * WHEN IT APPEARS, and each of these is deliberate:
 *
 *   - NEVER when already installed. display-mode: standalone covers Android
 *     and modern iOS; navigator.standalone is the old iOS flag and is still
 *     the reliable one there. Checking both is belt and braces.
 *   - NEVER on /login, /install or /auth/*. An install prompt shown to someone
 *     who has not yet got into the app is noise, and on /install it would be a
 *     strip pointing at a page that already says the same thing.
 *   - NEVER on a first visit. Because of R-7 every page but /login requires a
 *     session, so being on any other route already means the owner has signed
 *     in successfully -- "second visit OR after sign-in" collapses into one
 *     test, and the second visit is the one that has to be counted.
 *   - NEVER again once dismissed. The X writes a flag and it is honoured for
 *     good. This is ten people, not an acquisition funnel.
 *   - NEVER on iOS Chrome, Firefox or Edge. None of them can add to the home
 *     screen, so telling their users to press Share would be a lie.
 *
 * STORAGE. Three keys, all localStorage except the session guard, all wrapped
 * in try/catch because Safari private browsing throws on write rather than
 * failing quietly:
 *   edfl-install-dismissed   '1' once the owner closes it
 *   edfl-install-visits      how many browser sessions have reached a real page
 *   edfl-install-counted     sessionStorage, so one visit counts once
 *
 * There is no analytics here and there should not be. Whether owners installed
 * is answered by asking them in Discord.
 */

const K_DISMISSED = 'edfl-install-dismissed';
const K_VISITS = 'edfl-install-visits';
const K_COUNTED = 'edfl-install-counted';

function readNumber(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const n = parseInt(raw, 10);
    return isNaN(n) ? 0 : n;
  } catch (e) {
    return 0;
  }
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState(null); // null | 'android' | 'ios'
  const [deferred, setDeferred] = useState(null);

  const suppressedRoute =
    !pathname ||
    pathname === '/login' ||
    pathname === '/install' ||
    pathname.indexOf('/auth') === 0;

  useEffect(() => {
    if (suppressedRoute) return undefined;
    if (typeof window === 'undefined') return undefined;

    // Already installed? Then there is nothing to offer, on either platform.
    let standalone = false;
    try {
      standalone =
        (window.matchMedia &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true;
    } catch (e) {
      standalone = false;
    }
    if (standalone) return undefined;

    try {
      if (window.localStorage.getItem(K_DISMISSED) === '1') return undefined;
    } catch (e) {
      /* storage unavailable -- fall through and behave as not dismissed */
    }

    // Count this browser session once.
    let visits = readNumber(K_VISITS);
    try {
      if (window.sessionStorage.getItem(K_COUNTED) !== '1') {
        visits = visits + 1;
        window.localStorage.setItem(K_VISITS, String(visits));
        window.sessionStorage.setItem(K_COUNTED, '1');
      }
    } catch (e) {
      /* private mode: visits stays where it was, and the strip stays away */
    }

    const ua = window.navigator.userAgent || '';
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports itself as a Mac; the touch point count is the
      // standard way to tell an iPad from a laptop.
      (ua.indexOf('Macintosh') > -1 && navigator.maxTouchPoints > 1);
    const iosOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

    const onBeforeInstall = (e) => {
      // Suppress Chrome's own bar; we show one button instead.
      e.preventDefault();
      setDeferred(e);
      if (visits >= 2) setMode('android');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isIOS && !iosOtherBrowser && visits >= 2) {
      setMode('ios');
    }

    const onInstalled = () => {
      setMode(null);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [suppressedRoute, pathname]);

  function dismiss() {
    try {
      window.localStorage.setItem(K_DISMISSED, '1');
    } catch (e) {
      /* nothing to do; the strip closes for this session either way */
    }
    setMode(null);
  }

  async function install() {
    if (!deferred) return;
    try {
      deferred.prompt();
      await deferred.userChoice;
    } catch (e) {
      /* the owner closed the sheet; nothing to report */
    }
    setDeferred(null);
    setMode(null);
  }

  if (suppressedRoute || !mode) return null;

  return (
    <div className="edfl-install" role="region" aria-label="Install EDFL">
      <div className="edfl-install-inner">
        <img
          className="edfl-install-mark"
          src="/icons/icon-192.png"
          alt=""
          width="44"
          height="44"
        />

        {mode === 'android' ? (
          <>
            <div className="edfl-install-text">
              <strong>Put EDFL on your home screen</strong>
              <span>Opens full screen, stays signed in.</span>
            </div>
            <button
              type="button"
              className="edfl-install-go"
              onClick={install}
            >
              Install
            </button>
          </>
        ) : (
          <div className="edfl-install-text">
            <strong>Put EDFL on your home screen</strong>
            <span>
              Tap <ShareGlyph /> below, then <b>Add to Home Screen</b>, then{' '}
              <b>Add</b>.
            </span>
          </div>
        )}

        <button
          type="button"
          className="edfl-install-x"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      {mode === 'ios' ? <div className="edfl-install-arrow" aria-hidden="true" /> : null}
    </div>
  );
}

/**
 * iOS's Share button, drawn rather than described. A sentence that says "tap
 * the share button" asks the owner to work out which of six glyphs that is;
 * this is the glyph, inline in the sentence, at the size of the surrounding
 * text.
 */
function ShareGlyph() {
  return (
    <svg
      className="edfl-install-share"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 1.8 L10 12.4 M10 1.8 L6.6 5.2 M10 1.8 L13.4 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 7.6 H4.1 A1.6 1.6 0 0 0 2.5 9.2 V16.4 A1.6 1.6 0 0 0 4.1 18 H15.9 A1.6 1.6 0 0 0 17.5 16.4 V9.2 A1.6 1.6 0 0 0 15.9 7.6 H14.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
