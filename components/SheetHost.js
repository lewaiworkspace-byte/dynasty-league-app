'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * THE POP-UP SHEET -- November 11, 2026 (UI test batch 8).
 *
 * Lewis: "I want the app to do pop up screens like Sleeper, especially for the
 * player cards where a second screen comes up that you can manipulate and then
 * swipe it down to exit." His pick for the first build: player cards,
 * matchups, team pages and trade proposals.
 *
 * WHAT IT DOES. A tap on a link to one of those four pages no longer leaves
 * the page you are on. The page slides up over it in a sheet, works exactly
 * as it does on its own (every button, form and Server Action), and goes away
 * with a swipe down, the X, the phone's back gesture, Esc or a tap on the dim
 * strip above it. The page behind is untouched, so you never lose your place
 * -- the purpose of the August 27 "opens in a new window" decision, which
 * this replaces.
 *
 * HOW: AN IFRAME, ON PURPOSE. The sheet shows the real page in a same-origin
 * <iframe name="edfl-sheet">. Next's intercepting routes were the other way
 * and were rejected: they re-host each page inside the layout of the page
 * behind, so its breadcrumb portal, its Server Actions' redirects and its
 * router.refresh() would all act on the wrong page, and /trades/new would be
 * caught by /trades/[tradeId]. In a frame each page is exactly the page it is
 * at its own URL, so nothing on those four pages had to change. Inside the
 * frame the app bar, office bar, test banner and install prompt are hidden
 * (html[data-in-sheet], set before paint by app/layout.js and again here; the
 * rules are the November 11 block of app/kit.css).
 *
 * WHICH LINKS. Same-origin <a> clicks, left button, no modifier key, no
 * target other than _self, no download attribute, to:
 *   /player/<id>   /matchup/<week>/<id>   /team/<id>   /trades/<id> (not "new")
 * A link to the page you are already on is left alone (Team HQ's own view
 * links, the card's jump buttons). In the top window, links inside the app
 * bar, the breadcrumb slot, the office bar, any <nav>, or anything marked
 * data-sheet="off" are left alone too: those are navigation, and Home must go
 * home. Ctrl/Cmd-click and middle-click still open a new tab.
 *
 * INSIDE A SHEET a tap on another of the four opens it in the same sheet, and
 * back returns to the one before. Any other link in the app closes the sheet
 * and goes there in the main window ("Full contract details", Restructure).
 * /api/ links and same-page links stay in the frame.
 *
 * HISTORY. Each sheet pushes one history entry with the SAME url, so the
 * address never changes underneath the page behind (its view row and
 * crumbs read the url). The state is spread from history.state, which keeps
 * Next's __NA marker -- without it Next reloads the page on back. A page in
 * the frame can add entries of its own (its #hash jump buttons do), so back
 * undoes those first, as a browser would, and closing steps back one entry
 * at a time until the page behind's entry is current.
 *
 * THE MINI PLAYER CARD (UI test batch 10, November 11, 2026). Lewis: the Mini
 * Player Card opens "anywhere" a player is tapped. So a tap on a plain
 * /player/<id> link (no ?query, no #hash) opens /player/<id>/mini in the
 * sheet, and the card's own "Open the full player card" link (marked
 * data-full-card) opens the full card in the same sheet, one step further.
 * Any other /player/<id>?... link (the card's own jump links) is the full
 * card, as before. /player/<id>/injury is the injury report (the white pill on
 * a roster row). /players/claim/<placement> is the Players screen's claim
 * sheet (UI test batch 11); closing it refreshes the list behind it. The
 * Roster tab's laptop panel is the same page in an iframe
 * named edfl-panel: it is marked in-sheet like the sheet's frame, and its links
 * open the sheet over the page.
 *
 * WHAT IT DECIDES: NOTHING. It reads nothing and writes nothing. Every gate
 * stays on the page in the frame. Closing a sheet that showed a team, a trade
 * or a matchup refreshes the page behind (router.refresh), because a move or
 * an acceptance made in the sheet may have changed what it shows; a stack of
 * player cards only does not.
 */

export const SHEET_FRAME_NAME = 'edfl-sheet';

const LABELS = {
  player: 'Player card',
  mini: 'Mini Player Card',
  injury: 'Injury report',
  matchup: 'Matchup',
  team: 'Team',
  trade: 'Trade',
  claim: 'Waiver claim',
};

// Which of the four sheet pages a URL is, or null. Exported for the fixture.
export function sheetKindOf(url) {
  const p = url.pathname;
  if (/^\/player\/[^/]+\/?$/.test(p)) return 'player';
  if (/^\/player\/[^/]+\/mini\/?$/.test(p)) return 'mini';
  if (/^\/player\/[^/]+\/injury\/?$/.test(p)) return 'injury';
  if (/^\/matchup\/[^/]+\/[^/]+\/?$/.test(p)) return 'matchup';
  if (/^\/team\/[^/]+\/?$/.test(p)) return 'team';
  // The Players screen's claim sheet (UI test batch 11, November 11, 2026).
  if (/^\/players\/claim\/[^/]+\/?$/.test(p)) return 'claim';
  const t = p.match(/^\/trades\/([^/]+)\/?$/);
  if (t && t[1] !== 'new') return 'trade';
  return null;
}

export const PANEL_FRAME_NAME = 'edfl-panel';

function inSheetFrame() {
  try {
    return (window.name === SHEET_FRAME_NAME || window.name === PANEL_FRAME_NAME) && window.parent !== window;
  } catch (e) {
    return false;
  }
}

// A plain link to a player's card opens his Mini Player Card (batch 10), unless
// it is marked data-full-card or carries a query or hash of the full card's.
function miniRewrite(url, a) {
  if (sheetKindOf(url) !== 'player') return url;
  if (a && a.hasAttribute('data-full-card')) return url;
  if (url.search || url.hash) return url;
  const m = new URL(url.href);
  m.pathname = url.pathname.replace(/\/?$/, '') + '/mini';
  return m;
}

// The link a click should act on, as a URL, or null to leave the click alone.
function linkOf(e, inFrame) {
  if (e.defaultPrevented || e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a) return null;
  const target = a.getAttribute('target');
  if (target && target !== '_self') return null;
  if (a.hasAttribute('download')) return null;
  if (a.closest('[data-sheet="off"]')) return null;
  if (!inFrame && a.closest('.edfl-topbar, .edfl-crumbslot, .edfl-officebar, nav')) return null;
  let url;
  try {
    url = new URL(a.href, window.location.href);
  } catch (err) {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname) return null;
  if (url.pathname.indexOf('/api/') === 0) return null;
  const m = miniRewrite(url, a);
  if (m.pathname === window.location.pathname) return null;
  return m;
}

function hrefOf(url) {
  return url.pathname + url.search + url.hash;
}

// ---- inside the frame: hand links to the sheet, hide the chrome ----------

function useFrameSide(active) {
  useEffect(
    function () {
      if (!active) return undefined;
      const html = document.documentElement;
      html.setAttribute('data-in-sheet', '1');
      const origin = window.location.origin;

      function onClick(e) {
        const url = linkOf(e, true);
        if (!url) return;
        e.preventDefault();
        window.parent.postMessage(
          { edflSheet: sheetKindOf(url) ? 'open' : 'leave', href: hrefOf(url) },
          origin
        );
      }
      function onKey(e) {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if (document.querySelector('dialog[open], [role="dialog"]')) return;
        window.parent.postMessage({ edflSheet: 'close' }, origin);
      }
      document.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
      };
    },
    [active]
  );
}

// ---- the top window: the sheet itself --------------------------------------

export default function SheetHost() {
  const router = useRouter();
  const [frameSide, setFrameSide] = useState(false);
  const [sheet, setSheet] = useState(null); // { href, kind, depth } or null
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const stackRef = useRef([]); // hrefs, bottom first
  const openRef = useRef(false);
  const closingRef = useRef(false);
  const leaveRef = useRef(null); // href to go to once the sheet is closed
  const refreshRef = useRef(false);
  const returnFocusRef = useRef(null);
  const panelRef = useRef(null);
  const frameRef = useRef(null);
  const closeBtnRef = useRef(null);
  const dragRef = useRef(null);
  const fallbackRef = useRef(null);
  const stepsRef = useRef(0);

  useEffect(function () {
    setFrameSide(inSheetFrame());
  }, []);

  useFrameSide(frameSide);

  const reduceMotion = useCallback(function () {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }, []);

  const setPanelY = useCallback(function (y, animate) {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = animate ? 'transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    panel.style.transform = y ? 'translateY(' + y + ')' : '';
  }, []);

  // Unmount after the slide-down, then refresh or leave as owed.
  const finishClose = useCallback(
    function () {
      if (fallbackRef.current) {
        clearTimeout(fallbackRef.current);
        fallbackRef.current = null;
      }
      const leaveTo = leaveRef.current;
      const refresh = refreshRef.current;
      const done = function () {
        openRef.current = false;
        closingRef.current = false;
        stackRef.current = [];
        leaveRef.current = null;
        refreshRef.current = false;
        setSheet(null);
        setClosing(false);
        setLoading(false);
        document.documentElement.classList.remove('edfl-sheet-open');
        // Deferred a tick: this runs inside our popstate listener, which the
        // browser calls BEFORE Next's own (a child's effect registers first).
        // Next's listener then queues a back-button restore, and a restore
        // discards any navigation or refresh queued ahead of it.
        if (leaveTo) {
          setTimeout(function () {
            router.push(leaveTo);
          }, 0);
        } else {
          if (refresh) {
            setTimeout(function () {
              router.refresh();
            }, 0);
          }
          const back = returnFocusRef.current;
          if (back && back.focus) {
            try {
              back.focus({ preventScroll: true });
            } catch (e) {
              /* the link may be gone */
            }
          }
        }
      };
      if (leaveTo || reduceMotion()) {
        done();
        return;
      }
      setClosing(true);
      setPanelY('100%', true);
      setTimeout(done, 250);
    },
    [router, reduceMotion, setPanelY]
  );

  const show = useCallback(function (href) {
    const kind = sheetKindOf(new URL(href, window.location.href));
    if (kind && kind !== 'player' && kind !== 'injury') refreshRef.current = true;
    setLoading(true);
    setSheet({ href: href, kind: kind || 'player', depth: stackRef.current.length });
  }, []);

  const open = useCallback(
    function (href) {
      if (closingRef.current) return;
      stackRef.current = stackRef.current.concat([href]);
      const depth = stackRef.current.length;
      window.history.pushState(Object.assign({}, window.history.state, { edflSheetDepth: depth }), '');
      if (!openRef.current) {
        openRef.current = true;
        returnFocusRef.current = document.activeElement;
        document.documentElement.classList.add('edfl-sheet-open');
      }
      show(href);
    },
    [show]
  );

  // Every way out goes through history, so back and the X can never disagree.
  // It steps back ONE entry at a time until the page behind's own entry is
  // current. Not history.go(-n): a page in the frame adds entries of its own
  // (a jump button's #hash, a ?tab= link, a redirect), and the top window gets
  // no popstate for those, so a step that brings none is followed by another.
  const stepBack = useCallback(
    function () {
      stepsRef.current += 1;
      if (stepsRef.current > 40) {
        finishClose();
        return;
      }
      fallbackRef.current = setTimeout(stepBack, 160);
      window.history.back();
    },
    [finishClose]
  );

  const closeAll = useCallback(
    function () {
      if (!openRef.current || closingRef.current) return;
      closingRef.current = true;
      stepsRef.current = 0;
      stepBack();
    },
    [stepBack]
  );

  const leave = useCallback(
    function (href) {
      leaveRef.current = href;
      closeAll();
    },
    [closeAll]
  );

  // Back and forward.
  useEffect(
    function () {
      if (frameSide) return undefined;
      function onPop(e) {
        if (!openRef.current) return;
        const depth = (e.state && e.state.edflSheetDepth) || 0;
        if (depth <= 0) {
          closingRef.current = true;
          finishClose();
          return;
        }
        if (closingRef.current) {
          if (fallbackRef.current) clearTimeout(fallbackRef.current);
          stepBack();
          return;
        }
        // depth equal to the stack: the step was inside the frame (a #hash
        // or a ?tab= link), and the frame has already undone it.
        if (depth < stackRef.current.length) {
          stackRef.current = stackRef.current.slice(0, depth);
          show(stackRef.current[depth - 1]);
        }
      }
      window.addEventListener('popstate', onPop);
      return function () {
        window.removeEventListener('popstate', onPop);
      };
    },
    [frameSide, finishClose, show, stepBack]
  );

  // Links in the page, and messages from the frame.
  useEffect(
    function () {
      if (frameSide) return undefined;
      function onClick(e) {
        if (openRef.current) return;
        const url = linkOf(e, false);
        if (!url || !sheetKindOf(url)) return;
        e.preventDefault();
        open(hrefOf(url));
      }
      function onMessage(e) {
        if (e.origin !== window.location.origin) return;
        const frame = frameRef.current;
        let fromPanel = false;
        try {
          fromPanel = Boolean(e.source && e.source.name === PANEL_FRAME_NAME && e.source.parent === window);
        } catch (err) {
          fromPanel = false;
        }
        if (fromPanel) {
          const pd = e.data || {};
          if (pd.edflSheet === 'open' && typeof pd.href === 'string') open(pd.href);
          else if (pd.edflSheet === 'leave' && typeof pd.href === 'string') router.push(pd.href);
          return;
        }
        if (!frame || e.source !== frame.contentWindow) return;
        const d = e.data || {};
        if (d.edflSheet === 'open' && typeof d.href === 'string') open(d.href);
        else if (d.edflSheet === 'leave' && typeof d.href === 'string') leave(d.href);
        else if (d.edflSheet === 'close') closeAll();
      }
      function onKey(e) {
        if (e.key === 'Escape' && openRef.current) closeAll();
      }
      document.addEventListener('click', onClick);
      window.addEventListener('message', onMessage);
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('click', onClick);
        window.removeEventListener('message', onMessage);
        document.removeEventListener('keydown', onKey);
      };
    },
    [frameSide, open, leave, closeAll, router]
  );

  // ---- swipe down ----------------------------------------------------------

  const dragStart = useCallback(function (y) {
    dragRef.current = { y0: y, y: y, t: Date.now(), v: 0, on: false };
  }, []);

  const dragMove = useCallback(
    function (y) {
      const d = dragRef.current;
      if (!d) return false;
      const now = Date.now();
      const dt = Math.max(1, now - d.t);
      d.v = (y - d.y) / dt;
      d.y = y;
      d.t = now;
      const dy = y - d.y0;
      if (!d.on && dy > 6) d.on = true;
      if (d.on) setPanelY(Math.max(0, dy) + 'px', false);
      return d.on;
    },
    [setPanelY]
  );

  const dragEnd = useCallback(
    function () {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !d.on) return;
      const dy = d.y - d.y0;
      const panel = panelRef.current;
      const h = panel ? panel.getBoundingClientRect().height : 600;
      if (dy > Math.min(140, h * 0.25) || (d.v > 0.6 && dy > 24)) closeAll();
      else setPanelY('', true);
    },
    [closeAll, setPanelY]
  );

  // The grab bar: mouse, pen or finger.
  const onGrabDown = useCallback(
    function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        /* older browsers */
      }
      dragStart(e.screenY);
    },
    [dragStart]
  );
  const onGrabMove = useCallback(
    function (e) {
      if (dragRef.current) dragMove(e.screenY);
    },
    [dragMove]
  );

  // Inside the page: a finger pulling down while the page is at its top.
  // screenY, not clientY: the frame moves with the sheet under the finger.
  const wireFrame = useCallback(
    function () {
      setLoading(false);
      const frame = frameRef.current;
      let doc;
      try {
        doc = frame && frame.contentDocument;
      } catch (e) {
        doc = null;
      }
      if (!doc || doc.__edflSheetWired) return;
      doc.__edflSheetWired = true;
      let cand = null;
      doc.addEventListener(
        'touchstart',
        function (e) {
          cand = null;
          if (e.touches.length !== 1) return;
          const el = e.target;
          if (el && el.closest && el.closest('dialog, [role="dialog"], input, textarea, select')) return;
          const se = doc.scrollingElement || doc.documentElement;
          if (se.scrollTop > 0) return;
          const t = e.touches[0];
          cand = { x: t.screenX, y: t.screenY };
          dragStart(t.screenY);
        },
        { passive: true }
      );
      doc.addEventListener(
        'touchmove',
        function (e) {
          if (!cand || !dragRef.current) return;
          const t = e.touches[0];
          const dx = Math.abs(t.screenX - cand.x);
          const dy = t.screenY - cand.y;
          if (!dragRef.current.on && (dy < 0 || dx > Math.abs(dy))) {
            cand = null;
            dragRef.current = null;
            return;
          }
          if (dragMove(t.screenY)) e.preventDefault();
        },
        { passive: false }
      );
      const end = function () {
        if (!cand) return;
        cand = null;
        dragEnd();
      };
      doc.addEventListener('touchend', end, { passive: true });
      doc.addEventListener('touchcancel', end, { passive: true });
    },
    [dragStart, dragMove, dragEnd]
  );

  // Focus the X when a sheet opens, for keyboards and screen readers.
  useEffect(
    function () {
      if (sheet && sheet.depth === 1 && closeBtnRef.current) {
        try {
          closeBtnRef.current.focus({ preventScroll: true });
        } catch (e) {
          /* ignore */
        }
      }
    },
    [sheet]
  );

  if (frameSide || !sheet) return null;

  const label = LABELS[sheet.kind] || 'Details';

  return (
    <div className={'edfl-sheet' + (closing ? ' is-closing' : '')}>
      <div className="edfl-sheet-scrim" onClick={closeAll} aria-hidden="true" />
      <div
        className="edfl-sheet-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div
          className="edfl-sheet-grab"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={dragEnd}
          onPointerCancel={dragEnd}
          aria-hidden="true"
        >
          <span className="edfl-sheet-grabbar" />
        </div>
        <iframe
          key={sheet.href + '#' + sheet.depth}
          ref={frameRef}
          name={SHEET_FRAME_NAME}
          className={'edfl-sheet-frame' + (loading ? ' is-loading' : '')}
          src={sheet.href}
          title={label}
          onLoad={wireFrame}
        />
        {loading ? <span className="edfl-sheet-spinner" role="status" aria-label="Loading" /> : null}
        <button
          type="button"
          className="edfl-sheet-close"
          ref={closeBtnRef}
          onClick={closeAll}
          aria-label={'Close ' + label.toLowerCase()}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
