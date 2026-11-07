# Architecture

Plain browser scripts, no bundler. Files are loaded in order from `index.html` and share one global scope, exactly as the original single file did.

| File | Responsibility |
|---|---|
| `01-core.js` | Provider table, default settings, state, small utilities |
| `02-markdown.js` | Syntax highlighting, Markdown renderer (escapes first, then renders) |
| `02b-math.js` | LaTeX → MathML converter (fractions, roots, limits, matrices, cases, aligned, accents, styles) |
| `02c-highlight.js` | Code highlighter: functions, parameters, HTML tags, JSON keys, Mermaid |
| `03-storage.js` | Theme/accent, IndexedDB chats, localStorage settings, encrypted key vault, `save()`/`loadAll()` |
| `04-chat.js` | Chat helpers, message and chat-list rendering, composer |
| `05-providers.js` | OpenAI-compatible, Anthropic and Gemini adapters, streaming, export/import |
| `06-settings.js` | Settings panes, change handling, sidebar, event wiring |
| `06b-settings-page.js` | Haptics, bottom sheets and pickers, the settings page, edge-swipe navigation |
| `06c-attach.js` | Attachments: image downscale and thumbnails, PDF and text files, composer tray, drag and drop, paste, viewing |
| `06d-voice.js` | Dictation (browser speech or Whisper), voice activity detection, text-to-speech (device or OpenAI), read aloud |
| `06e-live.js` | Live voice loop and the canvas orb HUD |
| `07-features.js` | Proxy fetch, model discovery, dropdowns, artifacts and viewer, reasoning, editing, titles, menus, palette, error states, setup, sanitizer |
| `07b-web.js` | Web search engines, search planning, source chips, Wikipedia/Commons image lookup, lightbox |
| `07c-ui.js` | Rich components built from `ui:` JSON blocks: charts, cards, media rows, carousel, explainer, forms, SVG figures |
| `08-boot.js` | `boot()` |

## Data flow
`sendMessage` → `streamAssistant` → `runCompletion` → adapter → `pfetch` (proxy when served by `server.js`) → `onDelta(piece, kind)`. `kind === "r"` marks reasoning. Messages repaint on a throttle; the spinner and reasoning header are persistent elements so animations don't restart.

## Security model
- Rendered HTML: escape → render → `sanitizeHtml` allowlist (HTML, MathML and images only; images must be https and are loaded with no referrer).
- HTML artifacts: sandboxed iframe without `allow-same-origin`.
- Proxy: same-origin only, allowlist, connect-time private/loopback checks, size and rate limits.
- Keys: optional passphrase vault; never in exports; stripped to printable ASCII on entry.

## Known gaps
No TypeScript or bundler (no registry access when this was built), no browser end-to-end tests, chats are not virtualized, code highlighting runs on the main thread.


## Build mode

| File | Role |
|---|---|
| `build-core.js` | Server side: workspaces, file API, command execution (NDJSON stream), long-running processes, zip writer, doc fetch, host-based preview and WebSocket proxy. Enabled by `NEBULA_BUILD=1`. |
| `public/js/07d-build-core.js` | Agent: system prompt, action parser (`scanActs`), executor (`execAct`), history compaction, the step loop (`buildAgent`) and `runAssistant`, which routes a chat to the agent or to plain streaming. |
| `public/js/07e-build-ui.js` | Mode switch, action cards, status bar, workbench (files, terminal, preview). |
| `public/guides/*.md` | Guidelines the agent loads on demand. |
| `Dockerfile.build` | Sandbox image used when `BUILD_SANDBOX=docker`. |

Flow: user message -> `buildAgent` -> model turn streams -> each closed action runs immediately (writes) or ends the turn (blocking actions) -> result message -> next turn, until `<done>`. Tool results are stored as hidden user messages (`tool: true`); older ones are condensed before being sent to the model.
