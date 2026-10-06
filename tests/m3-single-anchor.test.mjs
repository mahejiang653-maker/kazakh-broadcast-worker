import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/gemini-tts/route.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("M3 is server-locked to one fixed male anchor", () => {
  assert.match(route, /const M3_FIXED_VOICE = "Gacrux";/);
  assert.match(route, /const voice = M3_FIXED_VOICE;/);
  assert.doesNotMatch(route, /sanitizeVoice\(body\.voice\)/);
  assert.match(route, /"X-M3-Single-Speaker": "true"/);
  assert.match(route, /"X-M3-Anchor": "fixed-male"/);
});

test("M3 uses a single speech_config voice per chunk", () => {
  assert.match(route, /speech_config:\s*\[\{ voice \}\]/);
  assert.match(route, /Never introduce, imitate, alternate with, or imply a second speaker/);
  assert.match(route, /Treat every chunk as a continuation of the same uninterrupted studio session/);
});

test("M3 UI communicates one anchor from opening through item thirteen and closing", () => {
  assert.match(page, /M3 · 固定男性主播/);
  assert.match(page, /开头 → 第一条 → 第二条 → …… → 第十三条 → 结尾/);
  assert.match(page, /voice: M3_FIXED_VOICE/);
});
