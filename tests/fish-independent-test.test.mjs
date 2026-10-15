import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "rolldown";
import { decode } from "@msgpack/msgpack";
import { waitForIndependentReady, sendAuthorizedFishRequest } from "../scripts/fish-independent-run.mjs";
const dir = await mkdtemp(join(tmpdir(), "fish-test-"));
await build({ input: "worker/fish-independent-test.ts", platform: "node", output: { file: join(dir, "handler.mjs"), format: "esm", codeSplitting: false } });
const { handleIndependentFishTest, independentFishStatus } = await import(pathToFileURL(join(dir, "handler.mjs")));
test.after(() => rm(dir, { recursive: true, force: true }));
const token = `${Date.now() + 600_000}.${"a".repeat(64)}`;
const env = { FISH_AUDIO_API_KEY: "fake-secret-not-for-logs", FISH_DRAMA3_RUN_TOKEN: token };
const body = { model: "drama-3", text: "Бірінші. Елімізде.", reference: { audioBase64: Buffer.alloc(120, 1).toString("base64"), text: "Сәлем тораптастар." } };
const req = (payload = body, credential = token) => new Request("https://example.test/api/fish-independent-test", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` }, body: JSON.stringify(payload),
});
function wav() { const bytes = Buffer.alloc(144); bytes.write("RIFF", 0); bytes.writeUInt32LE(136, 4); bytes.write("WAVE", 8); return bytes; }

test("anonymous, incorrect and expired operator credentials make zero upstream calls", async () => {
  let calls = 0; const fetcher = async () => { calls++; throw Error("must not run"); };
  for (const credential of ["", "wrong", `${Date.now() - 1000}.${"a".repeat(64)}`]) {
    assert.equal((await handleIndependentFishTest(req(body, credential), env, fetcher)).status, 403);
  }
  assert.equal((await handleIndependentFishTest(req(), { ...env, FISH_DRAMA3_RUN_TOKEN: `${Date.now()-1}.${"a".repeat(64)}` }, fetcher)).status, 403);
  assert.equal(calls, 0);
});
test("invalid models, incomplete references and oversized input never consume Fish credits", async () => {
  let calls = 0; const fetcher = async () => { calls++; throw Error("must not run"); };
  for (const payload of [null, [], { ...body, model: "Drama3" }, { ...body, text: "а".repeat(1201) }, { ...body, reference: null },
    { ...body, reference: { ...body.reference, audioBase64: "!!!=" } }, { ...body, reference: { ...body.reference, text: "" } }]) {
    assert.equal((await handleIndependentFishTest(req(payload), env, fetcher)).status, 400);
  }
  assert.equal(calls, 0);
});
test("explicit model, transcript and binary reference survive MessagePack without model fallback", async () => {
  for (const model of ["drama-3", "s2.1-pro-free"]) {
    const calls = [];
    const response = await handleIndependentFishTest(req({ ...body, model }), env, async (url, init) => {
      calls.push({ url, init }); return new Response(wav(), { headers: { "X-Model": model } });
    });
    assert.equal(response.status, 200); assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(url, "https://api.fish.audio/v1/tts"); assert.equal(init.headers.model, model);
    assert.equal(init.headers["Content-Type"], "application/msgpack");
    const packed = decode(new Uint8Array(init.body));
    assert.equal(packed.text, body.text); assert.equal(packed.references[0].text, body.reference.text);
    assert.deepEqual(Buffer.from(packed.references[0].audio), Buffer.alloc(120, 1));
    assert.equal(packed.condition_on_previous_chunks, true); assert.equal(packed.sample_rate, 24000);
    assert.equal(response.headers.get("X-Fish-Requested-Model"), model);
    assert.equal(response.headers.get("X-Fish-Upstream-Model"), model);
  }
});
test("upstream quota failure is reported exactly once without leaking secrets or retrying S2", async () => {
  let calls = 0;
  const response = await handleIndependentFishTest(req(), env, async () => { calls++; return new Response(env.FISH_AUDIO_API_KEY, { status: 402 }); });
  assert.equal(response.status, 502); const result = await response.json();
  assert.equal(result.upstreamStatus, 402); assert.equal(result.requestedModel, "drama-3");
  assert.equal(JSON.stringify(result).includes(env.FISH_AUDIO_API_KEY), false); assert.equal(calls, 1);
});
test("wrong model and non-audio success responses are rejected", async () => {
  const mismatch = await handleIndependentFishTest(req(), env, async () => new Response(wav(), { headers: { "X-Model": "s2.1-pro" } }));
  assert.equal((await mismatch.json()).code, "FISH_MODEL_MISMATCH");
  const invalid = await handleIndependentFishTest(req(), env, async () => new Response("x".repeat(100)));
  assert.equal((await invalid.json()).code, "FISH_AUDIO_INVALID");
});
test("read-only status exposes readiness but no credential values", async () => {
  const text = await independentFishStatus(env).text();
  assert.equal(text.includes(env.FISH_AUDIO_API_KEY), false); assert.equal(text.includes(token), false);
  const status = JSON.parse(text); assert.equal(status.changesProductionDefaults, false); assert.equal(status.operatorRunActive, true);
});
test("a newly published operator binding can become ready before any generation request", async () => {
  const urls = [], observations = [];
  await waitForIndependentReady({ fetcher: async url => {
    urls.push(url); return Response.json({ version: "fish-drama3-independent-v3-preflight", keyConfigured: true, operatorRunActive: urls.length === 3 });
  }, wait: async () => {}, onStatus: state => observations.push(state), attempts: 3 });
  assert.equal(urls.length, 3); assert.ok(urls.every(url => url.endsWith("/api/fish-independent-status")));
  assert.deepEqual(observations.map(x => x.operatorRunActive), [false, false, true]);
  const padded = { ...env, FISH_DRAMA3_RUN_TOKEN: ` ${token}\n` };
  assert.equal((await independentFishStatus(padded).json()).operatorRunActive, true);
  const response = await handleIndependentFishTest(req(), padded, async () => new Response(wav()));
  assert.equal(response.status, 200);
});
test("authenticated POST preflight validates the dedicated token without contacting Fish", async () => {
  let calls = 0;
  const request = new Request("https://example.test/api/fish-independent-test", { method: "POST", headers: { "Content-Type": "application/json", "X-Fish-Test-Token": token }, body: JSON.stringify({ preflight: true }) });
  const response = await handleIndependentFishTest(request, env, async () => { calls++; throw Error("must not run"); });
  assert.equal(response.status, 200); assert.equal((await response.json()).authorized, true); assert.equal(calls, 0);
});
test("readiness waits for the actual POST authorization path", async () => {
  let posts = 0;
  await waitForIndependentReady({ token, wait: async () => {}, attempts: 2, fetcher: async (url, init) => {
    if (url.endsWith("-status")) return Response.json({ version: "fish-drama3-independent-v3-preflight", keyConfigured: true, operatorRunActive: true });
    assert.equal(init.headers["X-Fish-Test-Token"], token); assert.deepEqual(JSON.parse(init.body), { preflight: true });
    return ++posts === 1 ? Response.json({ code: "FISH_TEST_UNAUTHORIZED" }, { status: 403 }) : Response.json({ authorized: true, version: "fish-drama3-independent-v3-preflight" });
  } });
  assert.equal(posts, 2);
});
test("only explicit local authorization rejections retry; provider failures never retry", async () => {
  let calls = 0;
  const success = await sendAuthorizedFishRequest(body, token, { wait: async () => {}, fetcher: async () => ++calls === 1 ? Response.json({ code: "FISH_TEST_UNAUTHORIZED" }, { status: 403 }) : new Response(wav()) });
  assert.equal(success.status, 200); assert.equal(calls, 2);
  calls = 0;
  const failure = await sendAuthorizedFishRequest(body, token, { wait: async () => {}, fetcher: async () => { calls++; return Response.json({ code: "FISH_UPSTREAM_ERROR", upstreamStatus: 402 }, { status: 502 }); } });
  assert.equal(failure.status, 502); assert.equal(calls, 1);
});
