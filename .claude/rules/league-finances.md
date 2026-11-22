---
paths:
  - "app/league-finances/**"
---

# League Finances

The league's Owner Cash page under League Office (`/league-finances`). Loads with
`app/league-finances/`. `cap-and-money-pages.md` loads with it.

- **Four tabs: Overview · Ledger · Outlook · Seasons** (UI test batch 27, November 15, 2026;
  Lewis's canvas "EDFL League Finances (Owner Cash) -- layout options", Option B). Tabs, the
  ledger's filter and team, and the season are query strings (`tab`, `f`, `team`, `season`) on
  this one page, plain anchors: a deep link opens the same view. **No page title** (the
  app-wide rule): a small heading row and the trail Home › League Office › League Finances.
- **The Outlook tab ends with the team accounts table** (Team, Issued, Paid, Fines, On hand,
  with the league's totals) — Lewis's comment on the canvas asked for it there. Keep it.
- **The page adds nothing up** (SR-23). Every total, share, bar width, heat shade and sentence
  is a column of one of six views (`league_finance_season`, `_team_accounts`, `_ledger`,
  `_ledger_items`, `_outlook`, `_outlook_by_team`; the Database Reference, §15). The page picks
  rows, groups ledger rows under the month the view names, and draws. **Do not total a
  filtered ledger in JavaScript**: the tiles over the ledger are the season's totals, whatever
  the filter. A sentence (`summary_sentence`, `team_sentence`, `outlook_sentence`,
  `outlook_team_sentence`) is rendered verbatim, never rebuilt from the figures beside it.
- **Which formatter**: what the league took (fines, cash paid, cash promised) is
  `formatCost`; cash still in a team's account is `formatRoom`; issued amounts, refunds and the
  League Fund are ledger facts, `formatMoney`. The views round paid and held to the cent first,
  so a league total of fourteenths does not floor a dollar low.
- **Every signed-in owner sees every team's Owner Cash ledger.** The six views are definer
  views granted to `authenticated` only, like `league_fines`; `team_cash_transactions`' own
  policy would show an owner only his team. **Read them with the session client**: through
  the anon client they refuse. An observer reads as well as an owner; nothing here writes.
- **The season row is the page.** If `league_finance_season` fails, an error and nothing else;
  each tab's other reads fail on their own line. A failed read never draws as an empty ledger
  or a `$0` account.
- **Open rulings show as "Awaiting ruling", never as a default**: how the League Fund is paid
  out at season end. Unspent Owner Cash is ruled (OC-1, read-backs confirmed Nov 20, 2026): it
  carries into the next League Year on March 1, a deficit included; "Into" says so. The outlook
  counts only cash promised on signed contracts; it never estimates a revenue share not yet
  voted. **Closing a season** (sign-off and lock) is drawn as "Coming soon" until it is ruled
  and built.
- **A ledger row with more than one entry is a `<details>`** listing every entry in it, whatever
  team is picked (the row's amount covers them all). A reversed pair is one row that nets to
  $0, struck through; the views decide what is a reversal.
