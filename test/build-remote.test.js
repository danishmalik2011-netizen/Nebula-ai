"use strict";
const test = require("node:test"), assert = require("node:assert");
const http = require("http"), net = require("net"), path = require("path"), fs = require("fs"), os = require("os");
const { spawn } = require("child_process");

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const TOKEN = "t".repeat(8) + "k".repeat(24), ORIGIN = "https://app.example.com", HOSTH = "build.example.net";
let srv, port, root, ws, pvPath;
const call = (method, p, o = {}) => new Promise((res, rej) => {
  const headers = { host: HOSTH, ...(o.token === false ? {} : { "x-build-token": o.token || TOKEN }), ...(o.origin === undefined ? { origin: ORIGIN } : o.origin ? { origin: o.origin } : {}), ...(o.headers || {}) };
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const r = http.request({ host: "127.0.0.1", port, path: p, method, headers }, x => {
    const c = []; x.on("data", d => c.push(d)); x.on("end", () => res({ status: x.statusCode, headers: x.headers, text: Buffer.concat(c).toString("utf8") }));
  });
  r.on("error", rej); r.end(o.body === undefined ? undefined : JSON.stringify(o.body));
});
const json = r => JSON.parse(r.text);
const start = (env) => new Promise((resolve) => {
  const p = freePort().then(pt => {
    const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: pt, NEBULA_BUILD: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; const on = d => { out += String(d); if (/Build mode on/.test(out) && !child._ready) { child._ready = true; setTimeout(() => resolve({ child, port: pt, log: () => out }), 50); } };
    child.stdout.on("data", on); child.stderr.on("data", on);
  });
});

test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nbremote-"));
  const s = await start({ BUILD_ROOT: root, BUILD_TOKEN: TOKEN, BUILD_REMOTE_ORIGINS: ORIGIN + "/", BUILD_REMOTE_UNSAFE: "1" });
  srv = s.child; port = s.port;
  ws = json(await call("POST", "/build/ws", { body: { name: "Remote" } })).id;
  pvPath = json(await call("GET", `/build/ws/${ws}/preview-url`)).path;
});
test.after(() => { srv.kill(); fs.rmSync(root, { recursive: true, force: true }); });

test("remote mode is refused without a long token, or without a sandbox unless explicitly accepted", async () => {
  const r1 = await start({ BUILD_ROOT: root, BUILD_TOKEN: "short", BUILD_REMOTE_ORIGINS: ORIGIN, BUILD_REMOTE_UNSAFE: "1" });
  assert.match(r1.log(), /BUILD_TOKEN is missing or shorter/); r1.child.kill();
  const r2 = await start({ BUILD_ROOT: root, BUILD_TOKEN: TOKEN, BUILD_REMOTE_ORIGINS: ORIGIN });
  assert.match(r2.log(), /Remote access refused/); r2.child.kill();
});
test("CORS: only the allowed site gets headers; preflight works; others are refused", async () => {
  const ok = await call("OPTIONS", "/build/ws", { token: false, headers: { "access-control-request-method": "POST" } });
  assert.strictEqual(ok.status, 204);
  assert.strictEqual(ok.headers["access-control-allow-origin"], ORIGIN);
  assert.match(ok.headers["access-control-allow-headers"], /x-build-token/);
  const pna = await call("OPTIONS", "/build/ws", { token: false, headers: { "access-control-request-private-network": "true" } });
  assert.strictEqual(pna.headers["access-control-allow-private-network"], "true");
  assert.strictEqual(ok.headers["access-control-allow-private-network"], undefined);
  const bad = await call("OPTIONS", "/build/ws", { token: false, origin: "https://evil.example" });
  assert.strictEqual(bad.status, 403);
  assert.strictEqual(bad.headers["access-control-allow-origin"], undefined);
  assert.strictEqual((await call("POST", "/build/ws", { origin: "https://evil.example", body: {} })).status, 403);
});
test("the token is required and is never handed out; the config shows remote mode", async () => {
  assert.strictEqual((await call("GET", "/api/build-config", { token: false })).status, 401);
  assert.strictEqual((await call("GET", "/api/build-config", { token: "x".repeat(32) })).status, 401);
  const r = await call("GET", "/api/build-config");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers["access-control-allow-origin"], ORIGIN);
  const c = json(r);
  assert.ok(c.remote && c.enabled && !("token" in c) && !r.text.includes(TOKEN));
  assert.ok(c.env === "server" || c.env === "phone");
  assert.strictEqual((await call("POST", "/build/ws", { token: false, body: {} })).status, 401);
  assert.strictEqual((await call("POST", "/build/ws", { origin: null, body: { name: "curl" } })).status, 200);
});
test("path previews: capability URL, rewritten absolute links, base tag, SPA fallback, no guessing", async () => {
  assert.match(pvPath, new RegExp(`^/p/[0-9a-f]{32}/${ws}/$`));
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "index.html", content: '<!doctype html><html><head><title>x</title><link rel="stylesheet" href="/style.css"></head><body><script src="/app.js"></script><a href="https://x.test/">x</a><a href="//cdn.test/y">y</a></body></html>' } });
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "app.js", content: "console.log(1)" } });
  const r = await call("GET", pvPath, { token: false, origin: null, headers: { host: "other.host" } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.text.includes(`href="${pvPath}style.css"`) && r.text.includes(`src="${pvPath}app.js"`) && r.text.includes(`<base href="${pvPath}">`));
  assert.ok(r.text.includes('href="https://x.test/"') && r.text.includes('href="//cdn.test/y"'));
  assert.match((await call("GET", pvPath + "app.js", { token: false, origin: null })).headers["content-type"], /javascript/);
  assert.strictEqual((await call("GET", pvPath + "deep/route", { token: false, origin: null })).status, 200);
  assert.strictEqual((await call("GET", pvPath.slice(0, -1), { token: false, origin: null })).status, 301);
  const wrong = pvPath.replace(/\/p\/[0-9a-f]{32}\//, "/p/" + "0".repeat(32) + "/");
  assert.strictEqual((await call("GET", wrong, { token: false, origin: null })).status, 404);
  assert.notStrictEqual((await call("GET", pvPath + "..%2f..%2f..%2fetc/passwd", { token: false, origin: null })).status, 200);
});
test("path previews proxy a running app, rewriting html and redirects", async () => {
  const sp = await freePort();
  const code = `require('http').createServer((q,r)=>{if(q.url==='/redir'){r.writeHead(302,{location:'/landed'});return r.end()}r.writeHead(200,{'content-type':'text/html'});r.end('<html><head></head><body><link href="/x.css"><p>'+q.url+'</p></body></html>')}).listen(process.env.PORT)`;
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "app-server.js", content: code } });
  const st = json(await call("POST", `/build/ws/${ws}/proc/start`, { body: { name: "web", port: sp, wait: 15, cmd: "node app-server.js" } }));
  assert.strictEqual(st.ready, true);
  const a = await call("GET", pvPath + "page?q=1", { token: false, origin: null });
  assert.ok(a.text.includes("<p>/page?q=1</p>") && a.text.includes(`href="${pvPath}x.css"`) && a.text.includes(`<base href="${pvPath}">`));
  const b = await call("GET", pvPath + "redir", { token: false, origin: null });
  assert.strictEqual(b.status, 302);
  assert.strictEqual(b.headers.location, pvPath.slice(0, -1) + "/landed");
  await call("POST", `/build/ws/${ws}/proc/stop`, { body: { name: "web" } });
});
test("repeated wrong tokens lock the caller out", async () => {
  for (let i = 0; i < 21; i++) await call("GET", "/api/build-config", { token: "z".repeat(32) });
  assert.strictEqual((await call("GET", "/api/build-config")).status, 429);
});
