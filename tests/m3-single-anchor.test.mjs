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

test("M3 validates a selected named male role and holds it for every chunk", () => {
  assert.match(route, /const requestedVoice = sanitizeVoiceId\(body\.voice\) \|\| M3_ANCHOR_TOKEN;/);
  assert.match(route, /NAMED_MALE_STUDIO_VOICES\.has\(requestedVoice\)/);
  assert.match(route, /source: "named-male-studio-voice"/);
  assert.match(route, /speech_config:\s*\[\{ voice \}\]/);
  assert.match(route, /"X-M3-Single-Speaker": "true"/);
});

test("M3 minimizes chunk resets for normal daily scripts", () => {
  assert.match(route, /if \(speed <= 0\.94\) return 6200;/);
  assert.match(route, /return 7000;/);
  assert.match(route, /splitLongText\(prepared, maxChunkCharactersForSpeed\(speed\)\)/);
});

test("M3 UI presents named male roles and explains Kazakh language behavior", () => {
  assert.match(page, /M3 固定单主播 · 官方命名男角色/);
  assert.match(page, /Gemini 3\.8 会自动识别哈萨克语输入/);
  assert.match(page, /选择命名男角色/);
  assert.match(page, /Iapetus/);
  assert.match(page, /Schedar/);
  assert.match(page, /Charon/);
  assert.match(page, /开头 → 第一条 → 第二条 → …… → 第十三条 → 结尾/);
});
