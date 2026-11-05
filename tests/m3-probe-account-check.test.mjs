import test from "node:test";
import assert from "node:assert/strict";

let moduleUnderTest = {};
try { moduleUnderTest = await import("../scripts/m3-probe-account-check.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const prod = "kazakh-broadcast-worker";
const probe = "kazakh-broadcast-m3-remix-probe-20261105";

function api(accounts, scriptsByAccount) {
  return async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    if (url.endsWith("/accounts?per_page=100")) return Response.json({ success: true, result: accounts, result_info: { total_pages: 1 } });
    const match = url.match(/\/accounts\/([^/]+)\/workers\/scripts$/);
    if (!match || !(match[1] in scriptsByAccount)) return Response.json({ success: false }, { status: 403 });
    return Response.json({ success: true, result: scriptsByAccount[match[1]].map(id => ({ id })) });
  };
}

test("selects only the account containing the production Worker when the probe name is unused", async () => {
  assert.equal(typeof moduleUnderTest.selectProbeAccount, "function");
  const account = await moduleUnderTest.selectProbeAccount({ token: "test-token", fetcher: api([{ id: "a" }, { id: "b" }], { a: ["other"], b: [prod] }) });
  assert.equal(account, "b");
});
test("refuses to overwrite an existing isolated Worker", async () => {
  assert.equal(typeof moduleUnderTest.selectProbeAccount, "function");
  await assert.rejects(moduleUnderTest.selectProbeAccount({ token: "test-token", fetcher: api([{ id: "a" }], { a: [prod, probe] }) }), /already exists/);
});
test("refuses ambiguous accounts or insufficient Cloudflare access", async () => {
  assert.equal(typeof moduleUnderTest.selectProbeAccount, "function");
  await assert.rejects(moduleUnderTest.selectProbeAccount({ token: "test-token", fetcher: api([{ id: "a" }, { id: "b" }], { a: [prod], b: [prod] }) }), /exactly one/);
  await assert.rejects(moduleUnderTest.selectProbeAccount({ token: "test-token", fetcher: api([{ id: "a" }], {}) }), /Cloudflare/);
});
