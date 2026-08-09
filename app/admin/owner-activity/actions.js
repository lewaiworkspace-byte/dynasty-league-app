'use server';

import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

export async function loadOwnerActivity() {
  // Real gate, not just UI hiding -- the page also checks this, but the
  // action must enforce it itself since Server Actions are callable
  // endpoints regardless of what the UI shows.
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) {
    throw new Error('Only the commissioner can view owner login activity.');
  }

  // Session client, NOT adminClient(). commissioner_owner_activity() is
  // SECURITY DEFINER and gates itself on require_commissioner(), which reads
  // auth.uid(). Through the service-role client auth.uid() is NULL and the
  // function would correctly refuse. The service-role client would also
  // bypass RLS, which is exactly what must not happen while a tier is open.
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('commissioner_owner_activity');
  if (error) throw new Error(error.message);

  // No revalidatePath: nothing is written, and a cached snapshot of "who
  // logged in recently" is worse than useless. The button refetches instead.
  return data || [];
}
