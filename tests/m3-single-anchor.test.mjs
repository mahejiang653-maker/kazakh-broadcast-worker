import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/gemini-tts/route.ts", import.meta.url), "utf8");
const voicesRoute = fs.readFileSync(new URL("../app/api/gemini-voices/route.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("M3 keeps a persistent custom Kazakh male anchor as optional fallback", () => {
  assert.match(route, /const M3_VOICE_DISPLAY_NAME = "QAZAQ M3 Anchor v2";/);
  assert.match(route, /type: "prompted"/);
  assert.match(route, /store: true/);
  assert.match(route, /language_code: "kk-KZ"/);
  assert.match(route, /gender: "male"/);
});

test("M3 exposes only official named male Studio roles plus the custom anchor", () => {
  for (const name of [
    "Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir",
    "Iapetus", "Orus", "Puck", "Rasalgethi", "Sadachbia", "Sadaltager",
    "Schedar", "Umbriel", "Zubenelgenubi",
  ]) {
    assert.match(route, new RegExp(`"${name}"`));
    assert.match(voicesRoute, new RegExp(`id: "${name}"`));
  }
  assert.doesNotMatch(voicesRoute, /Gacrux/);
  assert.doesNotMatch(voicesRoute, /Sulafat/);
});

test("strict M3 uses exactly one selected voice with Kazakh language lock", () => {
  assert.match(route, /const requestedVoice = sanitizeVoiceId\(body\.voice\) \|\| M3_ANCHOR_TOKEN;/);
  assert.match(route, /NAMED_MALE_STUDIO_VOICES\.has\(requestedVoice\)/);
  assert.match(route, /speech_config:\s*\[\{ voice, language: "kk-KZ" \}\]/);
  assert.doesNotMatch(route, /speech_config:\s*\{\s*speakers/);
  assert.match(route, /"X-M3-Strict-Single-Speaker": "true"/);
  assert.match(route, /"X-M3-Language": "kk-KZ"/);
});

test("strict M3 removes dialogue/performance triggers and uses punctuation pauses", () => {
  assert.match(route, /replaceAll\("\[短停顿\]", "\.\.\. "\)/);
  assert.match(route, /replaceAll\("\|", " "\)/);
  assert.match(route, /replaceAll\("«", ""\)/);
  assert.match(route, /output\.replace\(pattern, "\$1\$2\.\.\. "\)/);
  assert.doesNotMatch(route, /<short pause>/);
  assert.doesNotMatch(route, /<laugh>/);
});

test("strict M3 uses empty style at normal speed and shorter turns", () => {
  assert.match(route, /function strictSpeedStyle\(speed: number\)/);
  assert.match(route, /return "";/);
  assert.match(route, /if \(speed <= 0\.94\) return 2800;/);
  assert.match(route, /return 3200;/);
  assert.match(route, /const style = strictSpeedStyle\(speed\);/);
  assert.doesNotMatch(route, /PRESET_STYLE/);
});

test("long M3 programs automatically use Flash for stability", () => {
  assert.match(route, /rawText\.length > 2500 \? "gemini-3\.8-flash-tts" : requestedModel/);
});

test("M3 UI exposes strict single-speaker behavior", () => {
  assert.match(page, /M3 严格单主播 · 官方命名男角色/);
  assert.match(page, /严格单主播模式已关闭角色化播音风格/);
  assert.match(page, /M3 · 严格单主播 V3/);
  assert.match(page, /选择命名男角色/);
  assert.match(page, /Iapetus/);
  assert.match(page, /Schedar/);
  assert.match(page, /Charon/);
  assert.match(page, /开头 → 第一条 → 第二条 → …… → 第十三条 → 结尾/);
});
