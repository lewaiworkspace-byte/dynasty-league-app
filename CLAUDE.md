# CLAUDE.md — EDFL Dynasty League App

<!-- Root briefing: loads in every session. Its 200-line cap is flagged, not enforced: an edit
hook reports a breach right after the edit, and a GitHub check fails on a push to main or a
pull request. Restructured October 6, 2026 from the 1,169-line file at 105ef72 (`git show
105ef72:CLAUDE.md`); that batch's move map records where every entry went. -->

A briefing for Claude Code: conventions and decisions in this repo that a reader cannot
recover from the code. **It is not a source of truth. If the repo disagrees with anything
here, the repo wins** — report the discrepancy; do not silently reconcile it.

This file holds only what every session needs. Decisions that protect particular code live in
`.claude/rules/`, one file per area, each scoped to the files it protects: Claude Code loads a
rule file when you read or edit a matching file, which is when its warnings matter. **Nothing
here or there records league state, counts, versions, dates of things that change, or folder
paths** — the database and the governing documents carry those. Where you are is one command:
`git rev-parse --show-toplevel && git log --oneline -1`.

## What this is

Companion app for EDFL, a 10-team dynasty fantasy football league. The app is the league's
system of record for contracts, salary cap and Owner Cash; Sleeper is a data source only.
Live at dynasty-league-app-gold.vercel.app.

**This is the `ui-test` branch: the UI test site, not the live app.** A separate Vercel project
deploys it against a separate Supabase project (a copy of the data, with no scheduled jobs, no
Discord and no league email), so owners can review UI work safely. Its first commit adds the TEST
SITE banner (`components/TestSiteBanner.js`, a block at the foot of `kit.css`, and TEST in the
titles in `app/layout.js` and `app/manifest.js`). **Never push this branch to `main` and never
merge it there.** UI work proven here reaches the live app as a normal batch re-cut against `main`,
without the banner. Push nothing but `ui-test` from here.

**Stack:** Next.js 14, App Router, plain JavaScript (no TypeScript), Supabase (Postgres + RLS),
Vercel. **No path alias exists; all imports are relative.**

**Database facts live in `EDFL_Database_Reference_for_ClaudeCode.md`**, generated from the live
database; its version is on line 3. It mirrors the commissioner's copy: install a new cut by
copying it over whole and confirming the bytes match. Never hand-transcribe it, edit it in place,
or rename it to carry a version.

## Ground rules for every task

1. **Audit first, starting from `origin/main`.** This checkout is not the only thing that
   pushes — a session started from a phone runs in the cloud, pushes to `origin`, and never
   touches this working tree. **A clean tree can still be behind.** So before reading or
   writing anything:
   - `git fetch origin`, then compare local `main` with `origin/main`.
   - **Behind only:** `git merge --ff-only origin/main`.
   - **Ahead or diverged:** stop and report. Do not merge, rebase or push.
   - A handoff names the commit it was written against. If `HEAD` is not that commit, diff
     every target file between the two before replacing any of them — a complete file read
     from an older commit silently deletes whatever was added since.

   Then read the actual current state of every file you are about to touch and report
   findings before making changes. Documentation — including this file — has been wrong
   about repo state before. The repo is the truth. **Never force-push.**
2. **You have no database access, and the reference is the authority on what the
   database contains.**
   - **Do not write SQL and do not propose a migration.** Schema and function changes
     are made in the project chat. If a task appears to need a new table, view, column
     or function, **stop and say so** rather than designing around a guess.
   - **Do not infer schema from application code.** The app has been wrong about the
     database before; that is how this project lost a full session.
   - If the reference does not name something you need, **ask for a regenerated copy**.
     A missing name means the reference needs re-cutting, not that you should go looking
     for the object yourself.
   - **The absence of an object from the reference is not proof it does not exist.**
3. **You do not know the current state of the league** — not the standings, the rosters,
   who is over the cap, what has shipped, or what any rule currently says. **Do not infer
   any of it or reason from a remembered figure**; if a task depends on league state, stop
   and ask. A stale snapshot in a briefing once produced five confident wrong conclusions
   from otherwise correct reasoning.
4. **Complete files only** in any report or handoff — never diffs, never "change this
   line" instructions. When asked to paste a file verbatim, paste it verbatim.
   Summaries in place of contents have stalled builds twice.
5. **Confirm every push with a commit hash** in your report.
6. **Do not claim anything "builds" unless a build ran here.** There is no `.env.local`,
   and a Node runtime may or may not be present on this machine. If `npm run build` is
   available, run it and report the result; if it is not, say so. Either way the Vercel
   deploy is the real check. Flag anything needing a post-deploy click-through.
7. **Never `git add -A` or `git add .`** — add files by name, always. `.gitignore` covers
   only `node_modules`, `.next`, `.env.local` and `.vercel`, so **anything else that lands
   in the working tree is a candidate for the index**, including files a script or an
   import writes.
8. **Line endings are normalised on checkout.** To compare a file against a source,
   hash the committed blob (`git show HEAD:<file>`), never the working copy — the
   working copy's byte count will differ and mean nothing.
9. **Server Actions RETURN refusals; they do not throw them.** A **production build**
    masks every thrown message behind a generic render error, so a carefully-worded
    database refusal never reaches the owner — and dev shows the real message, so this
    cannot be caught locally. Return `{ ok: false, message }`, check `.ok` at the caller,
    and keep `.catch` for **genuine transport failures only**. No exported action throws;
    an internal helper may, only where every exported caller catches it.
10. **Enumerating write paths means following the data, not grepping for `.insert(`.**
    Some writes go through an RPC argument, which no insert-statement search surfaces. A
    grep-shaped inventory of "everything that writes table X" will silently omit every
    RPC-mediated write, and it did.
11. **Code arrives as a git bundle or a zip, never as text pasted from chat.** Chat rendering
    can alter backticks; if code ever does arrive as pasted text, check it against its source
    before using it. Template literals already in repo files are not suspect.

## Access, in brief (detail: `access.md`, `navigation.md`)

- **`middleware.js` is the front door.** Every path needs a session except a short allowlist,
  so a new route is closed by default. Some pages have no gate of their own and rely on it
  alone: editing the allowlist un-gates them all at once.
- **A page with its own gate uses two layers:** the page gate and an independent re-check in
  every Server Action. **Hiding a link is presentation, not access control**, and never a way
  to disable a write path.
- **`getCurrentViewer()` widens page gates and read-only loaders, nothing else.** Every Server
  Action that writes keeps calling `getCurrentTeamOwner()`, which returns null for the
  read-only observer login. Never hand an observer to code that reads `owner.team_id` or
  `owner.id`. The comment blocks in `lib/getCurrentTeamOwner.js` are the authority.
- **`isCommish` is the strict commissioner test** (`is_commissioner`); `isCommissionerOrCo()`
  is the officer test. Never swap one for the other.

## The database boundary, in brief (detail: `database-boundary.md`)

**Every rule that decides an outcome lives in the database.** The app collects input, calls a
function and surfaces the refusal it gets back, verbatim. No JavaScript decides a cut
settlement, withdrawal arithmetic or an option void year; a form may mirror a rule to warn
early (the 30% Rule, the poach floor), and when the two disagree the database is right. **Use
the session client for anything that gates on `auth.uid()`** — through the service-role client
it is NULL. A sentence the league reads is built in SQL once; the app never composes a second.

## Money and dates, in brief (detail: `money-and-dates.md`)

- **`lib/formatMoney.js` is the only money formatter, and the direction is in the name:**
  `formatCost` (anything the league takes) rounds up, `formatRoom` (anything still spendable)
  rounds down, `formatMoney` (a ledger fact) rounds half away from zero. Migrate call sites
  one at a time; never bulk-rename.
- **PPV is not money.** Draw it as a bare number, never with `$`.
- **A blank must never read as compliant.** A failed read renders an error, never an empty or
  all-clear panel, and `$0` is never printed for a question that has no meaning.
- **Dates:** render with `lib/formatDate.js`, which pins America/New_York; never
  `toLocaleString()` in a client component. A dated rule is a calendar row, never a constant.

## Shared modules

`lib/` holds single implementations: identity and the two gates (`getCurrentTeamOwner.js`),
the three Supabase clients, `formatMoney.js`, `formatDate.js`, `safeNext.js` and the rest
(listed in `libraries.md`). **Single-implementation modules stay single** — if you find
yourself writing a second copy of one, stop and import it instead.

## What this repo enforces mechanically

`.claude/settings.json` denies the Supabase tools, editing any `.sql` file, `git add -A`,
`git add --all` and `git add .`, and turns off Claude Code's auto memory for this repo: a
durable lesson goes into this file or a rule file through a handoff, never into a private
notebook. A session-start hook prints where this checkout stands against `origin/main`; an
edit hook reports, right after an edit, when this file passes 200 lines or a rule file has no
`paths:`. It does not undo the edit, so fix the breach at once. **If a denial or a hook fires,
report it — never work around it.** A GitHub check on every push to `main` and every pull
request runs the production build and the same instruction-file checks; nothing requires it
to pass before a push lands.

## The rule files (`.claude/rules/`)

**Cross-cutting**, loaded once you open app code: `money-and-dates`, `data-fetching`,
`ui-patterns`, `markup-and-css`, `libraries`. `database-boundary` loads with Server Actions,
route handlers, `lib/` and the admin pages.
**Platform:** `access`, `navigation`, `pwa`, `design-system`, and `instructions` (how to
maintain these files).
**Areas:** `team-hq`, `cap-and-money-pages`, `cuts-and-contracts`, `free-agency-and-poaching`,
`auction`, `trades`, `waivers`, `scoreboard-and-matchups`, `stats-and-imports`, `injuries`,
`library`, `data-center`, `settings-and-owner-info`, `transaction-log`, `player-card`,
`admin-portal`.

A rule file is named for what it protects, not for when it was written. Read one directly when
a task spans an area whose files you have not opened yet.

## Keeping this file honest

Update this file or the right rule file **in the same commit** as the change that alters
established behaviour, and report the hash. When an entry is superseded, replace it: these
files must shrink as often as they grow. A new "do not undo" entry goes in the rule file for
the code it protects, never here. `instructions.md` carries the rest and loads when you edit
any of these files.
