/** @type {import('next').NextConfig} */

/**
 * HEADERS FOR THE SERVICE WORKER. Phase 2F, September 19, 2026.
 *
 * This file was empty until today and the temptation is to read four lines of
 * config as optional. They are not: they are half of the service worker's kill
 * switch, and the half that is invisible.
 *
 * Cache-Control: no-cache
 *   A service worker is the one script a browser will happily run from its own
 *   HTTP cache for up to 24 hours. That means a cached copy of sw.js can keep
 *   running AFTER a deploy that was meant to replace or disable it -- so the
 *   kill switch inside that file would not be read until the cache expired.
 *   'no-cache' does not mean "do not store"; it means "revalidate before
 *   using", which is exactly right here. The other half is
 *   updateViaCache: 'none' in components/ServiceWorkerRegistrar.js. REMOVE
 *   EITHER AND THE KILL SWITCH CAN TAKE A DAY TO LAND.
 *
 * Service-Worker-Allowed: /
 *   Belt and braces. sw.js is served from /public so its default scope is
 *   already '/'. If it ever moves into a subdirectory this header is what lets
 *   it keep controlling the whole app instead of quietly controlling only its
 *   own folder -- a failure that looks like "the offline page works on some
 *   pages".
 *
 * NOTHING ELSE IS CONFIGURED HERE ON PURPOSE (except the Library's file
 * tracing entry below, September 29, 2026 -- see its own comment). In particular there is no
 * output: 'export'. The app is server-rendered behind a session gate and every
 * page is dynamic; a static export would break R-7, the Server Actions and
 * every read in the app. An installed phone app does not need one and never
 * did -- see the Mobile Delivery Brief, which closed that path.
 */
const nextConfig = {
  // THE LEAGUE LIBRARY, September 29, 2026. lib/library.js reads the three
  // governing documents and the How-To screenshots from content/library/ with
  // fs at request time. Vercel ships a file to a serverless function only if
  // the build's tracer sees it used, and a path built at runtime is not
  // always seen -- so it is named here for every /library route. Remove this
  // and the Library can deploy green and answer every request with ENOENT.
  experimental: {
    outputFileTracingIncludes: {
      '/library': ['./content/library/**/*'],
      '/library/[doc]': ['./content/library/**/*'],
      '/library/[doc]/download/[format]': ['./content/library/**/*'],
      '/library/figures/[name]': ['./content/library/**/*'],
    },
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
