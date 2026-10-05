import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { loadDataset } from '../../../../lib/dataExports';
import { FORMATS, toCsv, toXlsx, toMarkdown, fileBase, buildBriefing } from '../../../../lib/dataFormats';

/**
 * DATA CENTER DOWNLOAD -- /data/export/<dataset>?format=csv|xlsx|md
 *                         &season=&team=&position=
 * October 5, 2026.
 *
 * Gated here AND by middleware.js: a route handler has no page gate behind it
 * (same posture as /library/[doc]/download/[format]). Signed out is a 401 with
 * a sentence, never an empty file that looks complete.
 *
 * Reads through the SESSION client, so RLS applies as the owner. The datasets
 * themselves are league-wide by construction (lib/dataExports.js header), so
 * this returns exactly what the Claude connector returns for the same query.
 *
 * <dataset> = 'briefing' is the one-file Markdown pack (lib/dataFormats.js
 * BRIEFING); it has no CSV or Excel form.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function textError(message, status) {
  return new NextResponse(message + '\n', {
    status: status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function fileResponse(body, mime, filename) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(request, { params }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return textError('Sign in to download league data.', 401);

  const url = new URL(request.url);
  const format = String(url.searchParams.get('format') || 'csv').toLowerCase();
  if (!FORMATS[format]) return textError('Unknown format. Use format=csv, format=xlsx or format=md.', 400);

  const key = String(params.dataset || '');

  if (key === 'briefing') {
    if (format !== 'md') return textError('The briefing pack is Markdown only. Use format=md.', 400);
    const b = await buildBriefing(supabase);
    if (!b.ok) return textError(b.message, b.status || 500);
    const stamp = new Date(b.asOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return fileResponse(b.text, FORMATS.md.mime, 'edfl-briefing-' + stamp + '.md');
  }

  const loaded = await loadDataset(supabase, key, {
    season: url.searchParams.get('season'),
    team: url.searchParams.get('team'),
    position: url.searchParams.get('position'),
  });
  if (!loaded.ok) return textError(loaded.message, loaded.status || 500);

  const name = fileBase(key, loaded) + '.' + FORMATS[format].ext;
  try {
    if (format === 'csv') return fileResponse(toCsv(loaded.ds, loaded.rows), FORMATS.csv.mime, name);
    if (format === 'md') return fileResponse(toMarkdown(loaded.ds, loaded), FORMATS.md.mime, name);
    const buf = await toXlsx(loaded.ds, loaded);
    return fileResponse(buf, FORMATS.xlsx.mime, name);
  } catch (e) {
    return textError('Could not build the ' + format + ' file: ' + (e && e.message ? e.message : String(e)), 500);
  }
}
