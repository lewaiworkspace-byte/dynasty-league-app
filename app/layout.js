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
const themeScript =
  "try{" +
  "var t=localStorage.getItem('edfl-theme');" +
  "if(t!=='light'&&t!=='dark'){t='dark';}" +
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
// DELETING THE './tokens.css' LINE ABOVE RESTORES THE OLD LOOK COMPLETELY.
// Nothing else needs reverting. Keep that property until the league has seen
// the new one and said yes; the planned reflow of globals.css (phase 1B) is
// what gives it up, deliberately and on its own.
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
      <body>
        <AppBar />
        {children}
      </body>
    </html>
  );
}
