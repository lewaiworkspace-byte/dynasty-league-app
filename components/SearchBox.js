'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// THE APP BAR'S SEARCH BOX, and it is deliberately dumb.
//
// No dropdown, no inline results, no data fetching of any kind. It takes a
// string and navigates to /search?q=<string>, and that is the whole of it.
// The page is the surface: a second results renderer living in the chrome of
// every route would be a second data path to keep in step with the first, and
// this repo already knows how that ends.
//
// It is its own file because components/AppBar.js is an async Server Component
// that reads cookies(). A box needs onChange and onSubmit, so it cannot be
// inlined there -- the same reason SignOutButton.js sits beside it.
//
// NOT A GATE. AppBar draws this only for a signed-in owner, but /search keeps
// its own redirect and search_players() keeps its own grant. Hiding a box
// protects nobody; it stops showing somebody a door they cannot open.
//
// NO NEW CSS. The input is inline style over the theme's own custom
// properties, which is what everything in the app bar that is not wearing
// .theme-toggle already does. .theme-toggle itself is wrong here: it
// uppercases its text, which would render a typed player name in capitals.
// 16px is deliberate -- iOS zooms the page on focus for anything smaller, and
// .admin-form input picks 16px for the same reason.

const formStyle = {
  display: 'flex',
  flex: '0 1 auto',
};

const inputStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontFamily: 'var(--font-body), sans-serif',
  fontSize: 16,
  minHeight: 'var(--tap)',
  padding: '6px 10px',
  width: 170,
  maxWidth: '100%',
};

export default function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;
    router.push('/search?q=' + encodeURIComponent(text));
  }

  return (
    <form role="search" style={formStyle} onSubmit={handleSubmit}>
      <input
        type="search"
        value={query}
        placeholder="Search players"
        aria-label="Search players"
        style={inputStyle}
        onChange={function (e) {
          setQuery(e.target.value);
        }}
      />
    </form>
  );
}
