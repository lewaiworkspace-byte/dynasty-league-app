/**
 * StatTile -- one big number with a quiet label and, where it has one, a rank.
 *
 * THE RANK IS THE POINT. "$39" is a fact; "$39, 8th of 10" is a story, and it
 * is the single thing the reference site does that this app most conspicuously
 * did not. Commissioner ruling D-5, September 17: rank pills among the ten
 * teams on every tile.
 *
 * COLOUR belongs to the currency, not to the tile: pass valueClass 'v-cap',
 * 'v-cash', 'v-ppv' or 'v-dead' and the figure takes the colour globals.css
 * already assigns to that currency. A tile with no currency leaves it alone.
 *
 * @param {string} label     short, upper-cased by the stylesheet
 * @param {node}   value     already formatted -- this component never formats money
 * @param {string} valueClass optional currency class
 * @param {node}   rank      e.g. "8th of 10", omitted when there is no rank
 */

export default function StatTile({ label, value, valueClass, rank }) {
  return (
    <div className="kit-tile">
      <div className="kit-tile-label">{label}</div>
      <div className={'kit-tile-value' + (valueClass ? ' ' + valueClass : '')}>{value}</div>
      {rank ? <span className="kit-rank">{rank}</span> : null}
    </div>
  );
}
