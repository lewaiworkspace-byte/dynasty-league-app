import { redirect } from 'next/navigation';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import { loadSyncState } from './actions';
import SleeperSyncPanel from './SleeperSyncPanel';

export const revalidate = 0;
export const metadata = { title: 'Sleeper sync' };

// SLEEPER SYNC. Finds where the app and Sleeper disagree, lets the
// commissioner decide each one, and applies only what he approves.
//
// NOT THE SAME PAGE AS /admin/sync-players, and the two must not be merged.
// That one rewrites the player pool from Sleeper's full player list and is
// strict commissioner-only. This one reconciles rosters, writes almost
// nothing, and is widened to co-commissioners to match
// require_commissioner_or_co() in the database.
//
// THE PAGE GATE IS PRESENTATION. Every sleeper_sync_* function holds its own
// officer check, so a Server Action reached directly is refused whatever this
// renders.
export default async function SleeperSyncPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/sleeper-sync');
  if (!isCommissionerOrCo(me)) redirect('/');

  const loaded = await loadSyncState();

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">Commissioner</p>
      <h1>Sleeper sync</h1>
      <p className="subhead">
        Compares every Sleeper roster against the app&apos;s contracts and reports what
        disagrees. Pulling and comparing changes nothing. Nothing is written until you
        approve it.
      </p>

      {!loaded.ok ? (
        <div className="form-error">{loaded.message}</div>
      ) : (
        <SleeperSyncPanel
          run={loaded.data.run}
          conflicts={loaded.data.conflicts}
          armed={loaded.data.armed}
        />
      )}
    </main>
  );
}
