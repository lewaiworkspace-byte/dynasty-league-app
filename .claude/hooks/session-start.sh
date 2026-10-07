#!/usr/bin/env bash
# SessionStart hook. Prints where this checkout stands so ground rule 1 starts from facts.
# Never blocks a session: every failure is reported as text and the script exits 0.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
echo "Checkout: $(git rev-parse --show-toplevel 2>/dev/null || echo 'not a git checkout')"
echo "Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)   HEAD: $(git log --oneline -1 2>/dev/null)"
if git fetch --quiet origin 2>/dev/null; then
  counts=$(git rev-list --left-right --count HEAD...origin/main 2>/dev/null)
  ahead=${counts%%[[:space:]]*}; behind=${counts##*[[:space:]]}
  echo "Against origin/main: ${ahead:-?} ahead, ${behind:-?} behind (ground rule 1 says what to do)"
else
  echo "Against origin/main: fetch failed, so compare by hand before reading or writing anything."
fi
echo "Uncommitted or untracked paths: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
exit 0
