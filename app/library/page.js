import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { libraryIndex } from '../../lib/library';
import Breadcrumbs from '../../components/Breadcrumbs';

export const revalidate = 0;
export const metadata = { title: 'Library' };

/**
 * THE LEAGUE LIBRARY -- /library. September 29, 2026.
 *
 * The door to the three governing documents. Versions and dates are read out
 * of the documents themselves (lib/library.js), never typed here, so this page
 * cannot claim a version the text does not carry.
 *
 * The open-feedback counts come from library_feedback_feed through the
 * session client. If that read fails the counts are simply not drawn -- a
 * count is a convenience on this page, not its content, so it fails open.
 */
export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent('/library'));

  const docs = libraryIndex();

  const { data: fb, error } = await supabase
    .from('library_feedback_feed')
    .select('doc_slug, status')
    .range(0, 4999);

  const counts = {};
  if (!error && fb) {
    for (const r of fb) {
      const c = counts[r.doc_slug] || { total: 0, open: 0 };
      c.total += 1;
      if (r.status === 'open') c.open += 1;
      counts[r.doc_slug] = c;
    }
  }

  return (
    <main className="page lib-page">
      <Breadcrumbs trail={[{ label: 'Library' }]} />
      <div className="eyebrow">League Library</div>
      <h1>Rule Book and manuals</h1>
      <p className="subhead">
        The league&apos;s three governing documents, always the current version. The Rule Book
        governs: where either manual differs from it, the Rule Book is right and the manual is
        the defect.
      </p>

      <div className="lib-cards">
        {docs.map((d) => {
          const c = counts[d.slug];
          return (
            <div className="lib-card" key={d.slug}>
              <div className="lib-card-ask">{d.answers}</div>
              <h2 className="lib-card-title">
                <a href={'/library/' + d.slug}>{d.fullTitle}</a>
              </h2>
              <div className="lib-card-ver">
                {d.version ? 'Version ' + d.version : 'Current version'}
                {d.date ? ' · ' + d.date : ''}
              </div>
              <p className="lib-card-blurb">{d.blurb}</p>
              <div className="lib-card-links">
                <a className="btn" href={'/library/' + d.slug}>
                  Read
                </a>
                {d.downloads.map((x) => (
                  <a key={x.format} className="btn" href={'/library/' + d.slug + '/download/' + x.format}>
                    {x.label}
                  </a>
                ))}
              </div>
              <a className="lib-card-fb" href={'/library/' + d.slug + '#feedback'}>
                {c && c.total
                  ? c.total + ' feedback ' + (c.total === 1 ? 'item' : 'items') + ' · ' + c.open + ' open'
                  : 'Leave feedback'}
              </a>
            </div>
          );
        })}
      </div>
    </main>
  );
}
