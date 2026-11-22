'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * CRUMB PORTAL -- October 18, 2026 (UI test batch 2).
 *
 * Lewis: the breadcrumb trail goes between the top banner and the EDFL
 * title. The app bar and the title are drawn by components/AppBar.js in the
 * root layout; the trail is drawn by the page, further down. This moves the
 * page's trail up into the slot AppBar leaves for it, #edfl-crumbtarget.
 *
 * HOW. Nothing renders on the server or on the first client pass, so
 * hydration matches. After the page mounts, the effect finds the slot and
 * the trail is portalled into it. The slot already shows a plain "Home"
 * link (AppBar), and kit.css hides that link once the target is not empty,
 * so the row's height never changes and nothing below it jumps.
 *
 * NO SLOT (a page drawn without the app bar): the trail renders where the
 * page put it, as it did before this file existed.
 *
 * It reads nothing. Every label still comes from the calling page
 * (components/Breadcrumbs.js, rule 1).
 */
export default function CrumbPortal(props) {
  const [target, setTarget] = useState(null);

  useEffect(function () {
    setTarget(document.getElementById('edfl-crumbtarget') || 'inline');
  }, []);

  if (target === null) return null;
  if (target === 'inline') return props.children;
  return createPortal(props.children, target);
}
