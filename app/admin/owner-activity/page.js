import { redirect } from 'next/navigation';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import OwnerActivityPanel from './OwnerActivityPanel';
import CoCommissionerPanel from './CoCommissionerPanel';
import OwnerInfoPanel from '../../../components/OwnerInfoPanel';

export const revalidate = 0;

export const metadata = { title: 'Owner Administration' };

// TWO GATES ON ONE PAGE, AND THE INNER ONE IS NARROWER (August 25, 2026).
//
// The page itself is commissioner OR co-commissioner: the activity report is
// operational information -- who has an account and who needs a nudge before a
// tier closes -- and commissioner_owner_activity() accepts both.
//
// The co-commissioner appointment control below is COMMISSIONER ONLY, because
// a co-commissioner who could appoint co-commissioners could appoint
// themselves peers, and the role would stop being the commissioner's to give.
// So it gets its own gate rather than riding on the page's. Do NOT collapse
// the two, and do not assume the page gate covers everything rendered here.
export default async function AdminOwnerActivityPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/owner-activity');
  // Widened to co-commissioners August 25, 2026.
  if (!isCommissionerOrCo(me)) redirect('/');

  // The ACTIVITY report is still nothing-read-on-purpose -- OwnerActivityPanel
  // loads behind a button so a page visit does not query the auth tables every
  // time. The DIRECTORY is different and is read here: it is ten rows from one
  // function, it is the thing an officer came to this page to change, and a
  // button to reveal a contact list would be a click for its own sake.
  const authed = await createSupabaseServerClient();
  const { data: dirRows, error: dirErr } = await authed.rpc('owner_directory');

  return (
    <div className="page">
      <p className="page-actions"><a href="/">← Home</a></p>
      <p className="eyebrow">{me.is_commissioner ? 'Commissioner' : 'Co-Commissioner'}</p>
      <h1 className="team-name">Owner Administration</h1>

      <p className="empty-note">
        Who has an account, when they last signed in, and who may need a nudge
        before an auction tier closes.
      </p>

      <OwnerActivityPanel />

      {/*
        OFFICER EDITING OF ANOTHER OWNER'S CARD LIVES HERE, AND ONLY HERE.
        editScope="all" is what draws the button; /team/[teamId] mounts this
        same component with the default self-only scope. This is the same move
        cut-from-any-roster made to /admin/cuts on September 4, for the same
        reason -- a Teams surface treats the commissioner as an ordinary owner.

        The page gate above (commissioner or co-commissioner) is what protects
        this section. save_owner_profile() re-checks owner-or-officer itself and
        logs every officer edit of somebody else's row to commissioner_actions,
        so withholding the component is the tidy half, not the gate -- the same
        split as CoCommissionerPanel below.
      */}
      <h2 className="section-heading">Owner Directory</h2>
      <p className="empty-note">
        Every owner&rsquo;s contact card. You see every field regardless of the
        hide switches an owner has set. Editing another owner&rsquo;s card is
        recorded in the commissioner action log with a before and after snapshot.
      </p>
      <OwnerInfoPanel
        rows={dirRows || []}
        loadError={dirErr ? dirErr.message : null}
        editScope="all"
      />

      {/*
        COMMISSIONER ONLY, and narrower than the page gate immediately above --
        a co-commissioner can reach this page but must not reach this control.
        Withholding the component is not the gate, only the tidy half of it: a
        Server Action is a callable endpoint whatever the page renders, so
        loadOwnerRoles() and setCoCommissioner() each re-check commissioner-only
        themselves and return a refusal. See actions.js.
      */}
      {me.is_commissioner && <CoCommissionerPanel />}
    </div>
  );
}
