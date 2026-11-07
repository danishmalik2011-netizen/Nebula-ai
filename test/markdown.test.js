"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const { run, ctx } = load();
const md = (t, o) => { ctx.__t = t; ctx.__o = o; return run("renderMarkdown(__t,__o)"); };
const tex = (t, d) => { ctx.__x = t; ctx.__d = !!d; return run("renderTex(__x,__d)"); };
/* every MathML element opened must be closed, in order */
function balanced(h) {
  const st = [];
  for (const m of h.matchAll(/<(\/?)([a-z]+)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (!close) st.push(name); else if (st.pop() !== name) return false;
  }
  return st.length === 0;
}

const SNIPPETS = [
  "e^{i\\pi}+1=0", "\\int_0^\\infty e^{-x^2}\\,dx=\\frac{\\sqrt{\\pi}}{2}", "\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}",
  "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", "\\left(\\frac{a}{b}\\right)^2", "\\mathbb{R}^n\\to\\mathbb{R}",
  "f(x)=\\begin{cases}x&x>0\\\\-x&x\\le 0\\end{cases}", "\\lim_{x\\to0}\\frac{\\sin x}{x}=1", "\\vec{F}=m\\vec{a}",
  "\\nabla\\times\\vec{E}=-\\frac{\\partial\\vec{B}}{\\partial t}", "a_{i,j}^2", "\\sqrt[3]{x+1}", "\\text{if } x>0", "\\binom{n}{k}",
  "\\overline{AB}", "\\hat{x}", "\\boxed{E=mc^2}", "\\begin{aligned}a&=b\\\\c&=d\\end{aligned}", "\\prod_{i=1}^n x_i",
  "\\operatorname{argmax}_x f(x)", "f''(x)+y'", "\\alpha\\beta\\Gamma\\Omega", "\\mathbf{v}\\cdot\\mathbf{w}", "\\mathcal{L}\\{f\\}(s)",
  "\\color{red}{x}+\\textcolor{blue}{y}", "\\underbrace{a+b}_{n}", "\\xrightarrow{f}", "x\\not=y", "\\oint_C \\vec{B}\\cdot d\\vec{l}",
  "\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}", "\\frac{d}{dx}\\left[\\int_a^x f(t)\\,dt\\right]=f(x)"
];
test("LaTeX converts to balanced MathML with no unknown commands", () => {
  for (const s of SNIPPETS) {
    const h = tex(s, true);
    assert.ok(h.startsWith("<math"), s);
    assert.ok(!h.includes("merr") && !h.includes("math-err"), "unknown command in: " + s + "\n" + h);
    assert.ok(balanced(h), "unbalanced: " + s + "\n" + h);
  }
});
test("structure of common expressions", () => {
  assert.match(tex("\\frac{a}{b}"), /<mfrac><mrow><mi>a<\/mi><\/mrow><mrow><mi>b<\/mi><\/mrow><\/mfrac>/);
  assert.match(tex("x^2"), /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/);
  assert.match(tex("\\sum_{i=1}^n i"), /<munderover><mo largeop="true" movablelimits="true">∑<\/mo>/);
  assert.match(tex("\\int_0^1 x"), /<msubsup><mo largeop="true">∫<\/mo>/);
  assert.match(tex("\\sqrt[3]{x}"), /<mroot>/);
  assert.match(tex("\\mathbb{R}"), /<mi>ℝ<\/mi>/);
  assert.match(tex("\\left( x \\right)"), /<mo fence="true" stretchy="true">\(<\/mo>/);
  assert.match(tex("\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}"), /<mtable[^>]*><mtr><mtd><mn>1<\/mn><\/mtd><mtd>/);
  assert.match(tex("x", true), /display="block"/);
});
test("unknown commands are shown, never executed or dropped silently", () => {
  assert.match(tex("\\foo{x}"), /merr/);
  assert.ok(!tex("<script>alert(1)</script>").includes("<script"));
  assert.ok(!tex("\\text{<img src=x onerror=alert(1)>}").includes("<img"));
});
test("inline and display math in markdown; currency and code are left alone", () => {
  assert.match(md("Euler: $e^{i\\pi}+1=0$ done"), /<span class="math"><math class="tex">/);
  assert.match(md("$$\n\\frac{a}{b}\n$$"), /<div class="math-block"><math class="tex" display="block">/);
  assert.match(md("\\[x^2\\]"), /math-block/);
  assert.match(md("\\begin{align}a&=b\\end{align}"), /math-block/);
  assert.ok(!/<math/.test(md("It costs $5 and $10 in total.")));
  assert.ok(!/<math/.test(md("Run `echo $HOME and $PATH` now")));
  assert.ok(!/<math/.test(md("```js\nconst a = '$x$';\n```")));
  assert.ok(!/<math/.test(md("an unfinished $$ \\frac{a}{b}")));
  assert.match(md("snake_case and $a_1$ and snake_case"), /<msub>/);
});
test("images: wikipedia placeholders, https images, and the off switch", () => {
  assert.match(md("![[Eiffel Tower|The tower]]"), /<figure class="wimg" data-q="Eiffel Tower" data-cap="The tower">/);
  assert.match(md("Text ![[Marie Curie]] more"), /data-q="Marie Curie"[\s\S]*<p>\s*more<\/p>/);
  assert.match(md("![alt](https://upload.wikimedia.org/a_b_c.jpg)"), /<img class="mimg" src="https:\/\/upload\.wikimedia\.org\/a_b_c\.jpg"/);
  assert.ok(!/<img/.test(md("![x](http://insecure.example/x.png)")));
  run("state.settings.webImages=false");
  assert.ok(!/<figure/.test(md("![[Eiffel Tower]]")) && !/<img/.test(md("![x](https://a.b/c.png)")));
  run("state.settings.webImages=true");
});
test("callouts, task lists, ordered start, highlight", () => {
  assert.match(md("> [!WARNING]\n> careful"), /<div class="callout callout-warning"><div class="callout-title">Warning<\/div>/);
  assert.match(md("- [x] done\n- [ ] todo"), /task on[\s\S]*task"><\/span>todo/);
  assert.match(md("3. three\n4. four"), /<ol start="3">/);
  assert.match(md("==key=="), /<mark>key<\/mark>/);
});
test("citations link to the search sources; unknown numbers stay text", () => {
  const src = [{ url: "https://example.com/a?x=1&y=2", domain: "example.com" }];
  const h = md("Claim [1] and array[2] and [1](https://z.example)", { sources: src });
  assert.match(h, /<a class="cite" href="https:\/\/example\.com\/a\?x=1&amp;y=2"[^>]*>1<\/a>/);
  assert.ok(h.includes("array[2]"));
  assert.ok(!md("Claim [1]").includes('class="cite"'));
});
test("raw HTML is still escaped", () => {
  const h = md("<img src=x onerror=alert(1)> $x$ <script>1</script>");
  assert.ok(!h.includes("<img") && !h.includes("<script"));
});
