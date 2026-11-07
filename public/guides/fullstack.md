# Full-stack project guidelines

## Pick the smallest stack that fully works
- Web app with data: one Node (or Python) server that serves the API and the built frontend. Avoid microservices, queues and Docker unless asked.
- Pure frontend tool: static files, no build step if possible.
- Content/marketing: Astro or plain HTML.
- Typical stack: Vite + React (or vanilla) frontend, Express/Fastify backend, SQLite, plain CSS. Use TypeScript only if it will be compiled and checked in the build.

## Layout
```
my-app/
  package.json            # scripts: dev, build, start, test
  README.md  .env.example  .gitignore
  server/                 # API, db, migrations, tests
  client/ (or src/)       # UI source
  public/ or dist/        # built assets served by the server
```
Monorepo only if two packages are truly needed (`npm workspaces`).

## Make it runnable by anyone
- `npm install && npm run dev` starts everything (use `concurrently` or a Vite proxy to `/api`). `npm run build && npm start` serves production. Read `PORT` from env (default 3000), bind `0.0.0.0`.
- Serve the built frontend from the server with SPA fallback (`index.html` for unknown non-API routes). API under `/api`.
- Seed demo data on first run so the app is never empty. Provide a health endpoint.
- Pin versions in `package.json` / `requirements.txt` (`pip freeze` after tests pass). Commit lockfiles. Add `.gitignore` (node_modules, .venv, .env, dist).

## Build loop (do not skip)
1. Scaffold files with complete contents. 2. `npm install` (watch for errors; fix versions/peer deps). 3. Build/compile. 4. Start the server with `<serve>`. 5. `curl` the API and the HTML. 6. Run tests. 7. Fix and repeat until all green. 8. Write README. 9. Deliver zip (without node_modules/.venv).

## Frontend/backend contract
Define request/response shapes once (README or `types`), validate on the server, handle every failure state in the UI (loading, empty, error, offline). Use relative URLs (`/api/...`) so any host works. Optimistic updates with rollback for snappy UX.

## Preview constraints
The workspace preview opens your running server through a reverse proxy: bind `0.0.0.0`, honour `PORT`, avoid absolute `http://localhost:3000` URLs in the client, keep websockets on the same origin. Static sites without a server are previewed from `dist/`, `build/`, `public/` or the root `index.html`.

## Quality gates before delivery
No console errors, no failing tests, no TODO placeholders, no dead links, accessible forms, responsive at 360px, README with exact commands, working `.env.example`, sensible empty/error states, and a clean file tree.
