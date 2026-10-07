import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "rolldown";
const dir = await mkdtemp(join(tmpdir(), "m3-test-"));
for (const name of ["script", "audio", "pipeline", "handler"]) await build({ input: `app/lib/m3-${name}.ts`, platform: "node", output: { file: join(dir, `${name}.mjs`), format: "esm", codeSplitting: false } });
const script = await import(pathToFileURL(join(dir, "script.mjs")));
const audio = await import(pathToFileURL(join(dir, "audio.mjs")));
const { generateM3Program, M3Error } = await import(pathToFileURL(join(dir, "pipeline.mjs")));
const { handleM3Request } = await import(pathToFileURL(join(dir, "handler.mjs")));
test.after(() => rm(dir, { recursive: true, force: true }));
function tone(pitch = 160, seconds = 18, gain = 0.18) {
  const pcm = new Uint8Array(seconds * 48000), view = new DataView(pcm.buffer);
  for (let i = 0; i < pcm.length / 2; i++) { const t = i / 24000; view.setInt16(i * 2, Math.round(32767 * gain * (Math.sin(2 * Math.PI * pitch * t) + 0.24 * Math.sin(4 * Math.PI * pitch * t))), true); }
  return pcm;
}
function payload(pcm, reason = "STOP", mime = "audio/L16;codec=pcm;rate=24000") { return { candidates: [{ finishReason: reason, content: { parts: [{ inlineData: { mimeType: mime, data: Buffer.from(pcm).toString("base64") } }] } }] }; }
function mock(upstream = [], initialCount = 300, audioSequence = [tone(160, 60)]) {
  let count = 0, generated = 0;
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    upstream.push({ url, body });
    if (url.endsWith(":countTokens")) return Response.json({ totalTokens: ++count === 1 ? initialCount : 300 });
    const item = audioSequence[Math.min(generated++, audioSequence.length - 1)];
    return item instanceof Response ? item : Response.json(payload(item));
  };
  return fetcher;
}
const run = (overrides = {}) => generateM3Program({ apiKey: "fake-test-key", model: "gemini-3.8-flash-tts", voice: "Puck", text: "Бірінші. Маңызды жаңалық туралы мәлімет жарияланды.", speed: 1, log() {}, ...overrides });
const fixture = () => "Сәлем тораптастар.\n\n" + script.NUMBERED_OPENERS.map(x => `${x}. ${"Жаңалық мәтіні. ".repeat(8)}`).join("\n\n") + "\n\nОсымен бүгінгі кескін айақталды.";

test("all 13 ordinal periods and one supported pause survive; names and quotations remain text", () => {
  for (const opener of script.NUMBERED_OPENERS) {
    const prepared = script.prepareM3Text(`${opener}.\nДоналд Трамп: «Бұл маңызды», деді.`);
    assert.ok(prepared.startsWith(`${opener}. <short pause>\n`));
    assert.ok(prepared.includes('Доналд Трамп: «Бұл маңызды», деді.'));
    assert.equal(script.prepareM3Text(prepared), prepared);
  }
  assert.equal(script.prepareM3Text("Төртінші. <angry>Мәлімет. [sad] [短停顿]"), "Төртінші. <short pause>\nМәлімет.  <short pause>");
});
test("the full 13-item script is kept whole when limits allow, and body never includes instructions", async () => {
  const calls = []; const result = await run({ text: fixture(), fetcher: mock(calls) });
  const tts = calls.filter(x => x.url.endsWith(":generateContent"));
  assert.equal(tts.length, 1); assert.equal(result.audit.strategy, "single");
  assert.equal(tts[0].body.contents[0].parts[0].text, script.prepareM3Text(fixture()));
  assert.equal(tts[0].body.generationConfig.speechConfig.voiceConfig.voice, "Puck");
  assert.equal(tts[0].body.contents[0].parts[0].speechMetadata.style, script.m3Style(1));
  assert.equal(tts[0].body.generationConfig.temperature, 0.5);
  assert.equal(result.wav.slice(0, 4).toString(), new Uint8Array([82, 73, 70, 70]).toString());
});
test("large fallback groups intro+1–4, 5–9, 10–13+closing, with identical configuration", async () => {
  const calls = []; const result = await run({ text: fixture(), fetcher: mock(calls, 9000) });
  const tts = calls.filter(x => x.url.endsWith(":generateContent"));
  assert.equal(tts.length, 3); assert.equal(result.audit.strategy, "grouped");
  assert.ok(tts[0].body.contents[0].parts[0].text.includes("Төртінші."));
  assert.ok(tts[1].body.contents[0].parts[0].text.startsWith("Бесінші."));
  assert.ok(tts[2].body.contents[0].parts[0].text.endsWith("Осымен бүгінгі кескін айақталды."));
  for (const call of tts) assert.deepEqual(call.body.generationConfig, tts[0].body.generationConfig);
  assert.equal(tts.map(x => x.body.contents[0].parts[0].text).join(" ").replace(/\s+/g, " "), script.prepareM3Text(fixture()).replace(/\s+/g, " "));
});
test("speaker metadata is absent and the one voice cannot be replaced by a person in the text", () => {
  const request = script.m3RequestBody("Putin: «Сәлем». Donald Trump: «Hello».", "Puck", script.m3Style(1));
  assert.deepEqual(request.generationConfig.speechConfig, { voiceConfig: { voice: "Puck" } });
  assert.equal(request.contents[0].parts[0].speechMetadata.speaker, undefined);
  assert.equal(request.contents.length, 1);
});
test("0.95, 1.00 and 1.05 preserve voice/config and have a fixed explicit rate for the whole program", () => {
  for (const speed of [0.95, 1, 1.05]) {
    const a = script.m3RequestBody("А.", "Puck", script.m3Style(speed)), b = script.m3RequestBody("Б.", "Puck", script.m3Style(speed));
    assert.deepEqual(a.generationConfig, b.generationConfig);
    assert.equal(a.contents[0].parts[0].speechMetadata.style, b.contents[0].parts[0].speechMetadata.style);
    assert.ok(a.contents[0].parts[0].speechMetadata.style.includes(`${Math.round(speed * 100)}%`));
  }
});
test("known F0 is recovered; scalar gain alone does not become a voice-drift rejection", () => {
  const reference = audio.analyzeM3Pcm(tone(160));
  assert.ok(Math.abs(reference.f0Median - 160) < 2, JSON.stringify(reference));
  const comparison = audio.compareM3Voice(reference, audio.analyzeM3Pcm(tone(160, 18, 0.05)));
  assert.equal(comparison.detected, false); assert.ok(comparison.loudnessDb > 8);
  assert.ok(reference.mfccMean.length === 12);
});
test("scalar loudness matching is bounded, prevents clipping and preserves F0", () => {
  const pcm = tone(160, 6, 0.08), reference = audio.analyzeM3Pcm(tone(160, 6, 0.16));
  const before = audio.analyzeM3Pcm(pcm);
  const gain = audio.matchM3Loudness(pcm, reference.rmsDb, before.rmsDb);
  assert.ok(Math.abs(gain - 3) < 0.01);
  const after = audio.analyzeM3Pcm(pcm);
  assert.ok(Math.abs(after.f0Median - before.f0Median) < 0.05);
  assert.ok(Math.abs(after.rmsDb - before.rmsDb - gain) < 0.05);
  const hot = tone(160, 2, 0.78);
  audio.matchM3Loudness(hot, -1, -10);
  const values = new DataView(hot.buffer); let peak = 0;
  for (let p = 0; p < hot.length; p += 2) peak = Math.max(peak, Math.abs(values.getInt16(p, true)));
  assert.ok(peak <= 32700);
});
test("silent audio cannot pass screening and is never delivered", async () => {
  const calls = [];
  await assert.rejects(run({ fetcher: mock(calls, 300, [new Uint8Array(12 * 48000)]) }), error => error.code === "M3_INSUFFICIENT_VOICED_AUDIO");
  assert.equal(calls.filter(x => x.url.endsWith(":generateContent")).length, 3);
});
test("persistent large pitch/timbre changes are detected inside a single take too", () => {
  const a = tone(160, 24), b = tone(270, 36), pcm = new Uint8Array(a.length + b.length); pcm.set(a); pcm.set(b, a.length);
  const report = audio.screenM3Take(pcm);
  assert.equal(report.detected, true); assert.ok(report.windows.some(x => x.comparison.detected));
});
test("an anomalous second chunk is regenerated with exactly the same request and never appended", async () => {
  const calls = []; const result = await run({ text: fixture(), fetcher: mock(calls, 9000, [tone(160), tone(270), tone(160), tone(160)]) });
  const tts = calls.filter(x => x.url.endsWith(":generateContent"));
  assert.equal(tts.length, 4); assert.equal(result.audit.retries, 1); assert.equal(result.audit.parts[1].attempts, 2);
  assert.deepEqual(tts[1].body, tts[2].body);
  assert.ok(result.audit.parts.every(x => Math.abs(x.features.f0Median - 160) < 2));
});
test("exhausted drift retries fail closed instead of producing a completed WAV", async () => {
  const calls = [];
  await assert.rejects(run({ text: fixture(), fetcher: mock(calls, 9000, [tone(160), tone(270)]) }), e => e.code === "VOICE_DRIFT_DETECTED");
  assert.equal(calls.filter(x => x.url.endsWith(":generateContent")).length, 4);
});
test("region error stops immediately and never falls back to another voice/model/path", async () => {
  const calls = []; const fetcher = async (url, init) => { calls.push({ url, init }); return Response.json({ error: { message: "User location is not supported for the API use." } }, { status: 400 }); };
  await assert.rejects(run({ fetcher }), e => e instanceof M3Error && e.code === "GEMINI_REGION_UNSUPPORTED" && e.status === 503);
  assert.equal(calls.length, 1);
});
test("quota error does not retry or change temperature", async () => {
  const calls = []; const fetcher = async (url, init) => { calls.push({ url, init }); return url.endsWith(":countTokens") ? Response.json({ totalTokens: 30 }) : new Response('{}', { status: 429 }); };
  await assert.rejects(run({ fetcher }), e => e.code === "GEMINI_QUOTA_LIMIT"); assert.equal(calls.length, 2);
});
test("MAX_TOKENS audio is discarded; all text is regrouped", async () => {
  const calls = []; let n = 0;
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.endsWith(":countTokens")) return Response.json({ totalTokens: 300 });
    return Response.json(payload(tone(), n++ === 0 ? "MAX_TOKENS" : "STOP"));
  };
  const result = await run({ text: fixture(), fetcher });
  assert.equal(result.audit.strategy, "grouped"); assert.equal(result.audit.parts.length, 3); assert.equal(result.audit.ttsRequests, 4);
});
test("WAV headers are stripped and invalid rates/channels/truncation are rejected", () => {
  const pcm = tone(), wav = audio.joinM3Wav([pcm]);
  assert.deepEqual(audio.decodeM3Audio(wav, "audio/wav"), pcm);
  assert.throws(() => audio.decodeM3Audio(pcm, "audio/L16;rate=48000"), /FORMAT_MISMATCH/);
  assert.throws(() => audio.decodeM3Audio(pcm, "audio/L16;rate=24000;channels=2"), /FORMAT_MISMATCH/);
  assert.throws(() => audio.decodeM3Audio(wav.slice(0, -2), "audio/wav"), /INVALID_WAV/);
  const view = new DataView(wav.buffer); view.setUint32(24, 44100, true);
  assert.throws(() => audio.decodeM3Audio(wav, "audio/wav"), /FORMAT_MISMATCH/);
});
test("joining preserves raw speech samples and adds only the missing natural gap", () => {
  const pcm = tone(160, 1), wav = audio.joinM3Wav([pcm, pcm]);
  const decoded = audio.decodeM3Audio(wav, "audio/wav");
  assert.deepEqual(decoded.slice(0, pcm.length), pcm);
  assert.deepEqual(decoded.slice(-pcm.length), pcm);
  assert.equal(decoded.length, pcm.length * 2 + 220 * 48);
});
test("invalid/non-male voice and oversized manuscripts fail before synthesis", async () => {
  for (const voice of ["Kore", "evil/voice", "Trump"]) {
    const result = await handleM3Request(new Request("https://test/api/gemini-tts", { method: "POST", body: JSON.stringify({ text: "Бірінші. Мәлімет.", voice }) }), "fake-test-key");
    assert.ok(result.status >= 400);
  }
  const result = await handleM3Request(new Request("https://test/api/gemini-tts", { method: "POST", body: JSON.stringify({ text: "а".repeat(15001), voice: "Puck" }) }), "fake-test-key");
  assert.equal(result.status, 400);
});
test("M3 deployment pins only M3 routes to the supported EU execution jurisdiction", async () => {
  const worker = await readFile("worker/index.ts", "utf8"), config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  assert.ok(worker.includes('namespace.jurisdiction("eu")'));
  assert.equal(config.durable_objects.bindings[0].name, "M3_SESSIONS");
  assert.deepEqual(config.migrations[0].new_sqlite_classes, ["M3RegionalSession"]);
  assert.ok(worker.includes("await handler.fetch(request, env, ctx)"));
});
