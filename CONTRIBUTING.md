# Contributing

1. `npm test` must pass (Node 18+). Tests load `public/js/*.js` into a stub DOM; add logic tests there, and keep DOM-only code thin.
2. Keep scripts in the load order of `ARCHITECTURE.md`; top-level statements may only use things defined in earlier files.
3. Anything that renders model or user text into HTML must go through `escapeHtml` and `sanitizeHtml`.
4. Don't log request paths, query strings or headers in the proxy.
5. New provider quirks get a fixture test in `test/adapters.test.js`.
