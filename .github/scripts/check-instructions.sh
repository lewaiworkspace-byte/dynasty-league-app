#!/usr/bin/env bash
# The same instruction-file checks the Claude Code edit hook makes, run on every push.
set -u
fail=0
n=$(wc -l < CLAUDE.md | tr -d ' ')
echo "CLAUDE.md: $n lines (cap 200)"
if [ "$n" -gt 200 ]; then echo "::error file=CLAUDE.md::CLAUDE.md is $n lines; the cap is 200."; fail=1; fi
for f in .claude/rules/*.md; do
  [ -e "$f" ] || continue
  if ! head -n 1 "$f" | grep -q '^---' || ! sed -n '2,40p' "$f" | sed '/^---/q' | grep -q '^paths:'; then
    echo "::error file=$f::$f has no paths: frontmatter, so it would load in every session."; fail=1
  fi
done
for f in .claude/skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  m=$(wc -l < "$f" | tr -d ' ')
  if [ "$m" -gt 500 ]; then echo "::error file=$f::$f is $m lines; keep a skill under 500."; fail=1; fi
done
for f in .claude/hooks/*.sh .github/scripts/*.sh; do
  [ -e "$f" ] || continue
  if grep -q $'\r' "$f"; then echo "::error file=$f::$f has Windows line endings; bash cannot run it."; fail=1; fi
done
[ "$fail" -eq 0 ] && echo "Instruction files: all checks passed."
exit $fail
