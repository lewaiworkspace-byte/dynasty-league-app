import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import CutsPanel from './CutsPanel';

export const revalidate = 0;
export const metadata = { title: 'Cuts' };

export default async function CutsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/cuts');
  if (!me.is_commissioner) redirect('/');

  const supabase = await createSupabaseServerClient();

  const [{ data: config }, { data: cuts }] = await Promise.all([
    supabase
      .from('league_config')
      .select('current_season_year, cut_reversal_window_hours')
      .eq('id', true)
      .single(),
    supabase
      .from('cut_history')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 499),
  ]);

  const seasonYear = config?.current_season_year || 2026;
  const windowHours = Number(config?.cut_reversal_window_hours) || 96;

  return (
    <main className="page">
      <p className="eyebrow">Commissioner</p>
      <h1>Cuts</h1>
      <p className="subhead">
        <a href="/">&larr; Home</a>
      </p>

      <p className="empty-note">
        Every cut ever made, newest first. Reversing a cut restores the
        contract and removes its dead money from the team&rsquo;s cap and
        cash. The cut itself is never deleted &mdash; it stays on this page
        marked reversed, with the reason, so the record survives the
        correction.
      </p>

      <CutsPanel
        cuts={cuts || []}
        seasonYear={seasonYear}
        windowHours={windowHours}
      />
    </main>
  );
}
