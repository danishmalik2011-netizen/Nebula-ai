"use strict";
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const { load } = require("./harness");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const png = f => { const b = fs.readFileSync(path.join(root, f)); assert.strictEqual(b.subarray(1, 4).toString(), "PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("the Android project has the files Gradle and the manifest need, and the PNGs are the right size", () => {
  for (const f of ["android/settings.gradle.kts", "android/build.gradle.kts", "android/gradle.properties", "android/app/build.gradle.kts", "android/app/src/main/AndroidManifest.xml", "android/app/src/main/java/app/nebula/chat/MainActivity.java", "android/app/src/main/res/xml/network_security_config.xml", "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml", "android/app/src/main/assets/offline.html", "android/README.md", ".github/workflows/android.yml"])
    assert.ok(fs.existsSync(path.join(root, f)), f);
  assert.deepStrictEqual(png("android/app/src/main/res/mipmap-mdpi/ic_launcher.png"), [48, 48]);
  assert.deepStrictEqual(png("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"), [192, 192]);
  assert.deepStrictEqual(png("android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png"), [432, 432]);
  assert.deepStrictEqual(png("public/icons/icon-192.png"), [192, 192]);
  assert.deepStrictEqual(png("public/icons/icon-512.png"), [512, 512]);
  assert.deepStrictEqual(png("public/icons/maskable-512.png"), [512, 512]);
});
test("XML and the web manifest are well formed", () => {
  const files = ["AndroidManifest.xml", "res/xml/network_security_config.xml", "res/values/strings.xml", "res/values/colors.xml", "res/values/themes.xml", "res/mipmap-anydpi-v26/ic_launcher.xml"].map(f => path.join(root, "android/app/src/main", f));
  const py = spawnSync("python3", ["-c", "import sys,xml.dom.minidom as m\nfor f in sys.argv[1:]: m.parse(f)", ...files]);
  if (py.error) return;
  assert.strictEqual(py.status, 0, String(py.stderr));
  const mf = JSON.parse(read("public/manifest.webmanifest"));
  assert.strictEqual(mf.display, "standalone");
  assert.ok(mf.icons.some(i => i.purpose === "maskable") && mf.icons.some(i => i.sizes === "512x512"));
  assert.ok(read("public/index.html").includes('rel="manifest"'));
});
test("the app asks only for what it needs and only allows cleartext for the on-phone build server", () => {
  const m = read("android/app/src/main/AndroidManifest.xml");
  assert.deepStrictEqual([...m.matchAll(/uses-permission android:name="android\.permission\.(\w+)"/g)].map(x => x[1]).sort(), ["INTERNET", "MODIFY_AUDIO_SETTINGS", "RECORD_AUDIO"]);
  assert.ok(m.includes("networkSecurityConfig") && !m.includes("usesCleartextTraffic"));
  const n = read("android/app/src/main/res/xml/network_security_config.xml");
  assert.ok(/base-config cleartextTrafficPermitted="false"/.test(n) && /localhost/.test(n) && /127\.0\.0\.1/.test(n));
  assert.ok(!/<domain[^>]*>\*/.test(n));
});
test("the WebView keeps the file bridge and the microphone to the app's own site", () => {
  const j = read("android/app/src/main/java/app/nebula/chat/MainActivity.java");
  assert.ok(/addWebMessageListener\(web, "NebulaApp", allowed/.test(j) && j.includes("allowed.add(appOrigin)") && j.includes("isMainFrame"));
  assert.ok(j.includes("appHost.equals(request.getOrigin().getHost())") && j.includes("RESOURCE_AUDIO_CAPTURE"));
  assert.ok(!j.includes("addJavascriptInterface"), "a plain JS interface would be exposed to every frame");
  assert.ok(j.includes("setAllowFileAccess(false)") && j.includes("Intent.ACTION_VIEW"));
  assert.ok(j.includes("MediaStore.Downloads"));
});
test("Gradle takes the site address and version from the build, and signs from the environment", () => {
  const g = read("android/app/build.gradle.kts");
  assert.ok(g.includes('namespace = "app.nebula.chat"') && g.includes("minSdk = 29") && g.includes('findProperty("appUrl")'));
  for (const v of ["KEYSTORE_PATH", "KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"]) assert.ok(g.includes(`"${v}"`), v);
  assert.ok(g.includes('signingConfig = signingConfigs.getByName("release")'));
});
test("the workflow validates its inputs, signs with your key or a persisted one, and never prints secrets", () => {
  const y = read(".github/workflows/android.yml");
  assert.ok(y.includes("workflow_dispatch") && y.includes("assembleRelease") && y.includes("upload-artifact") && y.includes("apksigner"));
  assert.ok(y.includes("KEYSTORE_BASE64") && y.includes("actions/cache@v4") && y.includes("::add-mask::"));
  assert.ok(!/run:[^\n]*\$\{\{\s*inputs\./.test(y), "inputs must go through env, not be pasted into shell");
  const py = spawnSync("python3", ["-c", "import sys,yaml;yaml.safe_load(open(sys.argv[1]))", path.join(root, ".github/workflows/android.yml")]);
  if (!py.error && !/No module named/.test(String(py.stderr))) assert.strictEqual(py.status, 0, String(py.stderr));
});

test("inside the Android app a saved file goes to the app; in a browser it is a normal download", async () => {
  const { ctx, run } = load();
  ctx.Blob = Blob; ctx.btoa = btoa;
  const sent = [];
  ctx.window.NebulaApp = { postMessage: m => sent.push(JSON.parse(m)) };
  ctx.__b = new Blob(["hello zip"], { type: "application/zip" });
  await run('saveFile(__b,"app.zip")');
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual([sent[0].t, sent[0].name, sent[0].mime, Buffer.from(sent[0].b64, "base64").toString()], ["save", "app.zip", "application/zip", "hello zip"]);
  const big = new Blob([Buffer.alloc(300000, 7)], { type: "application/octet-stream" });
  ctx.__b = big; await run('saveFile(__b,"big.bin")');
  assert.strictEqual(Buffer.from(sent[1].b64, "base64").length, 300000);
  await run('download("notes.txt","plain text")');
  assert.strictEqual(Buffer.from(sent[2].b64, "base64").toString(), "plain text");
  assert.strictEqual(sent[2].mime, "text/plain;charset=utf-8");
  ctx.window.NebulaApp = undefined;
  let clicked = 0; const orig = ctx.document.createElement;
  ctx.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
  ctx.document.createElement = t => t === "a" ? { click() { clicked++; }, remove() {}, set href(v) {}, set download(v) { this.d = v; } } : orig.call(ctx.document, t);
  ctx.__b = new Blob(["x"]); await run('saveFile(__b,"x.txt")');
  assert.strictEqual(clicked, 1);
});
