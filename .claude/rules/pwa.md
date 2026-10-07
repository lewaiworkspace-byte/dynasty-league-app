---
paths:
  - "public/**"
  - "app/manifest.js"
  - "app/install/**"
  - "app/install.css"
  - "app/layout.js"
  - "components/ServiceWorkerRegistrar.js"
  - "components/InstallPrompt.js"
  - "next.config.js"
  - "middleware.js"
---

# The installed app and the service worker

The phone install is the same app, and the worker never caches a figure.

### The installed app is the same app, and `sw.js` must never cache a figure

The app is installable on a phone home screen (phase 2F). **It creates no second version:**
one repo, one deploy, one commit SHA. `app/manifest.js`, `public/sw.js`, `public/offline.html`,
the icon set and `app/install/page.js` are metadata and a how-to page, not a second build.
**There is no `output: 'export'` and there must never be** — every page is dynamic behind R-7.

- **The allowlist grew by four entries and that was not optional.** `/install` joined the
  prefixes; `/manifest.webmanifest`, `/sw.js` and `/offline.html` joined a new exact-match
  `PUBLIC_FILES` list. **The manifest and the worker are fetched with no cookies**, so gated
  they answer 307, the browser gets HTML where it expects JSON, and **no install prompt
  appears on any device with nothing logging an error.** The icon files were already fine —
  the matcher excludes their extensions.
- **`app/install/page.js` reads NOTHING** — no database, no session, no league state. That is
  the whole reason it is safe to serve signed-out. **If it ever reads something, the allowlist
  entry becomes a hole.**
- **`public/sw.js` caches the shell and only the shell** — `/_next/static/*`, `/icons/*`,
  `favicon.ico`, the offline card. All content-hashed or static. **No route HTML, no `/api`
  response, nothing cross-origin, nothing but GET.** A cached dollar amount is a wrong dollar
  amount. **Do not add a route to that list to make the app feel faster offline.**
- **The offline card's image is precached BY NAME in the install handler, and that is not
  redundant.** `/icons/` is cache-first eligible, but that rule only fills the cache **lazily,
  from a page request** — and no page in the app asks for `icon-192`. The browser fetches it
  for the manifest and the home screen **outside the worker's fetch handler**, so the lazy rule
  never sees it and the cache never holds it. Phase 2F shipped without it and the offline card
  drew a broken image on a real iPhone, every time. **Do not simplify the install handler back
  to the card alone** on the grounds that `/icons/` is already covered — it is not, for this
  one file. Keep the two `cache.add` calls **separate**: `addAll()` is all-or-nothing, so a 404
  on the icon would cost the card as well.
- **`public/offline.html` carries no figure, no name and no date**, deliberately. Do not add a
  cached summary to it.
- **The kill switch is two halves and both are load-bearing:** `KILLED` in `sw.js`, plus
  `Cache-Control: no-cache` on `/sw.js` in `next.config.js` **and** `updateViaCache: 'none'`
  in `components/ServiceWorkerRegistrar.js`. Remove either half and flipping `KILLED` can take
  a day to reach a phone. `skipWaiting()`/`clients.claim()` are why a deploy wins on next open
  rather than after a force-quit.
- **`viewport-fit=cover` in `app/layout.js` is a bug fix, not decoration.** `kit.css` has paid
  `env(safe-area-inset-*)` on the app bar since phase 1 and it was returning **zero on every
  iPhone** because nothing asked for the full screen. It, `statusBarStyle: 'black-translucent'`
  and the bar's existing padding are **one decision** — change one and check the other two.
- **`app/install.css` is a fourth stylesheet and a deliberate exception** to "new component CSS
  is appended to `kit.css`". This phase touches no existing page's styling and had no reason to
  put a 45KB stylesheet through another zip round-trip. **The next component block still goes
  in `kit.css`.**
