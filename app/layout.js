import { Oswald, Inter, IBM_Plex_Mono } from 'next/font/google';
import { supabase } from '../lib/supabaseClient';
import AppBar from '../components/AppBar';
import './globals.css';

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

const themeScript =
  "try{" +
  "var t=localStorage.getItem('edfl-theme');" +
  "if(t!=='light'&&t!=='dark'){" +
  "t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';" +
  "}" +
  "document.documentElement.setAttribute('data-theme',t);" +
  "}catch(e){}";

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

// The fixed top-right dock that used to hold the theme toggle is gone,
// replaced by <AppBar />: Home and the theme toggle on the left, who you
// are on the right. See components/AppBar.js for why it is sticky rather
// than fixed and why it lives here rather than in twenty-four page files.
//
// AppBar is an async Server Component and reads cookies() to answer "who
// is logged in". That makes every route dynamic -- which every route
// already was, because of the revalidate = 0 above.

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
