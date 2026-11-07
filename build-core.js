"use strict";
/* Build mode backend: workspaces on disk, files, command execution, zip, preview. Zero dependencies.
   Enabled with NEBULA_BUILD=1 (or --build). Commands run with the permissions of the user who started the
   server unless BUILD_SANDBOX=docker, which runs every command in a container instead. */
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto"), zlib = require("zlib");
const http = require("http"), https = require("https"), net = require("net"), dns = require("dns");
const { spawn } = require("child_process");
const core = require("./proxy-core");

const env = process.env;
const ENABLED = env.NEBULA_BUILD === "1" || process.argv.includes("--build");
const ROOT = path.resolve(env.BUILD_ROOT || path.join(os.homedir(), ".nebula", "workspaces"));
const CACHE = path.join(os.homedir(), ".nebula", "cache");
const SANDBOX = env.BUILD_SANDBOX === "docker" ? "docker" : "local";
const IMAGE = env.BUILD_IMAGE || "nebula-build:latest";
const REMOTE_ORIGINS = (env.BUILD_REMOTE_ORIGINS || "").split(",").map(x => x.trim().replace(/\/+$/, "")).filter(Boolean);
let REMOTE = ENABLED && REMOTE_ORIGINS.length > 0;
const WARN = [];
if (REMOTE && String(env.BUILD_TOKEN || "").length < 24) { REMOTE = false; WARN.push("BUILD_REMOTE_ORIGINS is set but BUILD_TOKEN is missing or shorter than 24 characters: remote access stays off."); }
if (REMOTE && SANDBOX !== "docker" && env.BUILD_REMOTE_UNSAFE !== "1") { REMOTE = false; WARN.push("Remote access refused: commands would run directly on this machine. Use BUILD_SANDBOX=docker, or set BUILD_REMOTE_UNSAFE=1 to accept that risk."); }
const TOKEN = REMOTE ? String(env.BUILD_TOKEN) : crypto.randomBytes(24).toString("hex");
const PV_KEY = id => crypto.createHmac("sha256", TOKEN).update("preview:" + id).digest("hex").slice(0, 32);
const keyOk = (key, id) => { try { return crypto.timingSafeEqual(Buffer.from(String(key)), Buffer.from(PV_KEY(id))); } catch { return false; } };
const MAX_FILE = (+env.BUILD_MAX_FILE_MB > 0 ? +env.BUILD_MAX_FILE_MB : 40) * 1048576;
const MAX_TIMEOUT = +env.BUILD_MAX_TIMEOUT > 0 ? +env.BUILD_MAX_TIMEOUT : 1800;
const OUT_CAP = 1.5 * 1048576;
const EXTRA_HOSTS = (env.BUILD_ALLOW_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const SHELL = (() => { for (const d of String(env.PATH || "").split(path.delimiter)) if (d && fs.existsSync(path.join(d, "bash"))) return path.join(d, "bash"); return "sh"; })();
const PHONE = /com\.termux/.test(String(env.PREFIX || "")) || process.platform === "android";
const HIDE = new Set(["node_modules", ".venv", ".git", ".cache", ".home", "__pycache__", ".next", ".nuxt", ".svelte-kit", ".pytest_cache", ".mypy_cache", ".turbo"]);
const MIME = { ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".pdf": "application/pdf", ".wasm": "application/wasm", ".map": "application/json", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg" };

const httpErr = (code, msg) => Object.assign(new Error(msg), { code });
const J = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0; const c = [];
    req.on("data", d => { n += d.length; if (n > max) { reject(httpErr(413, "Body too large")); req.destroy(); return; } c.push(d); });
    req.on("end", () => resolve(Buffer.concat(c)));
    req.on("error", reject);
  });
}
async function jbody(req, max) {
  const b = await readBody(req, max || MAX_FILE * 1.4);
  try { return JSON.parse(b.toString("utf8") || "{}"); } catch { throw httpErr(400, "Invalid JSON"); }
}

/* ---------- workspaces ---------- */
const validId = id => /^ws_[0-9a-f]{12}$/.test(String(id || ""));
const wsDir = id => { if (!validId(id)) throw httpErr(400, "Bad workspace id"); const d = path.join(ROOT, id); if (!fs.existsSync(d)) throw httpErr(404, "Workspace not found"); return d; };
const metaFile = d => path.join(d, ".nebula.json");
const readMeta = d => { try { return JSON.parse(fs.readFileSync(metaFile(d), "utf8")); } catch { return {}; } };
const writeMeta = (d, m) => fs.writeFileSync(metaFile(d), JSON.stringify(m));
function createWs(name) {
  const id = "ws_" + crypto.randomBytes(6).toString("hex"), d = path.join(ROOT, id);
  fs.mkdirSync(d, { recursive: true });
  writeMeta(d, { name: String(name || "Untitled").slice(0, 80), created: Date.now() });
  return id;
}
function safe(dir, rel) {
  rel = String(rel == null ? "" : rel).replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) throw httpErr(400, "Path escapes the workspace");
  return abs;
}
function noEscape(dir, abs) {
  let p = abs;
  while (p !== dir && !fs.existsSync(p)) p = path.dirname(p);
  const real = fs.realpathSync(p), root = fs.realpathSync(dir);
  if (real !== root && !real.startsWith(root + path.sep)) throw httpErr(400, "Path escapes the workspace");
}
function walk(dir, all, limit) {
  const out = []; limit = limit || 4000;
  (function rec(d, rel) {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
    for (const e of ents) {
      if (out.length >= limit) return;
      const p = rel ? rel + "/" + e.name : e.name;
      if (e.name === ".nebula.json") continue;
      if (e.isDirectory()) {
        if (!all && HIDE.has(e.name)) { out.push({ p, d: 1, hidden: 1 }); continue; }
        out.push({ p, d: 1 }); rec(path.join(d, e.name), p);
      } else if (e.isFile() || e.isSymbolicLink()) {
        let st; try { st = fs.statSync(path.join(d, e.name)); } catch { continue; }
        out.push({ p, s: st.size, m: Math.round(st.mtimeMs) });
      }
    }
  })(dir, "");
  return out;
}
const isText = buf => { const n = Math.min(buf.length, 4000); for (let i = 0; i < n; i++) if (buf[i] === 0) return false; return true; };

/* ---------- zip (store/deflate, unix modes preserved) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipBuffer(files) {
  const parts = [], cen = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, "/")), raw = f.data, comp = raw.length > 64 ? zlib.deflateRawSync(raw, { level: 6 }) : raw, method = comp === raw ? 0 : 8;
    const d = f.mtime || new Date(), dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF, tm = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt16LE(tm, 10); lh.writeUInt16LE(dt, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x0314, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(tm, 12); ch.writeUInt16LE(dt, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((f.mode || 0o644) & 0xFFFF) * 65536 >>> 0, 38); ch.writeUInt32LE(off, 42);
    cen.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cen.length / 2, 8); end.writeUInt16LE(cen.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
function collect(dir, paths) {
  const files = []; let total = 0;
  const add = (abs, rel) => {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        if (HIDE.has(e.name) || e.name === ".nebula.json") continue;
        add(path.join(abs, e.name), rel ? rel + "/" + e.name : e.name);
      }
    } else if (st.isFile()) {
      total += st.size; if (total > 800 * 1048576) throw httpErr(413, "Too large to zip");
      files.push({ name: rel, data: fs.readFileSync(abs), mtime: st.mtime, mode: st.mode });
    }
  };
  if (!paths.length) add(dir, "");
  else for (const p of paths) { const abs = safe(dir, p); noEscape(dir, abs); if (fs.existsSync(abs)) add(abs, path.relative(dir, abs).split(path.sep).join("/")); }
  return files;
}

/* ---------- running commands ---------- */
const SECRET = /key|token|secret|passw|credential|auth|cookie/i;
function execEnv(dir, extra) {
  const home = path.join(dir, ".home"); fs.mkdirSync(home, { recursive: true });
  const base = {};
  for (const [k, v] of Object.entries(env)) if (!SECRET.test(k) && !/^(NEBULA_|BUILD_|PROXY_|ALLOW_|RATE_)/.test(k)) base[k] = v;
  return { ...base, HOME: home, TMPDIR: home, PATH: [path.join(dir, ".venv", "bin"), path.join(dir, "node_modules", ".bin"), base.PATH || ""].join(path.delimiter), VIRTUAL_ENV: path.join(dir, ".venv"),
    CI: "1", TERM: "dumb", NO_COLOR: "1", FORCE_COLOR: "0", PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1", PIP_DISABLE_PIP_VERSION_CHECK: "1", PIP_BREAK_SYSTEM_PACKAGES: "1",
    PIP_CACHE_DIR: path.join(CACHE, "pip"), npm_config_cache: path.join(CACHE, "npm"), npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false", DEBIAN_FRONTEND: "noninteractive", ...extra };
}
function dockerArgs(dir, cwd, cmd, extra, name, port) {
  const rel = path.relative(dir, cwd).split(path.sep).join("/"), work = "/work" + (rel ? "/" + rel : "");
  const a = ["run", "--rm", "-i", "--init", "--name", name, "--memory", env.BUILD_MEMORY || "3g", "--cpus", env.BUILD_CPUS || "2", "-v", `${dir}:/work`, "-w", work, "-e", "HOME=/work/.home", "-e", "CI=1", "-e", "NO_COLOR=1", "-e", "PYTHONUNBUFFERED=1", "-e", "PIP_BREAK_SYSTEM_PACKAGES=1", "-e", "PATH=/work/.venv/bin:/work/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"];
  for (const [k, v] of Object.entries(extra || {})) a.push("-e", `${k}=${v}`);
  if (port) a.push("-p", `127.0.0.1:${port}:${port}`);
  return [...a, IMAGE, "bash", "-c", cmd];
}
function spawnCmd(dir, cwd, cmd, extra, port) {
  if (SANDBOX === "docker") {
    const name = "nb_" + crypto.randomBytes(5).toString("hex");
    const child = spawn("docker", dockerArgs(dir, cwd, cmd, extra, name, port), { stdio: ["ignore", "pipe", "pipe"] });
    child._container = name; return child;
  }
  return spawn(SHELL, ["-c", cmd], { cwd, env: execEnv(dir, extra), detached: true, stdio: ["ignore", "pipe", "pipe"] });
}
function killTree(child) {
  try { if (child._container) spawn("docker", ["rm", "-f", child._container], { stdio: "ignore" }); else process.kill(-child.pid, "SIGKILL"); }
  catch { try { child.kill("SIGKILL"); } catch {} }
}
async function doExec(req, res, id) {
  const b = await jbody(req, 2e6), dir = wsDir(id), cwd = safe(dir, b.cwd || "."), cmd = String(b.cmd || "").trim();
  if (!cmd) throw httpErr(400, "Missing command");
  fs.mkdirSync(cwd, { recursive: true });
  const timeout = Math.min(Math.max(+b.timeout || 120, 1), MAX_TIMEOUT) * 1000;
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" });
  const t0 = Date.now(); let bytes = 0, done = false, timedOut = false;
  const send = o => { if (!res.writableEnded) res.write(JSON.stringify(o) + "\n"); };
  const child = spawnCmd(dir, cwd, cmd, {});
  const onData = d => { const before = bytes; bytes += d.length; if (bytes <= OUT_CAP) send({ t: "o", d: d.toString("utf8") }); else if (before <= OUT_CAP) send({ t: "o", d: "\n…[output truncated]\n" }); };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout);
  res.on("close", () => { if (!done) killTree(child); });
  child.on("error", e => send({ t: "o", d: "spawn error: " + e.message + "\n" }));
  child.on("close", (code, sig) => { done = true; clearTimeout(timer); send({ t: "x", code: code == null ? -1 : code, signal: sig || "", ms: Date.now() - t0, timedOut }); res.end(); });
}

/* ---------- long-running processes (dev servers, APIs) ---------- */
const PROCS = new Map();
const procsOf = id => { if (!PROCS.has(id)) PROCS.set(id, new Map()); return PROCS.get(id); };
function portOpen(port) { return new Promise(r => { const s = net.connect(port, "127.0.0.1"); s.once("connect", () => { s.destroy(); r(true); }); s.once("error", () => r(false)); }); }
async function startProc(id, b) {
  const dir = wsDir(id), name = String(b.name || "server").replace(/[^\w.-]/g, "").slice(0, 30) || "server", port = +b.port || 0;
  if (!b.cmd) throw httpErr(400, "Missing command");
  const old = procsOf(id).get(name); if (old && !old.exit) killTree(old.child);
  const cwd = safe(dir, b.cwd || "."), extra = port ? { PORT: String(port) } : {};
  const child = spawnCmd(dir, cwd, String(b.cmd), extra, port);
  const p = { name, cmd: String(b.cmd), port, child, log: "", started: Date.now(), exit: null };
  const add = d => { p.log += d.toString("utf8"); if (p.log.length > 300000) p.log = p.log.slice(-200000); };
  child.stdout.on("data", add); child.stderr.on("data", add);
  child.on("error", e => add("spawn error: " + e.message + "\n"));
  child.on("close", (code, sig) => { p.exit = { code: code == null ? -1 : code, signal: sig || "" }; });
  procsOf(id).set(name, p);
  if (port) { const m = readMeta(dir); m.previewPort = port; writeMeta(dir, m); }
  const wait = Math.min(+b.wait || 30, 120) * 1000, t0 = Date.now();
  let ready = !port;
  while (!ready && Date.now() - t0 < wait && !p.exit) { if (await portOpen(port)) ready = true; else await new Promise(r => setTimeout(r, 300)); }
  return { name, port, ready, exit: p.exit, log: p.log.slice(-6000) };
}
const procList = id => [...procsOf(id).values()].map(p => ({ name: p.name, cmd: p.cmd, port: p.port, running: !p.exit, exit: p.exit, since: p.started }));
function stopProc(id, name) {
  const m = procsOf(id); let n = 0;
  for (const [k, p] of m) if (!name || k === name) { if (!p.exit) { killTree(p.child); n++; } }
  return n;
}

/* ---------- fetching docs for the agent (public hosts only) ---------- */
function publicLookup(host, opts, cb) {
  dns.lookup(host, opts, (err, addr, fam) => {
    if (err) return cb(err);
    const list = Array.isArray(addr) ? addr : [{ address: addr, family: fam }];
    for (const a of list) if (core.classify(a.address) !== "public") { const e = new Error("Private addresses are blocked"); e.code = "EBLOCKED"; return cb(e); }
    cb(null, addr, fam);
  });
}
function fetchText(url, hops) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch { return reject(httpErr(400, "Bad URL")); }
    if (!/^https?:$/.test(u.protocol)) return reject(httpErr(400, "Only http and https"));
    const hn = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(hn) && core.classify(hn) !== "public") return reject(httpErr(403, "Private addresses are blocked"));
    const lib = u.protocol === "https:" ? https : http;
    const rq = lib.get(u, { lookup: publicLookup, headers: { "user-agent": "Mozilla/5.0 NebulaBuild", accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" }, timeout: 15000 }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && (hops || 0) < 4) { r.resume(); return resolve(fetchText(new URL(r.headers.location, u).href, (hops || 0) + 1)); }
      const c = []; let n = 0;
      r.on("data", d => { n += d.length; if (n < 2e6) c.push(d); });
      r.on("end", () => resolve({ status: r.statusCode, type: String(r.headers["content-type"] || ""), body: Buffer.concat(c).toString("utf8") }));
    });
    rq.on("timeout", () => rq.destroy(httpErr(504, "Timed out")));
    rq.on("error", e => reject(e.code === "EBLOCKED" ? httpErr(403, e.message) : e));
  });
}
function htmlToText(h) {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [, ""])[1].trim();
  const t = h.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ").replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return (title ? title + "\n\n" : "") + t;
}

/* ---------- preview: <ws>.localhost serves the workspace in its own origin ---------- */
const previewId = req => { const m = /^(ws_[0-9a-f]{12})\.localhost(?::\d+)?$/.exec(String(req.headers.host || "").toLowerCase()); return m ? m[1] : null; };
function previewRoot(dir) {
  for (const c of ["dist", "build", "out", "public", "."]) { const d = c === "." ? dir : path.join(dir, c); if (fs.existsSync(path.join(d, "index.html"))) return d; }
  return dir;
}
function pathify(html, prefix) {
  let h = html.replace(/(\s(?:src|href|action|poster)\s*=\s*["'])\/(?!\/)/gi, "$1" + prefix);
  if (!/<base\s/i.test(h)) h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, m => m + `<base href="${prefix}">`) : `<base href="${prefix}">` + h;
  return h;
}
function proxyTo(port, req, res, pm) {
  const headers = { ...req.headers, host: "127.0.0.1:" + port }; delete headers["accept-encoding"];
  const up = http.request({ host: "127.0.0.1", port, path: pm ? pm.sub : req.url, method: req.method, headers }, r => {
    const h = { ...r.headers };
    if (pm && h.location && String(h.location).startsWith("/") && !String(h.location).startsWith("//")) h.location = pm.prefix.slice(0, -1) + h.location;
    if (pm && /text\/html/i.test(String(h["content-type"] || ""))) {
      const c = []; r.on("data", d => c.push(d));
      r.on("end", () => { const body = Buffer.from(pathify(Buffer.concat(c).toString("utf8"), pm.prefix)); delete h["transfer-encoding"]; h["content-length"] = body.length; res.writeHead(r.statusCode, h); res.end(body); });
      return;
    }
    res.writeHead(r.statusCode, h); r.pipe(res);
  });
  up.on("error", e => { if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" }); res.end("The app is not responding on port " + port + ": " + e.message); });
  req.pipe(up);
}
/* pm is set for path-based previews (remote mode): { prefix: "/p/<key>/<ws>/", sub: "/path?query" } */
function servePreview(req, res, id, pm) {
  let dir; try { dir = wsDir(id); } catch { res.writeHead(404); return res.end("Workspace not found"); }
  const meta = readMeta(dir), running = [...procsOf(id).values()].find(p => p.port && !p.exit);
  if (running) return proxyTo(running.port, req, res, pm);
  const root = previewRoot(dir); let rel;
  try { rel = decodeURIComponent(new URL(pm ? pm.sub : req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end(); }
  let file = path.join(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) {
    if (/\.[a-z0-9]{1,6}$/i.test(rel) || !fs.existsSync(path.join(root, "index.html"))) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Not found: " + rel + (meta.previewPort ? "\n(start the server with a port to preview a running app)" : "")); }
    file = path.join(root, "index.html");
  }
  try { noEscape(dir, file); } catch { res.writeHead(403); return res.end(); }
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  if (pm && /^text\/html/.test(type)) {
    const body = Buffer.from(pathify(fs.readFileSync(file, "utf8"), pm.prefix));
    res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "no-store", "referrer-policy": "no-referrer" });
    return res.end(body);
  }
  res.writeHead(200, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  fs.createReadStream(file).pipe(res);
}
function upgrade(req, socket, head) {
  let id = previewId(req), p = req.url;
  if (!id && REMOTE) { const m = /^\/p\/([0-9a-f]{32})\/(ws_[0-9a-f]{12})(\/[^?]*)?(\?.*)?$/.exec(req.url); if (m && keyOk(m[1], m[2])) { id = m[2]; p = (m[3] || "/") + (m[4] || ""); } }
  if (!id) return false;
  const running = [...procsOf(id).values()].find(x => x.port && !x.exit);
  if (!running) { socket.destroy(); return true; }
  const up = net.connect(running.port, "127.0.0.1", () => {
    up.write(`${req.method} ${p} HTTP/1.1\r\n` + Object.entries({ ...req.headers, host: "127.0.0.1:" + running.port }).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    if (head && head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy()); socket.on("error", () => up.destroy());
  return true;
}

/* ---------- http api ---------- */
const hostOk = req => {
  const h = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || EXTRA_HOSTS.includes(h);
};
function authed(req) {
  const t = String(req.headers["x-build-token"] || "");
  return t.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}
async function api(req, res, u) {
  const p = u.pathname, q = u.searchParams;
  let m;
  if (req.method === "POST" && p === "/build/ws") { const b = await jbody(req, 1e5); const id = createWs(b.name); return J(res, 200, { id }); }
  if (req.method === "GET" && p === "/build/ws") {
    fs.mkdirSync(ROOT, { recursive: true });
    return J(res, 200, { items: fs.readdirSync(ROOT).filter(validId).map(id => ({ id, ...readMeta(path.join(ROOT, id)) })).sort((a, b) => (b.created || 0) - (a.created || 0)) });
  }
  if (req.method === "POST" && p === "/build/fetch") {
    const b = await jbody(req, 1e5), r = await fetchText(String(b.url || ""));
    const text = /html/i.test(r.type) ? htmlToText(r.body) : r.body;
    return J(res, 200, { status: r.status, type: r.type, text: text.slice(0, +b.max > 0 ? Math.min(+b.max, 120000) : 40000) });
  }
  if (!(m = /^\/build\/ws\/(ws_[0-9a-f]{12})\/([a-z/-]+)$/.exec(p))) throw httpErr(404, "Not found");
  const id = m[1], op = m[2], dir = wsDir(id);
  if (req.method === "GET" && op === "preview-url") return J(res, 200, { path: REMOTE ? `/p/${PV_KEY(id)}/${id}/` : null });
  if (req.method === "GET" && op === "tree") return J(res, 200, { name: readMeta(dir).name, files: walk(dir, q.get("all") === "1"), procs: procList(id), previewPort: readMeta(dir).previewPort || 0 });
  if (req.method === "GET" && op === "file") {
    const abs = safe(dir, q.get("path")); noEscape(dir, abs);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw httpErr(404, "No such file");
    const st = fs.statSync(abs);
    if (q.get("raw") === "1") { res.writeHead(200, { "content-type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "content-length": st.size, "cache-control": "no-store" }); return fs.createReadStream(abs).pipe(res); }
    const max = Math.min(+q.get("max") || 400000, 2e6), buf = fs.readFileSync(abs).subarray(0, max + 1);
    if (!isText(buf)) return J(res, 200, { path: q.get("path"), size: st.size, binary: true });
    return J(res, 200, { path: q.get("path"), size: st.size, truncated: buf.length > max, content: buf.subarray(0, max).toString("utf8") });
  }
  if (req.method === "PUT" && op === "file") {
    const b = await jbody(req), abs = safe(dir, b.path);
    if (abs === dir || String(b.path).endsWith("/")) throw httpErr(400, "Not a file path");
    noEscape(dir, abs); fs.mkdirSync(path.dirname(abs), { recursive: true }); noEscape(dir, path.dirname(abs));
    const data = b.enc === "base64" ? Buffer.from(String(b.content || ""), "base64") : Buffer.from(String(b.content == null ? "" : b.content), "utf8");
    fs.writeFileSync(abs, data);
    if (b.exec) fs.chmodSync(abs, 0o755);
    return J(res, 200, { ok: true, bytes: data.length, lines: b.enc === "base64" ? 0 : String(b.content || "").split("\n").length });
  }
  if (req.method === "POST" && op === "edit") {
    const b = await jbody(req), abs = safe(dir, b.path); noEscape(dir, abs);
    if (!fs.existsSync(abs)) throw httpErr(404, "No such file");
    let t = fs.readFileSync(abs, "utf8"); const find = String(b.find == null ? "" : b.find);
    if (!find) throw httpErr(400, "Empty find text");
    const n = t.split(find).length - 1;
    if (n === 0) throw httpErr(409, "The text to replace was not found. Read the file and copy the exact text.");
    if (n > 1 && !b.all) throw httpErr(409, `The text to replace appears ${n} times. Add more surrounding lines to make it unique.`);
    t = b.all ? t.split(find).join(String(b.replace == null ? "" : b.replace)) : t.replace(find, () => String(b.replace == null ? "" : b.replace));
    fs.writeFileSync(abs, t);
    return J(res, 200, { ok: true, replaced: b.all ? n : 1 });
  }
  if (req.method === "POST" && op === "delete") {
    const b = await jbody(req, 1e5), abs = safe(dir, b.path); noEscape(dir, abs);
    if (abs === dir) throw httpErr(400, "Cannot delete the workspace root");
    fs.rmSync(abs, { recursive: true, force: true });
    return J(res, 200, { ok: true });
  }
  if (req.method === "POST" && op === "exec") return doExec(req, res, id);
  if (req.method === "POST" && op === "proc/start") return J(res, 200, await startProc(id, await jbody(req, 1e6)));
  if (req.method === "POST" && op === "proc/stop") { const b = await jbody(req, 1e5); return J(res, 200, { stopped: stopProc(id, b.name) }); }
  if (req.method === "GET" && op === "proc") return J(res, 200, { procs: procList(id) });
  if (req.method === "GET" && op === "proc/log") { const p2 = procsOf(id).get(q.get("name") || "server"); return J(res, 200, { log: p2 ? p2.log.slice(-(+q.get("tail") || 8000)) : "", running: !!p2 && !p2.exit }); }
  if (req.method === "GET" && op === "zip") {
    const paths = String(q.get("paths") || "").split(",").map(s => s.trim()).filter(Boolean), name = String(q.get("name") || readMeta(dir).name || "project").replace(/[^\w.-]+/g, "_").slice(0, 60) || "project";
    const buf = zipBuffer(collect(dir, paths));
    res.writeHead(200, { "content-type": "application/zip", "content-length": buf.length, "content-disposition": `attachment; filename="${name}.zip"`, "cache-control": "no-store" });
    return res.end(buf);
  }
  if (req.method === "POST" && op === "delete-ws") { stopProc(id); fs.rmSync(dir, { recursive: true, force: true }); PROCS.delete(id); return J(res, 200, { ok: true }); }
  throw httpErr(404, "Not found");
}
const FAILS = new Map();
const ipOf = req => String(req.socket.remoteAddress || "?");
function noteFail(req) { const ip = ipOf(req), n = Date.now(), f = FAILS.get(ip) || { c: 0, t: n }; if (n - f.t > 300000) { f.c = 0; f.t = n; } f.c++; FAILS.set(ip, f); if (FAILS.size > 5000) FAILS.clear(); }
const locked = req => { const f = FAILS.get(ipOf(req)); return !!f && f.c >= 20 && Date.now() - f.t < 300000; };
const corsOrigin = req => { const o = req.headers.origin; return REMOTE && o && REMOTE_ORIGINS.includes(String(o).replace(/\/+$/, "")) ? o : null; };
function callerOk(req) {
  if (REMOTE) return !req.headers.origin || !!corsOrigin(req) || core.sameOrigin(req);
  return hostOk(req) && core.sameOrigin(req);
}
/* returns true when the request was handled here */
function handle(req, res, u) {
  if (!ENABLED) return false;
  const pid = previewId(req);
  if (pid) { servePreview(req, res, pid, null); return true; }
  let m;
  if (REMOTE && (m = /^\/p\/([0-9a-f]{32})\/(ws_[0-9a-f]{12})(\/.*)?$/.exec(u.pathname))) {
    if (!keyOk(m[1], m[2])) { res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found"); return true; }
    if (!m[3]) { res.writeHead(301, { location: u.pathname + "/" + u.search }); res.end(); return true; }
    servePreview(req, res, m[2], { prefix: `/p/${m[1]}/${m[2]}/`, sub: m[3] + u.search });
    return true;
  }
  const isApi = u.pathname === "/api/build-config" || u.pathname.startsWith("/build/");
  if (!isApi) return false;
  const o = corsOrigin(req);
  if (o) {
    res.setHeader("access-control-allow-origin", o); res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-headers", "x-build-token, content-type"); res.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("access-control-max-age", "600"); res.setHeader("access-control-expose-headers", "content-disposition");
    if (req.headers["access-control-request-private-network"]) res.setHeader("access-control-allow-private-network", "true");
  }
  if (req.method === "OPTIONS") { if (o) { res.writeHead(204); res.end(); } else core.fail(res, 403, "Not allowed"); return true; }
  if (!callerOk(req)) { core.fail(res, 403, "Not allowed"); return true; }
  if (locked(req)) { core.fail(res, 429, "Too many failed attempts. Try again in a few minutes."); return true; }
  if (u.pathname === "/api/build-config") {
    if (REMOTE) {
      if (!authed(req)) { noteFail(req); core.fail(res, 401, "Missing or wrong build token"); return true; }
      J(res, 200, { enabled: true, remote: true, sandbox: SANDBOX, env: PHONE ? "phone" : "server", version: 1 }); return true;
    }
    if (!hostOk(req) || req.headers["sec-fetch-site"] === "cross-site") { core.fail(res, 403, "Not allowed"); return true; }
    const host = String(req.headers.host || ""), port = (/:(\d+)$/.exec(host) || [, "80"])[1];
    J(res, 200, { enabled: true, token: TOKEN, sandbox: SANDBOX, env: PHONE ? "phone" : "server", root: ROOT, previewOrigin: `http://{id}.localhost:${port}`, version: 1 });
    return true;
  }
  if (!authed(req)) { noteFail(req); core.fail(res, 401, "Missing or wrong build token"); return true; }
  api(req, res, u).catch(e => {
    if (res.headersSent) return res.end();
    J(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: { message: e.message || "Error" } });
  });
  return true;
}
module.exports = { enabled: ENABLED, remote: REMOTE, warnings: WARN, remoteOrigins: REMOTE_ORIGINS, handle, upgrade, previewId, zipBuffer, crc32, safe, ROOT, TOKEN, SANDBOX };
