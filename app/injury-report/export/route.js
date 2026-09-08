import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import { formatDate, formatDateTime } from '../../../lib/formatDate';
import {
  REPORT_COLUMNS,
  DESIGNATIONS,
  shapeRow,
  compareRows,
  exportCell,
} from '../../../lib/injuryReport';

// Node runtime, not Edge: xlsx writes a Buffer and jsPDF's node build needs
// Node globals. Never cached -- an export must match the page it came from.
// Same shape as app/bids/results/[tierId]/export/route.js.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const READ_PAGE_SIZE = 1000; // PostgREST's default row ceiling

// THE FILTERS ARE APPLIED HERE, NOT ON THE CLIENT, and they are applied with
// the SAME predicates the table uses -- both sides read REPORT_COLUMNS and
// shapeRow() from lib/injuryReport.js. A download that contains more rows than
// the screen it came from is the same class of failure as one that silently
// truncates, and this is the reason the columns and the shaping live in a
// module rather than in the component.

async function fetchAllReportRows(supabase) {
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('league_injury_report')
      .select(
        'player_id, full_name, position, nfl_team, nfl_roster_status, injury_status, injury_body_part, injury_notes, injury_start_date, prev_injury_status, injury_changed_at, edfl_team_id, edfl_team, edfl_roster_status, is_rostered, change_flag'
      )
      .order('player_id')
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < READ_PAGE_SIZE) break;
    from += READ_PAGE_SIZE;
  }
  return all;
}

function applyFilters(rows, f) {
  const needle = (f.q || '').trim().toLowerCase();
  return rows
    .filter(function (r) {
      if (f.scope === 'rostered') return r.is_rostered;
      if (f.scope === 'free') return !r.is_rostered;
      return true;
    })
    .filter(function (r) { return f.position === 'ALL' || r.position === f.position; })
    .filter(function (r) { return f.team === 'ALL' || r.edfl_team === f.team; })
    .filter(function (r) {
      return !needle || r.full_name.toLowerCase().indexOf(needle) !== -1;
    });
}

// The export's own order: most serious first, then name. The page lets an owner
// sort by any column, but a file has one order and the useful one is triage.
function sortForExport(rows) {
  const statusCol = REPORT_COLUMNS.find(function (c) { return c.key === 'designation'; });
  return rows.slice().sort(function (a, b) { return compareRows(a, b, statusCol, 'asc'); });
}

function scopeLabel(scope) {
  if (scope === 'rostered') return 'Rostered players';
  if (scope === 'free') return 'Free agents';
  return 'Rostered players and free agents';
}

function filterSentence(f) {
  const bits = [scopeLabel(f.scope)];
  if (f.position !== 'ALL') bits.push(f.position + ' only');
  if (f.team !== 'ALL') bits.push(f.team);
  if ((f.q || '').trim()) bits.push('name contains "' + f.q.trim() + '"');
  return bits.join(' · ');
}

function asOfLine(lastRun) {
  if (!lastRun || !lastRun.completed_at) return 'Not yet pulled from Sleeper';
  return 'Current per Sleeper as of ' + formatDateTime(lastRun.completed_at);
}

// ---- CSV -------------------------------------------------------------------

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.indexOf('"') !== -1 || s.indexOf(',') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsv(rows, f, lastRun) {
  const lines = [];
  // Two provenance lines before the header. A CSV that leaves the building
  // without its as-of stamp is a list of injuries with no date on it, which is
  // exactly the thing the banner exists to prevent.
  lines.push(csvCell('EDFL Injury Report'));
  lines.push(csvCell(asOfLine(lastRun)));
  lines.push(csvCell(filterSentence(f)));
  lines.push('');
  lines.push(REPORT_COLUMNS.map(function (c) { return csvCell(c.label); }).join(','));
  rows.forEach(function (r) {
    lines.push(
      REPORT_COLUMNS.map(function (c) {
        const v = exportCell(r, c.key);
        return csvCell(c.key === 'since' && v ? formatDate(v) : v);
      }).join(',')
    );
  });
  return lines.join('\r\n') + '\r\n';
}

// ---- XLSX ------------------------------------------------------------------

async function buildXlsx(rows, f, lastRun) {
  // Dynamic import, and XLSX.write rather than writeFile -- writeFile wants a
  // filesystem. Same call shape lib/statsHelpers.js uses.
  const XLSX = await import('xlsx');

  const header = REPORT_COLUMNS.map(function (c) { return c.label; });
  const body = rows.map(function (r) {
    return REPORT_COLUMNS.map(function (c) {
      const v = exportCell(r, c.key);
      return c.key === 'since' && v ? formatDate(v) : v;
    });
  });

  const sheet = XLSX.utils.aoa_to_sheet(
    [['EDFL Injury Report'], [asOfLine(lastRun)], [filterSentence(f)], []].concat([header]).concat(body)
  );

  // Column widths, or Player and Note arrive as four characters of "####".
  sheet['!cols'] = REPORT_COLUMNS.map(function (c) {
    if (c.key === 'full_name') return { wch: 24 };
    if (c.key === 'injury_notes') return { wch: 46 };
    if (c.key === 'edfl_team') return { wch: 20 };
    if (c.key === 'injury_body_part') return { wch: 16 };
    if (c.key === 'since') return { wch: 14 };
    return { wch: 12 };
  });

  const legend = XLSX.utils.aoa_to_sheet(
    [['Code', 'Meaning']].concat(
      Object.keys(DESIGNATIONS).map(function (code) {
        return [DESIGNATIONS[code].label, DESIGNATIONS[code].full];
      })
    ).concat([
      [],
      ['Since', 'The injury start date when Sleeper gives one, otherwise the date the designation last changed.'],
      ['Change', 'New, changed or cleared within the last seven days.'],
      ['Note', 'Injury status is reference data. It does not affect the cap, roster counts, or whether a move is legal.'],
    ])
  );
  legend['!cols'] = [{ wch: 14 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Injury Report');
  XLSX.utils.book_append_sheet(wb, legend, 'Key');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ---- PDF -------------------------------------------------------------------

// jspdf-autotable does NOT export the same shape everywhere, and this cost a
// smoke test to find. Under Node's own ESM loader the callable is at
// mod.default.default, so `mod.default || mod` -- the spelling used by
// app/bids/results/[tierId]/export/route.js -- resolves to a plain object and
// calling it throws "autoTable is not a function". Webpack's interop happens to
// unwrap it, which is why that route works when Next bundles it.
//
// Rather than depend on which loader is in play, resolve every published shape,
// and fall back to the plugin form -- importing the module installs
// doc.autoTable() on jsPDF's prototype, and that is stable across all of them.
// SR-16: a speculative single spelling would buy the appearance of coverage.
function drawTable(doc, mod, options) {
  let fn = null;
  if (typeof mod === 'function') fn = mod;
  else if (mod && typeof mod.default === 'function') fn = mod.default;
  else if (mod && mod.default && typeof mod.default.default === 'function') fn = mod.default.default;

  if (fn) {
    fn(doc, options);
    return;
  }
  if (typeof doc.autoTable === 'function') {
    doc.autoTable(options);
    return;
  }
  throw new Error('jspdf-autotable exported no callable and installed no plugin.');
}

async function buildPdf(rows, f, lastRun) {
  const jspdfMod = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const JsPDF = jspdfMod.jsPDF || jspdfMod.default;

  // Landscape: ten columns and a free-text note column do not fit portrait
  // without wrapping the note into a column of confetti.
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('EDFL Injury Report', margin, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(asOfLine(lastRun), margin, 23);

  doc.setFontSize(8);
  doc.text(filterSentence(f) + '  ·  ' + rows.length + ' players', margin, 28.5);
  doc.text(
    'Reference only: an injury designation has no effect on the cap, roster counts, or the legality of any move.',
    margin,
    33
  );

  const head = [REPORT_COLUMNS.map(function (c) { return c.label; })];
  const body = rows.map(function (r) {
    return REPORT_COLUMNS.map(function (c) {
      const v = exportCell(r, c.key);
      return c.key === 'since' && v ? formatDate(v) : v;
    });
  });

  drawTable(doc, autoTableMod, {
    startY: 37,
    head: head,
    body: body,
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: { fillColor: [235, 235, 235], textColor: 40, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 36 },
      1: { cellWidth: 11 },
      2: { cellWidth: 13 },
      3: { cellWidth: 20 },
      4: { cellWidth: 24 },
      5: { cellWidth: 34 },
      6: { cellWidth: 22 },
      7: { cellWidth: 17 },
      8: { cellWidth: 20 },
      9: { cellWidth: 'auto' },
    },
  });

  let y = doc.lastAutoTable.finalY + 8;
  if (y > 175) {
    doc.addPage('a4', 'landscape');
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('What the codes mean', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  Object.keys(DESIGNATIONS).forEach(function (code) {
    const d = DESIGNATIONS[code];
    doc.text(d.label + '  —  ' + d.full, margin, y);
    y += 4;
  });

  return Buffer.from(doc.output('arraybuffer'));
}

// ---- route -----------------------------------------------------------------

function textError(message, status) {
  return new NextResponse(message + '\n', {
    status: status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request) {
  // The page is login-gated and the view is granted to authenticated only, so a
  // signed-out request would get an empty file rather than a refusal. Refuse
  // explicitly: an empty spreadsheet that looks complete is worse than a 401.
  const me = await getCurrentTeamOwner();
  if (!me) return textError('Log in to download the Injury Report.', 401);

  const url = new URL(request.url);
  const format = String(url.searchParams.get('format') || 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'xlsx' && format !== 'pdf') {
    return textError('Unknown format. Use format=csv, format=xlsx or format=pdf.', 400);
  }

  const scopeParam = String(url.searchParams.get('scope') || 'rostered');
  const f = {
    scope: ['rostered', 'free', 'all'].indexOf(scopeParam) === -1 ? 'rostered' : scopeParam,
    position: String(url.searchParams.get('position') || 'ALL'),
    team: String(url.searchParams.get('team') || 'ALL'),
    q: String(url.searchParams.get('q') || ''),
  };

  const supabase = await createSupabaseServerClient();

  let rows;
  let lastRun = null;
  try {
    const raw = await fetchAllReportRows(supabase);
    rows = sortForExport(applyFilters(raw.map(shapeRow), f));

    const { data } = await supabase
      .from('injury_sync_runs')
      .select('id, completed_at, trigger_source')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastRun = data || null;
  } catch (err) {
    return textError(
      'Could not load the report: ' + (err && err.message ? err.message : String(err)),
      500
    );
  }

  // The as-of date is in the FILENAME as well as inside the file. These get
  // saved, mailed and opened a week later, and a file called
  // edfl-injury-report.pdf with no date on it is how a stale one gets quoted
  // as current.
  const stamp = lastRun && lastRun.completed_at
    ? new Date(lastRun.completed_at).toISOString().slice(0, 10)
    : 'not-pulled';
  const base = 'edfl-injury-report-' + f.scope + '-' + stamp;

  let body;
  let mime;
  let ext;
  try {
    if (format === 'csv') {
      body = buildCsv(rows, f, lastRun);
      mime = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else if (format === 'xlsx') {
      body = await buildXlsx(rows, f, lastRun);
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = 'xlsx';
    } else {
      body = await buildPdf(rows, f, lastRun);
      mime = 'application/pdf';
      ext = 'pdf';
    }
  } catch (err) {
    return textError(
      'Could not build the ' + format + ' export: ' + (err && err.message ? err.message : String(err)),
      500
    );
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': 'attachment; filename="' + base + '.' + ext + '"',
      'Cache-Control': 'no-store',
    },
  });
}
