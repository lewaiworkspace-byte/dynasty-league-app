import { redirect } from 'next/navigation';

// Nothing is rendered here. Kept dynamic so the redirect is never cached.
export const revalidate = 0;

/**
 * THE FRONT DOOR -- commissioner ruling R-8, phase 2C; changed by Lewis on
 * November 22, 2026 (UI test batch 42).
 *
 * `/` REDIRECTS EVERY SIGNED-IN LOGIN TO /matchups. There is no index page.
 * Until batch 42 it sent a linked owner to his own Team HQ and anyone else to
 * /league; Lewis: the design put "too much emphasis on the Team Page, it isn't
 * that important", and he chose Matchups as Home. An owner, an owner with no
 * team_owners row and the read-only observer all land there.
 *
 * middleware.js makes this same redirect before the page is reached (so the app
 * shell is never built for `/`). This file is the fallback and must say the
 * same thing: change the two together.
 *
 * SIGNED OUT NEVER REACHES HERE: the middleware sends every gated path to
 * /login first.
 *
 * redirect() THROWS. It must not be wrapped in a try/catch, and nothing may
 * follow it in this function.
 */
export default async function HomePage() {
  redirect('/matchups');
}
