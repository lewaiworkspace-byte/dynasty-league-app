import { Oswald, Inter, IBM_Plex_Mono } from 'next/font/google';
import { supabase } from '../lib/supabaseClient';
import AppBar from '../components/AppBar';
import InstallPrompt from '../components/InstallPrompt';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';
import './globals.css';
import './tokens.css';
import './kit.css';
import './install.css';

export const revalidate = 0;

const display = Oswald({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

// THEME, and what changed on September 17, 2026.
//
// Until today a device with no stored choice followed prefers-color-scheme.
// Commissioner ruling D-1: DARK IS THE DEFAULT. The league's identity is a
// neon sign, and a sign only works on a dark field -- an owner opening the app
// for the first time on a phone set to light should still see the league's own
// look, not a washed-out version of it.
//
// Light is NOT gone. The toggle still writes 'light' to localStorage and the
// palette is still maintained in app/tokens.css. An owner who prefers light
// keeps it, and keeps it across visits. Only the default moved.
//
// This runs before paint, which is why it is an inline script rather than an
// effect: a theme applied after hydration is a white flash on every load.
//
// SEPTEMBER 17 AMENDMENT. The version above shipped this morning and did not
// actually deliver D-1 to anybody who had used the app before. Defaulting to
// dark only applies to a browser with NO stored choice, and every owner's
// browser already held edfl-theme='light' from the old app -- so the whole
// league landed in light, on a palette that at the time was the old palette
// byte for byte, and the redesign looked like it had not deployed.
//
// This runs the ruling once. The first load after this ships sets dark and
// records that it has done so. Every load after that reads the owner's own
// choice as before, so anyone who then picks light keeps light for good. The
// marker key is never read anywhere else; deleting it re-runs the one-time
// reset, which is the only way to undo it.
const themeScript =
  "try{" +
  "var d=localStorage.getItem('edfl-theme-d1');" +
  "var t;" +
  "if(d!=='1'){t='dark';localStorage.setItem('edfl-theme','dark');localStorage.setItem('edfl-theme-d1','1');}" +
  "else{t=localStorage.getItem('edfl-theme');if(t!=='light'&&t!=='dark'){t='dark';}}" +
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
 * themeColor is #0A0D12 -- --hero from app/tokens.css, the one colour that
 * does NOT follow the theme (ruling D-1). It paints the phone's status bar and
 * the browser's own surround. An owner on the light theme still gets a dark
 * surround, which is correct: the sign only works on a dark field.
 *
 * It must be its own export. Next 14 moved themeColor and viewport out of the
 * metadata object, and leaving them in there is ignored with a build warning.
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0D12',
};

export async function generateMetadata() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name')
    .eq('id', true)
    .single();

  const leagueName = config?.league_short_name || 'Dynasty League';

  return {
    title: leagueName,
    description: 'Contracts, salary cap, and cash tracking for the league.',

    // PHASE 2F. Everything below makes the app installable. None of it
    // changes how the app behaves in an ordinary browser.
    //
    // applicationName and appleWebApp.title are the words that appear UNDER
    // the icon on a home screen, and they are deliberately not `leagueName`:
    // that column is read from the database and could be long, and iOS
    // truncates at about twelve characters. "EDFL" is what owners call it.
    applicationName: 'EDFL',
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
      title: 'EDFL',
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
      className={display.variable + ' ' + body.variable + ' ' + mono.variable}
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
      <body className="edfl-app">
        <AppBar />
        {children}
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
