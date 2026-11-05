import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let mod = {};
try { mod = await import("../worker/m3-remix-eval.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }

const token = "t".repeat(48);
const env = { GEMINI_API_KEY: "test-key", M3_VOICE_PROBE_TOKEN: token, M3_EVAL_ENABLED: "enabled" };
const text = (await readFile("tests/fixtures/m3-remix-eval-10news.txt", "utf8")).trim();
const cleanText = text.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/gu, "").replace(/[\r\n\t\u00A0\u202F\u3000]+/gu, " ").replace(/ {2,}/g, " ").trim();
const request = (path, body = {}, supplied = token) => new Request("https://example.test" + path, {
  method: "POST", headers: { "X-M3-Probe-Token": supplied, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const unexpected = async () => { throw new Error("unexpected upstream request"); };

test("archived ten-item manuscript is 5000–5300 characters", () => {
  assert.ok(text.length >= 5000 && text.length <= 5300);
  assert.ok(text.includes("Бірінші.") && text.includes("Оныншы."));
});

test("disabled and unauthorized experiment requests cannot reach Google", async () => {
  assert.equal(typeof mod.handleEvaluation, "function");
  const disabled = await mod.handleEvaluation(request("/api/internal/m3-remix-evaluation/create"), { ...env, M3_EVAL_ENABLED: undefined }, unexpected);
  assert.equal(disabled.status, 503);
  assert.equal((await disabled.json()).code, "EVALUATION_DISABLED");
  const denied = await mod.handleEvaluation(request("/api/internal/m3-remix-evaluation/create", {}, "wrong"), env, unexpected);
  assert.equal(denied.status, 401);
});

test("creating one remix uses the fixed Iapetus base and returns only safe metadata", async () => {
  assert.equal(typeof mod.handleEvaluation, "function");
  let calls = 0;
  const result = await mod.handleEvaluation(request("/api/internal/m3-remix-evaluation/create"), env, async (url, options) => {
    calls++;
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/voices");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    const payload = JSON.parse(options.body);
    assert.equal(payload.store, true);
    assert.equal(payload.voice.type, "prompted");
    assert.equal(payload.voice.model, "gemini-3.8-flash-tts");
    assert.equal(payload.voice.prompted.base_voice, "Iapetus");
    return Response.json({ id: "voice_example123", sample_audio: { data: "private-audio" }, usage: { total_input_tokens: 10, total_output_tokens: 20 } });
  });
  const raw = await result.text();
  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(raw).id, "voice_example123");
  assert.equal(raw.includes("private-audio"), false);
  assert.equal(raw.includes("test-key"), false);
});

test("synthesis sends the complete manuscript in one streaming request for either voice", async () => {
  assert.equal(typeof mod.handleEvaluation, "function");
  const calls = [];
  const upstream = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  };
  for (const voice of ["Iapetus", "voice_example123"]) {
    const result = await mod.handleEvaluation(request("/api/internal/m3-remix-evaluation/synthesize", { text, voice }), env, upstream);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("content-type"), /text\/event-stream/);
    assert.equal(await result.text(), "data: [DONE]\n\n");
  }
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:streamGenerateContent?alt=sse");
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.redirect, "manual");
    assert.equal(call.body.contents[0].parts[0].text, cleanText);
    assert.equal(call.body.generationConfig.temperature, undefined);
    assert.equal(call.body.generationConfig.maxOutputTokens, 16384);
  }
  const originalVoice = calls[0].body.generationConfig.speechConfig.voiceConfig.voice;
  const remixVoice = calls[1].body.generationConfig.speechConfig.voiceConfig.voice;
  assert.equal(originalVoice, "Iapetus");
  assert.equal(remixVoice, "voice_example123");
  calls[0].body.generationConfig.speechConfig.voiceConfig.voice = remixVoice;
  assert.deepEqual(calls[0].body, calls[1].body);
});

test("invalid text, model selection and voice never initiate synthesis", async () => {
  assert.equal(typeof mod.handleEvaluation, "function");
  for (const body of [{ text: "short", voice: "Iapetus" }, { text, voice: "Puck" }, { text, voice: "voice_x", model: "other" }]) {
    const result = await mod.handleEvaluation(request("/api/internal/m3-remix-evaluation/synthesize", body), env, unexpected);
    assert.equal(result.status, 400);
  }
});

test("upstream errors are not retried and never echo arbitrary error text", async () => {
  assert.equal(typeof mod.handleEvaluation, "function");
  let calls = 0;
  const result = await mod.handleEvaluation(request("/api/internal/m3-remix-evaluation/create"), env, async () => {
    calls++;
    return Response.json({ error: { message: "test-key private message" } }, { status: 403 });
  });
  const raw = await result.text();
  assert.equal(calls, 1);
  assert.equal(result.status, 502);
  assert.equal(JSON.parse(raw).upstreamStatus, 403);
  assert.equal(raw.includes("test-key"), false);
  assert.equal(raw.includes("private message"), false);
});
