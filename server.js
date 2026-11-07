#!/usr/bin/env node
"use strict";
/* Nebula server — zero dependencies, Node 18+.
   Serves ./public and relays provider requests through /proxy so the browser never hits CORS. */
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = +process.env.PORT || 3000, HOST = process.env.HOST || "127.0.0.1";
const PUB = path.join(__dirname, "public");
const SEC = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".webmanifest": "application/manifest+json"
};
const { fail, proxy } = require("./proxy-core");
const build = require("./build-core");

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname); } catch { return fail(res, 400, "Bad path"); }
  const file = path.join(PUB, rel);
  if (!file.startsWith(PUB + path.sep)) return fail(res, 403, "Forbidden");
  fs.readFile(file, (err, buf) => {
    if (err) return fail(res, 404, "Not found");
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache", ...SEC });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (build.enabled && build.handle(req, res, u)) return;
  if (u.pathname === "/api/health" || u.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ nebula: true, version: "1.0.0" }));
  }
  if (u.pathname === "/proxy") return proxy(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Method not allowed");
  serveStatic(req, res, u.pathname);
});

server.on("upgrade", (req, socket, head) => { if (!(build.enabled && build.upgrade(req, socket, head))) socket.destroy(); });
server.on("error", e => {
  console.error(e.code === "EADDRINUSE" ? `Port ${PORT} is busy. Try: PORT=3001 npm start` : e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`Nebula running at http://${HOST}:${PORT}`);
  if (build.enabled) console.log(`Build mode on (${build.SANDBOX} sandbox). Workspaces: ${build.ROOT}`);
  if (build.enabled && build.remote) console.log(`Build mode accepts remote connections from: ${build.remoteOrigins.join(", ")}`);
  if (build.enabled) for (const w of build.warnings) console.warn("WARNING: " + w);
});
