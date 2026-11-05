import test from "node:test";
import assert from "node:assert/strict";
import { handleVoiceProbe } from "../worker/m3-voice-probe.ts";
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
