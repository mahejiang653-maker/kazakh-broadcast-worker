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
const clientFile = join(dir, "live-client.mjs");
await build({ input: "app/lib/m3-live-client.ts", platform: "browser", output: { file: clientFile, format: "esm", codeSplitting: false } });
const liveClient = await import(pathToFileURL(clientFile));
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
function sseResponse(events, finalSeparator = true) {
  const bytes = new TextEncoder().encode(events.map(x => `data: ${JSON.stringify(x)}\r\n\r\n`).join("").replace(finalSeparator ? /$^/ : /\r\n\r\n$/, ""));
  let offset = 0, reads = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    const size = [1, 7, 16384, 3][reads++ % 4];
    controller.enqueue(bytes.slice(offset, offset + size)); offset = Math.min(bytes.length, offset + size);
  } }), { headers: { "Content-Type": "text/event-stream" } });
}
function streamEvents(pcm, end = "STOP") {
  const half = Math.floor(pcm.length / 4) * 2;
  const first = payload(pcm.slice(0, half)); delete first.candidates[0].finishReason;
  const last = payload(pcm.slice(half), end);
  return [first, last];
}

test("one streaming TTS request preserves the full program/config across fragmented SSE frames", async () => {
  const calls = []; const pcm = tone(160, 60);
  const result = await run({ text: fixture(), streaming: true, fetcher: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return url.endsWith(":countTokens") ? Response.json({ totalTokens: 300 }) : sseResponse(streamEvents(pcm), false);
  } });
  const tts = calls.filter(x => x.url.endsWith(":streamGenerateContent?alt=sse"));
  assert.equal(tts.length, 1); assert.equal(result.audit.ttsRequests, 1);
  assert.equal(result.audit.transport, "streamGenerateContent");
  assert.equal(tts[0].body.contents[0].parts[0].text, script.prepareM3Text(fixture()));
  assert.deepEqual(audio.decodeM3Audio(result.wav, "audio/wav"), pcm);
});
test("EOF without STOP and a stream error never deliver received partial audio", async () => {
  for (const errorEvent of [false, true]) {
    const first = payload(tone(160, 18)); delete first.candidates[0].finishReason;
    await assert.rejects(run({ streaming: true, fetcher: async url => url.endsWith(":countTokens") ? Response.json({ totalTokens: 100 }) : sseResponse([first, ...(errorEvent ? [{ error: { message: "upstream interrupted" } }] : [])]) }), error => error.code === (errorEvent ? "M3_STREAM_ERROR" : "M3_INCOMPLETE_AUDIO"));
  }
});
test("an upstream full-program timeout fails after exactly one full-program request", async () => {
  const calls = [];
  await assert.rejects(run({
    text: fixture(),
    streaming: true,
    fetcher: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response("Upstream timeout", { status: 524 });
    },
  }), error => error.code === "M3_UPSTREAM_TIMEOUT");
  const tts = calls.filter(x => x.url.endsWith(":streamGenerateContent?alt=sse"));
  assert.equal(tts.length, 1);
});

test("all 13 ordinal periods and one supported pause survive; names and quotations remain text", () => {
  for (const opener of script.NUMBERED_OPENERS) {
    const prepared = script.prepareM3Text(`${opener}.\nДоналд Трамп: «Бұл маңызды», деді.`);
    assert.ok(prepared.startsWith(`${opener}. <short pause> `));
    assert.ok(prepared.includes('Доналд Трамп: «Бұл маңызды», деді.'));
    assert.equal(script.prepareM3Text(prepared), prepared);
  }
  assert.equal(script.prepareM3Text("Төртінші. <angry>Мәлімет. [sad] [短停顿]"), "Төртінші. <short pause> Мәлімет. <short pause>");
});

test("copy-paste paragraph breaks are flattened before Gemini", () => {
  const prepared = script.prepareM3Text("Алғы сөз.\n\n\nКелесі сөйлем.\n   \n\t\nСоңы.");
  assert.equal(prepared, "Алғы сөз. Келесі сөйлем. Соңы.");
  assert.equal(prepared.includes("\n"), false);
});
test("abnormal internal silence is compressed without altering speech samples", () => {
  const first = tone(160, 2), gap = new Uint8Array(6 * 48000), last = tone(160, 2);
  const pcm = new Uint8Array(first.length + gap.length + last.length);
  pcm.set(first, 0); pcm.set(gap, first.length); pcm.set(last, first.length + gap.length);
  const result = audio.compressM3InternalSilence(pcm);
  assert.equal(result.regions, 1);
  assert.ok(result.removedMs >= 5300 && result.removedMs <= 5400, result.removedMs);
  assert.deepEqual(result.pcm.slice(0, first.length), first);
  assert.deepEqual(result.pcm.slice(-last.length), last);
  assert.ok(result.pcm.length < pcm.length);
});

test("normal sub-four-second pauses are preserved", () => {
  const first = tone(160, 1), gap = new Uint8Array(3 * 48000), last = tone(160, 1);
  const pcm = new Uint8Array(first.length + gap.length + last.length);
  pcm.set(first); pcm.set(gap, first.length); pcm.set(last, first.length + gap.length);
  const result = audio.compressM3InternalSilence(pcm);
  assert.equal(result.regions, 0);
  assert.equal(result.removedMs, 0);
  assert.deepEqual(result.pcm, pcm);
});

test("the full 13-item script is kept whole and 1.00x sends no style metadata", async () => {
  const calls = []; const result = await run({ text: fixture(), fetcher: mock(calls) });
  const tts = calls.filter(x => x.url.endsWith(":generateContent"));
  assert.equal(tts.length, 1); assert.equal(result.audit.strategy, "single");
  assert.equal(tts[0].body.contents[0].parts[0].text, script.prepareM3Text(fixture()));
  assert.equal(tts[0].body.generationConfig.speechConfig.voiceConfig.voice, "Puck");
  assert.equal(script.m3Style(1), "");
  assert.equal(tts[0].body.contents[0].parts[0].speechMetadata, undefined);
  assert.equal(tts[0].body.generationConfig.temperature, 0.5);
  assert.equal(result.wav.slice(0, 4).toString(), new Uint8Array([82, 73, 70, 70]).toString());
});
test("a long manuscript is never grouped and still uses one full-program request", async () => {
  const calls = [];
  const result = await run({ text: fixture(), fetcher: mock(calls, 9000) });
  const tts = calls.filter(x => x.url.endsWith(":generateContent"));
  assert.equal(tts.length, 1);
  assert.equal(result.audit.strategy, "single");
  assert.equal(result.audit.ttsRequests, 1);
  assert.equal(result.audit.retries, 0);
  assert.equal(result.audit.parts.length, 1);
  assert.equal(tts[0].body.contents[0].parts[0].text, script.prepareM3Text(fixture()));
  assert.ok(result.audit.timings.upstreamMs >= 0);
  assert.ok(result.audit.timings.postprocessMs >= 0);
  assert.ok(result.audit.timings.totalMs >= result.audit.timings.upstreamMs);
});
test("1.00x has no speech metadata and the one voice remains protocol-locked", () => {
  const request = script.m3RequestBody("Putin: «Сәлем». Donald Trump: «Hello».", "Puck", script.m3Style(1));
  assert.deepEqual(request.generationConfig.speechConfig, { voiceConfig: { voice: "Puck" } });
  assert.equal(request.contents[0].parts[0].speechMetadata, undefined);
  assert.equal(request.contents.length, 1);
});
test("1.00x uses empty style; non-default speeds use only a tiny rate hint", () => {
  const normal = script.m3RequestBody("А.", "Puck", script.m3Style(1));
  assert.equal(script.m3Style(1), "");
  assert.equal(normal.contents[0].parts[0].speechMetadata, undefined);

  for (const speed of [0.95, 1.05]) {
    const style = script.m3Style(speed);
    const a = script.m3RequestBody("А.", "Puck", style), b = script.m3RequestBody("Б.", "Puck", style);
    assert.deepEqual(a.generationConfig, b.generationConfig);
    assert.equal(a.contents[0].parts[0].speechMetadata.style, b.contents[0].parts[0].speechMetadata.style);
    assert.equal(style, `Speaking rate: ${Math.round(speed * 100)}% of normal.`);
    assert.equal(/identity|age|resonance|pitch|energy|newsreader/i.test(style), false);
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
test("silent audio cannot pass screening and is never retried", async () => {
  const calls = [];
  await assert.rejects(
    run({ fetcher: mock(calls, 300, [new Uint8Array(12 * 48000)]) }),
    error => error.code === "M3_INSUFFICIENT_VOICED_AUDIO",
  );
  assert.equal(calls.filter(x => x.url.endsWith(":generateContent")).length, 1);
});
test("long-form voice screening uses only a small fixed number of windows", () => {
  const pcm = tone(160, 180);
  const report = audio.screenM3Take(pcm);
  assert.ok(report.windows.length <= 4, report.windows.length);
  assert.ok(report.features.voicedFrames >= 18);
});

test("persistent large pitch/timbre changes are detected inside a single take too", () => {
  const a = tone(160, 24), b = tone(270, 36), pcm = new Uint8Array(a.length + b.length); pcm.set(a); pcm.set(b, a.length);
  const report = audio.screenM3Take(pcm);
  assert.equal(report.detected, true); assert.ok(report.windows.some(x => x.comparison.detected));
});
test("voice drift inside the single full-program take fails without a retry", async () => {
  const calls = [];
  const a = tone(160, 24), b = tone(270, 36), pcm = new Uint8Array(a.length + b.length);
  pcm.set(a); pcm.set(b, a.length);
  await assert.rejects(
    run({ text: fixture(), fetcher: mock(calls, 9000, [pcm]) }),
    error => error.code === "VOICE_DRIFT_DETECTED",
  );
  assert.equal(calls.filter(x => x.url.endsWith(":generateContent")).length, 1);
});
test("single-request policy never retries after drift failure", async () => {
  const calls = [];
  const a = tone(160, 24), b = tone(270, 36), pcm = new Uint8Array(a.length + b.length);
  pcm.set(a); pcm.set(b, a.length);
  await assert.rejects(
    run({ text: fixture(), fetcher: mock(calls, 9000, [pcm]) }),
    error => error.code === "VOICE_DRIFT_DETECTED",
  );
  assert.equal(calls.filter(x => x.url.endsWith(":generateContent")).length, 1);
});
test("region error stops immediately and never falls back to another voice/model/path", async () => {
  const calls = []; const fetcher = async (url, init) => { calls.push({ url, init }); return Response.json({ error: { message: "User location is not supported for the API use." } }, { status: 400 }); };
  await assert.rejects(run({ fetcher }), e => e instanceof M3Error && e.code === "GEMINI_REGION_UNSUPPORTED" && e.status === 503);
  assert.equal(calls.length, 1);
});
test("quota error stops after the one generation request", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return new Response('{}', { status: 429 });
  };
  await assert.rejects(run({ fetcher }), e => e.code === "GEMINI_QUOTA_LIMIT");
  assert.equal(calls.length, 1);
});
test("MAX_TOKENS fails closed and never regroups or retries", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    return Response.json(payload(tone(), "MAX_TOKENS"));
  };
  await assert.rejects(run({ text: fixture(), fetcher }), e => e.code === "M3_OUTPUT_LIMIT");
  assert.equal(calls.filter(x => x.url.endsWith(":generateContent")).length, 1);
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
test("Flash and Flash-Lite both accept 15,000 characters and issue exactly one TTS request", async () => {
  for (const model of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) {
    const calls = [];
    const result = await run({
      model,
      text: "а".repeat(15000),
      fetcher: mock(calls, 99999, [tone(160, 18)]),
    });
    const tts = calls.filter(x => x.url.endsWith(":generateContent"));
    assert.equal(tts.length, 1, model);
    assert.equal(tts[0].body.contents[0].parts[0].text.length, 15000);
    assert.equal(result.audit.strategy, "single");
    assert.equal(result.audit.ttsRequests, 1);
    assert.equal(result.audit.retries, 0);
    assert.equal(result.audit.parts.length, 1);
  }
});

test("M3 deployment pins only M3 routes to the supported EU execution jurisdiction", async () => {
  const worker = await readFile("worker/index.ts", "utf8"), config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  assert.ok(worker.includes('namespace.jurisdiction("eu")'));
  assert.equal(config.durable_objects.bindings[0].name, "M3_SESSIONS");
  assert.deepEqual(config.migrations[0].new_sqlite_classes, ["M3RegionalSession"]);
  assert.ok(worker.includes("await handler.fetch(request, env, ctx)"));
});


test("M3 UI is hard-isolated from Edge emotion, VibeVoice and Fish S2 controls", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  assert.ok(page.includes('M3 干净输入模式'));
  assert.ok(page.includes('Index 2.5 情绪强度、VibeVoice 长稿连续性、Fish S2 句内重点和 Edge 导演参数全部不参与 Gemini'));
  assert.ok(page.includes('engine === "edge" ? ('));
  const geminiPayload = page.match(/engine === "gemini"\s*\?\s*\{([\s\S]*?)\}\s*:\s*payload;/)?.[1] ?? "";
  assert.ok(geminiPayload.includes("text: cleanText"));
  assert.ok(geminiPayload.includes("model: geminiModel"));
  assert.ok(geminiPayload.includes("voice"));
  assert.ok(geminiPayload.includes("speed"));
  for (const forbidden of ["preset", "edgePitch", "edgeVolume", "edgeFineFocus", "edgeLongFormContinuity", "edgeEmotionOverrides", "style", "speakerBoost"]) {
    assert.equal(geminiPayload.includes(forbidden), false, forbidden);
  }
  assert.equal(page.includes('name: "M3 V2 当前专属主播"'), false);
});


test("M3 no longer has an application-side 12-minute audio cutoff", async () => {
  const pipeline = await readFile("app/lib/m3-pipeline.ts", "utf8");
  assert.equal(pipeline.includes("720 * 48000"), false);
  assert.equal(pipeline.includes("M3_AUDIO_SIZE_LIMIT"), false);
  assert.equal(pipeline.includes("Gemini 音频超过本轮安全大小上限"), false);
  assert.ok(pipeline.includes('candidate.finishReason === "MAX_TOKENS"'));
  assert.ok(pipeline.includes("Gemini 输出达到模型单次长度上限"));
});


test("live streamed PCM is delivered progressively and final WAV applies the same silence cuts", async () => {
  const first = tone(160, 2), silence = new Uint8Array(6 * 48000), last = tone(160, 2);
  const pcm = new Uint8Array(first.length + silence.length + last.length);
  pcm.set(first); pcm.set(silence, first.length); pcm.set(last, first.length + silence.length);
  const cleanup = audio.compressM3InternalSilence(pcm);
  const a = pcm.slice(0, 150000), b = pcm.slice(150000);
  const events = [
    { event: "start", data: { model: "gemini-3.8-flash-lite-tts" } },
    { event: "audio", data: { data: Buffer.from(a).toString("base64") } },
    { event: "heartbeat", data: { elapsedMs: 5000 } },
    { event: "audio", data: { data: Buffer.from(b).toString("base64") } },
    { event: "done", data: { cuts: cleanup.cuts, originalPcmBytes: pcm.length, timings: { upstreamMs: 4000, postprocessMs: 150, totalMs: 4150 } } },
  ];
  const wire = events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  const preview = new liveClient.M3LivePreview();
  const progress = [];
  const result = await liveClient.receiveM3LiveAudio(
    new Response(wire, { headers: { "Content-Type": "text/event-stream" } }),
    preview,
    (seconds) => progress.push(seconds),
  );
  assert.equal(Math.round(result.receivedSeconds), 10);
  assert.ok(progress.length >= 2);
  assert.equal(result.timings.totalMs, 4150);
  const wav = new Uint8Array(await result.audioBlob.arrayBuffer());
  assert.deepEqual(audio.decodeM3Audio(wav, "audio/wav"), cleanup.pcm);
});

test("live PCM never produces a completed WAV without an upstream done event", async () => {
  const preview = new liveClient.M3LivePreview();
  const body = `event: audio\ndata: ${JSON.stringify({ data: Buffer.from(tone(160, 1)).toString("base64") })}\n\n`;
  await assert.rejects(
    liveClient.receiveM3LiveAudio(new Response(body, { headers: { "Content-Type": "text/event-stream" } }), preview, () => {}),
    /尚未完成整篇生成/,
  );
});

test("live M3 API path uses the same EU regional service and one Google call", async () => {
  const [entry, regional, handler, page, clientRoute] = await Promise.all([
    readFile("worker/index.ts", "utf8"),
    readFile("worker/m3-regional-session.ts", "utf8"),
    readFile("app/lib/m3-handler.ts", "utf8"),
    readFile("app/page.tsx", "utf8"),
    readFile("app/api/gemini-tts-live/route.ts", "utf8"),
  ]);
  assert.match(entry, /url\.pathname === "\/api\/gemini-tts-live"/);
  assert.match(regional, /url\.pathname === "\/api\/gemini-tts-live"/);
  assert.match(regional, /"cloudflare-eu-jurisdiction"/);
  assert.match(handler, /onAudioChunk\(chunk\)/);
  assert.match(page, /receiveM3LiveAudio\(response, preview/);
  assert.match(page, /边生成边试听/);
  assert.match(clientRoute, /handleM3Request/);
});

test("PCM duration and actual signal activity are measured separately", () => {
  const voice = tone(160, 2);
  const gap = new Uint8Array(20 * 48000);
  const pcm = new Uint8Array(voice.length + gap.length);
  pcm.set(voice);
  const activity = audio.assessM3Signal(pcm);
  assert.ok(activity.rawSeconds >= 21.9);
  assert.ok(activity.activeSeconds > 1 && activity.activeSeconds < 3);
  assert.ok(activity.trailingInactiveSeconds > 18);
  assert.ok(activity.activeRatio < 0.2);
});

test("low-volume PCM is not rejected solely because pitch detector cannot track it", async () => {
  const quiet = tone(160, 18, 0.006);
  const stats = audio.assessM3Signal(quiet);
  assert.ok(stats.activeSeconds > 12, JSON.stringify(stats));
  assert.ok(audio.screenM3Take(quiet).features.voicedFrames < 18);
  const result = await run({ fetcher: mock([], 300, [quiet]) });
  assert.equal(result.audit.signal.activeSeconds > 12, true);
  assert.equal(result.audit.pitchScreen, "unreliable");
  assert.ok(result.wav.byteLength > 44);
});

test("an actual silent PCM response fails with actionable diagnostics without a retry", async () => {
  const calls = [];
  await assert.rejects(
    run({ fetcher: mock(calls, 300, [new Uint8Array(18 * 48000)]) }),
    error => error.code === "M3_INSUFFICIENT_VOICED_AUDIO" &&
      error.details?.audioDiagnostics?.activeSeconds === 0 &&
      error.details?.audioDiagnostics?.rawSeconds === 18,
  );
  assert.equal(calls.filter(x => x.url.endsWith(":generateContent")).length, 1);
});

test("live transport skips unused full WAV copy but retains exact activity diagnostics", async () => {
  const pcm = tone(160, 18);
  const result = await run({ skipWavAssembly: true, fetcher: mock([], 300, [pcm]) });
  assert.equal(result.wav, null);
  assert.equal(result.originalPcmBytes, pcm.byteLength);
  assert.ok(result.audit.signal.activeSeconds > 12);
});

test("live UI resets unverified PCM display after an incomplete generation", async () => {
  const [page, pipeline, handler] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/lib/m3-pipeline.ts", "utf8"),
    readFile("app/lib/m3-handler.ts", "utf8"),
  ]);
  assert.ok(page.includes("已缓冲原始 PCM"));
  assert.ok(page.includes("setM3ReceivedSeconds(0)"));
  assert.ok(page.includes('isGenerating && m3ReceivedSeconds > 0'));
  assert.ok(pipeline.includes("M3_PITCH_TRACKING_INCONCLUSIVE"));
  assert.ok(handler.includes("skipWavAssembly: true"));
  assert.ok(handler.includes("audioDiagnostics: audit.signal"));
});
