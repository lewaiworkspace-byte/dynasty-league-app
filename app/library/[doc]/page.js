import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import { loadDoc, findDoc } from '../../../lib/library';
import { formatDateTime } from '../../../lib/formatDate';
import Breadcrumbs from '../../../components/Breadcrumbs';
import LibraryFeedback from '../../../components/LibraryFeedback';

export const revalidate = 0;

export async function generateMetadata({ params }) {
  const doc = findDoc(params.doc);
  return { title: doc ? doc.title : 'Library' };
}

/**
 * ONE DOCUMENT -- /library/rule-book, /library/how-to, /library/technical-manual.
 * September 29, 2026.
 *
 * Rendered on the server from content/library/<slug>.md (lib/library.js). The
 * page has its own session gate as well as the middleware's -- belt and
 * braces, as CLAUDE.md asks of every page with a gate.
 *
 * Section links are stable: /library/rule-book#s-5-17 (see lib/library.js).
 * The Technical Manual's numbered headings carry a jump to the same Rule Book
 * section where one exists.
 *
 * Feedback sits at the foot. The feed is read through the SESSION client so
 * RLS decides what comes back; a failed read is shown as a failure, never as
 * "no feedback yet".
 */
export default async function LibraryDocPage({ params, searchParams }) {
  const slug = params.doc;
  const doc = findDoc(slug);
  if (!doc) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent('/library/' + slug));

  const crossIds = slug === 'technical-manual' ? loadDoc('rule-book').ids : null;
  const rendered = loadDoc(slug, crossIds);

  const [owner, feedRes] = await Promise.all([
    getCurrentTeamOwner(),
    supabase
      .from('library_feedback_feed')
      .select(
        'feedback_id, doc_version, section_id, section_label, body, status, created_at,' +
          ' author_owner_id, author_team_name, response, responded_at, responder_role'
      )
      .eq('doc_slug', slug)
      .order('created_at', { ascending: false })
      .order('feedback_id', { ascending: true })
      .range(0, 499),
  ]);

  const items = (feedRes.data || []).map((r) => ({
    ...r,
    createdLabel: formatDateTime(r.created_at),
    respondedLabel: r.responded_at ? formatDateTime(r.responded_at) : null,
  }));

  const initialSection =
    searchParams && typeof searchParams.section === 'string' ? searchParams.section : '';

  return (
    <main className="page lib-page">
      <Breadcrumbs trail={[{ label: 'Library', href: '/library' }, { label: doc.title }]} />

      <div className="eyebrow">League Library</div>
      <h1>{doc.fullTitle}</h1>
      <p className="subhead">
        {rendered.version ? 'Version ' + rendered.version : 'Current version'}
        {rendered.date ? ' — ' + rendered.date : ''}. {doc.answers}
      </p>

      <div className="lib-actions">
        {doc.downloads.map((d) => (
          <a key={d.format} className="btn" href={'/library/' + slug + '/download/' + d.format}>
            Download {d.label}
          </a>
        ))}
        <a className="btn" href="#feedback">
          Feedback{items.length ? ' (' + items.length + ')' : ''}
        </a>
      </div>

      <div className="lib-layout">
        <aside className="lib-toc" aria-label="Contents">
          <details className="lib-toc-box" open>
            <summary>Contents</summary>
            <nav>
              {rendered.toc.map((g, gi) => (
                <details key={(g.id || 'intro') + gi} className="lib-toc-group">
                  <summary>{g.id ? <a href={'#' + g.id}>{g.text}</a> : g.text}</summary>
                  {g.children.length ? (
                    <ul>
                      {g.children.map((c) => (
                        <li key={c.id} className={'lib-toc-l' + c.level}>
                          <a href={'#' + c.id}>{c.text}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
              ))}
              <div className="lib-toc-foot">
                <a href="#feedback">Feedback</a>
              </div>
            </nav>
          </details>
        </aside>

        <div className="lib-main">
          <article
            className="lib-doc"
            // The HTML is rendered on the server from our own markdown, with
            // raw HTML escaped (lib/library.js).
            dangerouslySetInnerHTML={{ __html: rendered.html }}
          />

          <LibraryFeedback
            docSlug={slug}
            docVersion={rendered.version}
            sections={rendered.sections}
            initialSection={initialSection}
            items={items}
            myOwnerId={owner ? owner.id : null}
            canPost={Boolean(owner)}
            isOfficer={isCommissionerOrCo(owner)}
            readError={feedRes.error ? feedRes.error.message || 'unknown error' : null}
          />
        </div>
      </div>
    </main>
  );
}
