'use client';

// THE "THIS SEASON" BOX -- UI test batch 6, November 2026.
//
// Lewis, November 9, 2026 (canvas comment): "Can you also display the
// projected points and show a trend line?" Bars are his EDFL points by week,
// a dark mark is each week's projection, a dashed gold outline is a week in
// progress, a dashed grey outline is a week not played yet (drawn at its
// projection), and the dashed purple line is the least-squares trend over the
// FINISHED weeks only, never extended into weeks not played. The Started /
// Benched shading of the old Overview list was dropped with Lewis's knowledge.
//
// EVERY FIGURE IS THE DATABASE'S. edfl_player_card_weeks gives the weeks and
// edfl_player_card_summary the totals, the average, the projection comparison
// and the trend's two end points; this file only places them. The only
// arithmetic here is geometry (where a bar goes), never a score.
//
// A SCORE IS NOT MONEY: no formatter from lib/formatMoney, no rounding beyond
// printing the two decimals the database stores.
//
// Two drawings, one per width: a narrow one with a week grid beneath it for a
// phone, and a wide one with the figures under each bar from 900px. CSS picks
// which shows (.edfl-pc-chart-phone / -wide), so the server renders both and
// nothing depends on measuring the window.

function pts(v) {
  if (v === null || v === undefined || v === '') return '—';
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(2) : String(v);
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function weekState(w) {
  const hasPts = num(w.points) !== null;
  if (w.week_is_final && hasPts) return 'final';
  if (!w.week_is_final && hasPts) return 'live';
  if (!w.week_is_final) return 'future';
  return 'none'; // a final week he was on no EDFL roster
}

function Chart({ weeks, summary, wide }) {
  const W = wide ? 900 : 326;
  const H = wide ? 270 : 190;
  const x0 = 34;
  const x1 = wide ? 892 : 318;
  const yBase = wide ? 212 : 168;
  const yTop = wide ? 24 : 14;

  let max = 0;
  weeks.forEach(function (w) {
    const p = num(w.points);
    const q = num(w.proj_points);
    if (p !== null && p > max) max = p;
    if (q !== null && q > max) max = q;
  });
  const step = max > 60 ? 20 : 10;
  const top = Math.max(step, Math.ceil(max / step) * step);
  function y(v) {
    return yBase - (Math.max(0, v) / top) * (yBase - yTop);
  }

  const n = weeks.length || 1;
  const slot = (x1 - x0) / n;
  const barW = Math.min(slot * 0.56, wide ? 34 : 18);
  function cx(i) {
    return x0 + slot * (i + 0.5);
  }

  const grid = [];
  for (let v = 0; v <= top; v += step) {
    grid.push(
      <g key={'g' + v}>
        <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
        <text x={x0 - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-2)">
          {v}
        </text>
      </g>
    );
  }

  const marks = weeks.map(function (w, i) {
    const st = weekState(w);
    const p = num(w.points);
    const q = num(w.proj_points);
    const x = cx(i);
    const parts = [];
    if (st === 'final') {
      parts.push(
        <rect key="b" x={x - barW / 2} y={y(p)} width={barW} height={yBase - y(p)} rx="3" fill="var(--neon)" />
      );
    } else if (st === 'live') {
      parts.push(
        <rect
          key="b"
          x={x - barW / 2}
          y={y(p)}
          width={barW}
          height={Math.max(1, yBase - y(p))}
          rx="3"
          fill="none"
          stroke="var(--brass)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      );
    } else if (st === 'future' && q !== null) {
      parts.push(
        <rect
          key="b"
          x={x - barW / 2}
          y={y(q)}
          width={barW}
          height={yBase - y(q)}
          rx="3"
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      );
    }
    if (q !== null) {
      parts.push(
        <line
          key="p"
          x1={x - barW / 2 - 3}
          x2={x + barW / 2 + 3}
          y1={y(q)}
          y2={y(q)}
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      );
    }
    parts.push(
      <text key="w" x={x} y={yBase + 14} textAnchor="middle" fontSize="10" fill="var(--ink-2)">
        {w.week_number}
      </text>
    );
    if (wide) {
      parts.push(
        <text
          key="v"
          x={x}
          y={yBase + 31}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill={st === 'live' ? 'var(--st-live-fg)' : 'var(--ink)'}
        >
          {pts(w.points)}
        </text>
      );
      parts.push(
        <text key="q" x={x} y={yBase + 47} textAnchor="middle" fontSize="10" fill="var(--ink-2)">
          {q === null ? 'no proj' : 'proj ' + pts(q)}
        </text>
      );
    }
    return <g key={w.week_number}>{parts}</g>;
  });

  // The trend: the database's two end points, over the finished weeks.
  let trend = null;
  if (summary && num(summary.final_weeks) >= 2 && num(summary.trend_start) !== null && num(summary.trend_end) !== null) {
    const iFirst = weeks.findIndex(function (w) {
      return w.week_number === summary.first_final_week;
    });
    const iLast = weeks.findIndex(function (w) {
      return w.week_number === summary.last_final_week;
    });
    if (iFirst >= 0 && iLast > iFirst) {
      trend = (
        <line
          x1={cx(iFirst)}
          x2={cx(iLast)}
          y1={y(num(summary.trend_start))}
          y2={y(num(summary.trend_end))}
          stroke="var(--c-ppv)"
          strokeWidth="2.5"
          strokeDasharray="7 4"
          strokeLinecap="round"
        />
      );
    }
  }

  return (
    <svg
      className="edfl-pc-chart-svg"
      viewBox={'0 0 ' + W + ' ' + H}
      width="100%"
      role="img"
      aria-label={chartLabel(weeks, summary)}
    >
      {grid}
      {marks}
      {trend}
    </svg>
  );
}

function chartLabel(weeks, summary) {
  const bits = ['EDFL points by week: bars are his actual points, dark marks are projected points'];
  if (weeks.some(function (w) { return weekState(w) === 'live'; })) bits.push('a dashed gold outline is the week in progress');
  if (weeks.some(function (w) { return weekState(w) === 'future'; })) bits.push('dashed outlines are weeks not yet played');
  if (summary && num(summary.final_weeks) >= 2 && summary.trend_start !== null) {
    bits.push(
      'the dashed purple trend line runs from about ' +
        summary.trend_start +
        ' in week ' +
        summary.first_final_week +
        ' to about ' +
        summary.trend_end +
        ' in week ' +
        summary.last_final_week
    );
  }
  return bits.join(', ') + '.';
}

function summaryLines(summary) {
  if (!summary || !num(summary.final_weeks)) return [];
  const lines = [];
  const span =
    summary.first_final_week === summary.last_final_week
      ? 'Week ' + summary.first_final_week
      : 'Weeks ' + summary.first_final_week + '–' + summary.last_final_week;
  lines.push(
    <b key="t" className="edfl-pc-ink">
      {span}: {pts(summary.final_points)} points, {pts(summary.final_avg)} a week.
    </b>
  );
  if (num(summary.proj_weeks) > 0) {
    const d = num(summary.proj_diff);
    const word = d === null || d === 0 ? 'right on it' : pts(Math.abs(d)) + (d < 0 ? ' under' : ' over');
    lines.push(
      ' In the ' +
        summary.proj_weeks +
        ' of those weeks that had a projection he scored ' +
        pts(summary.proj_actual) +
        ' against ' +
        pts(summary.proj_projected) +
        ' projected (' +
        word +
        ').'
    );
  }
  if (num(summary.final_weeks) >= 2 && num(summary.trend_slope) !== null) {
    const s = num(summary.trend_slope);
    lines.push(
      s === 0
        ? ' Trend: flat.'
        : ' Trend: ' + (s < 0 ? 'down' : 'up') + ' about ' + pts(Math.abs(s)) + ' points a week.'
    );
  }
  return lines;
}

export default function SeasonChart({ weeks, summary, seasonError }) {
  if (seasonError) {
    return <div className="form-error">This season could not be loaded: {seasonError}.</div>;
  }
  const list = weeks || [];
  const anything = list.some(function (w) {
    return num(w.points) !== null || num(w.proj_points) !== null;
  });
  if (!summary || list.length === 0 || !anything) {
    return (
      <p className="edfl-pc-note">
        No EDFL weeks or projections for him {summary && summary.season_year ? 'in ' + summary.season_year : 'this season'} yet.
      </p>
    );
  }
  const hasLive = list.some(function (w) { return weekState(w) === 'live'; });
  const hasFuture = list.some(function (w) { return weekState(w) === 'future' && num(w.proj_points) !== null; });
  const hasTrend = num(summary.final_weeks) >= 2 && num(summary.trend_start) !== null;

  return (
    <>
      <div className="edfl-pc-chart-phone">
        <Chart weeks={list} summary={summary} wide={false} />
      </div>
      <div className="edfl-pc-chart-wide">
        <Chart weeks={list} summary={summary} wide={true} />
      </div>
      <p className="edfl-pc-key">
        <span>
          <i className="edfl-pc-key-actual" />
          Actual
        </span>
        <span>
          <i className="edfl-pc-key-proj" />
          Projected
        </span>
        {hasTrend ? (
          <span>
            <i className="edfl-pc-key-trend" />
            Trend, weeks {summary.first_final_week}–{summary.last_final_week}
          </span>
        ) : null}
        {hasLive ? (
          <span>
            <i className="edfl-pc-key-live" />
            In progress
          </span>
        ) : null}
        {hasFuture ? (
          <span>
            <i className="edfl-pc-key-future" />
            Not played yet
          </span>
        ) : null}
      </p>
      <div className="edfl-pc-weekgrid">
        {list.map(function (w) {
          const st = weekState(w);
          return (
            <div key={w.week_number} className={'edfl-pc-wk' + (st === 'live' ? ' is-live' : '')}>
              <span>Wk {w.week_number}</span>
              <b>{pts(w.points)}</b>
              <em>{num(w.proj_points) === null ? 'no proj' : 'proj ' + pts(w.proj_points)}</em>
            </div>
          );
        })}
      </div>
      {summaryLines(summary).length > 0 ? <p className="edfl-pc-note">{summaryLines(summary)}</p> : null}
      <p className="edfl-pc-note">
        What he scored for an EDFL team in an EDFL week. NFL production by season is in Stats
        below &mdash; they answer different questions.
      </p>
    </>
  );
}
