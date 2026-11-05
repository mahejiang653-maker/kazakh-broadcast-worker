import test from "node:test";
import assert from "node:assert/strict";
import { planM3VoiceComparison, summarizeVoiceDrift } from "../experiments/m3-voice-ab-plan.mjs";
const text = "Бірінші. " + "Бұл маңызды жаңалық. ".repeat(12);
test("paired synthesis parameters remain identical", () => {
 const p = planM3VoiceComparison({text,baselineVoice:"Puck",remixVoice:"voice_123"});
 assert.equal(p.totalSynthesisRequests,10);
 for(let i=0;i<10;i+=2){
  const [a,b]=p.jobs.slice(i,i+2);
  for(const k of ["model","speed","transport","textSha256","characters","textMode"]) assert.equal(a[k],b[k]);
 }
});
test("invalid voice IDs and excess calls are rejected",()=>{
 assert.throws(()=>planM3VoiceComparison({text,baselineVoice:"Puck",remixVoice:"Puck"}));
 assert.throws(()=>planM3VoiceComparison({text,baselineVoice:"Puck",remixVoice:"voice_x",repetitions:6}));
});
test("measured acoustic drift is summarized per arm",()=>{
 const r=summarizeVoiceDrift([{arm:"baseline",take:1,f0DriftCents:100,mfccDistance:3,loudnessDeltaDb:-2},{arm:"remix",take:1,f0DriftCents:70,mfccDistance:2,loudnessDeltaDb:1}]);
 assert.equal(r.baseline.meanAbsolutePitchDriftCents,100);
 assert.equal(r.remix.meanAbsolutePitchDriftCents,70);
});
test("incomplete measurements fail validation",()=>{
 assert.throws(()=>summarizeVoiceDrift([{arm:"remix",take:1,f0DriftCents:0,mfccDistance:1}]));
});
