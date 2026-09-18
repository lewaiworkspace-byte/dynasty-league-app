import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../lib/getCurrentTeamOwner';

// Nothing is rendered here, but the redirect depends on who is asking, so this
// route must never be cached or statically generated.
export const revalidate = 0;

/**
 * THE FRONT DOOR -- commissioner ruling R-8, phase 2C.
 *
 * `/` REDIRECTS AN OWNER TO THEIR OWN TEAM HQ. There is no index page any more.
 *
 * WHAT THIS REPLACED, AND WHY NONE OF IT IS LOST. Until now `/` was a wall of
 * links: a League grid of eighteen routes, a Teams list of ten, an officer
 * shortcut to the portal, and an Account pair. Every one of those has another
 * door, and the doors are better than the wall was:
 *
 *   The League grid   the MENU drawer, which is in the app bar on every route
 *                     rather than on one page everything had to route back
 *                     through. /bids is the single deliberate omission and was
 *                     already omitted from the drawer (FA-19, the auction is
 *                     dormant); the route still works and every link to it
 *                     still resolves.
 *   The Teams list    the standings on /league, which is the same ten teams
 *                     with their records and points beside them.
 *   The officer link  the pill in the app bar, which carries a live count and
 *                     is the only door to /admin. It was added on September 17
 *                     with a temporary second link here "until the portal is
 *                     familiar"; the pill is on every page and this was on one
 *                     that no longer exists, so the temporary link goes.
 *   Account           /cash is in the drawer's MY TEAM group; Login is the bar's
 *                     own control for a signed-out visitor.
 *
 * WHERE IT SENDS PEOPLE, and the second case is not a fallback nobody hits:
 *
 *   linked owner      /team/<their team>
 *   signed in, no     /league. getCurrentTeamOwner() returns null for a real
 *   team_owners row   login that has not been linked to a team, which is a
 *                     state the app bar has rendered deliberately since
 *                     September 7 and must keep working. Sending them to
 *                     /team/null would be a 404 for a legitimate account.
 *
 * SIGNED OUT NEVER REACHES HERE. R-7's middleware redirects every path but
 * /login, /auth/callback and /api/cron. The null branch above is belt and
 * braces in the same way the twenty per-page redirects are -- it costs nothing
 * and it is the second line if that file is ever edited carelessly.
 *
 * redirect() THROWS. It must not be wrapped in a try/catch, and nothing may
 * follow it in this function.
 */
export default async function HomePage() {
  const teamOwner = await getCurrentTeamOwner();

  if (teamOwner && teamOwner.team_id) {
    redirect('/team/' + teamOwner.team_id);
  }

  redirect('/league');
}
