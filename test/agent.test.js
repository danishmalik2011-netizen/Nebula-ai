"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const { ctx, run } = load();
const J = e => JSON.parse(run(`JSON.stringify(${e})`));
const S = t => { ctx.__s = t; return JSON.parse(run("JSON.stringify(scanActs(__s))")); };

test("actions are found, in order, with attributes and bodies", () => {
  const r = S('Intro.\n<plan>- [ ] a</plan>\n<write path="src/a.js">\nconst x = 1;\n</write>\n<run cwd="." timeout="60">npm test</run>\n<read path="a" lines="1-5"/>\n<serve name="web" port="3000" cmd="node s.js"/>');
  assert.deepStrictEqual(r.acts.map(a => a.type), ["plan", "write", "run", "read", "serve"]);
  assert.strictEqual(r.acts[1].attrs.path, "src/a.js");
  assert.strictEqual(r.acts[2].body, "npm test");
  assert.deepStrictEqual([r.acts[3].attrs.lines, r.acts[4].attrs.port, r.acts[4].attrs.cmd], ["1-5", "3000", "node s.js"]);
  assert.strictEqual(r.open, null);
});
test("a file body keeps tags that look like actions; fenced examples are ignored", () => {
  const r = S('<write path="doc.md">Use <run>cmd</run> to run things.\n```\n<delete path="x"/>\n```\n</write>\nSee:\n```\n<run>rm -rf /</run>\n```\n<done>ok</done>');
  assert.deepStrictEqual(r.acts.map(a => a.type), ["write", "done"]);
  assert.ok(r.acts[0].body.includes("<run>cmd</run>"));
});
test("an unfinished action is reported while streaming", () => {
  const r = S('Working\n<write path="a/b.txt">line1\nline2');
  assert.strictEqual(r.acts.length, 0);
  assert.deepStrictEqual([r.open.type, r.open.attrs.path, r.open.body], ["write", "a/b.txt", "line1\nline2"]);
  assert.strictEqual(S("<run>npm inst").open.type, "run");
  assert.strictEqual(S('<write path="a').open.type, "write");
  assert.strictEqual(S('<read path="a">no close and no slash').acts[0].type, "read");
});
test("file bodies are normalised; edits are parsed", () => {
  assert.strictEqual(run('fileBody("\\nhello\\nworld\\n\\n")'), "hello\nworld\n");
  assert.strictEqual(run('fileBody("\\n```js\\nlet a=1;\\n```\\n")'), "let a=1;\n");
  assert.strictEqual(run('fileBody("")'), "");
  assert.deepStrictEqual(J('editPairs("<find>\\nold 1\\n</find><replace>\\nnew 1\\n</replace> <find>a</find><replace></replace>")'), [["old 1", "new 1"], ["a", ""]]);
});
test("old turns are condensed for the model, recent ones are kept whole", () => {
  const msgs = [{ role: "user", content: "build it" }];
  for (let i = 0; i < 9; i++) {
    msgs.push({ role: "assistant", content: `<write path="f${i}.js">${"line\n".repeat(50)}</write>` });
    msgs.push({ role: "user", tool: true, content: "<result>" + "x".repeat(2000) + "</result>" });
  }
  ctx.__m = msgs;
  const out = J("compactBuildMessages(__m)");
  assert.strictEqual(out[0].content, "build it");
  assert.match(out[1].content, /\[51 lines written\]/);
  assert.ok(out[2].content.length < 700 && out[2].content.includes("older output omitted"));
  assert.ok(out[out.length - 2].content.includes("line\nline\nline"));
  assert.ok(out[out.length - 1].content.length > 1900);
});
test("cards: files, commands, deliverables; statuses and escaping; chat mode untouched", () => {
  ctx.__t = 'Making it.\n<write path="a.js">x</write>\n<run>echo "<b>hi</b>"</run>\n<deliver name="app" zip="true"/>';
  ctx.__o = { build: true, acts: [{ status: "ok", path: "a.js", summary: "1 lines" }, { status: "err", summary: "exit 1 · 0.1s", out: "<script>bad</script>\nboom" }, { status: "ok", files: [{ kind: "zip", name: "app", paths: [] }, { kind: "file", name: "r.pdf", path: "r.pdf", size: 2048 }] }] };
  const h = run("renderMarkdown(__t,__o)");
  assert.ok(h.includes("act-link act-file st-ok") && h.includes(">a.js<") && h.includes('data-ai="0"'));
  assert.ok(h.includes("act-run st-err") && h.includes("&lt;script&gt;bad") && !h.includes("<script>") && h.includes("act-out"));
  assert.ok(h.includes("app.zip") && h.includes("r.pdf") && h.includes('data-pv="1"') && h.includes("Download"));
  assert.ok(h.indexOf("Making it.") < h.indexOf("a.js"));
  ctx.__o = {};
  assert.ok(run("renderMarkdown(__t,__o)").includes("&lt;write"));
  ctx.__t = 'Example:\n```\n<run>rm -rf /</run>\n```';
  ctx.__o = { build: true, acts: [] };
  const fenced = run("renderMarkdown(__t,__o)");
  assert.ok(fenced.includes("code-block") && !fenced.includes("act-run"));
  ctx.__t = '<write path="big.txt">line1\nline2';
  assert.ok(run("renderMarkdown(__t,{build:true,acts:[]})").includes("2 lines"));
});
test("the sanitizer allowlist covers the card markup and nothing broader", () => {
  const classes = "act act-run act-link act-file act-chip act-ic act-t act-s act-st act-h act-out act-dl act-dh act-df act-b act-done act-plan act-body act-wrap act-cv act-lab act-prog act-card fi fi-s fk-web fk-pdf md pri open collapsed st-ok st-err st-run st-wait".split(" ");
  ctx.__c = classes;
  assert.strictEqual(run("__c.every(c=>OK_CLASS.test(c))"), true);
  for (const bad of ["evil", "act-x", "st-bogus", "bn-row"]) { ctx.__b = bad; assert.strictEqual(run("OK_CLASS.test(__b)"), false, bad); }
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "js", "07-features.js"), "utf8");
  assert.ok(/data-ai[\s\S]{0,120}BUTTON[\s\S]{0,60}\\d\{1,3\}/.test(src));
});

/* ---- a scripted model working against a fake workspace server ---- */
function fakeServer(log, opts = {}) {
  const files = {};
  ctx.fetch = async (url, o = {}) => {
    const u = String(url), body = o.body ? JSON.parse(o.body) : {};
    const J2 = (x, s = 200) => new Response(JSON.stringify(x), { status: s });
    log.push([o.method || "GET", u.split("?")[0], body]);
    if (u === "/api/build-config") return J2({ enabled: true, token: "t", sandbox: "local", previewOrigin: "http://{id}.localhost:3000" });
    if (u === "/build/ws") return J2({ id: "ws_aaaaaaaaaaaa" });
    if (u.endsWith("/tree")) return J2({ name: "x", files: Object.keys(files).map(p => ({ p, s: files[p].length })), procs: [] });
    if (u.startsWith("/build/ws/ws_aaaaaaaaaaaa/file") && o.method === "PUT") { files[body.path] = body.content; return J2({ ok: true, lines: body.content.split("\n").length, bytes: body.content.length }); }
    if (u.endsWith("/edit")) return opts.editFail ? J2({ error: { message: "The text to replace was not found." } }, 409) : J2({ ok: true, replaced: 1 });
    if (u.endsWith("/exec")) {
      const r = opts.exec ? opts.exec(body.cmd) : { code: 0, out: "ok\n" };
      const enc = new TextEncoder();
      return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(JSON.stringify({ t: "o", d: r.out }) + "\n" + JSON.stringify({ t: "x", code: r.code, ms: 12, timedOut: false }) + "\n")); c.close(); } }), { status: 200 });
    }
    if (u.startsWith("guides/")) return new Response("# Guide\nbe good", { status: 200 });
    return J2({ error: { message: "unexpected " + u } }, 500);
  };
  return files;
}
function scriptModel(turns) {
  ctx.__turns = turns; ctx.__i = 0; ctx.__seen = [];
  run(`runCompletion=async(chat,onDelta,signal)=>{
    __seen.push(chat.messages.map(m=>m.role+(m.tool?":tool":"")).join(","));
    const t=__turns[__i++]; if(t===undefined)throw new Error("script exhausted");
    for(let k=0;k<t.length;k+=9){ if(signal&&signal.aborted){const e=new Error("aborted");e.name="AbortError";throw e} onDelta(t.slice(k,k+9)); }
    if(signal&&signal.aborted){const e=new Error("aborted");e.name="AbortError";throw e}
  }`);
}
const stubUi = () => run('bRender=()=>{};bPaint=()=>{};benchRefresh=async()=>{};renderChatList=()=>{};setSendState=()=>{};bStatus=()=>{}');
const newChat = () => run('var chat={id:"c1",title:"App",mode:"build",ws:"",messages:[{id:"u1",role:"user",content:"make a thing",ts:1}]};state.chats=[chat];state.activeId="c1";BUILD.cfg=undefined;BUILD.stop=false');

test("agent loop: writes immediately, runs, reads the result, finishes with done", async () => {
  stubUi(); newChat();
  const log = [], files = fakeServer(log);
  scriptModel(['Starting.\n<plan>- [ ] a\n- [ ] b</plan>\n<write path="hello.txt">hi\n</write>\n<run>echo ok</run> text after the run must be cut', 'Great, it works.\n<done>Built it. Run npm start.</done>']);
  await run("buildAgent(chat)");
  assert.deepStrictEqual(J("chat.messages.map(m=>m.role+(m.tool?':tool':''))"), ["user", "assistant", "user:tool", "assistant"]);
  const a1 = J("chat.messages[1]");
  assert.ok(!a1.content.includes("text after the run"));
  assert.deepStrictEqual(a1.acts.map(a => [a.type, a.status]), [["plan", "ok"], ["write", "ok"], ["run", "ok"]]);
  assert.strictEqual(files["hello.txt"], "hi\n");
  const tool = J("chat.messages[2].content");
  assert.ok(tool.includes('<result type="run"') && tool.includes("exit code 0") && tool.includes("[step 1 of 80]") && tool.includes('path="hello.txt"'));
  assert.strictEqual(J("chat.messages[3].acts[0].type"), "done");
  assert.strictEqual(run("BUILD.busy"), false);
  assert.strictEqual(run("isStreaming"), false);
  assert.strictEqual(run("chat.ws"), "ws_aaaaaaaaaaaa");
  assert.strictEqual(ctx.__seen[1], "user,assistant,user:tool");
  assert.ok(run('sysPrompt({mode:"build",messages:[]})').includes("You are Nebula Build"));
  assert.ok(!run('sysPrompt({mode:"chat",messages:[]})').includes("You are Nebula Build"));
});
test("failures are fed back, repeated ones trigger a change of approach, and edit conflicts are reported", async () => {
  stubUi(); newChat();
  fakeServer([], { exec: c => c.includes("npm test") ? { code: 1, out: "Error: boom at index.js:4\n" } : { code: 0, out: "fine\n" }, editFail: true });
  scriptModel(['<run>npm test</run>', '<run>npm test</run>', '<edit path="a.js"><find>x</find><replace>y</replace></edit><run>npm test</run>', '<done>gave up</done>']);
  await run("buildAgent(chat)");
  const tools = J("chat.messages.filter(m=>m.tool).map(m=>m.content)");
  assert.ok(tools[0].includes('status="err"') && tools[0].includes("Error: boom") && tools[0].includes("A command failed"));
  assert.ok(!tools[0].includes("same failure"));
  assert.ok(tools[2].includes("same failure has now happened 3 times"));
  assert.ok(tools[2].includes("ERROR: The text to replace was not found."));
});
test("guides load, and a text-only reply hands control back to the user", async () => {
  stubUi(); newChat(); fakeServer([]);
  scriptModel(['<guide name="frontend"/>', 'I need one more detail: which colour palette do you prefer?']);
  await run("buildAgent(chat)");
  assert.deepStrictEqual(J("chat.messages.map(m=>m.role+(m.tool?':tool':''))"), ["user", "assistant", "user:tool", "assistant"]);
  const t = J("chat.messages[2].content");
  assert.ok(t.includes("GUIDE frontend") && t.includes("be good"));
  assert.strictEqual(run("BUILD.busy"), false);
});
test("stopping ends the run cleanly and leaves the app usable", async () => {
  stubUi(); newChat(); fakeServer([]);
  run(`var __calls=0;runCompletion=async(chat,onDelta,signal)=>{__calls++;onDelta('<write path="a.txt">1</write>');buildStop();if(signal&&signal.aborted){const e=new Error("aborted");e.name="AbortError";throw e}onDelta("more")}`);
  await run("buildAgent(chat)");
  assert.strictEqual(run("__calls"), 1);
  assert.strictEqual(run("BUILD.busy"), false);
  assert.strictEqual(run("isStreaming"), false);
  assert.ok(J("chat.messages.length") <= 3);
});
test("write paths are cleaned, and the model gets a clear error for a malformed action", async () => {
  stubUi(); newChat();
  const files = fakeServer([]);
  scriptModel(['<write path="./src//x.js">a</write><write path="/abs.txt">b</write><write>no path</write><ls path="."/>', '<done>d</done>']);
  await run("buildAgent(chat)");
  assert.ok("src//x.js" in files || "src/x.js" in files);
  assert.ok("abs.txt" in files);
  const a = J("chat.messages[1].acts");
  assert.strictEqual(a[2].status, "err");
  assert.ok(a[2].summary.includes("write needs a path"));
});
test("a remote build server is addressed by URL with the token, and failures are explained", async () => {
  stubUi();
  run('BUILD.cfg=undefined;state.settings.buildServer="https://b.example/";state.settings.keys={buildServer:"tok123"}');
  const seen = [];
  ctx.fetch = async (u, o = {}) => { seen.push([String(u), o.headers || {}]); return new Response(JSON.stringify({ enabled: true, remote: true, sandbox: "docker" }), { status: 200 }); };
  const cfg = await run("buildConfig(true)");
  assert.deepStrictEqual([cfg.remote, cfg.token, run("BUILD.base")], [true, "tok123", "https://b.example"]);
  assert.strictEqual(seen[0][0], "https://b.example/api/build-config");
  assert.strictEqual(seen[0][1]["x-build-token"], "tok123");
  seen.length = 0;
  await run('bApi("/build/ws/ws_aaaaaaaaaaaa/tree")');
  assert.strictEqual(seen[0][0], "https://b.example/build/ws/ws_aaaaaaaaaaaa/tree");
  assert.strictEqual(seen[0][1]["x-build-token"], "tok123");
  ctx.fetch = async () => new Response("{}", { status: 401 });
  await run("buildConfig(true)");
  assert.strictEqual(run("BUILD.cfg"), null);
  assert.match(run("BUILD.err"), /token was rejected/);
  ctx.fetch = async () => new Response("{}", { status: 403 });
  await run("buildConfig(true)");
  assert.match(run("BUILD.err"), /BUILD_REMOTE_ORIGINS/);
  ctx.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await run("buildConfig(true)");
  assert.match(run("BUILD.err"), /reach https:\/\/b\.example/);
  run('state.settings.buildServer="";state.settings.keys={};BUILD.cfg=undefined;BUILD.base=""');
});
test("the mode switch keeps build and chat conversations apart", () => {
  run('state.chats=[{id:"a",mode:"chat",title:"chat one",messages:[],updatedAt:1},{id:"b",mode:"build",title:"build one",messages:[],updatedAt:2}];state.settings.mode="build"');
  assert.deepStrictEqual(J('state.chats.filter(c=>(c.mode==="build")===(state.settings.mode==="build")).map(c=>c.id)'), ["b"]);
});
