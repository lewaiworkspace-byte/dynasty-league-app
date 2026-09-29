import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { readFigure } from '../../../../lib/library';

export const dynamic = 'force-dynamic';

/**
 * HOW-TO SCREENSHOTS -- /library/figures/<name>. September 29, 2026.
 *
 * The URL has NO .jpg on purpose. middleware.js's matcher skips any path
 * ending in .jpg, so a URL with the extension would be served to anybody --
 * and these are pictures of the live app. Without it, the middleware gates
 * the request like any page, and this handler checks the session again.
 *
 * public/sw.js never caches these (it caches the shell only); the browser may
 * keep them privately for a day, which is fine -- a screenshot changes only
 * with a new manual, and a new manual is a new deploy.
 */
export async function GET(request, { params }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Sign in to view this image.', { status: 401 });

  const bytes = readFigure(params.name);
  if (!bytes) return new Response('Not found.', { status: 404 });

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
