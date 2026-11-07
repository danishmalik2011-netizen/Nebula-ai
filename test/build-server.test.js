"use strict";
const test = require("node:test"), assert = require("node:assert");
const http = require("http"), net = require("net"), path = require("path"), fs = require("fs"), os = require("os"), zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
let srv, port, root, token, ws;
const call = (method, p, o = {}) => new Promise((res, rej) => {
  const headers = { ...(o.token === false ? {} : { "x-build-token": o.token || token }), ...(o.headers || {}) };
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const r = http.request({ host: "127.0.0.1", port, path: p, method, headers }, x => {
    const c = []; x.on("data", d => c.push(d)); x.on("end", () => res({ status: x.statusCode, headers: x.headers, buf: Buffer.concat(c), text: Buffer.concat(c).toString("utf8") }));
  });
  r.on("error", rej); r.end(o.body === undefined ? undefined : JSON.stringify(o.body));
});
const json = r => JSON.parse(r.text);
const exec = async (cmd, extra = {}) => {
  const r = await call("POST", `/build/ws/${ws}/exec`, { body: { cmd, ...extra } });
  const lines = r.text.trim().split("\n").map(l => JSON.parse(l));
  return { out: lines.filter(l => l.t === "o").map(l => l.d).join(""), exit: lines.find(l => l.t === "x") };
};

test.before(async () => {
  port = await freePort(); root = fs.mkdtempSync(path.join(os.tmpdir(), "nbroot-"));
  srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: port, NEBULA_BUILD: "1", BUILD_ROOT: root, MY_SECRET_TOKEN: "leak-me" }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise(res => srv.stdout.on("data", d => /Build mode on/.test(String(d)) && res()));
  token = json(await call("GET", "/api/build-config", { token: false })).token;
  ws = json(await call("POST", "/build/ws", { body: { name: "Test App" } })).id;
});
test.after(() => { srv.kill(); fs.rmSync(root, { recursive: true, force: true }); });

test("the token is only given to same-origin loopback callers; every route needs it", async () => {
  assert.strictEqual((await call("GET", "/api/build-config", { token: false, headers: { host: "evil.example" } })).status, 403);
  assert.strictEqual((await call("GET", "/api/build-config", { token: false, headers: { origin: "http://evil.example" } })).status, 403);
  assert.strictEqual((await call("POST", "/build/ws", { token: false, body: {} })).status, 401);
  assert.strictEqual((await call("POST", "/build/ws", { token: "wrong", body: {} })).status, 401);
  assert.strictEqual((await call("POST", "/build/ws", { headers: { host: "evil.example" }, body: {} })).status, 403);
  assert.strictEqual((await call("POST", "/build/ws", { headers: { origin: "http://evil.example" }, body: {} })).status, 403);
});
test("files: write, read, tree, edit, delete", async () => {
  const w = json(await call("PUT", `/build/ws/${ws}/file`, { body: { path: "src/app/main.js", content: "const a = 1;\nconst b = 2;\n" } }));
  assert.deepStrictEqual([w.ok, w.lines], [true, 3]);
  assert.ok(json(await call("GET", `/build/ws/${ws}/file?path=src/app/main.js`)).content.startsWith("const a = 1;"));
  const t = json(await call("GET", `/build/ws/${ws}/tree`));
  assert.ok(t.files.some(f => f.p === "src/app/main.js") && t.files.some(f => f.p === "src" && f.d) && t.name === "Test App");
  assert.strictEqual(json(await call("POST", `/build/ws/${ws}/edit`, { body: { path: "src/app/main.js", find: "const b = 2;", replace: "const b = 3;" } })).ok, true);
  assert.ok(json(await call("GET", `/build/ws/${ws}/file?path=src/app/main.js`)).content.includes("b = 3"));
  assert.strictEqual((await call("POST", `/build/ws/${ws}/edit`, { body: { path: "src/app/main.js", find: "nope", replace: "x" } })).status, 409);
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "dup.txt", content: "x x" } });
  assert.strictEqual((await call("POST", `/build/ws/${ws}/edit`, { body: { path: "dup.txt", find: "x", replace: "y" } })).status, 409);
  assert.strictEqual(json(await call("POST", `/build/ws/${ws}/edit`, { body: { path: "dup.txt", find: "x", replace: "y", all: true } })).replaced, 2);
  await call("POST", `/build/ws/${ws}/delete`, { body: { path: "dup.txt" } });
  assert.strictEqual((await call("GET", `/build/ws/${ws}/file?path=dup.txt`)).status, 404);
});
test("paths cannot escape the workspace, including through symlinks", async () => {
  assert.strictEqual((await call("PUT", `/build/ws/${ws}/file`, { body: { path: "../evil.txt", content: "x" } })).status, 400);
  assert.strictEqual((await call("PUT", `/build/ws/${ws}/file`, { body: { path: "a/../../evil.txt", content: "x" } })).status, 400);
  assert.strictEqual((await call("GET", `/build/ws/${ws}/file?path=../../etc/passwd`)).status, 400);
  assert.ok(!fs.existsSync(path.join(root, "evil.txt")));
  await exec("ln -s /tmp linkdir");
  assert.strictEqual((await call("PUT", `/build/ws/${ws}/file`, { body: { path: "linkdir/pwn.txt", content: "x" } })).status, 400);
  assert.strictEqual((await call("GET", `/build/ws/${ws}/file?path=linkdir/anything`)).status, 400);
  assert.strictEqual((await call("POST", `/build/ws/${ws}/delete`, { body: { path: "." } })).status, 400);
  assert.strictEqual((await call("GET", "/build/ws/ws_../tree")).status, 404);
});
test("commands stream output, report exit codes, run in the workspace and hide secrets", async () => {
  const a = await exec("echo hello && pwd && echo oops 1>&2");
  assert.ok(a.out.includes("hello") && a.out.includes(ws) && a.out.includes("oops") && a.exit.code === 0);
  assert.strictEqual((await exec("exit 7")).exit.code, 7);
  assert.ok((await exec("pwd", { cwd: "src/app" })).out.includes("src/app"));
  const e = await exec("echo secret=[$MY_SECRET_TOKEN] home=$HOME ci=$CI");
  assert.ok(e.out.includes("secret=[]") && e.out.includes(path.join(ws, ".home")) && e.out.includes("ci=1"));
  assert.ok((await exec("node -e \"console.log(21*2)\"")).out.includes("42"));
  const t0 = Date.now(), k = await exec("sleep 8", { timeout: 1 });
  assert.ok(k.exit.timedOut && Date.now() - t0 < 5000);
  if (spawnSync("python3", ["-V"]).status === 0) assert.ok((await exec("python3 -c \"print(sum(range(5)))\"")).out.includes("10"));
});
test("zip skips heavy folders and symlinks, and every entry decompresses correctly", async () => {
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "README.md", content: "# Hello\n" + "line\n".repeat(200) } });
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "run.sh", content: "#!/bin/sh\necho hi\n", exec: true } });
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "node_modules/pkg/index.js", content: "heavy" } });
  const z = await call("GET", `/build/ws/${ws}/zip?name=my%20app`);
  assert.strictEqual(z.headers["content-type"], "application/zip");
  assert.match(z.headers["content-disposition"], /my_app\.zip/);
  const b = z.buf, eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), n = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16); const entries = {};
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16), cs = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42), attr = b.readUInt32LE(p + 38);
    const name = b.subarray(p + 46, p + 46 + nl).toString(), lnl = b.readUInt16LE(off + 26), lel = b.readUInt16LE(off + 28), data = b.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + cs);
    const raw = method === 8 ? zlib.inflateRawSync(data) : data;
    assert.strictEqual(require("../build-core").crc32(raw), crc, name);
    entries[name] = { raw, mode: attr >>> 16 }; p += 46 + nl + el + cl;
  }
  assert.ok(entries["README.md"] && entries["src/app/main.js"] && entries["run.sh"]);
  assert.ok(!Object.keys(entries).some(k => /node_modules|\.home|\.nebula\.json|linkdir/.test(k)));
  assert.ok(entries["README.md"].raw.toString().startsWith("# Hello"));
  assert.ok((entries["run.sh"].mode & 0o111) !== 0);
  const py = spawnSync("python3", ["-c", "import zipfile,sys,io;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));print(z.testzip())"], { input: z.buf });
  if (py.status === 0) assert.strictEqual(py.stdout.toString().trim(), "None");
});
test("preview: static files, SPA fallback, running servers through the proxy, no traversal", async () => {
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "index.html", content: "<!doctype html><title>x</title><h1>Hi</h1>" } });
  await call("PUT", `/build/ws/${ws}/file`, { body: { path: "style.css", content: "h1{color:red}" } });
  const h = { host: `${ws}.localhost:${port}` };
  const idx = await call("GET", "/", { token: false, headers: h });
  assert.ok(idx.status === 200 && idx.text.includes("<h1>Hi</h1>") && /text\/html/.test(idx.headers["content-type"]));
  assert.match((await call("GET", "/style.css", { token: false, headers: h })).headers["content-type"], /text\/css/);
  assert.strictEqual((await call("GET", "/some/spa/route", { token: false, headers: h })).status, 200);
  assert.strictEqual((await call("GET", "/missing.js", { token: false, headers: h })).status, 404);
  assert.notStrictEqual((await call("GET", "/..%2f..%2f..%2fetc/passwd", { token: false, headers: h })).status, 200);
  assert.strictEqual((await call("GET", "/", { token: false, headers: { host: `ws_000000000000.localhost:${port}` } })).status, 404);
  const sp = await freePort();
  const st = json(await call("POST", `/build/ws/${ws}/proc/start`, { body: { name: "web", port: sp, wait: 15, cmd: "node -e \"require('http').createServer((q,r)=>r.end('live '+q.url+' '+(process.env.PORT))).listen(process.env.PORT)\"" } }));
  assert.strictEqual(st.ready, true);
  assert.strictEqual((await call("GET", "/api/ping?x=1", { token: false, headers: h })).text, `live /api/ping?x=1 ${sp}`);
  assert.strictEqual(json(await call("GET", `/build/ws/${ws}/proc`)).procs[0].running, true);
  assert.strictEqual(json(await call("POST", `/build/ws/${ws}/proc/stop`, { body: { name: "web" } })).stopped, 1);
  await new Promise(r => setTimeout(r, 400));
  assert.ok((await call("GET", "/", { token: false, headers: h })).text.includes("<h1>Hi</h1>"));
  const bad = json(await call("POST", `/build/ws/${ws}/proc/start`, { body: { name: "crash", port: await freePort(), wait: 10, cmd: "node -e \"console.error('boom');process.exit(3)\"" } }));
  assert.strictEqual(bad.exit.code, 3);
  assert.ok(bad.log.includes("boom"));
});
test("fetch for documentation works for public pages only", async () => {
  for (const u of ["http://127.0.0.1:1/", "http://10.0.0.1/", "http://169.254.169.254/", "http://[::1]:1/", "http://localhost:1/", "file:///etc/passwd"]) {
    const r = await call("POST", "/build/fetch", { body: { url: u } });
    assert.ok(r.status === 403 || r.status === 400, u + " -> " + r.status);
  }
});
test("workspaces can be listed and deleted", async () => {
  const id2 = json(await call("POST", "/build/ws", { body: { name: "Temp" } })).id;
  assert.ok(json(await call("GET", "/build/ws")).items.some(i => i.id === id2));
  assert.strictEqual(json(await call("POST", `/build/ws/${id2}/delete-ws`, { body: {} })).ok, true);
  assert.ok(!fs.existsSync(path.join(root, id2)));
});
