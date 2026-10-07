---
paths:
  - "CLAUDE.md"
  - ".claude/**"
---

# Maintaining CLAUDE.md and the rule files

Loads when you open `CLAUDE.md` or anything under `.claude/`.

**These files hold three things and nothing else:** how to behave in this repo, its
conventions and structure, and decisions that must not be undone. Every entry describes
**code**, and each says **why**, because a rule without a reason gets tidied away by the next
reader.

**What does not belong:** league state, row counts, version numbers, what has shipped, what any
rule currently says, and any folder path or checkout name. One found here is a defect, not a
fact. A previous version carried all of it, went stale in place and gave several sessions
confident wrong premises; it once named a retired checkout, in capitals, twice. Put those in
the to-do list or the reference documents.

**Where an entry goes.** The root `CLAUDE.md` holds only what every session needs and stays under
200 lines; the edit hook and the GitHub check enforce it. An entry that protects particular code
goes in the `.claude/rules/` file for that area. **Every rule file starts with `paths:`
frontmatter** listing the files it protects: a rule file without it loads in every session,
which is the root's job. Write plain `**` globs and avoid `[` in a pattern, because glob syntax
reads it as a bracket expression — write `app/team/**`, never a pattern spelling out `[teamId]`.
A database fact belongs in the Database Reference, which is regenerated from the live database,
never in a rule file.

**Two failure modes have both happened, and the second is worse:** saying something that is no
longer true, and saying nothing where a reader will infer. A reader with no snapshot invents one
and reasons correctly to a wrong answer. The resolution is neither a snapshot nor silence:
**state the ignorance explicitly**, as ground rule 3 does.

**When an entry and the code disagree,** report it. Do not quietly edit the entry, and do not
change the code to match the entry. An entry marked *Under review* carries a known problem
awaiting a re-cut: keep its text, and do not rely on its stated reason.

**The repo wins on repo facts; the project chat wins on database facts.**

**Auto memory is off for this repo** (`autoMemoryEnabled: false` in `.claude/settings.json`). A
correction worth keeping becomes an entry here, through a handoff, where it is reviewed and
versioned with the code. A machine-local notebook is invisible to sessions started anywhere
else, and it is the stale snapshot this project keeps paying for.
