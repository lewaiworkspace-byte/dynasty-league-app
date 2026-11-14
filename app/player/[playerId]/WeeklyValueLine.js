import { formatDate } from '../../../lib/formatDate';

// THE WEEKLY PLAYER VALUE CHART ON THE CARD -- UI test batch 12, November 13,
// 2026 (rulings PVC-1 to PVC-15). Inside the Value box, above the published
// chart's figures: his per-year value on the latest Thursday chart, his rank
// at his position, and a small line of every Thursday since the anchor. Rows
// come from edfl_pvc_player_line(player_id): the anchor first (is_anchor),
// then each posted Thursday, oldest to newest. Every figure is the reader's;
// nothing is added or subtracted here (SR-23 -- the week-on-week change lives
// on /values, where edfl_pvc_weekly_chart() computes it). PPV is not money:
// bare numbers, .v-ppv.
//
// A failed read says so (L14); a player never signed has no rows and the line
// is left out, because the weekly chart covers signed players only (PVC-2).

function ppvNum(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('en-US');
}

function shortDate(d) {
  return formatDate(d).replace(/, \d{4}$/, '');
}

export default function WeeklyValueLine({ line, error }) {
  if (error) {
    return <p className="edfl-pc-note">The weekly chart couldn&rsquo;t load: {error}</p>;
  }
  const rows = line || [];
  const weeks = rows.filter(function (r) {
    return !r.is_anchor;
  });
  if (weeks.length === 0) return null;

  const latest = weeks[weeks.length - 1];

  const vals = rows.map(function (r) {
    return Number(r.per_year_value) || 0;
  });
  const max = Math.max.apply(null, vals);
  const min = Math.min.apply(null, vals);
  const span = max - min || 1;
  const pts = vals.map(function (v, i) {
    const x = 6 + (i * 288) / Math.max(1, vals.length - 1);
    const y = 50 - ((v - min) / span) * 40;
    return x.toFixed(1) + ',' + y.toFixed(1);
  });

  return (
    <div className="edfl-pvw-card">
      <div className="edfl-pvw-cardtop">
        <span className="edfl-pc-label">Weekly chart, {shortDate(latest.chart_date)}</span>
        <span>
          <b className="v-ppv">{ppvNum(latest.per_year_value)}</b> per year
          {latest.pos_rank ? <span className="edfl-pvw-cardrank"> · #{latest.pos_rank} at his position</span> : null}
        </span>
      </div>
      {rows.length >= 2 ? (
        <svg
          className="edfl-pvw-spark"
          viewBox="0 0 300 56"
          role="img"
          aria-label={
            'Per-year value by Thursday chart: ' +
            rows
              .map(function (r) {
                return ppvNum(r.per_year_value) + ' on ' + shortDate(r.chart_date);
              })
              .join(', ')
          }
        >
          <polyline fill="none" stroke="var(--c-ppv)" strokeWidth="2.5" points={pts.join(' ')} />
        </svg>
      ) : null}
      <p className="edfl-pc-note">
        Starts from the {shortDate(rows[0].chart_date)} chart; total {ppvNum(latest.total_ppv)}.{' '}
        <a href={'/values?view=weekly&date=' + latest.chart_date}>The weekly chart</a>
      </p>
    </div>
  );
}
