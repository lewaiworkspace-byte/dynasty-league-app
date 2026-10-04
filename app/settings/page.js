import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { formatShortDateTime } from '../../lib/formatDate';
import Breadcrumbs from '../../components/Breadcrumbs';
import NotificationPrefsForm from '../../components/NotificationPrefsForm';
import AutoIrForm from '../../components/AutoIrForm';
import OwnerInfoPanel from '../../components/OwnerInfoPanel';

export const revalidate = 0;
export const metadata = { title: 'Owner Settings' };

/**
 * OWNER SETTINGS -- /settings. October 4, 2026.
 *
 * One page for the three things an owner sets for himself (commissioner
 * request, October 4 2026): automatic IR moves, how he is notified, and his
 * contact card. Menu: MY TEAM -> Owner Settings. /notifications forwards here.
 *
 * EVERYTHING ON THE PAGE IS THE SIGNED-IN OWNER'S OWN, and each read says so
 * in the database, not here:
 *   my_roster_prefs()        reads auth.uid(); his automation switches and
 *                            his team's last ten automatic moves
 *   my_notification_prefs()  reads auth.uid(); his channels and last notices
 *   owner_directory()        the league directory -- this page keeps only the
 *                            row flagged is_self, and OwnerInfoPanel's default
 *                            editScope ('self') is what lets him edit it
 *
 * The three sections fail separately: a failed read draws its own message in
 * its own section and leaves the other two working. None of them falls back
 * to a default that would look like a real setting.
 *
 * Timestamps are formatted HERE, in Eastern (lib/formatDate.js), and handed to
 * the client forms as labels; neither form formats a date.
 */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent('/settings'));

  const [rosterRes, notifyRes, dirRes] = await Promise.all([
    supabase.rpc('my_roster_prefs'),
    supabase.rpc('my_notification_prefs'),
    supabase.rpc('owner_directory'),
  ]);

  const rosterPrefs = rosterRes.data;
  const notifyPrefs = notifyRes.data;

  if (!rosterRes.error && !notifyRes.error && !rosterPrefs && !notifyPrefs) {
    return (
      <main className="page">
        <Breadcrumbs trail={[{ label: 'Owner Settings' }]} />
        <h1>Owner Settings</h1>
        <p>Your login is not linked to a team, so there is nothing to set.</p>
      </main>
    );
  }

  const autoRecent = ((rosterPrefs && rosterPrefs.recent) || []).map(function (r) {
    return Object.assign({}, r, { createdLabel: formatShortDateTime(r.created_at) });
  });
  const notifyRecent = ((notifyPrefs && notifyPrefs.recent) || []).map(function (r) {
    return Object.assign({}, r, {
      createdLabel: formatShortDateTime(r.created_at),
      sentLabel: r.sent_at ? formatShortDateTime(r.sent_at) : null,
    });
  });
  const selfRows = (dirRes.data || []).filter(function (r) {
    return r.is_self;
  });

  return (
    <main className="page ntf-page set-page">
      <Breadcrumbs trail={[{ label: 'Owner Settings' }]} />
      <div className="eyebrow">My team</div>
      <h1>Owner Settings</h1>
      <p className="subhead">
        Automatic IR moves, how you are warned about fines and poaching, and the contact card the
        league sees.
      </p>

      <nav className="set-nav" aria-label="Settings sections">
        <a href="#roster">Roster automation</a>
        <a href="#notifications">Notifications</a>
        <a href="#contact">Contact info</a>
      </nav>

      <section id="roster" className="set-section">
        <h2 className="section-heading">Roster automation</h2>
        {rosterRes.error ? (
          <p className="ntf-error">Your roster automation settings could not be read: {rosterRes.error.message}</p>
        ) : (
          <AutoIrForm initial={rosterPrefs} recent={autoRecent} />
        )}
      </section>

      <section id="notifications" className="set-section">
        <h2 className="section-heading">Notifications</h2>
        <div className="ntf-when">
          <h3 className="set-h3">When you are warned about fines</h3>
          <ul>
            <li>The moment your roster goes out of compliance, whatever caused it.</li>
            <li>
              24 hours and 2 hours before the weekly compliance deadline (usually Thursday at 12:00 AM
              ET), if you are still out.
            </li>
            <li>
              Right after the deadline if you were out: fix everything before the week&apos;s first game
              kicks off and the roster fine is the reduced one. Again 2 hours before that kickoff.
            </li>
            <li>
              2 hours before any per-violation fine attaches: 24 hours after the first game kicks off,
              24 hours after an IR player loses his designation, or the kickoff of a player over a
              roster limit, who also scores 0 for that week.
            </li>
            <li>Whenever the app moves a player for you, or could not.</li>
            <li>Once more when you are back in compliance.</li>
          </ul>
          <p className="ntf-fine">
            Every message says what is wrong, how to fix it, the deadline and the fine, with the
            amounts taken from the league&apos;s rules at the moment it is sent. A warning that could not
            be delivered within six hours is dropped rather than sent late.
          </p>
          <h3 className="set-h3">When a team tries to poach your player</h3>
          <ul>
            <li>
              The moment another team opens a poach window on one of your practice squad players. Who
              opened it stays hidden until the window resolves.
            </li>
            <li>3 hours before the window closes, if you have not bid to keep him.</li>
            <li>Once more when the window is settled: kept, poached or voided.</li>
          </ul>
          <p className="ntf-fine">
            These use your email and Discord DM choices below. The public callout switch is for
            compliance only: Dianna announces every poach window in #insider-threat for the whole
            league.
          </p>
        </div>
        {notifyRes.error ? (
          <p className="ntf-error">Your notification settings could not be read: {notifyRes.error.message}</p>
        ) : (
          <NotificationPrefsForm initial={notifyPrefs} recent={notifyRecent} />
        )}
      </section>

      <section id="contact" className="set-section">
        <h2 className="section-heading">Contact info</h2>
        <OwnerInfoPanel rows={selfRows} loadError={dirRes.error ? dirRes.error.message : null} />
      </section>
    </main>
  );
}
