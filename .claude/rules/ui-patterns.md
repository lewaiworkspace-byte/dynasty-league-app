---
paths:
  - "app/**/*.js"
  - "components/**/*.js"
---

# Page and component patterns

Decisions about how pages read, fail and render that apply across the app.

### Pages and components

- **Do not hard-code a year range, a count, or a first and last season** for a strip built
  from data. That assumption has been wrong twice.
- **Do not unwrap the nested elements in a history cell** — every child of that cell is a
  flex item, and bare siblings lay the lines out side by side instead of stacked.
- **A page's reads do not all fail the same way, deliberately.** A read that *is* a
  panel's content fails closed — no panel, a banner instead, because an empty table looks
  like a working one. A read that only *supplies settings* fails open — the page renders on
  its fallback and says so, naming the value in use when it changes which controls are
  offered. **Do not make these consistent** in either direction.
- **A message written for verbatim display is rendered unchanged.** Do not paraphrase it
  or rebuild the sentence from the counts beside it.
- **Do not re-sort or re-key an already-sorted list** returned ordered by the view.
- **Unrecognised statuses fall through to the raw string** rather than being guessed at.
