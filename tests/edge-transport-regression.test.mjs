import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression guard: this Worker uses Translator-issued bearer tokens and
// HTTPS Speech REST, not the third-party edge-tts WebSocket protocol.
// Do not copy Sec-MS-GEC changes into this transport without a migration.
const route = readFileSync(new URL("../app/api/synthesize/route.ts", import.meta.url), "utf8");

test("Edge uses Translator endpoint and HTTPS Speech REST", () => {
  assert.match(route, /https:\/\/dev\.microsofttranslator\.com\/apps\/endpoint\?api-version=1\.0/);
  assert.match(route, /https:\/\/\$\{endpoint\.r\}\.tts\.speech\.microsoft\.com\/cognitiveservices\/v1/);
  assert.match(route, /Authorization:\s*endpoint\.t/);
  assert.doesNotMatch(route, /Sec-MS-GEC|speech\.platform\.bing\.com\/consumer\/speech\/synthesize\/readaloud\/edge\/v1/);
});

test("Daulet news PCM and standard MP3 both use existing Speech REST transport", () => {
  assert.match(route, /audio-24khz-160kbitrate-mono-mp3/);
  assert.match(route, /raw-24khz-16bit-mono-pcm/);
  assert.match(route, /kk-KZ-DauletNeural/);
  assert.match(route, /kk-KZ-AigulNeural/);
});
