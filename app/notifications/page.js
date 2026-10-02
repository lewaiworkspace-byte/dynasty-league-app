import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { formatShortDateTime } from '../../lib/formatDate';
import Breadcrumbs from '../../components/Breadcrumbs';
import NotificationPrefsForm from '../../components/NotificationPrefsForm';

export const revalidate = 0;
export const metadata = { title: 'Notifications' };

/**
 * NOTIFICATIONS -- /notifications. October 1, 2026.
 *
 * Where an owner chooses how he is warned that his roster is out of
 * compliance and a fine is coming. Everything on the page is the signed-in
 * owner's own: my_notification_prefs() reads auth.uid() and returns his row,
 * his Discord id and his last ten notices -- never anybody else's.
 *
 * Rulings (Commissioner, October 1, 2026):
 *   - channels: email, Discord private DM, public Discord callout by Robo
 *     Goodell in #league-office. Text messages were offered and not chosen.
 *   - an owner who never visits this page gets the in-app alert and email to
 *     his login address.
 *   - an owner may turn every outside channel off; the in-app alert stays.
 *
 * The *_ready flags say whether the league has switched a channel on yet
 * (its credential is in Vault). An owner can still choose a channel that is
 * not ready -- the choice is saved and takes effect when it is -- and the page
 * says so rather than pretending a message will arrive.
 *
 * Timestamps are formatted HERE, in Eastern (lib/formatDate.js), and handed to
 * the client form as labels; the form never formats a date.
 */
export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent('/notifications'));

  const { data: prefs, error } = await supabase.rpc('my_notification_prefs');

  if (error) {
    return (
      <main className="page">
        <Breadcrumbs trail={[{ label: 'Notifications' }]} />
        <h1>Notifications</h1>
        <p className="ntf-error">Your notification settings could not be read: {error.message}</p>
      </main>
    );
  }

  if (!prefs) {
    return (
      <main className="page">
        <Breadcrumbs trail={[{ label: 'Notifications' }]} />
        <h1>Notifications</h1>
        <p>Your login is not linked to a team, so there is nothing to warn you about.</p>
      </main>
    );
  }

  const recent = (prefs.recent || []).map(function (r) {
    return Object.assign({}, r, {
      createdLabel: formatShortDateTime(r.created_at),
      sentLabel: r.sent_at ? formatShortDateTime(r.sent_at) : null,
    });
  });

  return (
    <main className="page ntf-page">
      <Breadcrumbs trail={[{ label: 'Notifications' }]} />
      <div className="eyebrow">My team</div>
      <h1>Notifications</h1>
      <p className="subhead">
        How you hear that your roster is out of compliance and a fine is coming. The red alert at the
        top of every page is always on. Everything below is your choice.
      </p>

      <section className="ntf-when">
        <h2>When you are warned</h2>
        <ul>
          <li>The moment your roster goes out of compliance, whatever caused it.</li>
          <li>24 hours before the weekly compliance check, and again 2 hours before, if you are still out.</li>
          <li>
            Right after the check if you failed it -- fix it yourself by that evening&apos;s cure deadline
            and the fine drops to the reduced amount in Rule Book 6.7(b) -- and again 2 hours before
            that deadline.
          </li>
          <li>Once more when you are back in compliance.</li>
        </ul>
        <p className="ntf-fine">
          Every message says what is wrong, how to fix it, the deadline and the fine. A warning that
          could not be delivered within six hours is dropped rather than sent late with stale numbers.
        </p>
      </section>

      <NotificationPrefsForm initial={prefs} recent={recent} />
    </main>
  );
}
