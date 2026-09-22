// THE RED CROSS.
//
// WHO WEARS IT -- commissioner ruling, September 21 2026: EVERY player
// carrying a Sleeper injury designation, whatever it is (Questionable and NA
// included). That supersedes the September 20 ruling, under which only IR,
// Out, Doubtful and PUP drew the cross.
//
// NOTHING IN THIS FILE DECIDES ANYTHING. Whether the cross is drawn is the
// view's `injury_flagged`, and the label is the view's `injury_label`,
// rendered verbatim. Both come from edfl_injury_cross_shows() and
// edfl_injury_label() in the database -- the one definition of the rule,
// read by roster_injury_status, player_card_header and edfl_matchup_detail,
// so the roster, the card and the Matchup page cannot disagree (SR-70).
//
// THE CROSS NO LONGER MEANS "MAY HOLD AN IR SLOT". Rule 3.4(b) eligibility is
// still IR / Out / Doubtful / PUP, and still edfl_injury_designation_qualifies()
// -- a DIFFERENT predicate since September 21. A Questionable player wears the
// cross and is not IR-eligible. Never infer eligibility from the cross.
//
// WHY AN INLINE SVG AND NOT A GLYPH. "✚" and "+" render at wildly different
// weights across the fonts a phone may pick, and some platforms substitute a
// colour emoji that ignores currentColor entirely -- which would come out
// the wrong red in one theme and invisible in the other. The path below is
// two rectangles, inherits currentColor, and measures the same everywhere.
//
// SIZE. `size` in px, default 14 (was a fixed 12, which the commissioner found
// too easy to miss). The chip on the roster and the card passes its own.
//
// COLOUR. --st-bad-fg, the kit's existing bad-status ink. No new token.

export default function InjuryCross(props) {
  const label = props.label || 'Carrying an injury designation';
  const size = props.size || 14;

  return (
    <span
      className={'inj-cross' + (props.className ? ' ' + props.className : '')}
      title={label}
      role="img"
      aria-label={label}
    >
      <svg
        viewBox="0 0 12 12"
        width={size}
        height={size}
        focusable="false"
        aria-hidden="true"
      >
        <path
          d="M4.6 0.6h2.8v3.2h3.2v2.8H7.4v3.2H4.6V6.6H1.4V3.8h3.2z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
