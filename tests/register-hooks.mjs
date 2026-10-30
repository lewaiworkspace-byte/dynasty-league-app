// Lets Node's built-in test runner load lib/ exactly as Next.js bundles it,
// with no test framework installed and nothing changed in lib/ itself.
//
// Two things stand between plain Node and the lib/ modules:
//
//   - They write relative imports without an extension ('./leagueMinimum'),
//     which webpack resolves and Node's ESM loader refuses. The resolve hook
//     retries a failed relative specifier with '.js' appended.
//   - They are .js files using import/export in a package.json with no
//     "type" field. Node would detect the syntax, reparse and warn on every
//     file. The load hook declares them ES modules up front instead.
//
// Adding "type": "module" to package.json would do the second job for free
// and change how next.config.js loads, so it is deliberately not done.
//
// Loaded with --import from the "test" script in package.json.

import { registerHooks } from 'node:module';

if (typeof registerHooks !== 'function') {
  throw new Error(
    'The test suite needs module.registerHooks, added in Node 22.15. This Node is ' +
      process.version +
      '.'
  );
}

const LIB = new URL('../lib/', import.meta.url).href;
const RELATIVE = /^\.\.?\//;
const HAS_EXTENSION = /\.[cm]?js$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (
        err.code === 'ERR_MODULE_NOT_FOUND' &&
        RELATIVE.test(specifier) &&
        !HAS_EXTENSION.test(specifier)
      ) {
        return nextResolve(specifier + '.js', context);
      }
      throw err;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith(LIB) && url.endsWith('.js')) {
      return nextLoad(url, { ...context, format: 'module' });
    }
    return nextLoad(url, context);
  },
});
