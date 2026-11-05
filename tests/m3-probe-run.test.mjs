import test from "node:test";
import assert from "node:assert/strict";

let mod = {};
try { mod = await import("../scripts/m3-probe-run.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }

function responses(items) {
  let index = 0;
  const calls = [];
  return {
    calls,
    fetcher: async (url, options) => {
      calls.push({ url, method: options.method, token: options.headers?.["X-M3-Probe-Token"] });
      const item = items[index++];
      if (!item) throw new Error("Unexpected additional request");
      return Response.json(item.body, { status: item.status });
    },
  };
}
const ready = [
  { status: 405, body: { code: "METHOD_NOT_ALLOWED" } },
  { status: 401, body: { code: "UNAUTHORIZED" } },
];

test("verification confirms the token without making an upstream request", async () => {
  assert.equal(typeof mod.runProbe, "function");
  const fake = responses([...ready, { status: 200, body: { code: "AUTH_OK" } }]);
  const result = await mod.runProbe({ token: "x".repeat(40), mode: "verify", fetcher: fake.fetcher, delay: async () => {} });
  assert.equal(result.code, "AUTH_OK");
  assert.equal(fake.calls.length, 3);
  assert.match(fake.calls[2].url, /\?check=auth$/);
});
test("live mode waits for token propagation but stops after one upstream response", async () => {
  assert.equal(typeof mod.runProbe, "function");
  const fake = responses([...ready,
    { status: 401, body: { code: "UNAUTHORIZED" } },
    { status: 200, body: { code: "AUTH_OK" } },
    { status: 502, body: { code: "VOICE_LIST_UNAVAILABLE", checked: true, allowed: false, upstreamStatus: 403, upstreamErrorType: "PERMISSION_DENIED", message: "private detail" } },
  ]);
  const result = await mod.runProbe({ token: "x".repeat(40), mode: "live", fetcher: fake.fetcher, delay: async () => {} });
  assert.equal(result.upstreamStatus, 403);
  assert.equal(result.upstreamErrorType, "PERMISSION_DENIED");
  assert.equal(result.message, undefined);
  assert.equal(fake.calls.length, 5);
  assert.doesNotMatch(fake.calls[4].url, /check=auth/);
});
test("a network error from the upstream attempt is never retried", async () => {
  assert.equal(typeof mod.runProbe, "function");
  const fake = responses([...ready, { status: 200, body: { code: "AUTH_OK" } }, { status: 502, body: { checked: false, code: "UPSTREAM_NETWORK_ERROR" } }]);
  const result = await mod.runProbe({ token: "x".repeat(40), mode: "live", fetcher: fake.fetcher, delay: async () => {} });
  assert.equal(result.code, "UPSTREAM_NETWORK_ERROR");
  assert.equal(fake.calls.length, 4);
});
