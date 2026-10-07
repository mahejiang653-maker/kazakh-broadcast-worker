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
});

test("M3 V4 uses Generate Content protocol-level single-speaker voiceConfig", () => {
  assert.match(route, /models\/\$\{model\}:generateContent/);
  assert.match(route, /generationConfig:/);
  assert.match(route, /responseModalities: \["AUDIO"\]/);
  assert.match(route, /speechConfig:\s*\{\s*voiceConfig:\s*\{\s*voice,/s);
  assert.doesNotMatch(route, /multiSpeakerVoiceConfig/);
  assert.doesNotMatch(route, /GEMINI_INTERACTIONS_ENDPOINT/);
  assert.doesNotMatch(route, /speech_config:\s*\[/);
  assert.match(route, /"X-M3-TTS-API": "generateContent-voiceConfig"/);
});

test("M3 V4 uses raw PCM output for safe concatenation", () => {
  assert.match(route, /mimeType: "AUDIO_L16"/);
  assert.match(route, /sampleRate: SAMPLE_RATE/);
  assert.match(route, /GeminiGenerateContentPayload/);
  assert.match(route, /inlineData\?\.data \?\? part\.inline_data\?\.data/);
});

test("strict M3 removes dialogue/performance triggers and uses punctuation pauses", () => {
  assert.match(route, /replaceAll\("\[短停顿\]", "\.\.\. "\)/);
  assert.match(route, /replaceAll\("\|", " "\)/);
  assert.match(route, /replaceAll\("«", ""\)/);
  assert.match(route, /output\.replace\(pattern, "\$1\$2\.\.\. "\)/);
});

test("strict M3 uses empty style at normal speed and shorter turns", () => {
  assert.match(route, /function strictSpeedStyle\(speed: number\)/);
  assert.match(route, /return "";/);
  assert.match(route, /if \(speed <= 0\.94\) return 2800;/);
  assert.match(route, /return 3200;/);
});

test("long M3 programs automatically use Flash for stability", () => {
  assert.match(route, /rawText\.length > 2500 \? "gemini-3\.8-flash-tts" : requestedModel/);
});

test("M3 UI exposes protocol-level single-speaker V4", () => {
  assert.match(page, /M3 严格单主播 V4 · 官方命名男角色/);
  assert.match(page, /speechConfig\.voiceConfig/);
  assert.match(page, /multiSpeakerVoiceConfig/);
  assert.match(page, /M3 · 严格单主播 V4/);
  assert.match(page, /选择命名男角色/);
});
