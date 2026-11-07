# Nebula

Bring-your-own-key AI chat with a hardened local proxy, encrypted key storage and an artifact viewer. No runtime dependencies.

## Run
    npm start                 # http://127.0.0.1:3000
    npm test                  # unit and integration tests (Node 18+)
    docker build -t nebula . && docker run -p 3000:3000 nebula

Press Ctrl/Cmd+K for the command palette (chats, models, settings). Ctrl/Cmd+Shift+O starts a new chat.

## Layout
    server.js, proxy-core.js    static server + /proxy relay (shared with Vercel's api/ functions)
    public/index.html           shell
    public/styles.css           all styles
    public/js/01..08-*.js       classic scripts loaded in order (see ARCHITECTURE.md)
    test/                       node:test suites, no browser needed

## Proxy settings (environment)
| Variable | Default | Effect |
|---|---|---|
| `PORT`, `HOST` | 3000, 127.0.0.1 | Listen address. Keep `HOST` on localhost unless you add authentication in front. |
| `PROXY_ALLOW` | empty (any host) | Comma list of provider hosts the proxy may reach, e.g. `api.openai.com,api.anthropic.com`. Subdomains match. |
| `ALLOW_PRIVATE` | off | Set `1` to let the proxy reach private-network addresses (10.x, 192.168.x, ...). |
| `ALLOW_LOOPBACK` | on locally, off on Vercel | Set `0` to block localhost targets such as Ollama. |
| `RATE_LIMIT` | 120 | Requests per minute per client. |
| `MAX_BODY_MB` | 20 | Largest request body relayed. |

Targets are checked when the connection is made, so DNS tricks can't point an allowed name at a private address. Logs are one JSON line per request with host and status only, never paths, query strings or keys.

## Keys and storage
- Settings live in localStorage. Conversations live in IndexedDB (older localStorage data is migrated on first load).
- Settings, Providers: "Encrypt keys with a passphrase" stores keys encrypted (PBKDF2 + AES-GCM) and asks for the passphrase on each launch. Forgetting it means re-entering keys.
- Backups never include keys.

## Deploy on Vercel
Push the folder as-is. `public/` is static and `api/proxy.js` runs as a function (60 s limit per request). Loopback targets are blocked there.

## Feature notes
- Reasoning: one live line above the answer; tap it for a timeline sheet ("Thought process" while streaming, "Summary" after). Lines are written by the selected model (or taken from provider headings); raw thinking and code are never shown.
- Artifacts: the model emits `artifact:<filename>` blocks. HTML (sandboxed), SVG, images, PDF, audio/video, Markdown, CSV, JSON and code render in the side viewer. DOCX/PPTX/XLSX/ZIP show extracted text and file lists. Binary files arrive as base64 from the model, so quality depends on the model.
- All rendered HTML passes through an allowlist sanitizer.

## Touch
Swipe from the left edge to open the menu, swipe left to close it, swipe right from the edge to go back in Settings, swipe a sheet down to dismiss it, long-press a chat for its menu, tap a message to show its actions. Haptic feedback is used where the device supports it.

## Math, images, search
- **Math:** `$...$`, `$$...$$`, `\(...\)`, `\[...\]` and bare `\begin{align}` blocks render as native MathML (Chrome, Firefox, Safari). This is a built-in converter, not KaTeX; it covers common LaTeX and shows unknown commands in red instead of failing. Currency like "$5 and $10" is left alone.
- **Pictures:** the model can write `![[Exact Wikipedia title|optional caption]]` and Nebula fetches a real photo from Wikipedia (Wikimedia Commons as fallback), with a caption, a source link and a tap-to-zoom viewer. Plain `![alt](https://...)` images also render. Turn both off with "Web images" in Settings, Chat. Image lookups go from your browser straight to Wikipedia.
- **Web search:** composer globe button toggles it; Settings, Web search sets the mode (Auto lets the selected model decide per message, Always searches every time) and the engine: Wikipedia (no key), Tavily (key), or SearXNG (your own open-source instance; enable `json` under `search.formats` in its settings.yml). Tavily and SearXNG calls go through the local proxy; a SearXNG on localhost works when you run `npm start` locally. Answers cite sources as numbered chips, and each search adds one small request to the selected model to plan the query.
- Also supported: callouts (`> [!NOTE]`, TIP, IMPORTANT, WARNING, CAUTION), task lists, `==highlight==`, ordered-list start numbers.

## Attachments and voice
- **Attachments:** the + button (or drag and drop, or paste) adds photos, PDFs and text or code files. Photos are downscaled to 1568 px and shown as thumbnails in the composer and in the message; tap one to open it. Photos and PDFs go to the model natively (OpenAI, Anthropic and Gemini formats; PDFs need one of those providers or OpenRouter). Text files are inlined. About 14 MB of attachments are sent per request; older ones are replaced by a short note once that is exceeded. Attachments are stored in IndexedDB with the chat, are not included in JSON backups, and the model must support vision for images.
- **Dictation:** the mic button fills the composer using the browser's speech recognition (Chrome, Edge, Safari, Android; some browsers send audio to their vendor) or, when that isn't available, records audio and transcribes it with Whisper through your OpenAI or Groq key. Settings, Voice sets language, input engine and "send after dictation".
- **Live voice:** with an empty composer the round button starts Live: a hands-free loop of listening, thinking and speaking, with an orb that reacts to your voice and to the reply. Replies are spoken sentence by sentence as they stream, code and links are skipped, and the model is told to answer briefly. Controls: mute, interrupt (or tap the orb), end. The screen stays awake. Voices come from the device, or from OpenAI text-to-speech when you pick that engine and have a key. Assistant messages also have a Read aloud button.
- Live mode and dictation need microphone permission and an https or localhost page.

## Response components
The model is told to use ```ui:<type> blocks with compact JSON: `chart` (bar, line with touch tooltip, donut, pie), `cards` (icon tiles, optionally tappable to send a follow-up), `media` (picture left, text right), `carousel`, `explainer` (image, title, sections in Markdown), `form` (radio, slider, checkbox, textarea, select; shows or sends the chosen values). ```svg blocks become figure cards. Pictures named by Wikipedia title are fetched from Wikipedia. Incomplete blocks show a skeleton while streaming, and invalid JSON falls back to a normal code block. Turn all of it off with "Rich components" in Settings, Chat. Mermaid is shown as highlighted code.
For a KaTeX-like look on every device, place `latinmodern-math.woff2` in `public/fonts/`; without it, math uses the best math font the device has.

## Natural voices
Pick the engine in Settings, Voice. The device engine now chooses the most natural installed voice (neural, online or premium voices score highest); OpenAI speech is asked to sound conversational; ElevenLabs is supported with your key and a voice (pick one or paste any voice ID). Neural engines receive fuller sentences so intonation sounds natural. "Talk over replies" lets you interrupt by speaking (best with headphones); tapping the blob always interrupts.

## Build mode (agentic app and document builder)

Switch **Chat / Build** in the sidebar. In Build mode the model works inside a real workspace on your machine: it writes files, installs packages, runs commands, starts servers, reads its own errors and fixes them, then packages a zip. It can also create PDFs, PowerPoint, Word and Excel files with Python scripts it writes, runs, renders and checks.

```bash
npm run start:build            # same as: NEBULA_BUILD=1 node server.js
npm run docker:image           # optional: build the sandbox image (Dockerfile.build)
BUILD_SANDBOX=docker npm run start:build   # run every command inside a container
```

Build mode needs the Node server. It does not work on static hosting or Vercel, because it needs processes and a disk.

**How it works.** The model answers with action tags (`plan`, `write`, `edit`, `run`, `serve`, `read`, `ls`, `view`, `guide`, `search`, `fetch`, `deliver`, `done`). Writes happen as soon as each file closes. Blocking actions end the turn, their output comes back as a message, and the loop continues (up to 80 steps by default) until the model calls `done`. Repeated identical failures trigger a "change approach" nudge. Ten guides in `public/guides/` (frontend, backend, fullstack, pdf, pptx, docx, xlsx, dataviz, debugging, deliver) are loaded on demand.

**Workbench** (folder button): Files (tree, viewer, edit and save, download, zip), Terminal (live output plus a command box), Preview (phone, tablet, full). Previews open at `http://<workspace>.localhost:PORT`, a separate origin, so generated code cannot reach your keys or the build API.

| Variable | Default | Meaning |
|---|---|---|
| `NEBULA_BUILD` | off | `1` enables Build mode (or pass `--build`) |
| `BUILD_ROOT` | `~/.nebula/workspaces` | where workspaces live |
| `BUILD_SANDBOX` | `local` | `docker` runs each command in a container |
| `BUILD_IMAGE` | `nebula-build:latest` | sandbox image |
| `BUILD_MEMORY`, `BUILD_CPUS` | `3g`, `2` | container limits |
| `BUILD_MAX_TIMEOUT` | `1800` | longest allowed command, seconds |
| `BUILD_MAX_FILE_MB` | `40` | largest file write |
| `BUILD_ALLOW_HOSTS` | none | extra Host headers allowed for the build API |

### Security model for Build mode
- **Commands run with your user's permissions** in `local` mode. They can read and write anything you can. Use `BUILD_SANDBOX=docker` for anything you do not fully trust, and only run it on a machine you control.
- The build API answers only to loopback Hosts and same-origin requests, and every call needs a random per-start token. Cross-site pages cannot obtain it.
- File paths are confined to the workspace, including through symlinks. Zips skip symlinks, `node_modules`, `.venv`, `.git` and caches.
- Commands get a sanitised environment: variables that look like keys, tokens or secrets, and Nebula's own settings, are removed. `HOME` points inside the workspace.
- The agent's web fetch refuses private, loopback and link-local addresses.
- Timeouts kill the whole process group. Output is capped.
- Do not expose this server to a network. Anyone who can reach the build API with the token can run commands.

Limits: result quality depends on the model you choose; the Docker mode and the full loop against live providers are untested here.

### Using Build mode from Vercel, or from your phone

Vercel cannot run Build mode itself (it has no long-running processes or disk), but the Vercel-hosted app can **connect to a build server you run elsewhere**. On the Build screen, enter the server's address and token.

On the machine that will run the commands (a VPS, a home server, a spare laptop):

```bash
BUILD_SANDBOX=docker \
BUILD_TOKEN="$(openssl rand -hex 24)" \
BUILD_REMOTE_ORIGINS=https://your-app.vercel.app \
npm run start:build
```

Then put HTTPS in front of it (Caddy, Cloudflare Tunnel, Tailscale Funnel or `tailscale serve`). A page served over HTTPS cannot call a plain `http://` server, except on localhost.

- `BUILD_TOKEN` (24+ characters) is the secret you paste into the app. `BUILD_REMOTE_ORIGINS` is the list of web addresses allowed to call the server (comma separated).
- Remote access is refused unless the sandbox is Docker, or you set `BUILD_REMOTE_UNSAFE=1` to accept that commands run directly on that machine.
- The server only answers browsers on the allowed origins, needs the token on every call, and locks a caller out for a few minutes after 20 wrong tokens.
- Live previews are served from the same server under an unguessable per-workspace path (`/p/<key>/<workspace>/`). Absolute links in generated HTML (`/style.css`) are rewritten automatically; the agent is told to use relative URLs for scripts and API calls.
- Anyone holding the token can run commands on that machine. Treat it like an SSH key, and prefer a dedicated machine.

### Providers and models

Settings, Providers lets you add any number of custom endpoints (OpenAI-compatible or Anthropic-compatible), each with its own address, key and extra model ids. Models the server lists are fetched and merged with yours. The model menu in the composer combines the models of every provider that is set up, grouped by provider, and picking one switches provider and model together. Chats and Build workspaces are independent of the provider, so you can switch at any point: the agent is told the current model and the current workspace state on every turn, long histories are trimmed oldest-first to a size budget, and if a run stops (error, rate limit, Stop button) the bar above the composer offers Continue, and Model to switch first.

### Build mode on your phone (Termux, no other machine)

The build server can run on an Android phone inside Termux. Install Termux from F-Droid or GitHub (the Play Store build is outdated), copy this project into it (for example `unzip nebula-server.zip && cd nebula`), then:

```bash
bash termux-setup.sh      # one time: installs Node and Python, creates a token
./start-phone.sh          # every time: starts the server and prints the address and token
```

Then use Build in one of two ways:
- **With your Vercel app (keeps your keys and chats):** answer the setup question with your app's address. On the Build screen enter `http://localhost:3000` and the token. Chrome may ask to allow access to devices on your network: allow it. Brave blocks this by default; allow localhost in its shields.
- **Standalone:** press Enter at that question and open `http://localhost:3000` in the phone's browser. Keys and chats are stored separately from the Vercel app because it is a different address.

Tips: the server stops if Android closes Termux, so keep its notification, tap "Acquire wakelock" (the start script does it too) and exclude Termux from battery optimisation. Commands run with Termux's permissions and no Docker, so only use models and prompts you trust. The agent is told it is on a phone, so it prefers pure-Python document libraries and avoids heavy builds. LibreOffice is not available, so document checks are done by reopening the files, and PDF page renders need `pkg install poppler`.

### Install as an app (PWA) or build an APK

- **Install without building anything:** open your deployed site in Chrome on Android, menu, Install app (or Add to Home screen). `manifest.webmanifest` and the icons make it open full screen.
- **Signed APK without a computer:** see `android/README.md`. A GitHub Actions workflow (`.github/workflows/android.yml`) builds and signs an APK that wraps your deployed site, adds microphone and file access, and saves downloads to the Downloads folder. You can also open the `android` folder in Android Studio.
- **No-code alternative:** pwabuilder.com can package your deployed site into a signed Android app from its manifest.
