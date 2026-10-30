// PAGE UNTIL EXHAUSTED, for a server read that must be complete.
//
// PostgREST caps an unbounded select at 1,000 rows and returns no error, so a
// read that has to return every row pages explicitly and stops on a short page.
// This was two identical copies, in app/trades/page.js and app/trades/new/page.js,
// before the admin pages needed it too; it lives here once so the copies cannot
// drift. (lib/statsHelpers.js keeps its own fetchAllPages: it throws, and it
// hardcodes the stats view's order.)
//
// THE ORDER MUST BE UNIQUE. Without a stable, unique ORDER BY, consecutive
// .range() pages can overlap or skip rows and the result still looks normal.
// orderColumn is appended AFTER any .order() the builder already applied, so a
// caller that wants a display order passes it in the builder and names a unique
// column here as the tiebreaker -- e.g. .order('start_year') then 'id'.
//
// RETURNS ITS ERROR, never throws (CLAUDE.md ground rule 9): { rows, error },
// where rows holds whatever arrived before the failure. A caller must check
// error and must not render a partial list as if it were the whole.
//
// buildQuery is called once per page and must return a fresh query each time.
export async function fetchAllRows(buildQuery, orderColumn) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await buildQuery()
      .order(orderColumn)
      .range(from, from + pageSize - 1);
    if (error) return { rows: all, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { rows: all, error: null };
}
