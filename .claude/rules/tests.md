---
paths:
  - "tests/**"
  - "package.json"
  - "lib/contractMath.js"
  - "lib/leagueMinimum.js"
  - "lib/bidMath.js"
  - "lib/ppvMath.js"
  - "lib/deadCapPreview.js"
---

# The test suite

`npm test` runs Node's built-in test runner over `tests/**/*.test.mjs`. There is no test
framework dependency, and none should be added for this: the suite needs nothing Node
doesn't ship.

- **`tests/register-hooks.mjs` is what lets Node load `lib/`.** The modules import each other
  without an extension and use ESM syntax in a package with no `"type"`; webpack accepts both
  and Node refuses both. **Do not add `"type": "module"` to `package.json` to get around it**:
  that also changes how `next.config.js` loads.
- **A test that expects a failure checks the exact message**, written out in the test file and
  not borrowed from the module, so a rewording fails a test. **Every `describe` block ends
  with a control test** that proves its check can fire. Keep both conventions when you add a
  test.
- **Expected values are worked out by hand from the module headers, never pasted from a run.**
  A figure copied from the code's own output pins whatever the code does, bugs included. The
  suite cannot reach the database, so a pass means the client matches its own documented
  formulas, not that it matches the views.
- **PPV tests use the client's copy of the league's weights, `FALLBACK_WEIGHTS`.** The app
  reads the real ones from their table, which the suite cannot reach. `tests/bidPpv.test.mjs`
  pins the guaranteed, non-guaranteed and roster-bonus weights as literals, so a change to the
  table's weights needs `FALLBACK_WEIGHTS` and that test changed together, in one commit. **The
  option-bonus weights are read from `FALLBACK_WEIGHTS`, never written down**: they were not
  part of the stated weights the suite pins, and a test must not become their source.
- **The contract preview reads today's date** (roster-bonus conversion). Every preview test
  pins the clock with `t.mock.timers`, so the suite passes on any day.
- **A change to a rule these modules mirror changes the tests in the same commit.** The
  GitHub check's Tests job runs `npm test` on Node 24 with no install step, because nothing
  the suite loads comes from `node_modules`; an import that does will need one added. Run
  `npm test` yourself before pushing and report the result.
