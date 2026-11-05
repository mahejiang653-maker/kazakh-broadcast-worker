import test from "node:test";
import assert from "node:assert/strict";

let mod = {};
try { mod = await import("../scripts/m3-probe-secret-check.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const list = names => async (url, options) => {
  assert.match(url, /\/workers\/scripts\/kazakh-broadcast-m3-remix-probe-20261105\/secrets$/);
  assert.equal(options.method, "GET");
  return Response.json({ success: true, result: names.map(name => ({ name, type: "secret_text" })) });
};

test("verification requires a probe token and no Gemini key", async () => {
  assert.equal(typeof mod.checkProbeSecrets, "function");
  await mod.checkProbeSecrets({ token: "test-token", accountId: "account", mode: "verify", fetcher: list(["M3_VOICE_PROBE_TOKEN"]) });
  await assert.rejects(mod.checkProbeSecrets({ token: "test-token", accountId: "account", mode: "verify", fetcher: list(["M3_VOICE_PROBE_TOKEN", "GEMINI_API_KEY"]) }), /not be checked/);
});
test("live mode requires both secrets without reading their values", async () => {
  assert.equal(typeof mod.checkProbeSecrets, "function");
  await mod.checkProbeSecrets({ token: "test-token", accountId: "account", mode: "live", fetcher: list(["M3_VOICE_PROBE_TOKEN", "GEMINI_API_KEY"]) });
  await assert.rejects(mod.checkProbeSecrets({ token: "test-token", accountId: "account", mode: "live", fetcher: list(["M3_VOICE_PROBE_TOKEN"]) }), /not configured/);
});
