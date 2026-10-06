import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/gemini-tts/route.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("M3 resolves one persistent Google-managed voice identity", () => {
  assert.match(route, /const M3_VOICE_DISPLAY_NAME = "QAZAQ M3 Anchor v2";/);
  assert.match(route, /type: "prompted"/);
  assert.match(route, /store: true/);
  assert.match(route, /language_code: "kk-KZ"/);
  assert.match(route, /gender: "male"/);
  assert.match(route, /cachedM3VoiceId/);
  assert.match(route, /existing\.id\?\.startsWith\("voice_"\)/);
  assert.match(route, /created\.id\?\.startsWith\("voice_"\)/);
});

test("M3 synthesis reuses the persistent voice_ ID as single-speaker speech_config", () => {
  assert.match(route, /const voice = await resolveM3Voice\(apiKey\);/);
  assert.match(route, /speech_config:\s*\[\{ voice \}\]/);
  assert.match(route, /"X-M3-Single-Speaker": "true"/);
  assert.match(route, /"X-M3-Voice-Source": "persistent-voice-design"/);
  assert.doesNotMatch(route, /M3_SINGLE_SPEAKER_PROFILE/);
  assert.doesNotMatch(route, /Maintain the same speaker identity/);
});

test("M3 minimizes chunk resets for normal daily scripts", () => {
  assert.match(route, /if \(speed <= 0\.94\) return 6200;/);
  assert.match(route, /return 7000;/);
  assert.match(route, /splitLongText\(prepared, maxChunkCharactersForSpeed\(speed\)\)/);
});

test("M3 UI communicates one persistent anchor from opening through item thirteen and closing", () => {
  assert.match(page, /M3 · 固定男性主播/);
  assert.match(page, /开头 → 第一条 → 第二条 → …… → 第十三条 → 结尾/);
  assert.match(page, /持久 voice_ 声纹 ID/);
  assert.match(page, /voice: M3_ANCHOR_TOKEN/);
});
