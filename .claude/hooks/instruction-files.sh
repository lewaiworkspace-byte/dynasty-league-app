#!/usr/bin/env bash
# PostToolUse hook (Edit|Write|MultiEdit). Keeps the root CLAUDE.md under its cap and every
# rule file scoped. Exit 2 hands the message to Claude; exit 0 says nothing.
root="${CLAUDE_PROJECT_DIR:-.}"
cap=200
problems=""
n=$(wc -l < "$root/CLAUDE.md" 2>/dev/null | tr -d ' ')
if [ -n "$n" ] && [ "$n" -gt "$cap" ]; then
  problems="CLAUDE.md is $n lines; the cap is $cap. Move what you added into the .claude/rules/ file for the code it protects and bring CLAUDE.md back under the cap before doing anything else."
fi
for f in "$root"/.claude/rules/*.md; do
  [ -e "$f" ] || continue
  if ! head -n 1 "$f" | grep -q '^---' || ! sed -n '2,40p' "$f" | sed '/^---/q' | grep -q '^paths:'; then
    problems="$problems ${f#"$root"/} has no paths: frontmatter, so it would load in every session. Add the files it protects."
  fi
done
if [ -n "$problems" ]; then
  echo "$problems" >&2
  exit 2
fi
exit 0
