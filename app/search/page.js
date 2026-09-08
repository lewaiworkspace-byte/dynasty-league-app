import { redirect } from 'next/navigation';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { MIN_QUERY_LENGTH } from '../../lib/playerSearch';
import { searchPlayers } from './actions';
import SearchPanel from './SearchPanel';

export const revalidate = 0;
export const metadata = { title: 'Player Search' };

// LOGIN ONLY -- NO COMMISSIONER CHECK. The same shape as /restructure and
// /values: a search over player names is a League surface and shows every
// signed-in owner exactly the same rows. search_players() is granted to
// authenticated and had its anon grant revoked on September 8 2026, so this
// redirect and the grant agree; a signed-out visitor could not read anything
// here even if the page rendered.
//
// THE QUERY COMES FROM THE URL AND THE FIRST SEARCH RUNS HERE, ON THE SERVER.
// That is what makes /search?q=kittle a link somebody can send, a bookmark
// somebody can reload, and a page that comes back with its results already on
// it rather than blank until an effect fires. The client component takes over
// from there; this runs once per navigation.
export default async function SearchPage({ searchParams }) {
  const raw = searchParams ? searchParams.q : '';
  const first = Array.isArray(raw) ? raw[0] : raw;
  const query = typeof first === 'string' ? first.trim() : '';

  const me = await getCurrentTeamOwner();
  if (!me) {
    // Carry the query through the login round trip, encoded, so an owner who
    // followed a shared link lands back on the results and not on an empty
    // box. safeNext() accepts a path with a query string and rejects
    // everything that is not plainly internal.
    const back = query ? '/search?q=' + encodeURIComponent(query) : '/search';
    redirect('/login?next=' + encodeURIComponent(back));
  }

  let initialRows = [];
  let initialError = null;
  if (query.length >= MIN_QUERY_LENGTH) {
    const res = await searchPlayers(query);
    if (res.ok) initialRows = res.data;
    // Captured, not discarded. An empty list and a failed read are opposite
    // claims, and the panel says which one this is.
    else initialError = res.message;
  }

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
      </p>
      <p className="eyebrow">EDFL</p>
      <h1>Player Search</h1>
      <p className="subhead">
        Look up any player in the league by name and open his card. Punctuation and word
        order do not matter &mdash; &ldquo;aj brown&rdquo;, &ldquo;a.j. brown&rdquo; and
        &ldquo;brown aj&rdquo; all find the same man.
      </p>
      <SearchPanel
        initialQuery={query}
        initialRows={initialRows}
        initialError={initialError}
      />
    </main>
  );
}
