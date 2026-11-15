import { redirect } from 'next/navigation';

export const revalidate = 0;

/**
 * GM'S OFFICE -- retired by UI test batch 24, November 15, 2026.
 *
 * Lewis (Book design session, 14:53 ET): "Everything in GM's Office moves into
 * Owner's Office", which is renamed Owner's Suite, and The Book takes GM's
 * Office's place in the office row. Every tile that lived here (Players, Your
 * roster, Restructure, Find a trade, All trades, Free agency, Poaching, Waiver
 * wire and the Extend and Trade block placeholders) is on /owner now. This route
 * stays so an old link or a bookmark still lands somewhere: it redirects to
 * Owner's Suite. The middleware still requires a session first.
 */
export default function GmOfficePage() {
  redirect('/owner');
}
