// The request header middleware.js uses to pass on who is signed in (UI test batch 40,
// November 22, 2026). Its own module, with no imports, so the middleware (edge runtime) and
// lib/authUser.js (server components) share one spelling. lib/authUser.js is the authority on
// how it is written and read.
export const AUTH_UID_HEADER = 'x-edfl-uid';
export const NO_USER = 'none';
