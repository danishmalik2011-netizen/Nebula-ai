"use strict";
const test = require("node:test"), assert = require("node:assert");
const http = require("http"), net = require("net"), path = require("path");
const { spawn } = require("child_process");

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
async function start(env = {}) {
  const port = await freePort();
  const p = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: port, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise(res => p.stdout.on("data", d => /running/.test(String(d)) && res()));
  return { port, stop: () => p.kill() };
}
const call = (port, o = {}) => new Promise((res, rej) => {
  const r = http.request({ port, host: "127.0.0.1", path: o.path || "/proxy", method: o.method || "GET", headers: o.headers || {} }, x => {
    let b = ""; x.on("data", c => (b += c)); x.on("end", () => res({ status: x.statusCode, body: b }));
  });
  r.on("error", rej); r.end(o.body);
});
const up = () => new Promise(r => { const s = http.createServer((q, a) => { a.end("upstream-ok"); }).listen(0, "127.0.0.1", () => r(s)); });

test("serves the app, health and healthz", async () => {
  const s = await start();
  try {
    assert.strictEqual((await call(s.port, { path: "/" })).status, 200);
    assert.match((await call(s.port, { path: "/healthz" })).body, /nebula/);
    assert.strictEqual((await call(s.port, { path: "/js/01-core.js" })).status, 200);
    assert.strictEqual((await call(s.port, { path: "/../server.js" })).status, 404);
  } finally { s.stop(); }
});
test("relays to loopback upstream (local models) by default", async () => {
  const u = await up(), s = await start();
  try {
    const r = await call(s.port, { headers: { "x-target-url": `http://127.0.0.1:${u.address().port}/` } });
    assert.deepStrictEqual([r.status, r.body], [200, "upstream-ok"]);
  } finally { s.stop(); u.close(); }
});
test("blocks private, link-local and (optionally) loopback targets", async () => {
  const s = await start(), s2 = await start({ ALLOW_LOOPBACK: "0" }), u = await up();
  try {
    for (const t of ["http://10.0.0.1/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://[fd00::1]/"])
      assert.strictEqual((await call(s.port, { headers: { "x-target-url": t } })).status, 403, t);
    assert.strictEqual((await call(s2.port, { headers: { "x-target-url": `http://127.0.0.1:${u.address().port}/` } })).status, 403);
    assert.strictEqual((await call(s2.port, { headers: { "x-target-url": `http://localhost:${u.address().port}/` } })).status, 403);
  } finally { s.stop(); s2.stop(); u.close(); }
});
test("rejects cross-origin callers and missing target", async () => {
  const s = await start();
  try {
    assert.strictEqual((await call(s.port, { headers: { origin: "http://evil.example", "x-target-url": "http://127.0.0.1:1/" } })).status, 403);
    assert.strictEqual((await call(s.port, { headers: { "sec-fetch-site": "cross-site", "x-target-url": "http://127.0.0.1:1/" } })).status, 403);
    assert.strictEqual((await call(s.port)).status, 400);
  } finally { s.stop(); }
});
test("allowlist, body cap and rate limit", async () => {
  const u = await up(), a = await start({ PROXY_ALLOW: "api.openai.com" }), b = await start({ MAX_BODY_MB: "0.001" }), c = await start({ RATE_LIMIT: "2" });
  try {
    const t = { "x-target-url": `http://127.0.0.1:${u.address().port}/` };
    assert.strictEqual((await call(a.port, { headers: t })).status, 403);
    assert.strictEqual((await call(b.port, { method: "POST", headers: { ...t, "content-length": "5000" }, body: "x".repeat(5000) })).status, 413);
    const codes = []; for (let i = 0; i < 3; i++) codes.push((await call(c.port, { headers: t })).status);
    assert.deepStrictEqual(codes, [200, 200, 429]);
  } finally { a.stop(); b.stop(); c.stop(); u.close(); }
});
