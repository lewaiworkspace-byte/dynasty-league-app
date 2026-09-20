// THE RED CROSS -- September 20 2026 ruling.
//
// A player carrying a Sleeper injury designation of IR, Out, Doubtful or PUP
// wears a red cross beside his name, on the roster and on his player card.
//
// NOTHING IN THIS FILE DECIDES ANYTHING. Whether the cross is drawn is
// roster_injury_status.injury_flagged / player_card_header.injury_flagged,
// and the tooltip is that view's injury_label, rendered verbatim -- the same
// discipline as PracticeSquadWarning. The designation set is one ruling and
// lives in one place, edfl_injury_designation_qualifies() in the database.
// If the commissioner adds or removes a designation, that function changes
// and this file does not.
//
// THE SAME SET ALSO DECIDES IR ELIGIBILITY (rule 3.4(b)), which is why the
// cross and the compliance flag can never disagree: they read one predicate.
//
// WHY AN INLINE SVG AND NOT A GLYPH. "✚" and "+" render at wildly different
// weights across the fonts a phone may pick, and some platforms substitute a
// colour emoji that ignores currentColor entirely -- which would come out
// the wrong red in one theme and invisible in the other. The path below is
// two rectangles, inherits currentColor, and measures the same everywhere.
//
// COLOUR. --st-bad-fg, the kit's existing bad-status ink. Measured against
// both themes' page and card surfaces: 7.8:1 and 7.1:1 dark, 5.1:1 and
// 5.7:1 light (SR-61). No new token.

export default function InjuryCross(props) {
  const label = props.label || 'Carrying an injury designation';

  return (
    <span
      className={'inj-cross' + (props.className ? ' ' + props.className : '')}
      title={label}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 12 12" width="12" height="12" focusable="false" aria-hidden="true">
        <path
          d="M4.6 0.6h2.8v3.2h3.2v2.8H7.4v3.2H4.6V6.6H1.4V3.8h3.2z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
