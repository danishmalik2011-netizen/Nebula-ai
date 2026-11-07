"use strict";
/* Shared by server.js (local) and api/proxy.js (Vercel).
   Hardening: same-origin only, host allowlist, no private/loopback targets (checked at connect time,
   so DNS rebinding can't bypass it), body size cap, per-client rate limit, request logs without paths or keys. */
const http = require("http"), https = require("https"), dns = require("dns"), net = require("net");

const env = process.env;
const MAX_BODY = (+env.MAX_BODY_MB > 0 ? +env.MAX_BODY_MB : 20) * 1048576;
const RATE = +env.RATE_LIMIT > 0 ? +env.RATE_LIMIT : 120;           // requests per minute per client
const ALLOW = (env.PROXY_ALLOW || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const ALLOW_PRIVATE = env.ALLOW_PRIVATE === "1";
const ALLOW_LOOPBACK = env.ALLOW_LOOPBACK !== "0" && !env.VERCEL;    // local Ollama / LM Studio
const DROP_REQ = new Set(["host", "origin", "referer", "connection", "x-target-url", "accept-encoding", "cookie", "upgrade",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "x-vercel-id", "x-vercel-forwarded-for", "forwarded"]);
const DROP_RES = new Set(["connection", "transfer-encoding", "set-cookie"]);

function fail(res, code, msg) {
  if (res.headersSent) return res.end();
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message: msg } }));
}
function sameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
function classify(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase(), m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (m) return classify(m[1]);
    if (l === "::1" || l === "::") return "loopback";
    if (/^f[cd]/.test(l) || /^fe[89ab]/.test(l)) return "private";
    return "public";
  }
  const p = ip.split(".").map(Number);
  if (p[0] === 127) return "loopback";
  if (p[0] === 10 || p[0] === 0 || p[0] >= 224 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)) return "private";
  return "public";
}
function blockedReason(ip) {
  const c = classify(ip);
  if (c === "loopback" && !ALLOW_LOOPBACK) return "loopback addresses are blocked by the proxy";
  if (c === "private" && !ALLOW_PRIVATE) return "private network addresses are blocked by the proxy";
  return "";
}
function guardedLookup(host, opts, cb) {
  dns.lookup(host, opts, (err, addr, fam) => {
    if (err) return cb(err);
    const list = Array.isArray(addr) ? addr : [{ address: addr, family: fam }];
    for (const a of list) {
      const why = blockedReason(a.address);
      if (why) { const e = new Error(why); e.code = "EBLOCKED"; return cb(e); }
    }
    cb(null, addr, fam);
  });
}
function allowedHost(host) {
  return !ALLOW.length || ALLOW.some(a => host === a || host.endsWith("." + a));
}
const buckets = new Map();
setInterval(() => buckets.clear(), 60000).unref();
function limited(req) {
  const k = (env.VERCEL && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
  const n = (buckets.get(k) || 0) + 1;
  buckets.set(k, n);
  return n > RATE;
}

function proxy(req, res) {
  const t0 = Date.now();
  if (!sameOrigin(req)) return fail(res, 403, "Cross-origin use of the proxy is not allowed.");
  if (limited(req)) return fail(res, 429, "Too many requests through the proxy. Try again in a minute.");
  let target;
  try {
    target = new URL(req.headers["x-target-url"] || "");
    if (!/^https?:$/.test(target.protocol)) throw 0;
  } catch { return fail(res, 400, "Missing or invalid X-Target-URL header."); }
  const host = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!allowedHost(host)) return fail(res, 403, `Host ${host} is not in the proxy allowlist.`);
  if (net.isIP(host)) { const why = blockedReason(host); if (why) return fail(res, 403, `Request blocked: ${why}.`); }
  if (+req.headers["content-length"] > MAX_BODY) return fail(res, 413, "Request body too large for the proxy.");

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!DROP_REQ.has(k) && !k.startsWith("sec-")) headers[k] = v;
  headers.host = target.host;

  const lib = target.protocol === "https:" ? https : http;
  const up = lib.request(target, { method: req.method, headers, lookup: guardedLookup }, ur => {
    const h = {};
    for (const [k, v] of Object.entries(ur.headers)) if (!DROP_RES.has(k) && !k.startsWith("access-control-")) h[k] = v;
    res.writeHead(ur.statusCode, h);
    ur.pipe(res);
    res.on("close", () => console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, host: target.host, status: ur.statusCode, ms: Date.now() - t0 })));
  });
  up.on("error", e => fail(res, e.code === "EBLOCKED" ? 403 : 502, e.code === "EBLOCKED" ? `Request blocked: ${e.message}.` : "Upstream error: " + e.message));
  res.on("close", () => up.destroy());
  let size = 0;
  req.on("data", c => { size += c.length; if (size > MAX_BODY) { fail(res, 413, "Request body too large for the proxy."); up.destroy(); req.destroy(); } });
  req.pipe(up);
}
module.exports = { fail, proxy, classify, sameOrigin, blockedReason, guardedLookup };
