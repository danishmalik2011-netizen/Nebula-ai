"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const { run, ctx } = load();
const J = e => JSON.parse(run(`JSON.stringify(${e})`));

test("file kinds", () => {
  assert.strictEqual(run('fileKind("a.PNG","")'), "image");
  assert.strictEqual(run('fileKind("x","image/webp")'), "image");
  assert.strictEqual(run('fileKind("doc.pdf","")'), "pdf");
  assert.strictEqual(run('fileKind("main.py","")'), "text");
  assert.strictEqual(run('fileKind("logo.svg","image/svg+xml")'), "text");
  assert.strictEqual(run('fileKind("a.exe","application/octet-stream")'), "");
});
const ATTS = `[{id:"i1",kind:"image",name:"p.jpg",mime:"image/jpeg",data:"QUJD"},{id:"d1",kind:"pdf",name:"r.pdf",mime:"application/pdf",data:"UERG"},{id:"t1",kind:"text",name:"n.txt",mime:"text/plain",text:"hello file"}]`;
test("attachments are sent to OpenAI-compatible APIs as content parts", () => {
  run(`var c1={messages:[{id:"1",role:"user",content:"look",atts:${ATTS}},{id:"2",role:"assistant",content:"ok"}]}`);
  const m = J("buildOpenAIMessages(c1)").filter(x => x.role === "user")[0];
  assert.deepStrictEqual(m.content.map(p => p.type), ["image_url", "file", "text"]);
  assert.strictEqual(m.content[0].image_url.url, "data:image/jpeg;base64,QUJD");
  assert.strictEqual(m.content[1].file.filename, "r.pdf");
  assert.ok(m.content[2].text.includes('<file name="n.txt">') && m.content[2].text.endsWith("look"));
});
test("attachments go to Anthropic as image and document blocks, merged turns stay valid", () => {
  run(`var c2={messages:[{id:"1",role:"user",content:"look",atts:${ATTS}},{id:"2",role:"user",content:"and this"},{id:"3",role:"assistant",content:"ok"},{id:"4",role:"user",content:"thanks"}]}`);
  const o = J("buildAnthropicMessages(c2)");
  assert.deepStrictEqual(o[0].content.map(b => b.type), ["image", "document", "text", "text"]);
  assert.strictEqual(o[0].content[0].source.media_type, "image/jpeg");
  assert.strictEqual(o[1].content, "ok");
  assert.strictEqual(o[2].content, "thanks");
});
test("attachments go to Gemini as inlineData", () => {
  run(`var c3={messages:[{id:"1",role:"user",content:"",atts:${ATTS}}]}`);
  const o = J("buildGoogleContents(c3)");
  assert.deepStrictEqual(o[0].parts.map(p => Object.keys(p)[0]), ["inlineData", "inlineData", "text"]);
  assert.strictEqual(o[0].parts[1].inlineData.mimeType, "application/pdf");
});
test("an attachment-only message is still sent; old payloads are dropped over budget", () => {
  run('var c4={messages:[{id:"1",role:"user",content:"",atts:[{id:"i",kind:"image",name:"a.jpg",mime:"image/jpeg",data:"QQ=="}]}]}');
  assert.strictEqual(J("buildOpenAIMessages(c4)").filter(m => m.role === "user").length, 1);
  const big = '"' + "A".repeat(9 * 1048576) + '"';
  ctx.__big = big.slice(1, -1);
  run('var c5={messages:[{id:"1",role:"user",content:"old",atts:[{id:"a",kind:"image",name:"old.jpg",mime:"image/jpeg",data:__big}]},{id:"2",role:"assistant",content:"x"},{id:"3",role:"user",content:"new",atts:[{id:"b",kind:"image",name:"new.jpg",mime:"image/jpeg",data:__big}]}]}');
  const u = J("buildOpenAIMessages(c5)").filter(m => m.role === "user");
  assert.ok(typeof u[0].content === "string" && u[0].content.includes("omitted"));
  assert.ok(Array.isArray(u[1].content));
});

test("speech text drops markdown, code, links and formulas", () => {
  const t = run('speakable("# Title\\n\\n**Bold** and `code`.\\n\\n```js\\nlet x=1\\n```\\n\\n- one\\n- two\\n\\nSee [docs](https://a.b/c) or https://x.y [1] with $$x^2$$.")');
  assert.ok(!/[#*`\[\]]|```|https|let x/.test(t), t);
  assert.ok(t.includes("Title") && t.includes("Bold and code.") && t.includes("docs") && t.includes("formula") && t.includes("one"));
  assert.ok(!run('speakable("before\\n```js\\nconst secret = 1;",true)').includes("secret"));
  assert.ok(!run('speakable("a $$ x^2 and more",true)').includes("x^2"));
});
test("sentences are released as soon as they complete", () => {
  const T = (b, f) => J(`takeSentences(${JSON.stringify(b)},${f})`);
  assert.deepStrictEqual(T("Hello there, how are you doing today", false).out, []);
  const a = T("Hello there, how are you doing today? I am fine", false);
  assert.deepStrictEqual([a.out, a.rest], [["Hello there, how are you doing today?"], "I am fine"]);
  assert.deepStrictEqual(T("I am fine", true).out, ["I am fine"]);
  assert.deepStrictEqual(T("Version 3.5 is out now. More soon", false).out, ["Version 3.5 is out now."]);
});
test("voice activity detection finds speech and ends it after a pause", () => {
  const v = J("newVad()");
  run("var vv=newVad()");
  const step = (rms, now) => run(`vadStep(vv,${rms},${now})`);
  let ev = [];
  for (let t = 0; t < 400; t += 40) ev.push(step(0.004, t));
  assert.ok(ev.every(e => e === ""));
  const seq = [];
  for (let t = 400; t < 1400; t += 40) seq.push(step(0.12, t));
  assert.strictEqual(seq.filter(e => e === "start").length, 1);
  const end = [];
  for (let t = 1400; t < 2600; t += 40) end.push(step(0.003, t));
  assert.strictEqual(end.filter(e => e === "end").length, 1);
  run("var v2=newVad()");
  let drop = [];
  for (let t = 0; t < 300; t += 40) drop.push(run(`vadStep(v2,0.12,${t})`));
  for (let t = 300; t < 1500; t += 40) drop.push(run(`vadStep(v2,0.002,${t})`));
  assert.ok(drop.includes("start") && drop.includes("drop") && !drop.includes("end"));
});
test("engine choice: browser first, Whisper when only a key exists", () => {
  ctx.window.webkitSpeechRecognition = function () {};
  run('state.settings.sttMode="auto"');
  assert.strictEqual(run("sttEngine()"), "browser");
  delete ctx.window.webkitSpeechRecognition;
  run('state.settings.keys.openai="";state.settings.keys.groq=""');
  assert.strictEqual(run("sttEngine()"), "");
  ctx.MediaRecorder = function () {};
  run('state.settings.keys.groq="gsk_x"');
  assert.strictEqual(run("sttEngine()"), "whisper");
  assert.strictEqual(run("sttProvider()"), "groq");
});
test("Whisper transcription posts audio to the provider with the key", async () => {
  let sent;
  ctx.fetch = async (u, o) => { sent = { u, o }; return new Response(JSON.stringify({ text: " hello world " }), { status: 200 }); };
  run('state.settings.keys.openai="sk-1";state.settings.voiceLang="en-US"');
  ctx.__blob = new ctx.Blob(["x"], { type: "audio/webm" });
  assert.strictEqual(await run("whisperTranscribe(__blob)"), "hello world");
  assert.strictEqual(sent.u, "https://api.openai.com/v1/audio/transcriptions");
  assert.strictEqual(sent.o.headers.Authorization, "Bearer sk-1");
  assert.strictEqual(sent.o.body.get("model"), "whisper-1");
  assert.strictEqual(sent.o.body.get("language"), "en");
});
test("OpenAI speech request, with a fallback model", async () => {
  const calls = [];
  ctx.fetch = async (u, o) => { calls.push(JSON.parse(o.body).model); return calls.length === 1 ? new Response("no", { status: 400 }) : new Response("audio", { status: 200 }); };
  run('state.settings.voiceEngine="cloud";state.settings.keys.openai="sk-1";state.settings.cloudVoice="nova";state.settings.voiceRate=1.2');
  const b = await run('cloudAudio("Hello there")');
  assert.deepStrictEqual(calls, ["gpt-4o-mini-tts", "tts-1"]);
  assert.strictEqual(await b.text(), "audio");
  assert.strictEqual(run("cloudReady()"), true);
});
test("live mode speaks replies sentence by sentence and never code", () => {
  ctx.document.querySelector = () => ({ textContent: "", innerHTML: "", dataset: {}, style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute() { return ""; } });
  run("state.settings.voiceEngine='device';var spoken=[];ttsEnqueue=s=>{spoken.push(s)};LIVE.on=true;LIVE.msg=null;LIVE.state='thinking'");
  run('var lm={id:"m",content:""}');
  const feed = (c, f) => { run(`lm.content=${JSON.stringify(c)};liveFeed(lm,${f})`); return J("spoken.slice()"); };
  assert.deepStrictEqual(feed("Sure, here is the plan", false), []);
  assert.deepStrictEqual(feed("Sure, here is the plan for today. First, we", false), ["Sure, here is the plan for today."]);
  assert.deepStrictEqual(feed("Sure, here is the plan for today. First, we start early.\n\n```js\nconst a=1;\n```\nThen we rest", false).slice(1), ["First, we start early."]);
  const all = feed("Sure, here is the plan for today. First, we start early.\n\n```js\nconst a=1;\n```\nThen we rest.", true);
  assert.deepStrictEqual(all, ["Sure, here is the plan for today.", "First, we start early.", "Then we rest."]);
});
test("system prompt switches to short spoken answers in live mode", () => {
  run("LIVE.on=true");
  const p = run("sysPrompt({messages:[]})");
  assert.ok(p.includes("live voice conversation") && !p.includes("artifact:"));
  run("LIVE.on=false");
  assert.ok(run("sysPrompt({messages:[]})").includes("artifact:"));
});

test("neural voices get fuller sentences than the device voice", () => {
  const t = "Okay. Sure thing. That works for me. More";
  assert.deepStrictEqual(J(`takeSentences(${JSON.stringify(t)},false,14)`).out, ["Okay. Sure thing.", "That works for me."]);
  assert.deepStrictEqual(J(`takeSentences(${JSON.stringify(t)},false,26)`).out, ["Okay. Sure thing. That works for me."]);
});
test("speech text drops emoji and turns dashes into pauses", () => {
  const t = run('speakable("Great idea \ud83d\ude80 \u2014 let us start \u2728")');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u2728]/u.test(t) && t.includes("Great idea ,") === false && t.includes(", let us start"), t);
});
test("the most natural installed voice is chosen automatically", () => {
  ctx.window.speechSynthesis = null;
  const vs = [
    { name: "eSpeak English", lang: "en-US", localService: true, default: false },
    { name: "Google US English", lang: "en-US", localService: false, default: false },
    { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false, default: false },
    { name: "Samantha", lang: "en-US", localService: true, default: true },
    { name: "Thomas", lang: "fr-FR", localService: true, default: false }
  ];
  ctx.__vs = vs;
  run("deviceVoices=()=>__vs;state.settings.voiceName='';state.settings.voiceLang='en-US'");
  assert.match(run("pickDeviceVoice().name"), /Aria Online/);
  run("state.settings.voiceName='Samantha'");
  assert.strictEqual(run("pickDeviceVoice().name"), "Samantha");
  run("state.settings.voiceName='';state.settings.voiceLang='fr-FR'");
  assert.strictEqual(run("pickDeviceVoice().name"), "Thomas");
});
test("OpenAI speech asks for a natural delivery; ElevenLabs request is built correctly", async () => {
  let body, sent;
  ctx.fetch = async (u, o) => { sent = { u, o }; body = JSON.parse(o.body); return new Response("a", { status: 200 }); };
  run('state.settings.keys.openai="sk-1";state.settings.voiceEngine="cloud"');
  await run('cloudAudio("Hi there")');
  assert.match(body.instructions, /conversational/);
  run('state.settings.keys.elevenlabs="el-key";state.settings.voiceEngine="eleven";state.settings.elevenVoice="abc123";state.settings.voiceRate=1.5');
  assert.strictEqual(run("ttsEngine()"), "eleven");
  await run('elevenAudio("Hello")');
  assert.match(sent.u, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/abc123\?output_format=mp3/);
  assert.strictEqual(sent.o.headers["xi-api-key"], "el-key");
  assert.strictEqual(body.voice_settings.speed, 1.2);
  run('state.settings.keys.elevenlabs=""');
  assert.strictEqual(run("ttsEngine()"), "device");
});
