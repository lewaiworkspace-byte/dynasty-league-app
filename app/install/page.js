/**
 * /install -- HOW TO PUT EDFL ON A PHONE. Phase 2F, September 19, 2026.
 * Commissioner ruling M-1: the app on an owner's phone, installed as simply
 * as possible.
 *
 * THIS IS THE PAGE YOU LINK WHEN AN OWNER ASKS "how do I get this". It is also
 * the target of the QR code posted in Discord, which is the whole of the
 * rollout: an owner points a camera at an image, lands here, follows three
 * taps. No typed URL, no link that dies in a chat client, no support
 * conversation.
 *
 * *** IT IS THE THIRD ROUTE A SIGNED-OUT VISITOR CAN REACH, AND THAT IS
 *     DELIBERATE *** -- alongside /login and /auth/callback. An owner who has
 * not signed in yet is exactly the person who needs it, and gating it would
 * mean the only way to learn how to install the app is to already be inside
 * it. This is a narrow, considered exception to R-7 and it exposes nothing:
 * the page reads NOTHING. No database call, no session read, no league state,
 * no names, no figures. It is six paragraphs of instructions and it renders
 * identically for the commissioner and for a stranger.
 *
 * KEEP IT THAT WAY. The moment this page reads anything -- "your team",
 * "3 pending items" -- it stops being safe to serve signed-out and the
 * allowlist entry in middleware.js becomes a hole. If this page ever needs
 * data, gate it and move the instructions somewhere else.
 *
 * NO GATE OF ITS OWN, like the thirteen formerly-public routes, and for the
 * opposite reason: those have none because the middleware covers them, this
 * one has none because it must not have one.
 *
 * THE iOS COLUMN IS LONGER THAN THE ANDROID ONE AND WILL LOOK UNBALANCED.
 * That is the truth of the platform, not a layout defect: Chrome fires an
 * install event and Safari does not, so Android is one button and iOS is three
 * taps nobody can automate. Do not pad Android out to match.
 */

export const metadata = {
  title: 'Put EDFL on your phone',
  description:
    'Add the EDFL app to an iPhone or Android home screen. It opens full screen and stays signed in.',
};

export default function InstallPage() {
  return (
    <main className="page">
      <h1>Put EDFL on your phone</h1>
      <p className="subhead">
        The app can sit on your home screen with its own icon, open full screen
        with no address bar, and keep you signed in between visits. It takes
        about ten seconds and there is nothing to download from a store.
      </p>

      <div className="edfl-install-page">
        <section className="edfl-install-card">
          <h2>iPhone and iPad</h2>
          <p className="edfl-install-sub">
            In Safari. Chrome and Firefox on iOS cannot do this — Apple only
            allows it from Safari.
          </p>
          <ol className="edfl-install-steps">
            <li>
              Open the app in <b>Safari</b> and sign in as usual.
            </li>
            <li>
              Tap the <b>Share</b> button — the square with an arrow coming out
              of the top, in the bar at the bottom of the screen.
            </li>
            <li>
              Scroll down the list and tap <b>Add to Home Screen</b>, then tap{' '}
              <b>Add</b> at the top right.
            </li>
          </ol>
          <div className="edfl-install-note">
            The EDFL sign appears on your home screen. Open it from there from
            now on, not from Safari — an app opened from the icon is the one
            that stays signed in.
          </div>
        </section>

        <section className="edfl-install-card">
          <h2>Android</h2>
          <p className="edfl-install-sub">In Chrome, Edge or Samsung Internet.</p>
          <ol className="edfl-install-steps">
            <li>
              Open the app and sign in as usual. A strip appears at the bottom
              of the screen with an <b>Install</b> button — tap it.
            </li>
            <li>
              If you have already dismissed that strip, tap the{' '}
              <b>three dots</b> at the top right of Chrome and choose{' '}
              <b>Add to Home screen</b> or <b>Install app</b>.
            </li>
            <li>
              Confirm. The icon lands on your home screen and in your app
              drawer.
            </li>
          </ol>
          <div className="edfl-install-note">
            Chrome will also offer this by itself after a couple of visits.
            Either route installs the same thing.
          </div>
        </section>
      </div>

      <div className="edfl-install-card" style={{ marginTop: 18 }}>
        <h2>What you get, and what you do not</h2>
        <div className="edfl-install-note" style={{ marginTop: 10, paddingTop: 0, borderTop: 0 }}>
          <p style={{ margin: '0 0 10px' }}>
            <b>It is the same app.</b> There is one EDFL and one address. The
            icon is a faster door to it, not a separate copy — so it can never
            be a version behind the website, and there is no app to update. A
            change goes live and the next time you open the icon, you are on it.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            <b>It launches full screen</b> with the league&rsquo;s own splash,
            and it opens on your Team HQ.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            <b>It does not send notifications.</b> Nothing in the app will ping
            you — that stays in Discord, which reaches everyone whether they
            installed this or not.
          </p>
          <p style={{ margin: 0 }}>
            <b>Nothing is lost if you skip it.</b> The app works in any browser
            on any device exactly as it does now. Installing is optional and
            takes nothing away from anyone who never does.
          </p>
        </div>
      </div>

      <p className="subhead" style={{ marginTop: 22 }}>
        Trouble with any of it — say so in Discord and it gets sorted.
      </p>
    </main>
  );
}
