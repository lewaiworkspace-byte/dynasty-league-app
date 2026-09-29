import { createSupabaseServerClient } from '../../../../../lib/supabaseServerClient';
import { readDownload } from '../../../../../lib/library';

export const dynamic = 'force-dynamic';

/**
 * DOWNLOAD A DOCUMENT -- /library/<slug>/download/<docx|md>.
 * September 29, 2026.
 *
 * Gated here as well as by middleware.js: a route handler is not a page and
 * nothing else stands in front of it. The file list is closed (lib/library.js
 * DOWNLOAD_FILES) -- nothing the URL says can name a file outside it.
 */
export async function GET(request, { params }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Sign in to download league documents.', { status: 401 });

  const file = readDownload(params.doc, params.format);
  if (!file) return new Response('Not found.', { status: 404 });

  return new Response(file.bytes, {
    status: 200,
    headers: {
      'Content-Type': file.type,
      'Content-Disposition': 'attachment; filename="' + file.name + '"',
      'Cache-Control': 'private, no-store',
    },
  });
}
