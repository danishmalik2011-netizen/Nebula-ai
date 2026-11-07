"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const { ctx, run } = load();
const J = e => JSON.parse(run(`JSON.stringify(${e})`));

/* ---------- a tiny DOM, enough to prove the patching keeps nodes alive ---------- */
function replace(o, n) { const p = o.parent; if (n.parent) n.parent.removeChild(n); const i = p.childNodes.indexOf(o); p.childNodes[i] = n; n.parent = p; o.parent = null; }
class T { constructor(d) { this.nodeType = 3; this.data = d; this.parent = null; } replaceWith(n) { replace(this, n); } isEqualNode(o) { return o.nodeType === 3 && o.data === this.data; } }
class E {
  constructor(tag, attrs = {}, kids = []) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this._a = new Map(Object.entries(attrs)); this.childNodes = []; this.parent = null; kids.forEach(k => this.appendChild(typeof k === "string" ? new T(k) : k)); }
  get attributes() { return [...this._a].map(([name, value]) => ({ name, value })); }
  hasAttribute(n) { return this._a.has(n); } getAttribute(n) { return this._a.has(n) ? this._a.get(n) : null; }
  setAttribute(n, v) { this._a.set(n, String(v)); } removeAttribute(n) { this._a.delete(n); }
  get classList() { const s = this; return { contains: c => (s.getAttribute("class") || "").split(/\s+/).includes(c) }; }
  appendChild(k) { if (k.parent) k.parent.removeChild(k); k.parent = this; this.childNodes.push(k); return k; }
  removeChild(k) { const i = this.childNodes.indexOf(k); if (i >= 0) this.childNodes.splice(i, 1); k.parent = null; return k; }
  replaceWith(n) { replace(this, n); }
  isEqualNode(o) {
    if (!o || o.nodeType !== 1 || o.tagName !== this.tagName || this._a.size !== o._a.size || this.childNodes.length !== o.childNodes.length) return false;
    for (const [k, v] of this._a) if (o._a.get(k) !== v) return false;
    return this.childNodes.every((c, i) => c.isEqualNode(o.childNodes[i]));
  }
}
const reconcile = (a, b) => { ctx.__a = a; ctx.__b = b; run("reconcileChildren(__a,__b)"); };

test("patching keeps unchanged nodes, updates text and attributes in place, and appends only what is new", () => {
  const spinner = new E("span", { class: "act-st" }), name = new T("a.js");
  const row = new E("div", { class: "act st-run" }, [new E("span", { class: "act-t" }, [name]), spinner]);
  const para = new E("p", {}, ["Hello"]);
  const root = new E("div", {}, [para, row]);
  const next = new E("div", {}, [new E("p", {}, ["Hello"]), new E("div", { class: "act st-ok" }, [new E("span", { class: "act-t" }, ["a.js"]), new E("span", { class: "act-st" })]), new E("p", {}, ["More"])]);
  reconcile(root, next);
  assert.strictEqual(root.childNodes[0], para);
  assert.strictEqual(root.childNodes[1], row);
  assert.strictEqual(row.childNodes[1], spinner);
  assert.strictEqual(row.getAttribute("class"), "act st-ok");
  assert.strictEqual(root.childNodes.length, 3);
  assert.strictEqual(root.childNodes[2].childNodes[0].data, "More");
  const t1 = new E("div", {}, [new E("p", {}, ["streaming te"])]), p1 = t1.childNodes[0], tx = p1.childNodes[0];
  reconcile(t1, new E("div", {}, [new E("p", {}, ["streaming text so far"])]));
  assert.strictEqual(t1.childNodes[0], p1);
  assert.strictEqual(p1.childNodes[0], tx);
  assert.strictEqual(tx.data, "streaming text so far");
  reconcile(t1, new E("div", {}, []));
  assert.strictEqual(t1.childNodes.length, 0);
});
test("charts and images that finished loading are kept unless their content changed", () => {
  const host = new E("div", { class: "ui-host", "data-ui": "u1", "data-ready": "1" }, [new E("svg")]);
  const root = new E("div", {}, [host]);
  reconcile(root, new E("div", {}, [new E("div", { class: "ui-host", "data-ui": "u1" })]));
  assert.strictEqual(root.childNodes[0], host);
  reconcile(root, new E("div", {}, [new E("div", { class: "ui-host", "data-ui": "u2" })]));
  assert.notStrictEqual(root.childNodes[0], host);
  const fig = new E("figure", { class: "wimg ready", "data-q": "Paris", "data-done": "1" });
  const r2 = new E("div", {}, [fig]);
  reconcile(r2, new E("div", {}, [new E("figure", { class: "wimg", "data-q": "Paris" })]));
  assert.strictEqual(r2.childNodes[0], fig);
});

test("scrolling follows the stream only while the reader is at the bottom", () => {
  const frames = [], L = {};
  const m = { scrollHeight: 1000, scrollTop: 500, clientHeight: 500, addEventListener(t, f) { L[t] = f; }, scrollTo(o) { this.scrollTop = o.top; } };
  const orig = ctx.document.querySelector;
  ctx.document.querySelector = s => s === "#messages" ? m : (s === "#scrollBtn" ? { classList: { toggle() {} } } : orig.call(ctx.document, s));
  ctx.requestAnimationFrame = f => { frames.push(f); return frames.length; };
  run("followRaf=0;stickBottom=true;lastScrollTop=500;state.settings.autoScroll=true");
  run("initScrollFollow()");
  run("followStream()");
  assert.strictEqual(frames.length, 1);
  m.scrollHeight = 1400; frames.shift()();
  assert.strictEqual(m.scrollTop, 1400);
  m.scrollTop = 900; L.scroll();
  assert.strictEqual(run("stickBottom"), true);
  m.scrollTop = 600; L.scroll();
  assert.strictEqual(run("stickBottom"), false);
  run("followStream()");
  assert.strictEqual(frames.length, 0, "must not pull the reader back down");
  m.scrollHeight = 1800;
  m.scrollTop = 1300; L.scroll();
  assert.strictEqual(run("stickBottom"), true);
  run("followStream()");
  assert.strictEqual(frames.length, 1); frames.shift()();
  L.wheel({ deltaY: -40 });
  assert.strictEqual(run("stickBottom"), false);
  ctx.document.querySelector = orig;
});

test("file badges: format label and kind, escaped", () => {
  const f = n => run(`fileIcon(${JSON.stringify(n)})`);
  assert.match(f("src/index.html"), /fk-web[^>]*><i>HTML<\/i>/);
  assert.match(f("report.pdf"), /fk-pdf[^>]*><i>PDF<\/i>/);
  assert.match(f("deck.pptx"), /fk-ppt/);
  assert.match(f("model.xlsx"), /fk-xls/);
  assert.match(f("Dockerfile"), /fk-sh/);
  assert.match(f("weird.<b>"), /fk-file/);
  assert.ok(!f("x.<script>").includes("<script>"));
  assert.match(run('fileIcon("a.py",true)'), /fi fi-s fk-py/);
});
test("cards use the file badge, keep toggle state in the record, and collapse the plan", () => {
  ctx.__t = '<write path="src/app.py">x</write>\n<run>pytest</run>\n<plan>- [x] a\n- [ ] b</plan>\n<deliver files="report.pdf"/>';
  ctx.__o = { build: true, acts: [{ status: "ok", path: "src/app.py", summary: "10 lines" }, { status: "ok", out: "1 passed", summary: "exit 0", open: true }, { status: "ok", collapsed: true }, { status: "ok", files: [{ kind: "file", name: "report.pdf", path: "report.pdf", size: 4096 }] }] };
  const h = run("renderMarkdown(__t,__o)");
  assert.ok(h.includes("fk-py") && h.includes("<em>src/</em>") && h.includes(">app.py"));
  assert.ok(/act act-run st-ok open/.test(h) && h.includes('aria-expanded="true"'));
  assert.ok(h.includes("act-plan collapsed") && h.includes(">1/2<"));
  assert.ok(h.includes("fk-pdf") && h.includes("Ready to download"));
  ctx.__o = { build: true, acts: [{ status: "err", out: "boom", summary: "exit 1" }] };
  ctx.__t = "<run>false</run>";
  assert.ok(/act act-run st-err open/.test(run("renderMarkdown(__t,__o)")), "failed commands open by default");
  ctx.__o = { build: true, acts: [{ status: "err", out: "boom", summary: "exit 1", open: false }] };
  assert.ok(!/st-err open/.test(run("renderMarkdown(__t,__o)")), "but the reader can close them");
});

/* ---------- context, switching models, and resuming ---------- */
function msgs(n) {
  const a = [{ role: "user", content: "THE BRIEF" }];
  for (let i = 0; i < n; i++) {
    a.push({ role: "assistant", content: `<write path="f${i}.js">${"code line\n".repeat(400)}</write>` });
    a.push({ role: "user", tool: true, content: "<result>" + "o".repeat(5000) + "</result>" });
  }
  return a;
}
test("the context budget trims the oldest bulk first and keeps the brief and the latest turns whole", () => {
  ctx.__m = msgs(40);
  const before = JSON.parse(run("JSON.stringify(__m.reduce((n,m)=>n+m.content.length,0))"));
  const out = J("fitBuildContext(__m,120000)");
  const after = out.reduce((n, m) => n + m.content.length, 0);
  assert.ok(before > 300000 && after < 125000, `${before} -> ${after}`);
  assert.strictEqual(out.length, 81);
  assert.strictEqual(out[0].content, "THE BRIEF");
  assert.ok(out[1].content.includes("[content omitted]") && out[2].content.includes("older output omitted"));
  assert.ok(out[out.length - 1].content.length > 5000 && out[out.length - 2].content.includes("code line\ncode line"));
  assert.deepStrictEqual(out.map(m => m.role), J("__m.map(m=>m.role)"));
  ctx.__m = msgs(2);
  assert.strictEqual(run("fitBuildContext(__m,120000)===__m"), true);
});
test("the state note tells any model what exists, what runs, the plan, and who it is", () => {
  run('state.settings.provider="anthropic";state.settings.model="claude-test-1"');
  run('BUILD.treeWs="ws_x";BUILD.tree={files:[{p:"src",d:1},{p:"src/a.js",s:5},{p:"node_modules",d:1,hidden:1},{p:"README.md",s:9}],procs:[{name:"web",port:3000,running:true},{name:"old",running:false}]}');
  ctx.__c = { ws: "ws_x", plan: "- [x] scaffold\n- [ ] tests" };
  const n = run("buildStateNote(__c)");
  assert.ok(n.includes("claude-test-1") && n.includes("Anthropic") && n.includes("src/a.js, README.md") && !n.includes("node_modules"));
  assert.ok(n.includes("web on port 3000") && !n.includes("old on") && n.includes("- [ ] tests") && n.includes("never restart finished work"));
  run('BUILD.cfg={enabled:true,env:"phone"}');
  assert.match(run("buildStateNote(__c)"), /Android phone \(Termux\)[\s\S]*pure-Python/);
  run('BUILD.cfg={enabled:true,env:"server"}');
  assert.ok(!run("buildStateNote(__c)").includes("Termux"));
  ctx.__c = { ws: "ws_other" };
  assert.ok(!run("buildStateNote(__c)").includes("src/a.js"), "never describe another workspace");
  assert.ok(run('sysPrompt({mode:"build",ws:"ws_x",messages:[]})').includes("CURRENT STATE"));
});

function fakeWs(files = {}) {
  ctx.fetch = async (url, o = {}) => {
    const u = String(url), body = o.body ? JSON.parse(o.body) : {}, J2 = (x, s = 200) => new Response(JSON.stringify(x), { status: s });
    if (u === "/api/build-config") return J2({ enabled: true, token: "t", sandbox: "local", previewOrigin: "http://{id}.localhost:3000" });
    if (u === "/build/ws") return J2({ id: "ws_aaaaaaaaaaaa" });
    if (u.endsWith("/tree")) return J2({ name: "x", files: Object.keys(files).map(p => ({ p, s: 1 })), procs: [] });
    if (u.startsWith("/build/ws/ws_aaaaaaaaaaaa/file") && o.method === "PUT") { files[body.path] = body.content; return J2({ ok: true, lines: 1, bytes: 1 }); }
    if (u.startsWith("guides/")) return new Response("# g", { status: 200 });
    return J2({ error: { message: "unexpected " + u } }, 500);
  };
  return files;
}
const ui = () => run('bRender=()=>{};bPaint=()=>{};benchRefresh=async()=>{};renderChatList=()=>{};setSendState=()=>{};bStatus=()=>{};updateResume=()=>{};updateBadges=()=>{};fetchModels=async()=>{}');
const fresh = () => run('var chat={id:"c1",title:"App",mode:"build",ws:"",messages:[{id:"u1",role:"user",content:"make a thing",ts:1}]};state.chats=[chat];state.activeId="c1";BUILD.cfg=undefined;BUILD.stop=false;BUILD.busy=false;BUILD.error="";BUILD.tree=null');

test("a failed model call leaves a clean, resumable conversation; switching provider then continuing keeps everything", async () => {
  ui(); fresh(); const files = fakeWs();
  run(`var __n=0,__sys=[];runCompletion=async(chat,onDelta,signal)=>{__n++;__sys.push(sysPrompt(chat));
    if(__n===1){onDelta('<write path="a.txt">one</write>');throw new Error("429 rate limit")}
    if(__n===2){onDelta('<write path="b.txt">two</write><run>echo hi</run>');return}
    onDelta('<done>All set.</done>')}`);
  ctx.fetch0 = ctx.fetch;
  await run("buildAgent(chat)");
  assert.deepStrictEqual(J("chat.messages.map(m=>m.role+(m.tool?':tool':''))"), ["user", "assistant", "user:tool"]);
  assert.match(J("chat.messages[2].content"), /model request failed/);
  assert.match(run("BUILD.error"), /rate limit|429/i);
  assert.strictEqual(run("buildResumable(chat)"), true);
  assert.strictEqual(files["a.txt"], "one\n");
  run('useModel("anthropic","claude-other-9")');
  assert.deepStrictEqual([run("state.settings.provider"), run("state.settings.model")], ["anthropic", "claude-other-9"]);
  ctx.fetch = async (u, o = {}) => ctx.fetch0(u, o).then(r => r);
  // the exec route is not part of this fake, so let the second turn stop at the write
  run(`var __orig=runCompletion;runCompletion=async(c,d,s)=>{__n++;__sys.push(sysPrompt(c));d('<write path="b.txt">two</write><done>All set.</done>')}`);
  run("buildContinue()");
  await new Promise(r => setTimeout(r, 50));
  while (run("BUILD.busy")) await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(files["b.txt"], "two\n");
  assert.ok(ctx.__sys.length >= 2 && ctx.__sys[ctx.__sys.length - 1].includes("claude-other-9"));
  assert.ok(ctx.__sys[ctx.__sys.length - 1].includes("a.txt, b.txt") || ctx.__sys[ctx.__sys.length - 1].includes("a.txt"));
  assert.strictEqual(J("chat.messages.filter(m=>!m.tool).length"), 3);
  assert.strictEqual(run("buildResumable(chat)"), false, "finished work is not resumable");
});
test("an attempt that failed before doing anything is removed, and the user can retry", async () => {
  ui(); fresh(); fakeWs();
  run('runCompletion=async()=>{throw new Error("401 bad key")}');
  await run("buildAgent(chat)");
  assert.strictEqual(J("chat.messages.length"), 1);
  assert.strictEqual(run("buildResumable(chat)"), true);
  assert.match(run("BUILD.error"), /key|401/i);
});
test("resumable states", () => {
  const T = (messages, busy) => { ctx.__c = { mode: "build", id: "c1", messages }; run(`BUILD.busy=${!!busy};isStreaming=false;BUILD.error=""`); return run("buildResumable(__c)"); };
  assert.strictEqual(T([{ role: "user", content: "x" }]), true);
  assert.strictEqual(T([{ role: "user" }, { role: "assistant", acts: [{ type: "write" }] }]), true);
  assert.strictEqual(T([{ role: "user" }, { role: "assistant", acts: [{ type: "done" }] }]), false);
  assert.strictEqual(T([{ role: "user" }, { role: "assistant", acts: [] , content: "Which palette?" }]), false);
  assert.strictEqual(T([{ role: "user" }, { role: "assistant", acts: [{ type: "write" }] }], true), false);
  assert.strictEqual(T([{ role: "user" }, { role: "assistant", acts: [{ type: "write" }] }, { role: "user", tool: true }]), true);
  run("BUILD.busy=false");
});

/* ---------- custom providers ---------- */
function resetProviders() { run('state.settings.customProviders=[];state.settings.keys={};state.settings.fetched={};state.settings.provider="openai";state.settings.model="gpt-4o-mini";syncCustomProviders();updateBadges=()=>{};setSendState=()=>{};fetchModels=async()=>{};save=()=>{}'); }
test("any number of custom providers can be added, each with its own address, protocol, key and models", () => {
  resetProviders();
  ctx.__a = { name: "Together", base: " https://api.together.xyz/v1/ ", adapter: "openai", key: "k1 \n", models: ["m-a", "m-b", "m-a", " "] };
  ctx.__b = { name: "Gateway", base: "https://gw.example.com/anthropic", adapter: "anthropic", models: ["claude-x"] };
  const a = J("cpSave(__a)"), b = J("cpSave(__b)");
  assert.notStrictEqual(a.id, b.id);
  assert.match(a.id, /^cp_/);
  const pa = J(`PROVIDERS[${JSON.stringify(a.id)}]`), pb = J(`PROVIDERS[${JSON.stringify(b.id)}]`);
  assert.deepStrictEqual([pa.base, pa.adapter, pa.custom, pa.models], ["https://api.together.xyz/v1", "openai", true, ["m-a", "m-b"]]);
  assert.deepStrictEqual([pb.adapter, pb.name], ["anthropic", "Gateway"]);
  assert.strictEqual(run(`state.settings.keys[${JSON.stringify(a.id)}]`), "k1");
  assert.strictEqual(run(`providerUsable(${JSON.stringify(a.id)})`), true);
  ctx.__e = { id: a.id, name: "Together AI", base: "https://api.together.xyz/v1", adapter: "openai", models: ["m-z"] };
  run("cpSave(__e)");
  assert.strictEqual(J("state.settings.customProviders.length"), 2);
  assert.deepStrictEqual(J(`PROVIDERS[${JSON.stringify(a.id)}].models`), ["m-z"]);
});
test("models from every usable provider are combined, current first, and switching sets both together", () => {
  resetProviders();
  ctx.__a = { name: "Alpha", base: "https://a.example/v1", models: ["a1", "a2"] };
  const c = J("cpSave(__a)");
  run(`state.settings.keys.anthropic="sk-ant";state.settings.keys.openai=""`);
  run(`state.settings.fetched[${JSON.stringify(c.id)}]=["a2","a3"]`);
  assert.deepStrictEqual(J(`modelList(${JSON.stringify(c.id)})`), ["a2", "a3", "a1"]);
  const groups = J("allModelGroups()");
  const names = groups.map(g => g.name);
  assert.ok(names.includes("Anthropic") && names.includes("Alpha") && !names.includes("OpenAI"), names.join());
  run(`state.settings.provider=${JSON.stringify(c.id)};state.settings.model="a3"`);
  assert.strictEqual(J("allModelGroups()")[0].name, "Alpha");
  run('useModel("anthropic","claude-sonnet-4-20250514")');
  assert.deepStrictEqual([run("state.settings.provider"), run("state.settings.model")], ["anthropic", "claude-sonnet-4-20250514"]);
  run('useModel("nope","x")');
  assert.strictEqual(run("state.settings.provider"), "anthropic");
});
test("removing the active provider falls back to one that still works; the old single endpoint migrates", () => {
  resetProviders();
  run('state.settings.keys.openai="sk-1"');
  ctx.__a = { name: "Temp", base: "https://t.example/v1", models: ["t1"] };
  const c = J("cpSave(__a)");
  run(`useModel(${JSON.stringify(c.id)},"t1")`);
  run(`cpRemove(${JSON.stringify(c.id)})`);
  assert.strictEqual(run(`PROVIDERS[${JSON.stringify(c.id)}]`), undefined);
  assert.strictEqual(run("state.settings.provider"), "openai");
  run('state.settings.customProviders=[];state.settings.customBaseUrl="http://localhost:1234/v1";state.settings.provider="custom";state.settings.keys={custom:"abc"};state.settings.fetched={custom:["llama"]};migrateLegacyCustom()');
  const prov = run("state.settings.provider");
  assert.match(prov, /^cp_/);
  assert.strictEqual(run(`PROVIDERS[state.settings.provider].base`), "http://localhost:1234/v1");
  assert.strictEqual(run("state.settings.keys[state.settings.provider]"), "abc");
  assert.deepStrictEqual(J("modelList(state.settings.provider)"), ["llama"]);
  assert.strictEqual(run('state.settings.customBaseUrl'), "");
  assert.strictEqual(run('"custom" in PROVIDERS'), false);
});
test("model lists are fetched from the custom provider own address with its own key", async () => {
  const { ctx: c2, run: r2 } = load();
  r2('state.settings.useProxy=false;state.settings.customProviders=[];state.settings.keys={};state.settings.fetched={};syncCustomProviders();updateBadges=()=>{};setSendState=()=>{};save=()=>{};spRefresh=()=>{}');
  c2.__a = { name: "Mine", base: "https://my.example/v1/", key: "mykey", models: ["manual"] };
  const cp = JSON.parse(r2("JSON.stringify(cpSave(__a))"));
  const calls = [];
  c2.fetch = async (u, o = {}) => { calls.push([String(u), o.headers || {}]); return new Response(JSON.stringify({ data: [{ id: "zeta" }, { id: "alpha" }] }), { status: 200 }); };
  await r2("fetchModels(" + JSON.stringify(cp.id) + ")");
  assert.ok(calls.length >= 1);
  const [url, h] = calls[0];
  assert.ok(url.includes("my.example/v1/models"), url);
  assert.ok(JSON.stringify(h).includes("Bearer mykey"), JSON.stringify(h));
  assert.deepStrictEqual(JSON.parse(r2("JSON.stringify(modelList(" + JSON.stringify(cp.id) + "))")), ["alpha", "zeta", "manual"]);
});

/* ---------- calm build chat ---------- */
test("commands get readable labels; the literal command stays inside the opened row", () => {
  const L = c => run(`cmdLabel(${JSON.stringify(c)})`);
  assert.strictEqual(L("uname -a; node -v 2>/dev/null; npm -v"), "Checking the environment");
  assert.strictEqual(L("cd app && npm install express"), "Installing packages");
  assert.strictEqual(L("pip install reportlab"), "Installing Python packages");
  assert.strictEqual(L("python3 -m venv .venv"), "Creating Python environment");
  assert.strictEqual(L("npm run build"), "Building");
  assert.strictEqual(L("node --test"), "Running tests");
  assert.strictEqual(L("curl -s localhost:3000/api/items"), "Checking the app");
  assert.strictEqual(L("python3 make_report.py"), "Running make_report.py");
  assert.strictEqual(L("ls -la"), "Inspecting files");
  assert.strictEqual(L("something-unknown --flag"), "Running a command");
  ctx.__t = '<run label="Running tests">npm test</run>\n<run>uname -a</run>';
  ctx.__o = { build: true, acts: [{ status: "ok", out: "1 passed", summary: "exit 0" }, { status: "ok", out: "Linux", summary: "exit 0" }] };
  const h = run("renderMarkdown(__t,__o)");
  assert.ok(h.includes('<span class="act-t">Running tests</span>') && h.includes('<span class="act-t">Checking the environment</span>'));
  assert.ok(h.includes('<span class="act-cmd">$ npm test</span>') && !h.includes('<span class="act-t">$ '));
});
test("the plan is collapsed by default with the next step beside it, opens on demand, and only the newest plan shows", () => {
  const body = "- [x] Scaffold\n- [ ] Write css\n- [ ] Verify";
  ctx.__t = `<plan>${body}</plan>`;
  ctx.__o = { build: true, acts: [{ status: "ok" }] };
  let h = run("renderMarkdown(__t,__o)");
  assert.ok(h.includes("act-plan collapsed") && h.includes("<em>Write css</em>") && h.includes('aria-expanded="false"') && h.includes(">1/3<"));
  ctx.__o = { build: true, acts: [{ status: "ok", collapsed: false }] };
  h = run("renderMarkdown(__t,__o)");
  assert.ok(!h.includes("act-plan collapsed") && h.includes('aria-expanded="true"') && !h.includes("<em>"));
  ctx.__t = "<plan>- [x] a\n- [x] b</plan>";
  ctx.__o = { build: true, acts: [{ status: "ok" }] };
  assert.ok(run("renderMarkdown(__t,__o)").includes("All steps done"));
  ctx.__t = `Intro\n<plan>${body}</plan>\n<write path="a.js">x</write>`;
  ctx.__o = { build: true, hidePlan: true, acts: [{ status: "ok" }, { status: "ok", path: "a.js", summary: "1 lines" }] };
  h = run("renderMarkdown(__t,__o)");
  assert.ok(!h.includes("act-plan") && h.includes('data-ai="1"') && h.includes("a.js"));
});
test("older plans are hidden once a newer one exists", () => {
  run('var c9={id:"c9",mode:"build",messages:[{id:"m1",role:"assistant",acts:[{type:"plan"}]},{id:"m2",role:"assistant",acts:[{type:"write"}]},{id:"m3",role:"assistant",acts:[{type:"plan"}]}]};state.chats=[c9];state.activeId="c9"');
  assert.strictEqual(run("laterPlan(c9.messages[0])"), true);
  assert.strictEqual(run("laterPlan(c9.messages[1])"), true);
  assert.strictEqual(run("laterPlan(c9.messages[2])"), false);
});
test("cards inside the plan and download panels are clickable, and only one spinner is left in build mode", () => {
  const read = f => require("fs").readFileSync(require("path").join(__dirname, "..", "public", f), "utf8");
  assert.ok(read("js/07e-build-ui.js").includes('.act [data-ai],.act-card [data-ai]'), "plan and download buttons must be reachable by the click handler");
  const css = read("styles.css");
  assert.ok(/\.st-run \.act-st::before\{[^}]*animation:none/.test(css), "rows must not spin");
  assert.ok(/html\[data-mode="build"\] \.reason[^{]*\{display:none!important/.test(css));
  assert.ok(css.includes(".msg.pending{display:none}") && css.includes(".app.has-bbar .scroll-btn"));
});
