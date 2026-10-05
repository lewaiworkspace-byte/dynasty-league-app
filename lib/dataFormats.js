// THE DATA CENTER'S FILE FORMATS -- October 5, 2026.
//
// Turns a loaded dataset (lib/dataExports.js loadDataset()) into CSV, XLSX or
// Markdown. The download route and the Claude connector both use these, so a
// file downloaded from /data and the same dataset read by Claude are
// byte-for-byte the same shape.
//
// CSV IS MACHINE-FIRST: the header row is row 1 and uses column KEYS, with no
// provenance lines above it (unlike the injury report's human-first CSV).
// That is what lets a spreadsheet, pandas, or Claude read it without being
// told to skip rows. The as-of date lives in the filename instead.
//
// XLSX IS HUMAN-FIRST: column LABELS on the Data sheet, and a second sheet,
// About, with the as-of stamp, filters, units and the column dictionary.
//
// MARKDOWN IS CLAUDE-FIRST: a header block (what, when, filters, units), a
// column dictionary, then the table with column keys. Everything Claude needs
// to read the numbers correctly travels inside the file.
//
// VALUES ARE TO THE CENT -- no dollar rounding, no currency symbols. See the
// header of lib/dataExports.js.

import { formatDateTime, EASTERN_TIME_ZONE } from './formatDate';
import { UNITS_NOTE, filterSentence, loadDataset, loadContext } from './dataExports';

export const FORMATS = {
  csv: { ext: 'csv', mime: 'text/csv; charset=utf-8', label: 'CSV' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
  md: { ext: 'md', mime: 'text/markdown; charset=utf-8', label: 'Markdown (for Claude)' },
};

function cellString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ---- CSV -------------------------------------------------------------------

function csvCell(v) {
  const s = cellString(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(ds, rows) {
  const keys = ds.columns.map(function (c) {
    return c.key;
  });
  const lines = [keys.map(csvCell).join(',')];
  rows.forEach(function (r) {
    lines.push(
      keys
        .map(function (k) {
          return csvCell(r[k]);
        })
        .join(',')
    );
  });
  return lines.join('\r\n') + '\r\n';
}

// ---- Markdown ------------------------------------------------------------------

function mdCell(v) {
  return cellString(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function metaLines(ds, loaded) {
  return [
    '- League: ' + loaded.ctx.leagueName,
    '- Dataset: `' + ds.key + '` -- ' + ds.title,
    '- As of: ' + formatDateTime(loaded.asOf),
    '- Current league season: ' + loaded.ctx.season,
    '- Filters: ' + filterSentence(loaded.ctx, loaded.filters),
    '- Rows: ' + loaded.rows.length,
  ];
}

export function mdTable(ds, rows) {
  const keys = ds.columns.map(function (c) {
    return c.key;
  });
  const out = [];
  out.push('| ' + keys.join(' | ') + ' |');
  out.push('|' + keys.map(function () { return '---'; }).join('|') + '|');
  rows.forEach(function (r) {
    out.push(
      '| ' +
        keys
          .map(function (k) {
            return mdCell(r[k]);
          })
          .join(' | ') +
        ' |'
    );
  });
  return out.join('\n');
}

export function mdDictionary(ds) {
  const out = ['| Column | Label | Meaning |', '|---|---|---|'];
  ds.columns.forEach(function (c) {
    out.push('| `' + c.key + '` | ' + mdCell(c.label) + ' | ' + mdCell(c.about) + ' |');
  });
  return out.join('\n');
}

export function toMarkdown(ds, loaded, opts) {
  const o = opts || {};
  const parts = [];
  parts.push((o.headingLevel === 2 ? '## ' : '# ') + 'EDFL data: ' + ds.title);
  parts.push('');
  parts.push(metaLines(ds, loaded).join('\n'));
  parts.push('');
  parts.push(ds.about);
  parts.push('');
  parts.push(UNITS_NOTE + ' Blank cells are empty in the database, not zero. Timestamps are ISO 8601 (UTC offsets included); league deadlines are Eastern time.');
  if (!o.skipDictionary) {
    parts.push('');
    parts.push((o.headingLevel === 2 ? '### ' : '## ') + 'Columns');
    parts.push('');
    parts.push(mdDictionary(ds));
  }
  parts.push('');
  parts.push((o.headingLevel === 2 ? '### ' : '## ') + 'Data');
  parts.push('');
  parts.push(loaded.rows.length ? mdTable(ds, loaded.rows) : '_No rows match these filters._');
  parts.push('');
  return parts.join('\n');
}

// ---- XLSX --------------------------------------------------------------------

export async function toXlsx(ds, loaded) {
  // Dynamic import and XLSX.write (not writeFile) -- same call shape as the
  // injury report export. Do not bump the pinned xlsx version (CLAUDE.md).
  // Resolve both shapes: webpack's interop puts utils on the namespace, Node's
  // own ESM loader puts the CommonJS module on .default.
  const mod = await import('xlsx');
  const XLSX = mod && mod.utils ? mod : mod.default;
  const header = ds.columns.map(function (c) {
    return c.label;
  });
  const body = loaded.rows.map(function (r) {
    return ds.columns.map(function (c) {
      const v = r[c.key];
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  });
  const sheet = XLSX.utils.aoa_to_sheet([header].concat(body));
  sheet['!cols'] = ds.columns.map(function (c, i) {
    let w = String(c.label).length;
    for (let j = 0; j < body.length && j < 400; j++) {
      const s = body[j][i] === null ? '' : String(body[j][i]);
      if (s.length > w) w = s.length;
    }
    return { wch: Math.min(Math.max(w + 2, 8), 60) };
  });
  if (body.length) {
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: header.length - 1 } }) };
  }

  const about = [['EDFL data: ' + ds.title]]
    .concat(
      metaLines(ds, loaded).map(function (l) {
        return [l.replace(/^- /, '').replace(/`/g, '')];
      })
    )
    .concat([[], [ds.about], [UNITS_NOTE], [], ['Column', 'Key', 'Meaning']])
    .concat(
      ds.columns.map(function (c) {
        return [c.label, c.key, c.about];
      })
    );
  const aboutSheet = XLSX.utils.aoa_to_sheet(about);
  aboutSheet['!cols'] = [{ wch: 30 }, { wch: 28 }, { wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Data');
  XLSX.utils.book_append_sheet(wb, aboutSheet, 'About');
  // compression: true is not optional. Uncompressed, one season of
  // stats_games is ~9 MB -- past Vercel's 4.5 MB response limit.
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
}

// ---- filename ------------------------------------------------------------------

function easternDate(iso) {
  // en-CA gives YYYY-MM-DD. Eastern, so a file pulled at 9 PM ET on the 5th
  // is not stamped the 6th.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: EASTERN_TIME_ZONE });
}

export function fileBase(key, loaded) {
  const bits = ['edfl', key.replace(/_/g, '-')];
  const f = loaded ? loaded.filters : {};
  if (f.season) bits.push(String(f.season));
  if (f.team) {
    const t = loaded.ctx.teamById.get(f.team);
    bits.push(t && t.abbrev ? t.abbrev.toLowerCase() : 'team');
  }
  if (f.position) bits.push(f.position.toLowerCase());
  bits.push(easternDate(loaded ? loaded.asOf : new Date().toISOString()));
  return bits.join('-');
}

// ---- the briefing pack ------------------------------------------------------------
//
// One Markdown file holding the datasets an owner most often wants to hand
// Claude at once -- drop it into a Claude project or chat and ask questions.
// Each section is the ordinary dataset (same loader, same columns); `limit`
// trims the long lists to their top rows and the section says so.


export const BRIEFING = [
  { key: 'standings' },
  { key: 'team_cap' },
  { key: 'team_cash', seasonIsCurrent: true },
  { key: 'rosters' },
  { key: 'draft_picks' },
  { key: 'player_values' },
  { key: 'free_agents', limit: 150 },
  { key: 'transactions', limit: 100 },
];

export async function buildBriefing(client) {
  let ctx;
  try {
    ctx = await loadContext(client);
  } catch (e) {
    return { ok: false, status: 500, message: 'Could not load the league: ' + (e && e.message ? e.message : String(e)) };
  }
  const asOf = new Date().toISOString();
  const parts = [
    '# EDFL briefing pack',
    '',
    '- League: ' + ctx.leagueName,
    '- As of: ' + formatDateTime(asOf),
    '- Current league season: ' + ctx.season,
    '- Teams: ' +
      ctx.teams
        .map(function (t) {
          return t.name + (t.abbrev ? ' (' + t.abbrev + ')' : '');
        })
        .join(', '),
    '',
    'A snapshot of the league for Claude: standings, every team\'s cap and cash, every roster, draft picks, the Player Value Chart, the best available free agents and recent transactions. Each section below is one Data Center dataset with its own column dictionary.',
    '',
    UNITS_NOTE,
    '',
  ];
  for (let i = 0; i < BRIEFING.length; i++) {
    const b = BRIEFING[i];
    const loaded = await loadDataset(client, b.key, b.seasonIsCurrent ? { season: ctx.season } : {}, ctx);
    if (!loaded.ok) {
      parts.push('## ' + b.key);
      parts.push('');
      parts.push('_This section could not be loaded: ' + loaded.message + '_');
      parts.push('');
      continue;
    }
    let note = '';
    if (b.limit && loaded.rows.length > b.limit) {
      note = 'Showing the first ' + b.limit + ' of ' + loaded.rows.length + ' rows; download the `' + b.key + '` dataset for all of them.';
      loaded.rows = loaded.rows.slice(0, b.limit);
    }
    parts.push(toMarkdown(loaded.ds, loaded, { headingLevel: 2 }));
    if (note) {
      parts.push('_' + note + '_');
      parts.push('');
    }
  }
  return { ok: true, text: parts.join('\n'), asOf: asOf, ctx: ctx };
}
