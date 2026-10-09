import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "rolldown";
const dir = await mkdtemp(join(tmpdir(), "m3-test-"));
for (const name of ["script", "audio", "signal", "pipeline", "handler", "transcript-audit"]) await build({ input: `app/lib/m3-${name}.ts`, platform: "node", output: { file: join(dir, `${name}.mjs`), format: "esm", codeSplitting: false } });
const script = await import(pathToFileURL(join(dir, "script.mjs")));
const transcriptAudit = await import(pathToFileURL(join(dir, "transcript-audit.mjs")));
const audio = await import(pathToFileURL(join(dir, "audio.mjs")));
const signalTools = await import(pathToFileURL(join(dir, "signal.mjs")));
const { generateM3Program, M3Error } = await import(pathToFileURL(join(dir, "pipeline.mjs")));
const { handleM3Request } = await import(pathToFileURL(join(dir, "handler.mjs")));
const clientFile = join(dir, "live-client.mjs");
await build({ input: "app/lib/m3-live-client.ts", platform: "browser", output: { file: clientFile, format: "esm", codeSplitting: false } });
const liveClient = await import(pathToFileURL(clientFile));
test.after(() => rm(dir, { recursive: true, force: true }));
function tone(pitch = 160, seconds = 18, gain = 0.18) {
  const pcm = new Uint8Array(seconds * 48000), view = new DataView(pcm.buffer);
  for (let i = 0; i < pcm.length / 2; i++) { const t = i / 24000; view.setInt16(i * 2, Math.round(32767 * gain * (1 + 0.015 * Math.sin(t * 0.17)) * (Math.sin(2 * Math.PI * pitch * t) + 0.24 * Math.sin(4 * Math.PI * pitch * t))), true); }
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
  const bytes = new TextEncoder().encode(events.map(x => x === "[DONE]" ? "event: done\r\ndata: [DONE]\r\n\r\n" : `data: ${JSON.stringify(x)}\r\n\r\n`).join("").replace(finalSeparator ? /$^/ : /\r\n\r\n$/, ""));
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

test("V14 no longer inserts pause tags or changes Kazakh punctuation around all 13 openers", () => {
  for (const opener of script.NUMBERED_OPENERS) {
    const original = `${opener}.\nДоналд Трамп: «Бұл маңызды», деді.`;
    const prepared = script.prepareM3Text(original);
    assert.equal(prepared, `${opener}. Доналд Трамп: «Бұл маңызды», деді.`);
    assert.equal(prepared.includes("<short pause>"), false);
    assert.equal(script.prepareM3Text(prepared), prepared);
    assert.equal(script.prepareM3Text(original, "verbatim"), original);
  }
});

test("V14 cleans only copy-pasted whitespace and invisible characters", () => {
  const raw = "Алғы сөз.\r\n\r\nКелесі сөйлем.\n   \n\t\nСоңы.";
  assert.equal(script.prepareM3Text(raw), "Алғы сөз. Келесі сөйлем. Соңы.");
  assert.equal(script.prepareM3Text(raw, "verbatim"), raw);
  const mixed = "Бірінші.\u00a0жүңгө\u200b  —   еліміз!  Он үшінші. «құлжа» | «бұратала».";
  assert.equal(script.prepareM3Text(mixed), "Бірінші. жүңгө — еліміз! Он үшінші. «құлжа» | «бұратала».");
  assert.equal(script.prepareM3Text(mixed, "verbatim"), mixed);
});

test("V14 preserves explicitly typed pause tags but never synthesizes new ones", () => {
  const original = "Бірінші. <short pause> Мәлімет. [短停顿] <long pause>";
  assert.equal(script.prepareM3Text(original), original);
  assert.equal(script.prepareM3Text("Бірінші. Мәлімет."), "Бірінші. Мәлімет.");
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
test("long-form voice screening covers every section with bounded analysis windows", () => {
  const pcm = tone(160, 180);
  const report = audio.screenM3Take(pcm);
  assert.ok(report.windows.length >= 12, report.windows.length);
  assert.ok(report.windows.length <= Math.ceil(180 / 12) + 1, report.windows.length);
  assert.equal(report.timeline.windowsScanned, report.windows.length);
  assert.ok(report.features.voicedFrames >= 18);
  assert.equal(report.detected, false);
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
  assert.ok(page.includes('M3 输入文字独立检查'));
  assert.ok(page.includes('Edge 情绪、VibeVoice 和 Fish S2 参数不会进入 Gemini'));
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
    { event: "audio", data: { sequence: 0, offset: 0, crc32: signalTools.m3Crc32(a), data: Buffer.from(a).toString("base64") } },
    { event: "heartbeat", data: { elapsedMs: 5000 } },
    { event: "audio", data: { sequence: 1, offset: a.length, crc32: signalTools.m3Crc32(b), data: Buffer.from(b).toString("base64") } },
    { event: "done", data: { cuts: cleanup.cuts, gains: [], originalPcmBytes: pcm.length, integrity: { rawBytes: pcm.length, rawCrc32: signalTools.m3Crc32(pcm), processedBytes: cleanup.pcm.length, processedCrc32: signalTools.m3Crc32(cleanup.pcm) }, timings: { upstreamMs: 4000, postprocessMs: 150, totalMs: 4150 } } },
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
  const pcm = tone(160, 1);
  const body = `event: start\ndata: {}\n\nevent: audio\ndata: ${JSON.stringify({ sequence: 0, offset: 0, crc32: signalTools.m3Crc32(pcm), data: Buffer.from(pcm).toString("base64") })}\n\n`;
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
  assert.ok(audio.screenM3Take(quiet).features.voicedFrames >= 18);
  const result = await run({ fetcher: mock([], 300, [quiet]) });
  assert.equal(result.audit.signal.activeSeconds > 12, true);
  assert.equal(result.audit.pitchScreen, "reliable");
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

test("oversized trailing or leading PCM padding does not inflate the final recording", () => {
  const speech = tone(160, 3);
  const deadAir = new Uint8Array(22 * 48000);
  for (const trailing of [true, false]) {
    const pcm = new Uint8Array(speech.length + deadAir.length);
    if (trailing) pcm.set(speech, 0);
    else pcm.set(speech, deadAir.length);
    const result = audio.compressM3InternalSilence(pcm);
    assert.equal(result.regions, 1);
    assert.ok(result.removedMs > 20000, result.removedMs);
    const remaining = result.pcm.length / 48000;
    assert.ok(remaining >= 3 && remaining < 4.5, remaining);
    if (trailing) assert.deepEqual(result.pcm.subarray(0, speech.length), speech);
    else assert.deepEqual(result.pcm.subarray(result.pcm.length - speech.length), speech);
  }
});

function concat(...chunks) { return new Uint8Array(Buffer.concat(chunks)); }
function modulated(pitch = 160, seconds = 6, gain = 0.08) {
  const pcm = tone(pitch, seconds, gain), v = new DataView(pcm.buffer);
  for (let i = 0; i < pcm.length / 2; i++) {
    const t = i / 24000, envelope = 0.15 + 0.85 * Math.sin(t * Math.PI * 2.2) ** 2;
    v.setInt16(i * 2, Math.round(v.getInt16(i * 2, true) * envelope), true);
  }
  return pcm;
}
test("V11 never confuses the real failure's HF energy with speech or digital silence", async () => {
  const faulty = concat(modulated(), tone(7100, 12, 0.009), modulated());
  const scan = signalTools.scanM3Signal(faulty);
  assert.ok(scan.summary.longestHighFrequencySeconds > 11.8);
  assert.ok(scan.summary.activeSeconds < 13);
  const plan = signalTools.planM3Repair(scan);
  assert.equal(plan.cuts.length, 0, "HF noise is not silently deleted");
  let raw;
  const calls = [];
  await assert.rejects(run({ fetcher: mock(calls, 300, [faulty]), onDiagnostic(stage, pcm) { if (stage === 'raw') raw = pcm.slice(); } }), e => e.code === 'M3_HIGH_FREQUENCY_ARTIFACT');
  assert.deepEqual(new Uint8Array(raw), faulty);
  assert.equal(calls.length, 1);
});
test("quiet Kazakh-like modulated phonation is retained, smoothly restored and never clipped", () => {
  const loud = modulated(160, 6, 0.15), quiet = modulated(160, 8, 0.005), source = concat(loud, quiet, loud);
  const scan = signalTools.scanM3Signal(source), plan = signalTools.planM3Repair(scan);
  assert.equal(plan.cuts.length, 0);
  assert.ok(plan.gains.length > 0);
  const output = signalTools.applyM3Plan(source, plan.cuts, plan.gains);
  assert.equal(source.length, output.length);
  assert.deepEqual(output.subarray(0, loud.length), loud);
  const after = signalTools.scanM3Signal(output);
  assert.ok(after.summary.maxPeak < 0.86);
  const quietBefore = audio.analyzeM3Pcm(source, 7, 13), quietAfter = audio.analyzeM3Pcm(output, 7, 13);
  assert.ok(quietAfter.rmsDb - quietBefore.rmsDb > 12);
  assert.ok(Math.abs(quietBefore.f0Median - quietAfter.f0Median) < 0.2);
});
test("very weak speech below old silence thresholds and uncertain noise are never removed", () => {
  const weak = modulated(160, 10, 0.0005);
  const noise = new Uint8Array(48000 * 8), dv = new DataView(noise.buffer);
  let seed = 17;
  for (let p = 0; p < noise.length; p += 2) { seed = (1664525 * seed + 1013904223) >>> 0; dv.setInt16(p, Math.round((seed / 2 ** 32 - 0.5) * 40), true); }
  for (const pcm of [weak, noise]) {
    const plan = signalTools.planM3Repair(signalTools.scanM3Signal(pcm));
    assert.equal(plan.cuts.length, 0);
  }
  assert.ok(signalTools.scanM3Signal(weak).summary.activeSeconds > 5);
  assert.equal(signalTools.planM3Repair(signalTools.scanM3Signal(noise)).gains.length, 0);
});
test("duplicate, cumulative, overlapping PCM and invalid Base64 fail without extra requests", async () => {
  const a = modulated(153, 2), b = modulated(171, 2);
  for (const [events, code] of [
    [[{...payload(a), candidates: [{...payload(a).candidates[0], finishReason: undefined}]}, payload(a)], 'M3_REPEATED_PCM'],
    [[{...payload(a), candidates: [{...payload(a).candidates[0], finishReason: undefined}]}, payload(concat(a, b))], 'M3_CUMULATIVE_PCM'],
    [[{...payload(a), candidates: [{...payload(a).candidates[0], finishReason: undefined}]}, payload(concat(a.subarray(a.length - 24000), b))], 'M3_OVERLAPPING_PCM'],
    [[{ candidates: [{finishReason:'STOP',content:{parts:[{inlineData:{data:'@@bad!',mimeType:'audio/pcm;rate=24000'}}]}}]}], 'M3_INVALID_BASE64'],
  ]) {
    let calls = 0;
    await assert.rejects(run({ streaming:true, fetcher: async () => { calls++;return sseResponse(events); } }), e => e.code === code);
    assert.equal(calls, 1);
  }
});
test("audio after STOP and truncated PCM never become downloadable audio", async () => {
  await assert.rejects(run({streaming:true,fetcher:async()=>sseResponse([payload(modulated()),payload(modulated(180))])}),e=>e.code==='M3_AUDIO_AFTER_STOP');
  await assert.rejects(run({fetcher:mock([],300,[new Uint8Array(301)])}),e=>e.code==='M3_AUDIO_FORMAT_MISMATCH');
});
test("phone and Worker apply identical gains/cuts at fragmented chunk boundaries", async () => {
  const pcm = concat(modulated(160, 6, 0.15), modulated(160, 8, 0.005), new Uint8Array(48000 * 6), modulated(160, 6, 0.15));
  const plan = signalTools.planM3Repair(signalTools.scanM3Signal(pcm));
  const expected = signalTools.applyM3Plan(pcm, plan.cuts, plan.gains);
  const pieces=[];for(let i=0;i<pcm.length;i+=13462)pieces.push(pcm.subarray(i,i+13462));
  const wav=liveClient.assembleM3Wav(pieces,pcm.length,plan.cuts,plan.gains,signalTools.m3Crc32(expected));
  assert.deepEqual(audio.decodeM3Audio(new Uint8Array(await wav.arrayBuffer()),'audio/wav'),expected);
});
test("mobile raw PCM checksum/sequence rejects replay and preserves diagnostic original", async () => {
  const pcm = modulated(), message={ sequence:0,offset:0,crc32:signalTools.m3Crc32(pcm),data:Buffer.from(pcm).toString('base64') };
  for(const second of [message,{...message,sequence:1,offset:pcm.length,crc32:0}]) {
    const wire=`event: start\ndata: {}\n\nevent: audio\ndata: ${JSON.stringify(message)}\n\nevent: audio\ndata: ${JSON.stringify(second)}\n\n`;
    const preview=new liveClient.M3LivePreview();
    await assert.rejects(liveClient.receiveM3LiveAudio(new Response(wire,{headers:{'Content-Type':'text/event-stream'}}),preview,()=>{}),e=>{
      assert.ok(e instanceof liveClient.M3LiveError);assert.equal(e.rawAudioBlob.size,pcm.length+44);return true;
    });
  }
});
test("preview halts HF anomaly rather than queuing minutes of inaudible playback", () => {
  const p=new liveClient.M3LivePreview();p.add(modulated(160,2));p.add(tone(7000,4,.01));p.add(modulated(160,2));
  assert.equal(p.bufferedSeconds,8);assert.equal(p.safeSeconds,2);assert.match(p.warning,/试听已暂停/);
});
test("raw vs processed evidence is exact and never logs manuscript or credentials", async () => {
  const pcm=concat(modulated(),new Uint8Array(48000*3),modulated(171));const evidence=[];
  const logs=[];const result=await run({fetcher:mock([],300,[pcm]),onDiagnostic:(stage,bytes,details)=>evidence.push({stage,bytes:bytes.slice(),details}),log:(event,d)=>logs.push({event,d})});
  assert.equal(evidence.length,2);assert.deepEqual(new Uint8Array(evidence[0].bytes),pcm);
  assert.equal(result.audit.integrity.rawBytes,pcm.length);assert.equal(result.audit.integrity.processedBytes,evidence[1].bytes.length);
  assert.equal(result.audit.integrity.contentVerified,false);
  assert.equal(JSON.stringify(logs).includes('fake-test-key'),false);assert.equal(JSON.stringify(logs).includes('Маңызды'),false);
});
test("uploaded 682.76s regression rejects HF failure while preserving original samples", {skip:!process.env.M3_FAULT_WAV}, async () => {
  const pcm=audio.decodeM3Audio(await readFile(process.env.M3_FAULT_WAV),'audio/wav');
  const scan=signalTools.scanM3Signal(pcm);assert.equal(scan.summary.rawSeconds,682.76);
  assert.ok(scan.summary.highFrequencySeconds>520);assert.ok(scan.summary.longestHighFrequencySeconds>209);
  const before=Buffer.from(pcm);assert.equal(signalTools.planM3Repair(scan).cuts.length,0);
  await assert.rejects(run({fetcher:mock([],300,[pcm])}),e=>e.code==='M3_HIGH_FREQUENCY_ARTIFACT');
  assert.deepEqual(new Uint8Array(pcm),new Uint8Array(before));
});
test("100ms SSE packets cannot evade the preview HF guard", () => {
  const p=new liveClient.M3LivePreview(),pcm=tone(7100,4,.008);
  for(let at=0;at<pcm.length;at+=4800)p.add(pcm.subarray(at,at+4800));
  assert.equal(p.bufferedSeconds,4);assert.equal(p.safeSeconds,0);assert.match(p.warning,/试听已暂停/);
});
test("uncertain quantized low-level noise is retained and not amplified or delivered as complete", async () => {
  const tiny=tone(53,16,.00025),pcm=concat(modulated(),tiny,modulated(180));
  const scan=signalTools.scanM3Signal(pcm),plan=signalTools.planM3Repair(scan);
  assert.equal(plan.cuts.length,0);assert.equal(plan.gains.length,0);
  await assert.rejects(run({fetcher:mock([],300,[pcm])}),e=>e.code==='M3_UNRESOLVED_LOW_SIGNAL');
});

test("V12 does not count a long 90 Hz low-level hum as verified speech", () => {
  const lead = modulated(160, 6, 0.12), hum = tone(90, 18, 0.0008), tail = modulated(160, 6, 0.12);
  const pcm = concat(lead, hum, tail);
  const scan = signalTools.scanM3Signal(pcm);
  assert.ok(scan.summary.activeSeconds > scan.summary.speechEvidenceSeconds + 12,
    JSON.stringify(scan.summary));
  assert.ok(scan.summary.lowFrequencyDominatedSeconds >= 17.5,
    JSON.stringify(scan.summary));
  assert.equal(scan.summary.evidence.includes("transcription"), true);
  const plan = signalTools.planM3Repair(scan);
  assert.equal(plan.cuts.length, 0, "low-frequency noise must never be deleted as digital silence");
  assert.equal(plan.gains.some(g => g.start < lead.length + hum.length && g.end > lead.length), false,
    "unverified bass hum must never be amplified");
  const unresolved = signalTools.unresolvedM3Low(scan, plan.gains);
  assert.ok(unresolved.some(r => r.start < 7 && r.end > 23),
    JSON.stringify(unresolved));
});

test("V12 rejects long bass-hum output without retrying or substituting a shorter WAV", async () => {
  const lead = modulated(160, 6, 0.12), hum = tone(90, 18, 0.0008), tail = modulated(160, 6, 0.12);
  const pcm = concat(lead, hum, tail), calls = [];
  let raw = null;
  await assert.rejects(
    run({ fetcher: mock(calls, 300, [pcm]), onDiagnostic(stage, bytes) { if (stage === "raw") raw = bytes.slice(); } }),
    e => e.code === "M3_UNRESOLVED_LOW_SIGNAL" &&
      e.details?.audioDiagnostics?.lowFrequencyDominatedSeconds >= 17.5,
  );
  assert.deepEqual(new Uint8Array(raw), pcm);
  assert.equal(calls.length, 1);
});

test("V12 keeps single-request and diagnostic semantics explicit", async () => {
  const [source, scriptSource] = await Promise.all([
    readFile("app/lib/m3-pipeline.ts", "utf8"),
    readFile("app/lib/m3-script.ts", "utf8"),
  ]);
  assert.ok(source.includes('activityDefinition: "acoustic-candidates-not-verified-speech"'));
  assert.ok(source.includes("不会放大噪声、删除区段后冒充全文完成"));
  assert.ok(scriptSource.includes("m3-single-request-v15-transport-comparison"));
});

test("uploaded V11 WAV must preserve bytes and reveal bass-hum evidence", { skip: !process.env.M3_V11_WAV }, async () => {
  const pcm = audio.decodeM3Audio(await readFile(process.env.M3_V11_WAV), "audio/wav");
  const scan = signalTools.scanM3Signal(pcm);
  assert.equal(scan.summary.rawSeconds, 1024.48);
  assert.ok(scan.summary.lowFrequencyDominatedSeconds > 100);
  assert.ok(scan.summary.speechEvidenceSeconds < scan.summary.activeSeconds - 100);
  const plan = signalTools.planM3Repair(scan);
  const unresolved = signalTools.unresolvedM3Low(scan, plan.gains);
  assert.ok(unresolved.some(r => r.seconds >= 40));
  assert.equal(plan.cuts.some(c => unresolved.some(r => c.start / 48000 < r.end && c.end / 48000 > r.start)), false);
});

test("V13 detects long HF artifacts during SSE streaming before waiting for STOP", async () => {
  const pcm = concat(modulated(160, 4, 0.12), tone(7100, 12, 0.009));
  const guard = new signalTools.M3StreamingAnomalyGuard();
  let detected = null;
  for (let at = 0; at < pcm.length; at += 16000) {
    detected = guard.observe(pcm.subarray(at, Math.min(at + 16000, pcm.length)));
    if (detected) break;
  }
  assert.equal(detected?.kind, "high-frequency");
  assert.ok(detected.endSeconds < 20);
});

test("V13 detects sustained 90 Hz hum without counting it as spoken news", () => {
  const pcm = concat(modulated(160, 4, 0.12), tone(90, 24, 0.0008));
  const guard = new signalTools.M3StreamingAnomalyGuard();
  let detected = null;
  for (let at = 0; at < pcm.length; at += 47002) {
    detected = guard.observe(pcm.subarray(at, Math.min(at + 47002, pcm.length)));
    if (detected) break;
  }
  assert.equal(detected?.kind, "low-frequency");
  assert.ok(detected.endSeconds <= 28);
});

test("V13 only treats extended true digital silence as a stream anomaly", () => {
  const guard = new signalTools.M3StreamingAnomalyGuard();
  assert.equal(guard.observe(new Uint8Array(20 * 48000)), null);
  const triggered = guard.observe(new Uint8Array(16 * 48000));
  assert.equal(triggered?.kind, "digital-silence");
});

test("V13 retains normal 2–3s news pauses and genuine low-level voice", () => {
  const lead = modulated(160, 10, 0.12), pause = new Uint8Array(3 * 48000);
  const quiet = modulated(160, 22, 0.006);
  const guard = new signalTools.M3StreamingAnomalyGuard();
  const pcm = concat(lead, pause, quiet, pause, lead);
  for (let at = 0; at < pcm.length; at += 32000) {
    assert.equal(guard.observe(pcm.subarray(at, at + 32000)), null);
  }
});

test("V13 stops one defective upstream request and preserves received original PCM for diagnostics", async () => {
  const pcm = concat(modulated(160, 4, 0.12), tone(7100, 16, 0.009));
  const trace = [], collected = [];
  await assert.rejects(run({
    streaming: true,
    onAudioChunk(piece) { collected.push(piece.slice()); },
    fetcher: async (url) => {
      trace.push(url);
      return sseResponse(streamEvents(pcm));
    },
  }), e => e.code === "M3_STREAM_AUDIO_ANOMALY" &&
    e.details?.streamingAnomaly?.kind === "high-frequency" &&
    e.details?.integrity?.rawBytes > 0);
  assert.equal(trace.length, 1, "never retry or split the one generation request");
  assert.ok(collected.length > 0, "the original, unmodified PCM was relayed first");
});

test("V14 UI can preview exactly what M3 sends to Google without billing", async () => {
  const [page, pipeline, handler] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/lib/m3-pipeline.ts", "utf8"),
    readFile("app/lib/m3-handler.ts", "utf8"),
  ]);
  assert.ok(page.includes("查看实际发送给 Google 的文本（免费预览）"));
  assert.ok(page.includes('value={m3PreparedPreview}'));
  assert.ok(page.includes('textMode: m3TextMode'));
  assert.ok(page.includes('setM3TextMode(event.target.value as M3TextMode)'));
  assert.ok(pipeline.includes('prepareM3Text(options.text, textMode)'));
  assert.ok(pipeline.includes('M3_UPSTREAM_TEXT_AUDIT'));
  assert.ok(handler.includes('body.textMode === "verbatim" ? "verbatim" : "clean"'));
});

test("V14 both Flash models preserve one TTS request with either text treatment", async () => {
  const text = "Сәлем тораптастар.\n\nБірінші. «Біздің еліміз»!\nЕкінші. Мәлімет.";
  for (const model of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) {
    for (const textMode of ["clean", "verbatim"]) {
      const calls = [];
      const result = await run({ text, textMode, model, fetcher: mock(calls) });
      const tts = calls.filter(x => x.url.endsWith(":generateContent"));
      assert.equal(tts.length, 1);
      assert.equal(tts[0].body.contents[0].parts[0].text, script.prepareM3Text(text, textMode));
      assert.equal(result.audit.ttsRequests, 1);
      assert.equal(result.audit.retries, 0);
    }
  }
});


test("M3 UI derives both version labels from the actual backend constant", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  assert.ok(page.includes('import { M3_VERSION, prepareM3Text'));
  assert.ok(page.includes('const M3_PUBLIC_VERSION = M3_VERSION.match'));
  assert.ok(page.includes('M3 单次整篇 {M3_PUBLIC_VERSION} · 输入文本及生成接口诊断'));
  assert.ok(page.includes('M3 · 单次整篇 {M3_PUBLIC_VERSION} · 连续文本 + 实时试听'));
  assert.equal(page.includes('M3 · 单次整篇 V13 · 连续文本 + 实时试听'), false);
  assert.ok(page.includes('setM3ServerVersion(typeof payload?.version === "string" ? payload.version : null)'));
  assert.ok(page.includes('m3ServerVersion === M3_VERSION'));
  const regional = await readFile("worker/m3-regional-session.ts", "utf8");
  assert.ok(regional.includes('version: M3_VERSION'));
});


function interactionSseEvents(pcm, complete = true) {
  const half = Math.floor(pcm.length / 4) * 2;
  const deltas = [pcm.subarray(0, half), pcm.subarray(half)].map(piece => ({
    event_type: "step.delta",
    index: 0,
    delta: { type: "audio", data: Buffer.from(piece).toString("base64"), mime_type: "audio/l16", sample_rate: 24000, channels: 1 },
  }));
  return [{ event_type: "interaction.created", interaction: { status: "in_progress" } },
    { event_type: "step.start", index: 0, step: { type: "model_output" } },
    ...deltas,
    { event_type: "step.stop", index: 0 },
    ...(complete ? [{ event_type: "interaction.completed", interaction: { status: "completed" } }] : [])];
}

test("V15 legacy temperature A/B changes only the optional temperature property", async () => {
  const sample = "Сәлем тораптастар.\n\nБірінші. Еліміз жаңалықтары.";
  for (const diagnosticMode of ["legacy-05", "legacy-default"]) {
    const calls = [];
    const result = await run({ streaming: true, diagnosticMode, textMode: "verbatim", text: sample, fetcher: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return sseResponse(streamEvents(tone(160, 18)), false);
    } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.includes(":streamGenerateContent?alt=sse"), true);
    const config = calls[0].body.generationConfig;
    assert.equal(config.temperature, diagnosticMode === "legacy-05" ? 0.5 : undefined);
    assert.equal(calls[0].body.contents[0].parts[0].text, sample);
    assert.deepEqual(config.speechConfig, { voiceConfig: { voice: "Puck" } });
    assert.equal(result.audit.ttsRequests, 1);
    assert.equal(result.audit.retries, 0);
    assert.equal(result.audit.temperature, diagnosticMode === "legacy-05" ? 0.5 : null);
  }
});

test("V15 Interactions streams 24 kHz PCM from one request using one voice", async () => {
  const sample = "Сәлем тораптастар.\n\nБірінші. «жүңгө», еліміз!";
  const pcm = tone(160, 18);
  for (const model of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) {
    const calls = [];
    const result = await run({ streaming: true, model, diagnosticMode: "interactions-default", text: sample, textMode: "verbatim", fetcher: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return sseResponse([...interactionSseEvents(pcm), "[DONE]"], false);
    } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(calls[0].body.stream, true);
    assert.equal(calls[0].body.input[0].content[0].text, sample);
    assert.equal(calls[0].body.input[0].content[0].annotations, undefined);
    assert.deepEqual(calls[0].body.generation_config.speech_config, [{ voice: "Puck" }]);
    assert.deepEqual(calls[0].body.response_format, { type: "audio", mime_type: "audio/l16", sample_rate: 24000 });
    assert.equal(calls[0].body.generation_config.temperature, undefined);
    assert.equal(result.audit.transport, "interactions");
    assert.equal(result.audit.ttsRequests, 1);
    assert.equal(result.audit.retries, 0);
    assert.deepEqual(audio.decodeM3Audio(result.wav, "audio/wav"), pcm);
  }
});

test("V15 Interactions incomplete, failed, or wrong-format streams never become completed WAV", async () => {
  const pcm = tone(160, 18);
  const valid = interactionSseEvents(pcm, false);
  const failures = [
    { events: valid, code: "M3_INCOMPLETE_AUDIO" },
    { events: [...valid, { event_type: "interaction.completed", interaction: { status: "incomplete" } }], code: "M3_INCOMPLETE_AUDIO" },
    { events: [...valid, { event_type: "interaction.failed" }], code: "M3_STREAM_ERROR" },
    { events: valid.map(v => v.event_type === "step.delta" ? { ...v, delta: { ...v.delta, sample_rate: 16000 } } : v), code: "M3_AUDIO_FORMAT_MISMATCH" },
  ];
  for (const sample of failures) {
    const requests = [];
    await assert.rejects(
      run({ streaming: true, diagnosticMode: "interactions-default",
        fetcher: async (url, options) => {
          requests.push(url);
          return sseResponse(sample.events, false);
        },
      }), err => err.code === sample.code,
    );
    assert.equal(requests.length, 1);
  }
});

test("V15 manual transport selectors do not trigger automatic additional API calls", async () => {
  const [page, handler, scriptSrc] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/lib/m3-handler.ts", "utf8"),
    readFile("app/lib/m3-script.ts", "utf8"),
  ]);
  assert.ok(page.includes("id=\"m3-diagnostic-mode\""));
  assert.ok(page.includes('value="legacy-05"'));
  assert.ok(page.includes('value="legacy-default"'));
  assert.ok(page.includes('value="interactions-default"'));
  assert.ok(page.includes("diagnosticMode: m3DiagnosticMode"));
  assert.ok(handler.includes('normalizeM3DiagnosticMode(body.diagnosticMode)'));
  assert.ok(scriptSrc.includes('m3-single-request-v15-transport-comparison'));
  assert.equal(script.normalizeM3DiagnosticMode("bad input"), "legacy-default");
  assert.equal(script.m3Temperature("legacy-default"), null);
  assert.equal(script.m3Temperature("legacy-05"), 0.5);
});


test("V15 Interactions requires both completed status and final [DONE] SSE sentinel", async () => {
  const pcm = tone(160, 18);
  const base = interactionSseEvents(pcm, true);
  for (const events of [
    base,
    [...interactionSseEvents(pcm, false), "[DONE]"],
    ["[DONE]", ...base],
  ]) {
    const requests = [];
    await assert.rejects(run({
      streaming: true, diagnosticMode: "interactions-default",
      fetcher: async (url) => { requests.push(url); return sseResponse(events); },
    }), e => e.code === "M3_INCOMPLETE_AUDIO");
    assert.equal(requests.length, 1);
  }
});

test("V15 Interactions rejects audio after completion, duplicate completion and corrupted deltas", async () => {
  const pcm = tone(160, 18);
  const complete = interactionSseEvents(pcm);
  const completedEvent = complete.at(-1);
  const audioEvent = complete.find(e => e.event_type === "step.delta");
  const faulty = [
    { events: [...complete, audioEvent, "[DONE]"], code: "M3_AUDIO_AFTER_STOP" },
    { events: [...complete, completedEvent, "[DONE]"], code: "M3_AUDIO_AFTER_STOP" },
    { events: [complete[0], complete[1], complete[2], complete[4], complete[3], complete[5], "[DONE]"], code: "M3_INVALID_STREAM" },
    { events: complete.filter(e => e.event_type !== "step.start"), code: "M3_INVALID_STREAM" },
    { events: complete.map(e => e.event_type === "step.delta" ? { ...e, delta: { ...e.delta, data: "@bad-base64" } } : e), code: "M3_INVALID_BASE64" },
    { events: complete.filter(e => e.event_type !== "step.stop"), code: "M3_INCOMPLETE_AUDIO" },
    { events: complete.map(e => e.event_type === "step.delta" ? { ...e, delta: { ...e.delta, channels: 2 } } : e), code: "M3_AUDIO_FORMAT_MISMATCH" },
  ];
  for (const { events, code } of faulty) {
    const calls = [];
    await assert.rejects(run({ streaming: true, diagnosticMode: "interactions-default",
      fetcher: async (url) => { calls.push(url); return sseResponse(events); },
    }), e => e.code === code, "expected " + code);
    assert.equal(calls.length, 1, "never retry or fallback");
  }
});

test("V15 cancellation never completes a WAV even after Google's success marker", async () => {
  const pcm = tone(160, 18);
  const aborter = new AbortController(), requests = [];
  await assert.rejects(run({
    diagnosticMode: "interactions-default", streaming: true, signal: aborter.signal,
    fetcher: async url => { requests.push(url); aborter.abort(); return sseResponse([...interactionSseEvents(pcm), "[DONE]"]); },
  }), e => e.code === "M3_CANCELLED");
  assert.equal(requests.length, 1);
});

test("V15 Interactions enforces streaming even when caller omits the legacy streaming flag", async () => {
  const pcm = tone(160, 18), requests = [];
  const result = await run({
    diagnosticMode: "interactions-default", streaming: false,
    fetcher: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return sseResponse([...interactionSseEvents(pcm), "[DONE]"]);
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.stream, true);
  assert.deepEqual(audio.decodeM3Audio(result.wav, "audio/wav"), pcm);
});

test("V15 refuses to disguise missing narration by compressing abnormal source silence", async () => {
  const pcm = concat(modulated(160, 6), new Uint8Array(48000 * 6), modulated(180, 6));
  const calls = [], stages = [];
  await assert.rejects(run({
    fetcher: mock(calls, 300, [pcm]),
    onDiagnostic(stage, bytes) { stages.push({ stage, bytes: bytes.slice() }); },
  }), e => e.code === "M3_UNVERIFIED_AUDIO_REPAIR" &&
    e.details?.proposedCuts?.length > 0 &&
    e.details?.proposedSilenceRegions?.[0]?.seconds > 4 &&
    e.details?.stage === "postprocess-repair-gate" &&
    e.details?.integrity?.rawBytes === pcm.length &&
    /数字静音/.test(e.message));
  assert.equal(calls.length, 1, "single Google generation, no fallback");
  assert.equal(stages.length, 1, "must retain raw, never manufacture a processed complete WAV");
  assert.equal(stages[0].stage, "raw");
  assert.deepEqual(new Uint8Array(stages[0].bytes), pcm);
});


test("V15 A/B/C attribute distinct PCM-silence failures without another synthesis", async () => {
  const pcm = concat(modulated(160, 6), new Uint8Array(48000 * 6), modulated(180, 6));
  for (const diagnosticMode of ["legacy-05", "legacy-default", "interactions-default"]) {
    const calls = [];
    const fetcher = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return diagnosticMode === "interactions-default"
        ? sseResponse([...interactionSseEvents(pcm), "[DONE]"])
        : sseResponse(streamEvents(pcm));
    };
    await assert.rejects(run({ diagnosticMode, streaming: true, fetcher }), e => {
      assert.equal(e.code, "M3_UNVERIFIED_AUDIO_REPAIR");
      assert.equal(e.details?.diagnosticMode, diagnosticMode);
      assert.equal(e.details?.transport, diagnosticMode === "interactions-default" ? "interactions" : "streamGenerateContent");
      assert.equal(e.details?.temperature, diagnosticMode === "legacy-05" ? 0.5 : null);
      assert.equal(e.details?.stage, "postprocess-repair-gate");
      assert.equal(e.details?.integrity?.rawBytes, pcm.length);
      assert.equal(e.details?.proposedLowVolumeRegions?.length, 0);
      assert.ok(e.details?.proposedSilenceRegions?.length > 0);
      assert.ok(e.details?.proposedSilenceRegions[0].startSeconds >= 6);
      assert.ok(e.details?.proposedSilenceRegions[0].endSeconds <= 12);
      assert.match(e.details?.textSha256 ?? "", /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(e.details).includes("fake-test-key"), false);
      assert.match(e.message, /数字静音裁剪候选/);
      return true;
    });
    assert.equal(calls.length, 1, diagnosticMode + ": must not retry");
  }
});

test("V15 failure SSE forwards reason, transport and intervals; QA files have unique names", async () => {
  const [handler, page] = await Promise.all([
    readFile("app/lib/m3-handler.ts", "utf8"),
    readFile("app/page.tsx", "utf8"),
  ]);
  assert.ok(handler.includes("proposedSilenceRegions:"));
  assert.ok(handler.includes("proposedLowVolumeRegions:"));
  assert.ok(handler.includes("diagnosticMode,"));
  assert.ok(handler.includes("textSha256: details?.textSha256"));
  assert.ok(page.includes("m3-${m3DiagnosticMode}-${voiceLabel}-${stamp}"));
  assert.ok(page.includes("m3Diagnostic.filename"));
  assert.ok(page.includes("请在下一次生成前保存本次文件"));
});


test("B field-data regression: gain suggestions alone cannot invalidate intact full PCM", async () => {
  // Approximate B's real root cause without embedding the user's personal
  // 15.9MB recorded audio into GitHub: a single low-amplitude voiced passage
  // surrounded by healthy speech, with no multi-second lost audio.
  const original = concat(modulated(160, 6, 0.15), modulated(160, 8, 0.005), modulated(160, 6, 0.15));
  const plan = signalTools.planM3Repair(signalTools.scanM3Signal(original));
  assert.equal(plan.cuts.length, 0);
  assert.ok(plan.gains.length > 0, "must reproduce original false-positive gain proposal");
  for (const diagnosticMode of ["legacy-05", "legacy-default", "interactions-default"]) {
    const calls = [], events = [];
    const fetcher = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return diagnosticMode === "interactions-default"
        ? sseResponse([...interactionSseEvents(original), "[DONE]"])
        : sseResponse(streamEvents(original));
    };
    const result = await run({
      streaming: true, diagnosticMode, fetcher,
      log(event, details) { events.push({ event, details }); },
    });
    assert.equal(calls.length, 1, "must not retry or use fallback");
    assert.deepEqual(audio.decodeM3Audio(result.wav, "audio/wav"), original,
      "must deliver original bytes without any gain or cut");
    assert.equal(result.audit.integrity.rawSha256, result.audit.integrity.processedSha256);
    assert.equal(result.audit.integrity.rawCrc32, result.audit.integrity.processedCrc32);
    assert.equal(result.audit.integrity.rawBytes, result.audit.integrity.processedBytes);
    assert.equal(result.audit.parts[0].gainDb, 0);
    assert.ok(events.some(e => e.event === "M3_GAIN_CANDIDATES_NOT_APPLIED"), "leave diagnostic evidence");
    assert.ok(events.some(e => e.event === "M3_PROGRAM_COMPLETE" &&
      e.details.gainRegions === 0 && e.details.gainCandidatesNotApplied > 0));
  }
});

test("M3 live preview never amplifies a low-level PCM segment", () => {
  const original = concat(modulated(160, 6, 0.15), modulated(160, 8, 0.005), modulated(160, 6, 0.15));
  const preview = new liveClient.M3LivePreview();
  preview.add(original);
  assert.equal(preview.safeSeconds, original.length / 48000);
  assert.equal(preview.warning, "");
  assert.equal(preview.chunks.length, 1);
  assert.deepEqual(preview.chunks[0], original, "live listening must use unaltered raw samples");
  preview.stop();
});


test("V15 long-form voice audit covers the entire timeline, not just four sparse samples", () => {
  // This 24s middle shift has only brief overlap with the old four probes.
  const pcm = concat(tone(160, 38), tone(270, 24), tone(160, 30));
  const check = audio.screenM3Take(pcm);
  assert.ok(check.windows.length >= 7, "continuous 12s checks must cover the programme");
  assert.ok(check.windows.some(w => w.start >= 36 && w.start <= 48), "middle transition must be represented");
  assert.equal(check.timeline.windowsScanned, check.windows.length);
  assert.ok(check.timeline.maxPitchSemitones > 6);
  assert.ok(check.windows.every(w => w.end <= pcm.length / 48000 + 0.001));
  assert.ok(["review-pitch-and-prosody", "sustained-multi-cue-drift-risk"].includes(check.timeline.status));
});

test("V15 voice analysis is advisory for voice-band-stable loudness changes", () => {
  // Plain loudness changes are not biometric speaker changes.
  const pcm = concat(tone(160, 30, 0.14), tone(160, 36, 0.025));
  const check = audio.screenM3Take(pcm);
  assert.equal(check.detected, false);
  assert.ok(check.windows.length >= 5);
  assert.equal(check.timeline.longestMultiCueRun, 0);
  assert.ok(check.windows.every(w => w.risk !== "multi-cue"));
});

test("V15 timeline is preserved in audit without another synthesis or changing PCM", async () => {
  const pcm = concat(tone(160, 24), tone(160, 30, 0.09));
  const requests = [], events = [];
  const result = await run({
    streaming: true, diagnosticMode: "legacy-default",
    fetcher: async (url) => { requests.push(url); return sseResponse(streamEvents(pcm)); },
    log(event, details) { events.push({ event, details }); },
  });
  assert.equal(requests.length, 1);
  assert.ok(result.audit.voiceTimeline?.windows.length >= 4);
  assert.equal(result.audit.voiceTimeline?.windowsScanned, result.audit.voiceTimeline?.windows.length);
  assert.ok(events.some(e => e.event === "M3_VOICE_CONTINUITY_AUDIT"));
  assert.deepEqual(audio.decodeM3Audio(result.wav, "audio/wav"), pcm);
  assert.equal(result.audit.integrity.rawSha256, result.audit.integrity.processedSha256);
});

test("V15 exposes waveform-independent voice audit across pipeline, SSE and user QA", async () => {
  const [handler, page, pipeline] = await Promise.all([
    readFile("app/lib/m3-handler.ts", "utf8"),
    readFile("app/page.tsx", "utf8"),
    readFile("app/lib/m3-pipeline.ts", "utf8"),
  ]);
  assert.ok(handler.includes("voiceTimeline: audit.voiceTimeline"));
  assert.ok(handler.includes("voiceTimeline: details?.voiceTimeline"));
  assert.ok(page.includes("captureM3VoiceTimeline(live.diagnostics)"));
  assert.ok(page.includes("长篇主播一致性声学检查"));
  assert.ok(pipeline.includes("M3_VOICE_CONTINUITY_AUDIT"));
});

test("M3 local transcript audit detects all 13 sections with real Kazakh heading structures", () => {
  const story = "Елімізде маңызды жаңалықтар жарияланды. Халықаралық ынтымақтастық туралы жаңа мәліметтер белгілі болды.";
  const source = "Сәлем тораптастар, баршаңызға қайырлы таң. " +
    script.NUMBERED_OPENERS.map((label, index) => `${label}. ${story} ${index}.`).join(" ") +
    " Осымен бүгінгі кескіннің барлық мазмұны айақталды. Ертең қайта кездескенше сау сәлемет болыңыздар.";
  const report = transcriptAudit.auditM3Transcript(source, source);
  assert.equal(report.presentHeadings, 13);
  assert.equal(report.referenceHeadings, 13);
  assert.deepEqual(report.missingHeadings, []);
  assert.deepEqual(report.duplicatedHeadings, []);
  assert.deepEqual(report.reviewSections, []);
  assert.ok(report.introLikelyPresent && report.endingLikelyPresent);
  assert.ok(report.sections.every(section => section.similarity === 1));
  assert.equal(report.transcriptVerified, false, "never claim audio verification from text alone");
});
test("M3 audit distinguishes absent, duplicated and changed sections without altering Kazakh source", () => {
  const sections = script.NUMBERED_OPENERS.map((name, i) =>
    `${name}. ${i + 1} жаңалықтың ерекше мазмұны және нақты хабарлары жарияланды, мәліметтер тарады.`);
  const source = "Қайырлы таң, ардақты тораптастар. " + sections.join(" ") + " Осымен бүгінгі кескін аяқталды.";
  const target = [sections[0], sections[1], sections[1], ...sections.slice(2, 6), ...sections.slice(7)].join(" ") +
    " Осымен бүгінгі кескін аяқталды.";
  const sourceCopy = source;
  const result = transcriptAudit.auditM3Transcript(source, target);
  assert.deepEqual(result.missingHeadings, [7]);
  assert.deepEqual(result.duplicatedHeadings, [2]);
  assert.equal(result.presentHeadings, 12);
  assert.equal(source, sourceCopy);
  assert.equal(result.transcriptVerified, false);
});
test("M3 audit treats orthographic variation as review, never proven omitted speech", () => {
  const reference = "Бірінші. елімізде Шинжиаңдағы тасжолы бекітілді, шөферлер мен сайахатшылар ескертілді.";
  const recognized = "Бірінші. елімізде Шыңжаңдағы тас жолы бекітілді, шөпірлер мен саяхатшылар ескертілді.";
  const result = transcriptAudit.auditM3Transcript(reference, recognized);
  assert.equal(result.sections[0].recognizedCount, 1);
  assert.ok(result.sections[0].similarity > 0.55, "minor ASR spelling differences must not equate to missing article");
  assert.equal(result.transcriptVerified, false);
  assert.match(result.notice, /ASR/);
});
test("M3 web keeps transcript audit local, optional and tied to frozen Google request text", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  assert.match(page, /setM3ActualTextForQa\(engine === "gemini" \? prepareM3Text\(cleanText, m3TextMode\)/);
  assert.ok(page.includes("auditM3Transcript(m3ActualTextForQa ?? prepareM3Text(text.trim(), m3TextMode), m3ExternalTranscript)"));
  assert.ok(page.includes("不会发送至服务器"));
  assert.ok(page.includes("不生成语音"));
});

test("M3 sentence-level audit flags a missing sentence even with the correct numbered heading", () => {
  const a = "Мемлекет мерекесінде халық саяхатқа шықты және барлық өңірлерде жол қатынасы тығыз болды.";
  const b = "Жеті күннің ішінде қатынау саны екі миллиардтан асып кетті және жаңа деректер жарияланды.";
  const c = "Бұл еліміздің көлік жүйесі тұрақты жұмыс істегенін және саяхат көлемі өскенін көрсетті.";
  const reference = "Бірінші. " + [a, b, c].join(" ");
  const recognized = "Бірінші. " + [a, c].join(" ");
  const results = transcriptAudit.auditM3Transcript(reference, recognized);
  assert.equal(results.sections[0].recognizedCount, 1);
  assert.ok(results.sections[0].sentenceWarnings.length >= 1, JSON.stringify(results.sections[0]));
  assert.ok(results.sections[0].sentenceWarnings.some(w => w.sourceExcerpt.includes("Жеті күннің")));
  assert.equal(results.transcriptVerified, false);
});
test("M3 sentence matching tolerates punctuation changes and runs with flat ASR text", () => {
  const sentence = "Шинжиаңдағы таулы жолдардағы ауа райының өзгеруі мен қар жауу қаупі көлік қатынасына әсер етеді.";
  const reference = "Он екінші. " + sentence;
  const recognized = "Он екінші. " + sentence.replaceAll(" ", "  ").replace("әсер етеді.", "әсер етеді");
  const report = transcriptAudit.auditM3Transcript(reference, recognized);
  assert.equal(report.sections[11].recognizedCount, 1);
  assert.equal(report.sections[11].sentenceWarnings.length, 0);
});

test("M3 historical WAV text QA requires no M3 generation or uploaded audio", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  assert.ok(page.includes('{engine === "gemini" && (m3ActualTextForQa || text.trim()) ? ('));
  assert.ok(page.includes("无需生成语音即可核对历史录音"));
  assert.ok(page.includes("m3ActualTextForQa ?? prepareM3Text(text.trim(), m3TextMode)"));
  assert.ok(page.includes("不会发送至服务器"));
});
