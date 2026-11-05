import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let runner = {};
try { runner = await import("../experiments/m3-remix-runner.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }
const text = (await readFile("tests/fixtures/m3-remix-eval-10news.txt", "utf8")).trim();
const encode = value => "data: " + JSON.stringify(value) + "\n\n";
const audio = bytes => ({ candidates: [{ index: 0, content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: Buffer.from(bytes).toString("base64") } }] } }] });
const stop = { candidates: [{ index: 0, finishReason: "STOP" }] };
const parts = source => new ReadableStream({
  start(controller) {
    const bytes = new TextEncoder().encode(source);
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  },
});
const streamResponse = source => new Response(parts(source), { headers: { "Content-Type": "text/event-stream" } });
const valid = encode(audio([1, 0, 2, 0, 3, 0, 4, 0])) + encode(stop);

test("fragmented SSE preserves audio bytes and produces a correct WAV", async () => {
  assert.equal(typeof runner.decodeAudioStream, "function");
  const result = await runner.decodeAudioStream(parts(valid), { minimumSeconds: 0 });
  assert.deepEqual(result.pcm, Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]));
  assert.equal(result.wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(result.wav.readUInt32LE(24), 24000);
  assert.equal(result.wav.readUInt16LE(22), 1);
  assert.equal(result.wav.readUInt16LE(34), 16);
  assert.equal(result.wav.readUInt32LE(40), 8);
  assert.deepEqual(result.wav.subarray(44), result.pcm);
  assert.equal(result.sha256.length, 64);
  assert.equal(result.contentVerified, false);
});

test("incomplete, corrupted, or post-stop streams never become completed WAVs", async () => {
  assert.equal(typeof runner.decodeAudioStream, "function");
  const badBase64 = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: "A===" } }] } }] };
  const wrongRate = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=16000", data: "AQACAA==" } }] } }] };
  for (const input of [
    encode(audio([1, 0, 2, 0])),
    encode(audio([1, 0, 2, 0])) + encode({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    encode(badBase64) + encode(stop),
    encode(wrongRate) + encode(stop),
    encode(audio([1, 0, 2])) + encode(stop),
    encode(stop) + encode(audio([1, 0, 2, 0])),
    encode({ error: { message: "private upstream" } }),
    encode(stop),
  ]) await assert.rejects(() => runner.decodeAudioStream(parts(input), { minimumSeconds: 0 }));
});

test("duplicate large non-silent audio is rejected rather than silently removed", async () => {
  assert.equal(typeof runner.decodeAudioStream, "function");
  const block = Buffer.alloc(48000); block[2] = 1; block[4] = 2;
  await assert.rejects(() => runner.decodeAudioStream(parts(encode(audio(block)) + encode(audio(block)) + encode(stop)), { minimumSeconds: 0 }), /REPEATED_AUDIO/);
});

test("one comparison makes one creation and two ordered single synthesis calls", async () => {
  assert.equal(typeof runner.runRemixComparison, "function");
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/create")) return Response.json({ code: "VOICE_CREATED", id: "voice_safe123" });
    return streamResponse(valid);
  };
  const result = await runner.runRemixComparison({ text, token: "t".repeat(48), fetcher, minimumSeconds: 0 });
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /\/create$/);
  const baseline = JSON.parse(calls[1].options.body);
  const remix = JSON.parse(calls[2].options.body);
  assert.equal(baseline.voice, "Iapetus");
  assert.equal(remix.voice, "voice_safe123");
  assert.equal(baseline.text, remix.text);
  assert.equal(calls.every(c => c.options.redirect === "manual"), true);
  assert.equal(result.baseline.contentVerified, false);
  assert.equal(result.remix.contentVerified, false);
});

test("upstream failure stops the comparison without retry or further synthesis", async () => {
  assert.equal(typeof runner.runRemixComparison, "function");
  let calls = 0;
  await assert.rejects(() => runner.runRemixComparison({
    text, token: "t".repeat(48),
    fetcher: async () => { calls++; return Response.json({ code: "GOOGLE_REQUEST_FAILED", upstreamStatus: 403 }, { status: 502 }); },
    minimumSeconds: 0,
  }));
  assert.equal(calls, 1);
});

test("failed baseline stops before remix and invalid inputs make no requests", async () => {
  assert.equal(typeof runner.runRemixComparison, "function");
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    if (String(url).endsWith("/create")) return Response.json({ code: "VOICE_CREATED", id: "voice_safe123" });
    return streamResponse(encode(audio([1, 0, 2, 0])));
  };
  await assert.rejects(() => runner.runRemixComparison({ text, token: "t".repeat(48), fetcher, minimumSeconds: 0 }));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(() => runner.runRemixComparison({ text: "short", token: "t".repeat(48), fetcher }));
  assert.equal(calls, 0);
});
