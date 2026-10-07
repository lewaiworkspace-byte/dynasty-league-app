---
paths:
  - "app/library/**"
  - "content/library/**"
  - "lib/library.js"
  - "components/LibraryFeedback.js"
  - "next.config.js"
---

# The League Library

Verbatim governing documents, private figures and open feedback.

- **`content/library/` holds VERBATIM copies of the governing documents; never edit them here.** Updating a document is a file swap from the commissioner's folder (`EDFL_Rule_Book_text.md` → `rule-book.md`, `EDFL_Technical_Manual_text.md` → `technical-manual.md`, `EDFL_Owner_HowTo_Manual.md` → `how-to.md`, `EDFL_Rule_Book.docx` → `rule-book.docx`, screenshots → `figures/`). Version and date on screen are parsed from the file's own `**Version X — date**` line, so **never type a version into a page**.
- **The screenshots are NOT in `public/`, and their URLs have no `.jpg`, on purpose.** The middleware matcher skips `*.jpg`, so either would serve pictures of the live app to anybody (R-7). They go out through `/library/figures/[name]`, which the middleware gates and which checks the session again.
- **`experimental.outputFileTracingIncludes` in `next.config.js` is load-bearing.** The files are read with `fs` at request time; without the include Vercel may ship the functions without them and every Library request answers ENOENT after a green deploy.
- **Section anchors are `#s-<number with dashes>`** (`/library/rule-book#s-5-17`, `/library/how-to#s-5-4`) and are meant to be pasted into Discord. The documents promise stable numbering; **do not change the scheme**. Raw HTML in the markdown is escaped, never passed through.
- **Feedback is not sealed** (a commissioner ruling, unlike offers and claims): every owner sees every item with the team that left it. **Nothing is deleted** — an author's Withdraw sets `status = 'withdrawn'`, which the feed view hides. The officer's role on a reply is snapshotted on the row (`responder_role`) because `team_owners` RLS will not let an owner read an officer's row through a `security_invoker` view.
- **The Library CSS is the dated `.lib-*` block at the foot of `kit.css`.** Heading feedback links are `.lib-fblink`; `.lib-fb` is the feedback section — do not merge the two names.
