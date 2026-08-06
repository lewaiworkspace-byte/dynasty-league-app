import { Oswald, Inter, IBM_Plex_Mono } from 'next/font/google';
import { supabase } from '../lib/supabaseClient';
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
      <body>{children}</body>
    </html>
  );
}
