// WHERE THE PLAYER SITS THIS WEEK -- September 21 2026.
//
// contracts.roster_status is one of active | taxi | ir. The commissioner asked
// for it on every roster row and on the player card, ACTIVE included -- it
// used to be shown only when it was not active. The league's word for taxi is
// Practice Squad (the rule book's), so that is what an owner reads.
//
// This is WHERE HE SITS, not WHAT KIND OF DEAL HE IS ON. A player can be on a
// practice squad contract and on the active roster, and the row's colour
// (contract type, R-10) and this chip (roster status) are different facts.
// Legality of any move is set_roster_status() and its triggers, never this.
//
// Neutral ink on purpose. R-10 has spent the palette: teal is a rookie deal,
// gold is attention, red is an injury, neon is the one thing you can press.

const LABELS = {
  active: 'Active',
  ir: 'IR',
  taxi: 'Practice Squad',
};

export function rosterStatusLabel(status) {
  if (!status) return null;
  return LABELS[status] || String(status);
}

export default function RosterStatusChip(props) {
  const label = rosterStatusLabel(props.status);
  if (!label) return null;
  return (
    <span
      className={
        'rp-chip rp-chip-status is-' + props.status + (props.size === 'lg' ? ' is-lg' : '')
      }
    >
      {label}
    </span>
  );
}
