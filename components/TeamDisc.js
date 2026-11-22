// The team disc: the team's logo in a circle, with its tri-graph underneath.
//
// UI test batch 16 (Lewis, November 14, 2026): "Add these logos for all the
// teams ... anywhere that has a circle with the trigraph."
//
// The logo is public/team-logos/<ABBREV>.webp (128px, cut to the badge's
// circle from Drive > EDFL 2.0 > EDFL App Graphics > Team Logos). It is a
// background image laid OVER the tri-graph, so a team with no logo file still
// shows its letters: a missing background draws nothing (an <img> would draw
// Chromium's broken-image icon, measured November 14).
// There is deliberately no list of teams here (no hardcoded team count) and
// no client code: this renders the same in a server or a client component.
//
// className carries the disc's existing look (kit-disc, tdk-disc ...); the
// team-disc class adds the positioning the logo needs (kit.css, Nov 14 block).

const SAFE = /^[A-Z0-9]{2,5}$/;

export function teamLogoSrc(abbrev) {
  const a = String(abbrev || '').trim().toUpperCase();
  return SAFE.test(a) ? '/team-logos/' + a + '.webp' : null;
}

export default function TeamDisc(props) {
  const src = teamLogoSrc(props.abbrev);
  return (
    <span
      className={(props.className || '') + ' team-disc' + (src ? ' has-logo' : '')}
      aria-hidden="true"
    >
      <span className="team-disc-tri">{props.abbrev || props.fallback || ''}</span>
      {src ? (
        <span className="team-disc-logo" style={{ backgroundImage: 'url(' + src + ')' }} />
      ) : null}
    </span>
  );
}
