"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const { run, ctx } = load();
const json = o => new Response(JSON.stringify(o), { status: 200 });

test("wikipedia search returns ranked sources", async () => {
  let url = "";
  ctx.fetch = async u => { url = u; return json({ query: { pages: [{ title: "B", index: 2, fullurl: "https://en.wikipedia.org/wiki/B", extract: "second" }, { title: "A", index: 1, fullurl: "https://en.wikipedia.org/wiki/A", extract: "first" }] } }); };
  run('state.settings.webEngine="wikipedia"');
  const r = JSON.parse(await run('runSearch("alpha").then(x=>JSON.stringify(x))'));
  assert.deepStrictEqual(r.map(x => x.title), ["A", "B"]);
  assert.strictEqual(r[0].domain, "en.wikipedia.org");
  assert.match(url, /origin=%2A|origin=\*/);
});
test("tavily search sends the key and maps results", async () => {
  let sent;
  ctx.fetch = async (u, o) => { sent = { u, o }; return json({ results: [{ title: "T", url: "https://t.example/p", content: "body" }] }); };
  run('state.settings.webEngine="tavily";state.settings.keys.tavily="tvly-abc"');
  const r = JSON.parse(await run('runSearch("q").then(x=>JSON.stringify(x))'));
  assert.strictEqual(r[0].snippet, "body");
  assert.strictEqual(sent.u, "https://api.tavily.com/search");
  assert.strictEqual(sent.o.headers.Authorization, "Bearer tvly-abc");
  run('state.settings.keys.tavily=""');
  await assert.rejects(run('runSearch("q")'), /Tavily key/);
});
test("searxng search uses the configured address and explains a 403", async () => {
  let url = "";
  ctx.fetch = async u => { url = u; return json({ results: [{ title: "S", url: "https://s.example", content: "c" }] }); };
  run('state.settings.webEngine="searxng";state.settings.searxUrl="http://localhost:8080/"');
  const r = JSON.parse(await run('runSearch("hello world").then(x=>JSON.stringify(x))'));
  assert.strictEqual(r.length, 1);
  assert.match(url, /^http:\/\/localhost:8080\/search\?q=hello%20world&format=json/);
  ctx.fetch = async () => new Response("no", { status: 403 });
  await assert.rejects(run('runSearch("x")'), /json format/);
});
test("the selected model decides whether and what to search", async () => {
  run('state.settings.provider="openai";state.settings.model="m";state.settings.keys.openai="k";state.settings.streaming=false');
  const reply = text => { ctx.fetch = async () => json({ choices: [{ message: { content: text } }] }); };
  run('var chat={messages:[{id:"1",role:"user",content:"who won the 2024 euros?"},{id:"2",role:"assistant",content:""}]}');
  reply("SEARCH: Euro 2024 winner");
  assert.strictEqual(await run("planSearch(chat,false)"), "Euro 2024 winner");
  reply("NO");
  assert.strictEqual(await run("planSearch(chat,false)"), null);
  assert.strictEqual(await run("planSearch(chat,true)"), "who won the 2024 euros?");
  ctx.fetch = async () => { throw new Error("down"); };
  assert.strictEqual(await run("planSearch(chat,false)"), null);
});
test("search phase stores sources and puts them in the system prompt only for that turn", async () => {
  run('state.settings.webMode="on";state.settings.webEngine="wikipedia"');
  let n = 0;
  ctx.fetch = async () => (n++ === 0
    ? json({ choices: [{ message: { content: "SEARCH: eiffel tower height" } }] })
    : json({ query: { pages: [{ title: "Eiffel Tower", index: 1, fullurl: "https://en.wikipedia.org/wiki/Eiffel_Tower", extract: "330 m tall" }] } }));
  run('var chat2={messages:[{id:"1",role:"user",content:"how tall is it?"}]};var msg2={id:"9",role:"assistant",content:""}');
  await run("webPhase(chat2,msg2)");
  assert.strictEqual(run("msg2.web.state"), "done");
  assert.strictEqual(run("msg2.web.sources[0].domain"), "en.wikipedia.org");
  const sys = run("sysPrompt(chat2)");
  assert.ok(sys.includes("[1] Eiffel Tower") && sys.includes("Cite them inline"));
  run("delete chat2._web");
  assert.ok(!run("sysPrompt(chat2)").includes("Web search results"));
  assert.ok(run("sysPrompt({noSys:true,_web:'x'})") === "");
});
test("a failed search is reported, not fatal", async () => {
  run('state.settings.webEngine="tavily";state.settings.keys.tavily=""');
  let n = 0;
  ctx.fetch = async () => (n++ === 0 ? json({ choices: [{ message: { content: "SEARCH: x" } }] }) : json({}));
  run('var chat3={messages:[{id:"1",role:"user",content:"news"}]};var msg3={id:"8",role:"assistant",content:""}');
  await run("webPhase(chat3,msg3)");
  assert.strictEqual(run("msg3.web.state"), "failed");
  assert.ok(!run("chat3._web"));
});
test("image lookup prefers the top Wikipedia hit with a thumbnail, then Commons", async () => {
  ctx.fetch = async () => json({ query: { pages: [{ title: "No pic", index: 1 }, { title: "Eiffel Tower", index: 2, thumbnail: { source: "https://upload.wikimedia.org/x.jpg", width: 800, height: 600 }, extract: "A tower.", fullurl: "https://en.wikipedia.org/wiki/Eiffel_Tower" }] } });
  const a = JSON.parse(await run('wikiImage("Eiffel Tower").then(x=>JSON.stringify(x))'));
  assert.deepStrictEqual([a.title, a.from, a.w], ["Eiffel Tower", "Wikipedia", 800]);
  let calls = 0;
  ctx.fetch = async u => (calls++ === 0 ? json({ query: { pages: [] } }) : json({ query: { pages: [{ title: "File:Some_Statue.jpg", index: 1, imageinfo: [{ thumburl: "https://upload.wikimedia.org/t.jpg", thumbwidth: 900, thumbheight: 600, mime: "image/jpeg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Some_Statue.jpg" }] }] } }));
  const b = JSON.parse(await run('wikiImage("some statue zzz").then(x=>JSON.stringify(x))'));
  assert.deepStrictEqual([b.from, b.title], ["Commons", "Some Statue"]);
  ctx.fetch = async () => { throw new Error("offline"); };
  assert.strictEqual(await run('wikiImage("nothing here qqq")'), null);
});
test("prompts tell the model how to use math, images and artifacts", () => {
  const p = run("sysPrompt({messages:[]})");
  assert.ok(p.includes("$$") && p.includes("![[") && p.includes("artifact:"));
  run("state.settings.webImages=false");
  assert.ok(!run("sysPrompt({messages:[]})").includes("![["));
});
