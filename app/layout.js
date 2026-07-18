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

export async function generateMetadata() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name')
    .eq('id', true)
    .single();

  const leagueName = config?.league_short_name || 'Dynasty League';

  return {
    title: `${leagueName} — Cap Sheet`,
    description: 'Contracts, salary cap, and cash tracking for the league.',
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
