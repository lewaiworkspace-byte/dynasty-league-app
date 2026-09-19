/**
 * THE WEB APP MANIFEST -- the file that makes the app installable.
 * Phase 2F, September 19, 2026. Commissioner rulings M-1 and M-6.
 *
 * WHAT THIS FILE IS. Four dozen bytes of metadata that tell a phone "this URL
 * may be kept on the home screen, and here is what it should look like when it
 * is." It creates no second version of the app, no second deploy target and no
 * second version number: the installed app and the website are the same thing
 * being served from the same Vercel deployment. An owner who never installs
 * loses nothing.
 *
 * WHY IT IS A ROUTE AND NOT A FILE IN public/. Next serves this at
 * /manifest.webmanifest with the correct application/manifest+json content
 * type. A hand-written public/manifest.json is served as JSON and Safari is
 * the fussiest client about that.
 *
 * force-static IS LOAD-BEARING. Everything else in this app is dynamic
 * (revalidate = 0 in the root layout, an AppBar that reads cookies). This
 * route reads nothing and must never become a per-request render -- a
 * manifest is fetched before there is a session and must answer identically
 * every time.
 *
 * *** THE ONE THING THAT WOULD BREAK THIS SILENTLY ***
 * The manifest is fetched by the browser WITHOUT cookies. R-7's gate in
 * middleware.js redirects every cookie-less request to /login -- so without
 * the allowlist entry in that file, this route answers 307, the browser gets
 * HTML where it expected JSON, the manifest fails to parse, and the install
 * prompt never appears on any device. Nothing logs an error. See the
 * PUBLIC_FILES list in middleware.js; it and this file ship together or
 * neither ships.
 *
 * COLOURS. Both are --hero (#0A0D12) from app/tokens.css, which is the one
 * colour that does NOT follow the theme -- ruling D-1, hero surfaces are
 * always dark. An owner running the light theme still gets a dark splash and
 * a dark status bar, which is correct: the league's identity is a neon sign
 * and a sign only works on a dark field.
 *
 * start_url IS '/', NOT A TEAM HQ URL, and this corrects the Mobile Delivery
 * Brief v0.2 §7.5, which was written before R-8 shipped. '/' is now a redirect
 * that sends a linked owner to their own Team HQ and everyone else to /league
 * (app/page.js). Hard-coding /team/<id> into the manifest is impossible
 * anyway -- one manifest is served to all ten owners.
 *
 * NO shortcuts[] IN v1.0. Long-press shortcuts are Android-only, want their
 * own 96px icons, and cannot be tested from here. The natural set would also
 * be tempting to point at the Commissioner Portal, which would put a door in
 * front of owners who cannot open it. Deliberately left for later.
 */

export const dynamic = 'force-static';

export default function manifest() {
  return {
    id: '/',
    name: 'El Dynasty Futbol League-o',
    short_name: 'EDFL',
    description:
      'Contracts, salary cap, cash and the wire for the El Dynasty Futbol League-o.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0A0D12',
    theme_color: '#0A0D12',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Android masks every icon to its own shape (circle, squircle, rounded
        // square) and crops to the centre 80%. The 'any' icons above would
        // lose the ends of the sign to that crop, so this one is drawn with
        // the whole sign inside the safe circle and the hero field bleeding
        // to the edges.
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
