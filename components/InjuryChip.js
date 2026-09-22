import InjuryCross from './InjuryCross';

// THE INJURY CHIP -- September 21 2026.
//
// The red cross plus the designation in words, e.g. "Out — Hamstring", on a
// tinted red chip, so the injury reads at a glance on a phone rather than
// hiding in a 12px mark and a tooltip nobody can hover on a touch screen.
//
// IT DECIDES NOTHING. Pass the view's `injury_flagged` as `flagged` and its
// `injury_label` as `label`; the chip renders when flagged is true and prints
// the label verbatim. The words are composed in edfl_injury_label() and never
// here, and which designations draw it is edfl_injury_cross_shows() (every
// Sleeper designation, commissioner ruling September 21 2026).
//
// COLOUR. --st-bad-fg on --st-bad-bg, the kit's existing bad-status pair, no
// new token. Measured (SR-61): 6.89:1 dark, 4.88:1 light.

export default function InjuryChip(props) {
  if (!props.flagged) return null;
  const label = props.label || 'Injury designation';
  const big = props.size === 'lg';

  return (
    <span className={'rp-chip rp-chip-inj' + (big ? ' is-lg' : '')} title={label}>
      <InjuryCross size={big ? 18 : 14} label={label} />
      <span className="rp-chip-text">{label}</span>
    </span>
  );
}
