"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load, sse } = require("./harness");
const { ctx, run } = load();

const collect = async (prov, model, lines, extra = "") => {
  let sent = null;
  ctx.fetch = async (u, o) => { sent = JSON.parse(o.body); return sse(lines); };
  ctx.__o = { r: "", c: "" };
  run(`state.settings.provider="${prov}";state.settings.model="${model}";state.settings.keys["${prov}"]="k";state.settings.streaming=true;state.settings.reasoning=true;${extra}`);
  await run(`runCompletion({messages:[{id:"1",role:"user",content:"hi"}]},(p,k)=>{k==="r"?__o.r+=p:__o.c+=p})`);
  return { out: ctx.__o, sent };
};

test("openai-compatible stream: reasoning_content vs content", async () => {
  const { out } = await collect("openai", "deepseek-reasoner", ['data: {"choices":[{"delta":{"reasoning_content":"think"}}]}', 'data: {"choices":[{"delta":{"content":"Hi"}}]}', "data: [DONE]"]);
  assert.deepStrictEqual(out, { r: "think", c: "Hi" });
});
test("openai o-series: max_completion_tokens, no temperature", async () => {
  const { sent } = await collect("openai", "o4-mini", ['data: {"choices":[{"delta":{"content":"x"}}]}'], "state.settings.maxTokens=500;");
  assert.strictEqual(sent.max_completion_tokens, 500);
  assert.ok(!("max_tokens" in sent) && !("temperature" in sent));
});
test("anthropic: thinking enabled, budget leaves room for the answer", async () => {
  const { out, sent } = await collect("anthropic", "claude-sonnet-4-20250514", ['data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"T"}}', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}']);
  assert.deepStrictEqual(out, { r: "T", c: "A" });
  assert.strictEqual(sent.thinking.type, "enabled");
  assert.ok(sent.max_tokens > sent.thinking.budget_tokens + 2000);
  assert.ok(!("temperature" in sent));
});
test("anthropic: retries once without thinking after a 400 about thinking", async () => {
  const bodies = [];
  ctx.fetch = async (u, o) => {
    bodies.push(JSON.parse(o.body));
    return bodies.length === 1 ? new Response(JSON.stringify({ error: { message: "thinking is not supported for this model" } }), { status: 400 })
      : sse(['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}']);
  };
  ctx.__o = { c: "" };
  run(`state.settings.provider="anthropic";state.settings.model="claude-sonnet-4-20250514";state.settings.keys.anthropic="k"`);
  await run(`runCompletion({messages:[{id:"1",role:"user",content:"hi"}]},(p,k)=>{if(k!=="r")__o.c+=p})`);
  assert.strictEqual(bodies.length, 2);
  assert.ok(bodies[0].thinking && !bodies[1].thinking);
  assert.strictEqual(ctx.__o.c, "ok");
});
test("gemini: thought parts are reasoning, thinkingConfig requested", async () => {
  const { out, sent } = await collect("google", "gemini-2.5-flash", ['data: {"candidates":[{"content":{"parts":[{"text":"hm","thought":true},{"text":"Ans"}]}}]}']);
  assert.deepStrictEqual(out, { r: "hm", c: "Ans" });
  assert.strictEqual(sent.generationConfig.thinkingConfig.includeThoughts, true);
});
test("title mode: no system prompt, no streaming, no thinking", async () => {
  let sent = null;
  ctx.fetch = async (u, o) => { sent = JSON.parse(o.body); return new Response(JSON.stringify({ content: [{ type: "text", text: "A Title" }] }), { status: 200 }); };
  run(`state.settings.provider="anthropic";state.settings.model="claude-sonnet-4-20250514";state.settings.keys.anthropic="k"`);
  ctx.__t = "";
  await run(`runCompletion({noSys:true,messages:[{id:"1",role:"user",content:"x"}]},(p,k)=>{if(k!=="r")__t+=p})`);
  assert.strictEqual(ctx.__t, "A Title");
  assert.ok(sent.stream === false && !sent.system && !sent.thinking);
});
test("keys are stripped to printable ASCII", () => {
  assert.strictEqual(run('cleanKey(" sk-abc\\u200b\\u2026 123\\n")'), "sk-abc123");
});
