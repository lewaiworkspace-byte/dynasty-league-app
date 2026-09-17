/**
 * Chip -- the one small label in the kit.
 *
 * Roster status, position, severity, provisional, PS, IR, LOCKED: every short
 * marker in the app is this component with a different tone.
 *
 * IT IS NOT A CONTROL, and that is deliberate. CLAUDE.md records that some
 * status markers are plain spans with no role, no tabindex and no handler, and
 * that they must not acquire a border-hover, a background-hover or a click.
 * This component renders a <span> and accepts no onClick. A thing that acts
 * wears .btn like every other control in the app.
 *
 * TONES map to the status token groups globals.css already defines, so light
 * and dark both follow without this file knowing either palette:
 *   good  -- compliant, met, settled
 *   live  -- pending, provisional, attention  (this is the gold globals.css
 *            already reserves; do not use it for anything else)
 *   bad   -- breach, refused, urgent
 *   neon  -- the owner's own thing, used sparingly
 *   off   -- neutral, the default
 */

export default function Chip({ tone, dot, children }) {
  const cls =
    'kit-chip' + (tone && tone !== 'off' ? ' kit-chip-' + tone : '');

  return (
    <span className={cls}>
      {dot ? <span className="kit-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
