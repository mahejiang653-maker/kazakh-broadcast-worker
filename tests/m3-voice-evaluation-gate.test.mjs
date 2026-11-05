import test from "node:test";
import assert from "node:assert/strict";
import { evaluateM3VoiceExperiment } from "../experiments/m3-voice-evaluation-gate.mjs";
const row = (arm,take) => ({arm,take,source:"recorded-audio",audioSha256:"a".repeat(64),f0DriftCents:20,mfccDistance:2,loudnessDeltaDb:-1,transcriptChecked:true,pronunciationReviewed:true});
test("partial A/B evidence cannot claim improvement",()=>{
 const r=evaluateM3VoiceExperiment([row("baseline",1),row("remix",1)]);
 assert.equal(r.complete,false);
 assert.match(r.conclusion,/Insufficient/);
});
test("complete verified pairs still require human comparison",()=>{
 const r=evaluateM3VoiceExperiment([row("baseline",1),row("remix",1)],1);
 assert.equal(r.complete,true);
 assert.match(r.conclusion,/blinded human/);
});
test("duplicate and synthetic measurements are rejected",()=>{
 assert.throws(()=>evaluateM3VoiceExperiment([row("baseline",1),row("baseline",1)]));
 assert.throws(()=>evaluateM3VoiceExperiment([{...row("remix",1),source:"mock"}]));
});
