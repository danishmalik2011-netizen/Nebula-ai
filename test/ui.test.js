"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const { run, ctx } = load();
run("sanitizeHtml=s=>s");
const md = (t, o) => { ctx.__t = t; ctx.__o = o; return run("renderMarkdown(__t,__o)"); };
const fence = (lang, body, close = true) => "```" + lang + "\n" + body + (close ? "\n```" : "");
const storeHtml = h => run(`UI_STORE.get(${JSON.stringify(/data-ui="(u[0-9a-z]+)"/.exec(h)[1])})`);

test("code is highlighted with function names, parameters, tags and JSON keys", () => {
  const py = run('highlightCode("def factorial(n):\\n    return n * factorial(n - 1)\\n\\nprint(factorial(5))","python")');
  assert.match(py, /tok-key">def<\/span> <span class="tok-fn">factorial<\/span>/);
  assert.match(py, /tok-pun">\(<\/span><span class="tok-param">n<\/span>/);
  assert.match(py, /tok-fn">factorial<\/span><span class="tok-pun">\(<\/span><span class="tok-num">5/);
  const js = run('highlightCode("function greet(name) { return `Hi ${name}`; }","javascript")');
  assert.match(js, /tok-fn">greet<\/span>/);
  assert.match(js, /tok-param">name<\/span>/);
  const html = run('highlightCode("<div class=\\"card\\"><p>Hi</p></div>","html")');
  assert.match(html, /tok-tag">div<\/span> ?<span class="tok-attr">class<\/span><span class="tok-pun">=<\/span><span class="tok-val">&quot;card&quot;/);
  const json = run('highlightCode("{\\"model\\": \\"GPT\\", \\"ok\\": true, \\"n\\": 3}","json")');
  assert.match(json, /tok-prop">&quot;model&quot;<\/span><span class="tok-pun">:/);
  assert.match(json, /tok-str">&quot;GPT&quot;/);
  assert.match(json, /tok-key">true/);
  const mm = run('highlightCode("flowchart TD\\n  A[Question] --> B{Understand it?}","mermaid")');
  assert.match(mm, /tok-key">flowchart<\/span>/);
  assert.match(mm, /tok-str">\[Question\]/);
  assert.ok(!run('highlightCode("<script>alert(1)</script>","html")').includes("<script"));
});
test("code cards carry a readable language name and an icon-only copy button", () => {
  assert.strictEqual(run('langLabel("js")'), "JavaScript");
  assert.strictEqual(run('langLabel("mermaid")'), "Mermaid");
  assert.strictEqual(run('langLabel("")'), "Code");
  const h = md(fence("python", "print(1)"));
  assert.match(h, /<span>Python<\/span><button class="code-copy" type="button" aria-label="Copy code"><\/button>/);
});

test("a bar chart becomes a placeholder and a card with one bar per value", () => {
  const body = JSON.stringify({ type: "bar", title: "Study hours", labels: ["Jan", "Feb", "Mar"], series: [{ name: "Hours", values: [60, 75, 92] }], caption: "Illustrative data only." });
  const h = md(fence("ui:chart", body));
  assert.match(h, /^<div class="ui-host" data-ui="u[0-9a-z]+"><\/div>$/);
  const card = storeHtml(h);
  assert.strictEqual((card.match(/<rect /g) || []).length, 3);
  assert.ok(card.includes("Study hours") && card.includes("Illustrative data only.") && card.includes(">92<"));
  assert.ok(card.includes(">100<") && card.includes(">25<"));
});
test("an unfinished component shows a skeleton, bad JSON falls back to code", () => {
  assert.match(md(fence("ui:chart", '{"type":"bar","lab', false)), /ui-host ui-skel/);
  const bad = md(fence("ui:chart", "{not json}"));
  assert.ok(bad.includes("code-block") && !bad.includes("ui-host"));
  assert.ok(md(fence("ui:unknown", "{}")).includes("code-block"));
  run("state.settings.richUI=false");
  assert.ok(md(fence("ui:chart", '{"type":"bar","labels":["a"],"series":[{"values":[1]}]}')).includes("code-block"));
  run("state.settings.richUI=true");
});
test("donut and line charts", () => {
  const dh = md(fence("ui:chart", JSON.stringify({ type: "donut", title: "Split", labels: ["Biology", "Chemistry", "Physics"], values: [50, 25, 25] })));
  const d = storeHtml(dh);
  assert.strictEqual((d.match(/<path /g) || []).length, 3);
  assert.ok(d.includes("Biology") && d.includes(">50<"));
  const lh = md(fence("ui:chart", JSON.stringify({ type: "line", title: "Trend", labels: ["W1", "W2", "W3", "W4", "W5"], series: [{ name: "Mock score", values: [40, 52, 49, 73, 81] }], xTitle: "week", yTitle: "Mock score" })));
  const l = storeHtml(lh);
  assert.match(l, /<svg class="ui-line"[^>]*data-pts="/);
  assert.ok(l.includes('class="ui-leg live"') && l.includes(">81<") && l.includes(" C"));
  assert.strictEqual(run("niceMax(92)"), 100);
  assert.strictEqual(run("niceMax(75)"), 80);
  assert.strictEqual(run("niceMax(0)"), 1);
});
test("component text is escaped", () => {
  const h = md(fence("ui:cards", JSON.stringify({ cards: [{ icon: "book", title: "<img src=x onerror=1>", text: "<script>x</script>" }] })));
  const c = storeHtml(h);
  assert.ok(!c.includes("<img") && !c.includes("<script") && c.includes("&lt;img"));
});
test("cards, media, carousel, explainer", () => {
  const cards = storeHtml(md(fence("ui:cards", JSON.stringify({ cards: [{ icon: "book", title: "Study", text: "Notes" }, { icon: "code", title: "Dev", text: "Code", prompt: "Show me code" }] }))));
  assert.ok(cards.includes("ui-grid") && cards.includes('data-send="Show me code"') && cards.includes("<svg"));
  const media = storeHtml(md(fence("ui:media", JSON.stringify({ items: [{ image: "Heart", title: "Medical", text: "Diagrams" }] }))));
  assert.ok(media.includes('data-q="Heart"') && media.includes("ui-row"));
  const car = storeHtml(md(fence("ui:carousel", JSON.stringify({ items: [{ image: "Neuron", title: "Neuron", text: "Nervous tissue" }, { image: "Kidney", title: "Kidney", text: "Excretory" }] }))));
  assert.strictEqual((car.match(/class="ui-slide"/g) || []).length, 2);
  const ex = storeHtml(md(fence("ui:explainer", JSON.stringify({ title: "Counter-current mechanism", subtitle: "Biology", image: "Loop of Henle", sections: [{ heading: "Process", body: "1. one\n2. two" }] }))));
  assert.ok(ex.includes("<h3>Counter-current mechanism</h3>") && ex.includes("<ol>") && ex.includes("Process"));
});
test("nested markdown inside a component does not break citations after it", () => {
  const src = [{ url: "https://example.com", domain: "example.com" }];
  const h = md(fence("ui:explainer", JSON.stringify({ title: "T", sections: [{ heading: "H", body: "text" }] })) + "\n\nSee [1].", { sources: src });
  assert.match(h, /class="cite"/);
});
test("forms: radio, slider, checkbox, textarea and a submit button", () => {
  const form = storeHtml(md(fence("ui:form", JSON.stringify({ title: "Interactive demo", description: "Choose", fields: [
    { type: "radio", label: "Subject", options: ["Biology", "Chemistry", "Physics"] },
    { type: "slider", label: "Difficulty", options: ["Easy", "Moderate", "Hard", "Very hard"] },
    { type: "checkbox", label: "Mark this task as complete" },
    { type: "textarea", label: "Notes", placeholder: "Type something here..." }], submit: "Show selected values" }))));
  assert.strictEqual((form.match(/type="radio"/g) || []).length, 3);
  assert.match(form, /Difficulty: <b>Hard<\/b>/);
  assert.ok(form.includes('type="checkbox"') && form.includes("<textarea") && form.includes("Show selected values") && form.includes("data-ui-submit"));
  assert.match(form, /data-action="show"/);
});
test("SVG blocks become figure cards with title and caption; unsafe or broken ones stay code", () => {
  const svg = '<!-- title: Simple diagram | caption: A real vector -->\n<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';
  const fig = storeHtml(md(fence("svg", svg)));
  assert.ok(fig.includes("Simple diagram") && fig.includes("A real vector") && fig.includes('src="data:image/svg+xml;charset=utf-8,'));
  assert.ok(fig.includes("xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg"));
  assert.ok(md(fence("svg", "not svg")).includes("code-block"));
});
test("tables, task lists, links and underline follow the reference styling hooks", () => {
  assert.match(md("- [x] done\n- [ ] todo"), /class="task-li is-done"/);
  assert.match(md("a <u>under</u> b"), /<u>under<\/u>/);
  assert.match(md("[link](https://example.com/a_b_c)"), /<a href="https:\/\/example\.com\/a_b_c"/);
});
test("chemistry and units render", () => {
  const ch = run('renderTex("6CO_2+6H_2O\\\\xrightarrow{\\\\text{light}}C_6H_{12}O_6+6O_2",true)');
  assert.ok(ch.includes("<mover>") && ch.includes("light"));
  assert.match(run('renderTex("N_2+3H_2\\\\rightleftharpoons 2NH_3")'), /⇌/);
  assert.match(run('renderTex("\\\\mathrm{m\\\\,s^{-1}}")'), /<mi mathvariant="normal">m<\/mi>/);
  assert.match(run('renderTex("Ca^{2+}, SO_4^{2-}")'), /<msup>/);
});
