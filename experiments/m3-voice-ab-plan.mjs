/**
 * Pure, offline M3 A/B experiment planner. No network, credentials, or audio synthesis.
 * Keeps the source text and all generation settings identical between arms.
 */
import { createHash } from "node:crypto";
export const ARMS = Object.freeze(["baseline", "remix"]);
export function planM3VoiceComparison({text, baselineVoice, remixVoice, model="gemini-3.8-flash-tts", repetitions=5, speed=1, transport="interactions"}) {
  if (typeof text !== "string" || text.trim().length < 100) throw new Error("Need a real Kazakh news manuscript (>=100 characters)");
  if (typeof baselineVoice !== "string" || !/^[A-Za-z][\w-]{0,100}$/.test(baselineVoice)) throw new Error("Invalid baseline voice");
  if (typeof remixVoice !== "string" || !/^voice_[A-Za-z0-9_-]+$/.test(remixVoice)) throw new Error("Expected a stored voice_ ID");
  if (!["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"].includes(model)) throw new Error("Unsupported comparison model");
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error("Repetitions must be 1..5");
  if (speed !== 1 || transport !== "interactions") throw new Error("Use 1.0x and the same Interactions transport");
  const textSha256=createHash("sha256").update(text).digest("hex");
  const common={model, speed, transport, textSha256, characters:text.length, textMode:"verbatim"};
  return {version:1, common, totalSynthesisRequests:repetitions*2, jobs:Array.from({length:repetitions},(_,i)=>[
    {arm:"baseline",take:i+1,voice:baselineVoice,...common},
    {arm:"remix",take:i+1,voice:remixVoice,...common},
  ]).flat()};
}
export function summarizeVoiceDrift(records) {
  if (!Array.isArray(records) || records.length===0) throw new Error("No measured recordings");
  const grouped={};
  for(const row of records){
    if (!ARMS.includes(row.arm) || !Number.isInteger(row.take) || row.take<1) throw new Error("Invalid recording identity");
    if (typeof row.f0DriftCents!=="number" || !Number.isFinite(row.f0DriftCents) ||
        typeof row.mfccDistance!=="number" || !Number.isFinite(row.mfccDistance) || row.mfccDistance<0 ||
        typeof row.loudnessDeltaDb!=="number" || !Number.isFinite(row.loudnessDeltaDb)) throw new Error("Missing or invalid acoustic measurement");
    (grouped[row.arm]??=[]).push(row);
  }
  const mean=(a,key)=>a.reduce((s,r)=>s+Math.abs(r[key]),0)/a.length;
  return Object.fromEntries(Object.entries(grouped).map(([arm,rows])=>[arm,{
    takes:rows.length,
    meanAbsolutePitchDriftCents:mean(rows,"f0DriftCents"),
    meanMfccDistance:mean(rows,"mfccDistance"),
    meanAbsoluteLoudnessDeltaDb:mean(rows,"loudnessDeltaDb"),
  }]));
}
