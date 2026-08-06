// Validates the ?next= destination before anything redirects to it.
//
// WHY THIS EXISTS NOW AND NOT BEFORE. Twelve gated pages have always
// passed next= to /login, but the login page never read its own query
// string, so the value was dropped and never reached a redirect. It was
// inert: written by every caller, consumed by nobody.
//
// The OTP flow changes that. The login page now reads next= from its own
// URL and hands it to router.push(), and the callback route interpolates
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

  // A newline or carriage return can split a header in anything that
  // forwards this value on, so it never gets to survive that far.
  if (value.indexOf('\n') !== -1 || value.indexOf('\r') !== -1) return '/';

  return value;
}
