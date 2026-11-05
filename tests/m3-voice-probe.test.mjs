import test from "node:test";
import assert from "node:assert/strict";
import { handleVoiceProbe } from "../worker/m3-voice-probe.ts";
import * as probeModule from "../worker/m3-voice-probe.ts";
const url = "https://example.test/api/internal/m3-voice-probe";
const token = "x".repeat(40);
const req = (method = "POST", supplied = token) => new Request(url, { method, headers: {"X-M3-Probe-Token": supplied} });
test("disabled without independent admin token", async () => {
 const r = await handleVoiceProbe(req(), { GEMINI_API_KEY:"key" }, async()=>{throw Error("should not fetch");});
 assert.equal(r.status,503);
});
test("unauthorized probe never reaches Google", async () => {
 const r=await handleVoiceProbe(req("POST","wrong"),{GEMINI_API_KEY:"key",M3_VOICE_PROBE_TOKEN:token},async()=>{throw Error("should not fetch");});
 assert.equal(r.status,401);
});
test("authorized probe issues exactly one GET and redacts response", async () => {
 let calls=0;
 const r=await handleVoiceProbe(req(),{GEMINI_API_KEY:"key",M3_VOICE_PROBE_TOKEN:token},async (u,opts)=>{
  calls++; assert.equal(opts.method,"GET");assert.equal(u,"https://generativelanguage.googleapis.com/v1beta/voices");
  return Response.json({voices:[{id:"private_voice"}]});
 });
 assert.equal(calls,1);assert.equal(r.status,200);
 const body=await r.text();assert.equal(body.includes("private_voice"),false);assert.equal(body.includes("key"),false);
});
test("GET requests are refused", async()=>{
 const r=await handleVoiceProbe(req("GET"),{GEMINI_API_KEY:"key",M3_VOICE_PROBE_TOKEN:token});
 assert.equal(r.status,405);
});
test("authorized token preflight never calls Google even when a Gemini key exists", async () => {
 const request = new Request(`${url}?check=auth`, { method: "POST", headers: { "X-M3-Probe-Token": token } });
 const result = await handleVoiceProbe(request, { GEMINI_API_KEY: "key", M3_VOICE_PROBE_TOKEN: token }, async () => { throw new Error("must not contact Google"); });
 assert.equal(result.status, 200);
 assert.equal((await result.json()).code, "AUTH_OK");
});
test("refuses to follow redirects while sending the Google API key", async () => {
 let calls = 0;
 const r = await handleVoiceProbe(req(), { GEMINI_API_KEY: "key", M3_VOICE_PROBE_TOKEN: token }, async (url, opts) => {
  calls++;
  assert.equal(opts.redirect, "manual");
  return new Response(null, { status: 302, headers: { Location: "https://example.test/redirect" } });
 });
 assert.equal(calls, 1);
 assert.equal(r.status, 502);
 assert.equal((await r.json()).upstreamStatus, 302);
});
test("reports a recognized Google error type without exposing its message", async () => {
 const r = await handleVoiceProbe(req(), { GEMINI_API_KEY: "secret-key", M3_VOICE_PROBE_TOKEN: token }, async () =>
  Response.json({ error: { status: "PERMISSION_DENIED", message: "secret-key private_voice" } }, { status: 403 }));
 const text = await r.text();
 const body = JSON.parse(text);
 assert.equal(body.upstreamStatus, 403);
 assert.equal(body.upstreamErrorType, "PERMISSION_DENIED");
 assert.equal(text.includes("secret-key"), false);
 assert.equal(text.includes("private_voice"), false);
});
test("does not reflect unknown or attacker-supplied upstream error types", async () => {
 const r = await handleVoiceProbe(req(), { GEMINI_API_KEY: "secret-key", M3_VOICE_PROBE_TOKEN: token }, async () =>
  Response.json({ error: { status: "secret-key" } }, { status: 400 }));
 const text = await r.text();
 assert.equal(JSON.parse(text).upstreamErrorType, "UNKNOWN");
 assert.equal(text.includes("secret-key"), false);
});
test("the isolated Worker exposes only the guarded probe path", async () => {
 assert.ok(probeModule.default, "an isolated Worker entry point must be exported");
 const worker = probeModule.default;
 const env = { GEMINI_API_KEY: "secret-key", M3_VOICE_PROBE_TOKEN: token };
 const missing = await worker.fetch(new Request("https://example.test/api/synthesize", { method: "POST" }), env);
 assert.equal(missing.status, 404);
 const unauthorized = await worker.fetch(req("POST", "wrong"), env);
 assert.equal(unauthorized.status, 401);
});
