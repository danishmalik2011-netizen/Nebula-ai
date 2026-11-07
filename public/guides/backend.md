# Backend and API guidelines

## Choose simply
- Node: Express or Fastify (+ zod for validation). Python: FastAPI (+ pydantic) or Flask. Use SQLite (better-sqlite3 / sqlite3 / SQLModel) by default; Postgres only if the user needs it. No ORM magic you cannot debug: raw SQL or a thin query builder is fine.
- Single process, one `src/` tree, config from environment (`PORT`, `DATABASE_URL`, `SECRET`), `.env.example` committed, real `.env` never.

## Structure
```
server/
  index.js|main.py        # boot, middleware, routes, listen on process.env.PORT, bind 0.0.0.0
  routes/ services/ db/   # transport -> logic -> data
  migrations/             # numbered, idempotent SQL
  tests/
```
Expose `GET /health` -> `{ok:true}`. Log one structured line per request (method, path, status, ms), never bodies or secrets.

## API design
- REST nouns, plural: `GET /api/notes`, `POST /api/notes`, `GET/PATCH/DELETE /api/notes/:id`. Use correct status codes (201 create, 204 delete, 400 validation, 401/403, 404, 409 conflict, 422, 429).
- Consistent JSON envelope for errors: `{error:{code,message,details}}`. Validate every input at the edge (type, range, length, enum). Reject unknown fields or ignore them deliberately.
- Pagination (`limit`, `cursor`), sorting whitelists, filtering by indexed columns. Idempotency for retries on POST when it matters.
- Version when breaking (`/api/v1`). Document endpoints in the README with curl examples.

## Data
- Model first: tables with primary keys, foreign keys, NOT NULL, UNIQUE, CHECK; timestamps (`created_at`, `updated_at`). Index columns you filter/join/sort on. Use transactions for multi-step writes. Store money as integer minor units. Store times in UTC ISO-8601.
- Migrations are code: run automatically on boot (`CREATE TABLE IF NOT EXISTS` + a `schema_version` table). Seed script with realistic demo data.
- Always parameterised queries. Never string-concatenate SQL.

## Security checklist
- Passwords: argon2id or bcrypt (cost >= 12), never plain or fast hashes. Sessions: httpOnly, Secure, SameSite=Lax cookies, or short-lived JWT + refresh rotation. CSRF protection for cookie auth.
- Authorisation on every route (ownership checks, roles). No IDs trusted from the client without checking the owner.
- Rate-limit auth and expensive endpoints. Set `helmet`-style headers (CSP, X-Content-Type-Options, Referrer-Policy). Strict CORS allow-list. Limit body size. Escape output; sanitise user HTML.
- File uploads: size and type limits, random server-side names, store outside web root, never execute. SSRF: block private IP ranges for user-supplied URLs. Secrets from env only; redact in logs.

## Reliability and performance
Timeouts on outbound calls, retries with backoff for idempotent calls, graceful shutdown (close server, DB). Cache read-heavy endpoints (ETag, in-memory TTL). Avoid N+1 queries. Stream large responses. Background work: a simple in-process queue or cron-like timer; persist jobs if they matter.

## Realtime
SSE for one-way streams (simple, proxy-friendly); WebSocket (`ws`, FastAPI websockets) for two-way. Heartbeats, reconnect with backoff on the client.

## Testing (do it, then run it)
Unit-test pure logic; integration-test routes against a temp database (supertest / pytest + httpx). Cover: happy path, validation errors, auth failures, not found, conflict. Run the suite and fix failures before delivering. Smoke-test the running server with `curl -i` for each main endpoint.

## Deliverable
README: what it is, requirements, install, env vars, run (dev/prod), test, API summary, project layout. Scripts: `dev`, `start`, `test`, `migrate`, `seed`.
