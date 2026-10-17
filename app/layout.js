import { Poppins } from 'next/font/google';
import { supabase } from '../lib/supabaseClient';
import AppBar from '../components/AppBar';
import OfficeBar from '../components/OfficeBar';
import InstallPrompt from '../components/InstallPrompt';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';
import TestSiteBanner from '../components/TestSiteBanner';
import './globals.css';
import './tokens.css';
import './kit.css';
import './install.css';

export const revalidate = 0;

// OCTOBER 17, 2026 -- DESIGN SYSTEM v2 (UI test batch 1). One typeface,
// Poppins, for everything: the display, body and mono variables that
// globals.css and kit.css read all point at it, so no stylesheet had to be
// edited. Figures stay tabular through font-variant-numeric at the foot of
// kit.css. Oswald, Inter and IBM Plex Mono are gone from the build.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});

// THEME -- OCTOBER 17, 2026 (UI test batch 1): FOLLOWS THE PHONE.
//
// Lewis, October 10 ("match phone settings"): the app matches the owner's
// phone, dark phones get dark and light phones get light, and the sun/moon
// switch (now on the Settings page) overrides it for good. This replaces the
// September 17 ruling D-1 (dark default) and its one-time reset.
//
// HOW THE SEPTEMBER RESET IS UNDONE. D-1 wrote edfl-theme='dark' into every
// browser once. That stored value would otherwise pin everyone to dark and
// the phone setting would never be consulted. So, once per browser, under a
// new marker key, the stored choice is cleared. From then on:
//   stored 'light' or 'dark'  the owner chose it on Settings; honour it;
//   nothing stored            prefers-color-scheme decides, every load.
// Anyone who picks a theme after this ships keeps it across visits, as
// before: the Settings switch still writes edfl-theme.
//
// This runs before paint, which is why it is an inline script rather than an
// effect: a theme applied after hydration is a white flash on every load.
const themeScript =
  "try{" +
  "if(localStorage.getItem('edfl-theme-v2')!=='1'){localStorage.removeItem('edfl-theme');localStorage.setItem('edfl-theme-v2','1');}" +
  "var t=localStorage.getItem('edfl-theme');" +
  "if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}" +
  "document.documentElement.setAttribute('data-theme',t);" +
  "}catch(e){document.documentElement.setAttribute('data-theme','dark');}";

/**
 * VIEWPORT -- phase 2F, September 19, 2026. This export did not exist before
 * today and two of its three lines fix things that were already broken.
 *
 * viewport-fit=cover IS A BUG FIX, not a new feature. app/kit.css has paid
 * env(safe-area-inset-top / left / right) on the app bar since phase 1, and
 * app/globals.css pays safe-area-inset-bottom. Those functions return 0 unless
 * the page asks for the full screen with viewport-fit=cover, and nothing ever
 * did -- so every one of those calc()s has been adding zero on every iPhone
 * since it was written. Nobody saw it because Safari's own chrome was covering
 * the unsafe area. In an INSTALLED app there is no Safari chrome, so the bar
 * would have run under the notch and the strip under the home indicator. The
 * padding was always right; this is the line that turns it on.
 *
 * themeColor: OCTOBER 17, 2026 -- one entry per colour scheme, the Design
 * System v2 grounds, so the phone's status bar follows the theme like the app
 * does. (It was a single permanently dark value under ruling D-1.)
 *
 * It must be its own export. Next 14 moved themeColor and viewport out of the
 * metadata object, and leaving them in there is ignored with a build warning.
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F5F9' },
    { media: '(prefers-color-scheme: dark)', color: '#151925' },
  ],
};

export async function generateMetadata() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name')
    .eq('id', true)
    .single();

  const leagueName = config?.league_short_name || 'Dynasty League';

  // TEST SITE (ui-test branch only, October 9, 2026). The tab title, the
  // home-screen name and the iOS app title all say TEST, so a test tab or a
  // test icon is never mistaken for the live league. See
  // components/TestSiteBanner.js; none of this goes to main.
  return {
    title: 'TEST SITE \u00b7 ' + leagueName,
    description: 'Contracts, salary cap, and cash tracking for the league.',

    // PHASE 2F. Everything below makes the app installable. None of it
    // changes how the app behaves in an ordinary browser.
    //
    // applicationName and appleWebApp.title are the words that appear UNDER
    // the icon on a home screen, and they are deliberately not `leagueName`:
    // that column is read from the database and could be long, and iOS
    // truncates at about twelve characters. "EDFL" is what owners call it.
    applicationName: 'EDFL TEST',
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48 32x32 16x16' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      // iOS reads this and nothing else. It will not read the manifest's
      // icons, which is why a separate 180px file exists.
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    appleWebApp: {
      capable: true,
      title: 'EDFL TEST',
      // black-translucent puts the app under the status bar rather than
      // below it, which is what makes an installed launch look like an app
      // rather than a web page with a grey band on top. It is only safe
      // because viewport-fit=cover is set above and the bar already pays
      // safe-area-inset-top. THOSE THREE THINGS ARE ONE DECISION -- change
      // one and check the other two. This is the first thing to look at on
      // a real iPhone: if the app bar sits under the clock, this is why.
      statusBarStyle: 'black-translucent',
    },
    formatDetection: {
      // Safari turns anything that looks like a phone number into a blue link
      // of its own accord. This app is full of bare numbers -- a $1,500 cap,
      // a 2026 season, a jersey number -- and some of them get underlined and
      // made tappable on iOS. Off.
      telephone: false,
    },
  };
}

// STYLESHEET ORDER IS LOAD-BEARING, and it is the reason this batch does not
// touch globals.css at all:
//
//   globals.css   1,765 lines of feature blocks, appended in shipped order.
//                 Untouched. Every rule in it reads its colours through
//                 variables.
//   tokens.css    redefines those variables with the new palette, and so
//                 repaints all 1,765 lines without editing any of them.
//   kit.css       the new components, all namespaced, colliding with nothing.
//   install.css   phase 2F. A FOURTH stylesheet, and a deliberate departure
//                 from the convention that new component CSS is appended to
//                 kit.css as a dated block. The reason is narrow: phase 2D-3
//                 round-tripped kit.css through a zip on Windows, and a
//                 line-ending slip would have rewritten 54KB of stylesheet
//                 with a diff that looked like nothing. It passed, but this
//                 phase touches no existing page's styling and has no reason
//                 to take that exposure again -- a new file cannot corrupt an
//                 old one. It is the exception, not a new habit: the next
//                 component block still goes in kit.css.
//
// REVERTING, as of phase 1B. globals.css is still untouched and the old look
// is still two deletions away, not one: drop './tokens.css' above for the old
// palette, and drop className="edfl-app" from <body> below for the old shapes.
// Either can be done alone. Keep both properties until the league has seen the
// new look and said yes.
//
// AppBar is an async Server Component reading cookies(), which makes every
// route dynamic -- as every route already was because of revalidate = 0.
export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={poppins.variable}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* .edfl-app scopes the reflow section at the foot of app/kit.css.
          Those rules beat globals.css on specificity rather than on the
          order Next.js concatenates CSS chunks in, which is not a
          contract. Removing this one class name disables the reflow and
          returns every page to the shapes globals.css draws. */}
      {/* InstallPrompt and ServiceWorkerRegistrar are phase 2F and are mounted
          LAST on purpose. Both are client components in a tree that is server
          components nearly all the way down; putting them after {children}
          keeps them out of every page's render path and means neither can
          delay a first paint. ServiceWorkerRegistrar renders null. The prompt
          renders null too on a laptop, on an already-installed app, on a first
          visit, on /login and /install, and forever once dismissed -- see its
          own header for why each of those is deliberate. */}
      {/* OCTOBER 17, 2026 -- THE SKETCH SHELL (UI test batch 1). AppBar now
          draws the top bar, the league title, the compliance pill, the
          in-app compliance alert and the VIEW row (Roster · Players · League
          · Media); OfficeBar draws the four offices fixed to the foot of the
          screen, above the TEST SITE banner. The page sits between them.
          Lewis's sketch of October 12, option A "as sketched". */}
      <body className="edfl-app edfl-shell">
        <AppBar />
        {children}
        <OfficeBar />
        <InstallPrompt />
        <ServiceWorkerRegistrar />
        {/* ui-test branch only: see components/TestSiteBanner.js. */}
        <TestSiteBanner />
      </body>
    </html>
  );
}
