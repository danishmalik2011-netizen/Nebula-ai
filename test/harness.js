"use strict";
/* Loads the browser scripts in order into a vm with a stub DOM, so logic can be tested without a browser. */
const vm = require("vm"), fs = require("fs"), path = require("path");
function load() {
  const dir = path.join(__dirname, "..", "public", "js");
  const mk = () => new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "length" ? 0 : mk()),
    set: () => true, apply: () => mk(), construct: () => mk()
  });
  const store = {};
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, TextDecoder, TextEncoder, URL, Blob, Response,
    ReadableStream, URLSearchParams, FormData, AbortController, crypto: require("crypto").webcrypto, btoa, atob, Event: function () {},
    document: { readyState: "loading", querySelector: () => mk(), querySelectorAll: () => [], addEventListener() {},
      createElement: () => mk(), documentElement: { style: { setProperty() {} }, dataset: {} }, body: mk() },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {}, innerWidth: 1400 },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { origin: "http://x" }, navigator: {}, requestAnimationFrame() {}, confirm: () => true, innerWidth: 1400, innerHeight: 900
  };
  ctx.fetch = async () => { throw new Error("no fetch stubbed"); };
  vm.createContext(ctx);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js")).sort())
    vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
  return { ctx, run: s => vm.runInContext(s, ctx) };
}
const sse = lines => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const l of lines) c.enqueue(e.encode(l + "\n\n")); c.close(); } }), { status: 200 });
module.exports = { load, sse };
