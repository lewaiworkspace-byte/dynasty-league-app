import { redirect } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import TierBuilder from './TierBuilder';

export const revalidate = 0;

export default async function NewTierPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/new-tier');
  // Widened to co-commissioners August 25, 2026.
  if (!isCommissionerOrCo(me)) redirect('/');

  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name')
    .eq('id', true)
    .single();

  const leagueName = config?.league_short_name || 'Dynasty League';

  return (
    <main className="page">
      <p className="subhead">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">{leagueName} · Admin · Commissioner</p>
      <h1>Build a Free Agent Tier</h1>
      <p className="subhead">
        Set the bidding window, then add the players who&apos;ll be up for auction in it. Only
        one tier can be open at a time — overlapping windows are rejected automatically.
      </p>
      <TierBuilder />
    </main>
  );
}
