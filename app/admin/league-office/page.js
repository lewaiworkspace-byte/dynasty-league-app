import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import LeagueOfficeAdmin from './LeagueOfficeAdmin';
import { formatShortDateTime } from '../../../lib/formatDate';

// /admin/league-office -- Robo Goodell's desk. Spec: EDFL_RoboGoodell_Spec v1.0.
//
// WIDENED gate (isCommissionerOrCo). Ruling RG-4: the co-commissioner may draft
// and pull a memo and may mute a wire kind. Every one of those writes carries
// its own is_commissioner_or_co() check in the database, so the page gate is a
// door and not the lock.
//
// FOUR READS, all through the SESSION client, because three of them gate on
// auth.uid() and would refuse the service client:
//   goodell_wire_status()  -- is the webhook stored, what is queued, what is next
//   goodell_memo_queue     -- the officer's own drafts, posted and pending
//   goodell_upcoming       -- the calendar wire, said and unsaid, 30 days out
//   league_office_feed     -- what he has actually said
//
// THE PAGE DECIDES NOTHING. Every sentence Robo speaks is composed in Postgres
// by goodell_event_line / goodell_fine_line / goodell_memo_line and stored on
// the broadcast row; this page prints stored text. Money is never recomputed
// here (SR-23) -- a fine line arrives already formatted.

export const revalidate = 0;
export const metadata = { title: 'League Office · Portal' };

export default async function AdminLeagueOfficePage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/league-office');
  if (!isCommissionerOrCo(me)) redirect('/');

  const authed = await createSupabaseServerClient();

  const [status, memos, upcoming, feed, kinds] = await Promise.all([
    authed.rpc('goodell_wire_status'),
    authed
      .from('goodell_memo_queue')
      .select('memo_id, body, publish_after, created_at, posted, posted_at')
      .limit(25),
    authed
      .from('goodell_upcoming')
      .select('broadcast_key, kind, title, starts_at, due_at, already_posted')
      .limit(60),
    authed
      .from('league_office_feed')
      .select('broadcast_key, kind, posted_at, content')
      .limit(20),
    authed.from('goodell_kinds').select('kind, enabled, note, sort_rank').order('sort_rank'),
  ]);

  const wire = status.data && status.data.ok ? status.data : null;

  return (
    <LeagueOfficeAdmin
      webhookStored={wire ? Boolean(wire.webhook_stored) : false}
      queuedNow={wire ? wire.queued_now : 0}
      lastPost={wire && wire.last_post ? formatShortDateTime(wire.last_post) : null}
      nextDue={wire && wire.next_due ? formatShortDateTime(wire.next_due) : null}
      statusError={status.error ? status.error.message : null}
      memos={(memos.data || []).map(function (m) {
        return {
          memo_id: m.memo_id,
          body: m.body,
          posted: m.posted,
          when: m.posted ? formatShortDateTime(m.posted_at) : formatShortDateTime(m.publish_after),
        };
      })}
      upcoming={(upcoming.data || []).map(function (u) {
        return {
          broadcast_key: u.broadcast_key,
          kind: u.kind,
          title: u.title,
          due: formatShortDateTime(u.due_at),
          starts: formatShortDateTime(u.starts_at),
          posted: u.already_posted,
        };
      })}
      feed={(feed.data || []).map(function (f) {
        return {
          broadcast_key: f.broadcast_key,
          kind: f.kind,
          when: formatShortDateTime(f.posted_at),
          content: f.content,
        };
      })}
      kinds={kinds.data || []}
    />
  );
}
