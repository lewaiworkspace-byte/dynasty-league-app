// Validates the ?next= destination before anything redirects to it.
//
// WHY THIS EXISTS NOW AND NOT BEFORE. Twelve gated pages have always
// passed next= to /login, but the login page never read its own query
// string, so the value was dropped and never reached a redirect. It was
// inert: written by every caller, consumed by nobody.
//
// The OTP flow changes that. The login page now reads next= from its own
// URL and hands it to window.location.assign() (router.push() until
// October 7, 2026), and the callback route interpolates
// it into a redirect. That URL is one anyone can construct and hand to
// anyone else -- a message reading "log in here" pointing at
// /login?next=<somewhere hostile>. So next= became attacker-supplied for
// the first time in this batch, and an unguarded redirect on it is an
// open redirect.
//
// Everything that is not plainly an internal path collapses to '/'. This
// never throws: a bad next is a quiet trip to the home page, not an error
// an owner has to read and cannot act on.
export function safeNext(value) {
  if (typeof value !== 'string') return '/';

  // Must be an absolute path on this site.
  if (value.charAt(0) !== '/') return '/';

  // '//evil.com' is protocol-relative -- the browser reads it as a host,
  // not a path, and leaves the site.
  if (value.slice(0, 2) === '//') return '/';

  // '/\evil.com' is the backslash spelling of the same trick. Some
  // parsers and browsers normalise the backslash to a forward slash,
  // which turns it back into the protocol-relative case above.
  if (value.slice(0, 2) === '/\\') return '/';

  // NO CONTROL CHARACTERS AT ALL (October 7, 2026, batch 3). This used to
  // refuse only a newline or carriage return, which can split a header in
  // anything that forwards this value on. But every URL parser also STRIPS a
  // tab, newline or carriage return before it reads an address, so
  // '/\t/evil.com' -- what /login?next=/%09/evil.com decodes to -- passed
  // every test above and then resolved to //evil.com, another host. Nothing
  // legitimate carries a control character, so any of them collapses to '/'.
  if (/[\u0000-\u001F\u007F]/.test(value)) return '/';

  // AND THE PARSER HAS THE LAST WORD. Resolve the value the way a browser
  // will, against a placeholder origin, and refuse anything that lands on a
  // different one -- whatever spelling got it past the tests above.
  let resolved;
  try {
    resolved = new URL(value, 'https://edfl.invalid');
  } catch (e) {
    return '/';
  }
  if (resolved.origin !== 'https://edfl.invalid') return '/';

  return value;
}
