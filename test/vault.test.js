"use strict";
const test = require("node:test"), assert = require("node:assert");
const { load } = require("./harness");
const { ctx, run } = load();

test("vault encrypts keys, strips them from settings, and unlocks only with the right passphrase", async () => {
  run('state.settings.keys={openai:"sk-secret-123"}');
  await run('vaultEnable("correct horse")');
  const vault = ctx.localStorage.getItem("nebula.vault.v1");
  assert.ok(vault && !vault.includes("sk-secret-123"));
  const settings = ctx.localStorage.getItem("nebula.settings.v3");
  assert.ok(settings && !settings.includes("sk-secret-123"));
  run("VK=null;state.settings.keys={}");
  await assert.rejects(run('vaultUnlock("wrong")'));
  await run('vaultUnlock("correct horse")');
  assert.strictEqual(run("state.settings.keys.openai"), "sk-secret-123");
  run("vaultDisable()");
  assert.strictEqual(ctx.localStorage.getItem("nebula.vault.v1"), null);
  assert.match(ctx.localStorage.getItem("nebula.settings.v3"), /sk-secret-123/);
});
