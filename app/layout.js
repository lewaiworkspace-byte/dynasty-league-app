import { Oswald, Inter, IBM_Plex_Mono } from 'next/font/google';
import { supabase } from '../lib/supabaseClient';
import AppBar from '../components/AppBar';
import './globals.css';
import './tokens.css';
import './kit.css';

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
      <body className="edfl-app">
        <AppBar />
        {children}
      </body>
    </html>
  );
}
