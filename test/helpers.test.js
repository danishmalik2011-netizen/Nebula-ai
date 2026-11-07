"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const vm = require("vm");
const { run } = load();

test("provider headings become summary lines; code never does", () => {
  const J = e => JSON.parse(run(`JSON.stringify(${e})`));
  assert.deepStrictEqual(J('headingLines("**Planning the fix**\\n\\nbody text\\n\\n**Checking `const x = 1;` usage**\\n\\nmore\\n\\n**Verifying the result**")'), ["Planning the fix", "Verifying the result"]);
  assert.deepStrictEqual(J('headingLines("no headings here, just thinking out loud")'), []);
  assert.strictEqual(run('codeish("const x = foo(1);")'), true);
  assert.strictEqual(run('codeish("<div class=\\"a\\">")'), true);
  assert.strictEqual(run('codeish("Checking the flex layout")'), false);
  assert.ok(!run('stripCode("Thinking about it.\\n```js\\nconst a=1;\\n```\\nfunction f(){ return 1; }\\nDone.")').includes("const"));
});
test("summary lines come from the model; raw thinking is never shown", () => {
  const J = e => JSON.parse(run(`JSON.stringify(${e})`));
  assert.deepStrictEqual(J('summaryLines({steps:["Checking the flex layout","const a = 1;","Fixing overflow"]},{reasoning:"long raw thinking without headings"})'), ["Checking the flex layout", "Fixing overflow"]);
  assert.deepStrictEqual(J('summaryLines({steps:[]},{reasoning:"raw thinking only"})'), []);
});
test("the selected model writes the summary line; code-like replies are rejected", async () => {
  const { ctx } = load();
  const reply = text => { ctx.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 }); };
  const r = s => vm.runInContext(s, ctx);
  r('state.settings.provider="openai";state.settings.model="m";state.settings.keys.openai="k";state.settings.streaming=false');
  reply('"Checking the flex layout."');
  assert.strictEqual(await r('modelSummary("some reasoning excerpt")'), "Checking the flex layout");
  reply("const a = foo(1);");
  assert.strictEqual(await r('modelSummary("x")'), "");
  reply("Checking the flex layout");
  r('var m={id:"1",content:"",reasoning:"'+"word ".repeat(120)+'",steps:[]}');
  await r("maybeSummarize(m,false)");
  assert.deepStrictEqual(JSON.parse(r("JSON.stringify(m.steps)")), ["Checking the flex layout"]);
});
test("artifact cards show writing, then ready steps", () => {
  const w = run('renderArtifactCard({code:"<p>hi",done:false},"artifact:a.html")');
  assert.ok(/art-card writing/.test(w) && /pip on">Writing/.test(w));
  const d = run('renderArtifactCard({code:"<p>hi</p>",done:true},"artifact:a.html")');
  assert.ok(!/writing/.test(d) && /pip on">Ready/.test(d) && /pip done">Written/.test(d));
});
test("settings pages are plain rows with no descriptions", () => {
  const home = run("pageHome()");
  assert.ok(/data-act="pick-model"/.test(home) && /data-go="data"/.test(home));
  assert.ok(!/tr-desc|hint/.test(run("pageChat()")) && /data-set="reasoning"/.test(run("pageChat()")));
  assert.ok(/data-act="delete-all"/.test(run("pageData()")));
});
test("<think> tags become reasoning, unclosed tags too", () => {
  assert.deepStrictEqual(JSON.parse(run('JSON.stringify(viewParts({content:"<think>a\\n\\nb</think>Answer"}))')), { reasoning: "a\n\nb", content: "Answer" });
  assert.deepStrictEqual(JSON.parse(run('JSON.stringify(viewParts({content:"<think>still"}))')), { reasoning: "still", content: "" });
});
test("durations", () => {
  assert.strictEqual(run("fmtDur(12000)"), "12s");
  assert.strictEqual(run("fmtDur(125000)"), "2m 5s");
});
test("error states pick the right title and actions", () => {
  assert.match(run('errorHtml("Authentication failed (401). bad")'), /rejected your API key[\s\S]*data-err="providers"/);
  assert.match(run('errorHtml("Rate limit or quota exceeded (429).")'), /Rate limit/);
  assert.match(run('errorHtml("Network error — the request could not reach the provider.")'), /Couldn’t reach/);
});
test("markdown escapes raw HTML", () => {
  const html = run('renderMarkdown("<img src=x onerror=alert(1)> **b**")');
  assert.ok(!html.includes("<img") && html.includes("<strong>b</strong>"));
});
test("artifact cards register files by extension", () => {
  const card = run('renderArtifactCard({code:"<svg/>"},"artifact:logo.svg")');
  assert.match(card, /data-art="a/);
  assert.strictEqual(run("Object.values(ART).pop().text"), true);
});
test("proxy-core classifies addresses", () => {
  const { classify } = require("../proxy-core");
  assert.strictEqual(classify("10.1.2.3"), "private");
  assert.strictEqual(classify("169.254.169.254"), "private");
  assert.strictEqual(classify("127.0.0.1"), "loopback");
  assert.strictEqual(classify("::ffff:192.168.0.5"), "private");
  assert.strictEqual(classify("fd00::1"), "private");
  assert.strictEqual(classify("8.8.8.8"), "public");
});
