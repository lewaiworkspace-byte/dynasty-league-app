/* eslint-disable no-restricted-globals */
/**
 * THE SERVICE WORKER. Phase 2F, September 19, 2026.
 *
 * THIS IS THE ONE FILE IN THE APP THAT CAN FAIL SILENTLY IN PRODUCTION AND
 * NEVER APPEAR IN A DEPLOY LOG. It runs in its own worker, outlives the page
 * that registered it, and keeps running after a bad deploy. There is no test
 * runner in this repository to catch it. Everything below is written for that
 * fact: the rules are narrow, the kill switch is at the top, and the default
 * for anything not named is "do nothing and let the network handle it."
 *
 * ================= RULE 1: IT NEVER CACHES A FIGURE =================
 *
 * Every number in this app is read live from Postgres, and a cached dollar
 * amount is a WRONG dollar amount -- an owner shown $39 of cap room he spent
 * an hour ago is the same failure as a stale reference document, in a new hat.
 * So:
 *   - no route HTML is ever cached (every route is dynamic anyway: the root
 *     layout sets revalidate = 0 and the AppBar reads cookies),
 *   - no /api response is ever cached,
 *   - no Supabase response is ever cached -- cross-origin is not touched at
 *     all,
 *   - a Server Action POST is never touched; this worker ignores every
 *     method but GET.
 *
 * What IS cached is the shell and nothing else: /_next/static/* (webpack
 * chunks, CSS and the self-hosted Oswald/Inter/Plex Mono files, every one of
 * them content-hashed by the build and therefore immutable), the icon set and
 * the offline card. A hashed filename cannot go stale -- a new build produces
 * a new name -- which is what makes cache-first safe for exactly this list and
 * unsafe for everything else.
 *
 * ================= RULE 2: THE KILL SWITCH =================
 *
 * Flip KILLED to true, push, and the next time any installed app is opened
 * this worker unregisters itself, deletes every cache it made and gets out of
 * the way. It does NOT need the owner to force-quit the app, uninstall it, or
 * do anything at all.
 *
 * That works because of two things that must stay true together:
 *   1. next.config.js sends this file with Cache-Control: no-cache, so the
 *      browser revalidates the worker script itself rather than serving a
 *      cached copy of its own kill switch, and
 *   2. the registrar passes updateViaCache: 'none' for the same reason.
 * Remove either and the kill switch can take up to 24 hours to land.
 *
 * ================= RULE 3: A NEW DEPLOY WINS IMMEDIATELY =================
 *
 * skipWaiting() on install and clients.claim() on activate. Without them a new
 * version sits in "waiting" until every tab of the old one is closed -- and an
 * installed phone app is never closed, it is backgrounded. That is the single
 * most common complaint about installed web apps ("it won't update") and the
 * two lines below are the whole of the prevention. The cost is that a shell
 * asset can change under a page that is already open; it is paid back the next
 * time the owner opens the app, and no figure is involved either way.
 */

var VERSION = 'edfl-sw-v1';

/* Set to true, push, done. See RULE 2 above. */
var KILLED = false;

var SHELL_CACHE = VERSION + '-shell';

/* Cache-first is only ever applied to these prefixes. Nothing else, ever. */
var SHELL_PREFIXES = ['/_next/static/', '/icons/'];

var OFFLINE_URL = '/offline.html';

function isShellPath(pathname) {
  if (pathname === '/favicon.ico') return true;
  for (var i = 0; i < SHELL_PREFIXES.length; i++) {
    if (pathname.indexOf(SHELL_PREFIXES[i]) === 0) return true;
  }
  return false;
}

self.addEventListener('install', function (event) {
  if (KILLED) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        // The offline card is the only thing precached. If it 404s the whole
        // install must not fail -- a missing fallback is a worse app, not a
        // broken one.
        return cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      })
      .catch(function () {})
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            // Drop every cache this app has ever made except the current
            // one. When KILLED, that includes the current one.
            if (KILLED || key !== SHELL_CACHE) return caches.delete(key);
            return null;
          })
        );
      })
      .then(function () {
        if (KILLED && self.registration && self.registration.unregister) {
          return self.registration.unregister();
        }
        return null;
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  if (KILLED) return;

  var request = event.request;

  // Anything that is not a plain same-origin GET is none of this worker's
  // business: Server Action POSTs, Supabase calls, the Sleeper CDN's player
  // headshots. Returning without calling respondWith() hands the request back
  // to the browser untouched, which is the correct default for everything
  // this file does not explicitly name.
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 1. THE SHELL. Content-hashed and immutable -- cache first, and this is the
  //    whole of the speed the install is for.
  if (isShellPath(url.pathname)) {
    event.respondWith(
      caches.match(request).then(function (hit) {
        if (hit) return hit;
        return fetch(request).then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var copy = response.clone();
            caches.open(SHELL_CACHE).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 2. A PAGE. Network only -- never cached, never served from cache (RULE 1).
  //    If the network is gone, the offline card, which carries no figures.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(OFFLINE_URL).then(function (hit) {
          return (
            hit ||
            new Response('Offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        });
      })
    );
    return;
  }

  // 3. EVERYTHING ELSE. Untouched.
});
