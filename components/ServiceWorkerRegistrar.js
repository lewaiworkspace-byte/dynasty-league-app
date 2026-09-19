'use client';

import { useEffect } from 'react';

/**
 * REGISTERS public/sw.js. Phase 2F, September 19, 2026.
 *
 * Renders nothing. It is a component only because the root layout is a Server
 * Component and cannot run browser code itself.
 *
 * PRODUCTION ONLY, and that is not caution for its own sake. In `next dev` the
 * chunk filenames under /_next/static are NOT content-hashed the way a build's
 * are, so a cache-first worker would serve yesterday's chunk against today's
 * HTML and produce hydration errors that look like application bugs and are
 * not. There is no reason to run it there.
 *
 * updateViaCache: 'none' IS LOAD-BEARING. It tells the browser never to serve
 * sw.js itself from the HTTP cache. Together with the no-cache header in
 * next.config.js it is what makes the kill switch inside sw.js land on the
 * next app open rather than up to 24 hours later. Do not remove either half.
 *
 * WHY 'load' AND NOT IMMEDIATELY. Registration competes with the page's own
 * requests for bandwidth. Waiting for load costs nothing on a second visit
 * (the worker is already installed) and keeps the first paint clean on a
 * phone, which is where this whole phase is aimed.
 *
 * FAILURE IS SILENT AND THAT IS CORRECT. An unregistered worker means no
 * offline card and a slower cold start. It does not mean a broken app -- every
 * page still renders from the network exactly as it does in a browser today.
 * Nothing here may ever throw into the page.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {});
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
    return undefined;
  }, []);

  return null;
}
