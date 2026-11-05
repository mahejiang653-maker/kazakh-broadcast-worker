import test from "node:test";
import assert from "node:assert/strict";
import { voiceId, summarizeVoices, listVoices } from "../experiments/m3-voices-preflight.mjs";

test("accepts only persistent custom voice IDs", () => {
  assert.equal(voiceId("voice_abc123"), true);
  assert.equal(voiceId("Puck"), false);
  assert.equal(voiceId("voicekey_abc"), false);
});
test("summarizes documented voice list without leaking samples", () => {
  assert.deepEqual(summarizeVoices({voices:[{id:"Puck",type:"prebuilt"},{id:"voice_abc",type:"prompted",sample_audio:{data:"SECRET"}}]}).entries,
    [{id:"Puck",type:"prebuilt",displayName:null,persistent:false},{id:"voice_abc",type:"prompted",displayName:null,persistent:true}]);
});
test("read-only request uses GET, never POST", async () => {
  let called = 0;
  const result = await listVoices({apiKey:"fake-key",fetcher:async (url,options) => {
    called++; assert.equal(url,"https://generativelanguage.googleapis.com/v1beta/voices");
    assert.equal(options.method,"GET"); return Response.json({voices:[]});
  }});
  assert.equal(called,1); assert.equal(result.totalOnPage,0);
});
