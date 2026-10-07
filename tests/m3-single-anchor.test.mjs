import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/gemini-tts/route.ts", import.meta.url), "utf8");
const voicesRoute = fs.readFileSync(new URL("../app/api/gemini-voices/route.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("M3 keeps a persistent native Kazakh male anchor as the safe default", () => {
  assert.match(route, /const M3_VOICE_DISPLAY_NAME = "QAZAQ M3 Anchor v2";/);
  assert.match(route, /type: "prompted"/);
  assert.match(route, /store: true/);
  assert.match(route, /language_code: "kk-KZ"/);
  assert.match(route, /gender: "male"/);
  assert.match(route, /cachedM3VoiceId/);
  assert.match(route, /item\.id\?\.startsWith\("voice_"\)/);
  assert.match(route, /created\.id\?\.startsWith\("voice_"\)/);
});

test("M3 voice catalog is strictly kk-KZ plus male", () => {
  assert.match(voicesRoute, /url\.searchParams\.append\("language_code", "kk-KZ"\)/);
  assert.match(voicesRoute, /url\.searchParams\.append\("gender", "male"\)/);
  assert.match(voicesRoute, /page_size", "1000"/);
  assert.match(voicesRoute, /language\.toLowerCase\(\) !== "kk-kz"/);
  assert.match(route, /url\.searchParams\.append\("language_code", "kk-KZ"\)/);
  assert.match(route, /url\.searchParams\.append\("gender", "male"\)/);
  assert.match(route, /item\.language_code\?\.trim\(\)\.toLowerCase\(\) === "kk-kz"/);
});

test("M3 validates the selected Kazakh male voice and holds it for every chunk", () => {
  assert.match(route, /const requestedVoice = sanitizeVoiceId\(body\.voice\) \|\| M3_ANCHOR_TOKEN;/);
  assert.match(route, /const resolvedVoice = await resolveSelectedM3Voice\(apiKey, requestedVoice\);/);
  assert.match(route, /speech_config:\s*\[\{ voice \}\]/);
  assert.match(route, /maleVoiceIds\.has\(requestedVoice\)/);
  assert.match(route, /"X-M3-Single-Speaker": "true"/);
  assert.doesNotMatch(route, /Maintain the same speaker identity/);
});

test("M3 minimizes chunk resets for normal daily scripts", () => {
  assert.match(route, /if \(speed <= 0\.94\) return 6200;/);
  assert.match(route, /return 7000;/);
  assert.match(route, /splitLongText\(prepared, maxChunkCharactersForSpeed\(speed\)\)/);
});

test("M3 UI lets the user choose Kazakh male voices while preserving one-speaker output", () => {
  assert.match(page, /M3 固定单主播 · 哈萨克男声可选/);
  assert.match(page, /这里只加载 Gemini 3\.8 中标记为 kk-KZ \+ male 的哈萨克男声/);
  assert.match(page, /选择哈萨克男主播/);
  assert.match(page, /偏细/);
  assert.match(page, /低沉/);
  assert.match(page, /voice,/);
  assert.match(page, /开头 → 第一条 → 第二条 → …… → 第十三条 → 结尾/);
});
