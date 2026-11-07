# Debugging and error-recovery protocol

You must keep going until the build is green. Use this loop; never give up or hand the problem back.

1. **Read the whole error** (first error, not the last). Identify: exit code, file:line, message, missing module, failed step.
2. **Classify**: syntax/type error; missing dependency; version conflict; wrong path/cwd; port in use; permission; network failure; runtime logic bug; environment (tool not installed).
3. **Fix the root cause** with the smallest change (`<edit>`), then **rerun the exact failing command**. Do not rewrite everything.
4. If the same fix fails twice: print more (`--verbose`, `DEBUG=*`, `node -e`, `python -X dev`), reproduce in a minimal script, check versions (`node -v`, `npm ls pkg`, `pip show pkg`), read the source of the failing file with `<read>`.
5. If a library is the problem: search the exact message (`<search q="..."/>`, `<fetch url="..."/>` the official docs/issue), pin a known-good version, or replace the library.

## Common fixes
- `Cannot find module` / `ModuleNotFoundError`: install it, check `cwd`, check venv (`python3 -m venv .venv` once, then `pip install -r requirements.txt`).
- `ERESOLVE`/peer deps: `npm install --legacy-peer-deps` or align versions; delete `node_modules` + lockfile and reinstall if corrupted.
- `EADDRINUSE`: pick another port or stop the old process (`<stop name="..."/>`); servers read `PORT`.
- `externally-managed-environment`: use the venv.
- Missing system tool (`soffice`, `pdftoppm`, `pango`): try an alternative (ReportLab instead of WeasyPrint; PyMuPDF instead of poppler), or install via pip/npm packages that bundle binaries.
- Network blocked: use cached/pinned alternatives, vendored files, or dependency-free code. Say so in the README.
- ESM/CJS mix-ups: set `"type":"module"` consistently or use `.cjs`. Python import cycles: move shared code.
- CORS/proxy: same-origin `/api`, dev proxy in Vite config. Blank page: open the built HTML, check console errors by running a node script with jsdom or by `curl` of assets (404s).
- Hanging command: add timeouts, run servers with `<serve>`, never run a blocking server with `<run>`.

## Verification ladder
Compile/build -> unit tests -> start server -> `curl -i` key routes -> inspect HTML output -> render documents and `<view>` them. A task is finished only when the top rung relevant to the request passes.
