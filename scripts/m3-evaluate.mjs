/** Real upstream regression runner. No credentials, fixtures or audio are sent anywhere except the existing site's M3 endpoint. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "rolldown";

const mode = process.argv[2];
if (!["baseline", "A", "B", "C", "analyze"].includes(mode)) throw new Error("Usage: node scripts/m3-evaluate.mjs baseline|A|B|C|analyze [output-directory]");
const root = resolve(process.argv[3] ?? "work/m3/qa");
await mkdir(root, { recursive: true });
for (const name of ["script", "audio"]) await build({ input: `app/lib/m3-${name}.ts`, platform: "node", output: { file: join(root, `${name}.mjs`), format: "esm", codeSplitting: false } });
const script = await import(pathToFileURL(join(root, "script.mjs")));
const audio = await import(pathToFileURL(join(root, "audio.mjs")));
const original = (await readFile("tests/fixtures/m3-real-13-news.txt", "utf8")).trim();
const text = script.prepareM3Text(original);
const sections = script.m3Sections(text);
if (sections.length !== 15) throw new Error(`Expected introduction + 13 news + closing, got ${sections.length}`);
const endpoint = "https://kazakh-broadcast-worker.mahejiang653.workers.dev/api/gemini-tts";
const runCurl = args => new Promise((accept, reject) => {
  const p = spawn("curl", args); let out = "", err = "";
  p.stdout.on("data", x => out += x); p.stderr.on("data", x => err += x);
  p.on("error", reject); p.on("exit", code => code === 0 ? accept(out) : reject(new Error(`curl ${code}: ${err.slice(0, 300)}`)));
});
if (mode !== "analyze") {
  // Baseline uses the unchanged V4 full-program pipeline; C is the controlled 15-request variant.
  const blocks = mode === "B" ? script.largeM3Chunks(text) : mode === "C" ? sections : [original];
  const manifest = { mode, generatedAt: new Date().toISOString(), characters: original.length, words: original.split(/\s+/).length, sections: sections.length, requestedVoice: "Puck", requestedModel: "gemini-3.8-flash-tts", speed: 1, endpoint, requests: [] };
  try {
    for (let i = 0; i < blocks.length; i++) {
      const prefix = join(root, `${mode}-${String(i + 1).padStart(2, "0")}`);
      const payload = `${prefix}.request.json`, wav = `${prefix}.wav`, headerFile = `${prefix}.headers`;
      await writeFile(payload, JSON.stringify({ text: blocks[i], voice: "Puck", model: manifest.requestedModel, speed: 1, preset: "news" }));
      console.log(`${mode} ${i + 1}/${blocks.length}: ${blocks[i].length} characters, requesting live TTS`);
      const started = Date.now();
      const status = Number(await runCurl(["--silent", "--show-error", "--max-time", "660", "--retry", "0", "--request", "POST", endpoint, "--header", "Content-Type: application/json", "--data-binary", `@${payload}`, "--dump-header", headerFile, "--output", wav, "--write-out", "%{http_code}"]));
      const rawHeaders = await readFile(headerFile, "utf8");
      const headers = Object.fromEntries([...rawHeaders.matchAll(/^([^:\r\n]+):\s*(.*)$/gm)].map(m => [m[1].toLowerCase(), m[2].trim()]));
      const bytes = await readFile(wav);
      const record = { index: i, characters: blocks[i].length, status, elapsedSeconds: (Date.now() - started) / 1000, bytes: bytes.length, headers, file: wav };
      manifest.requests.push(record);
      await writeFile(join(root, `${mode}.json`), JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify(record));
      if (status !== 200 || !/^audio\/wav/.test(headers["content-type"] ?? "")) throw new Error(`Live M3 failed: ${bytes.toString("utf8").slice(0, 900)}`);
      if (mode !== "baseline" && headers["x-m3-version"] !== script.M3_VERSION) throw new Error("Live server is not the candidate M3 version");
      if (headers["x-gemini-tts-voice"] !== "Puck") throw new Error("Live server did not preserve the selected Puck voice");
    }
  } catch (error) {
    manifest.error = error.message;
    await writeFile(join(root, `${mode}.json`), JSON.stringify(manifest, null, 2));
    throw error;
  }
}
const modes = mode === "analyze" ? ["baseline", "A", "B", "C"] : [mode];
for (const label of modes) {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(root, `${label}.json`), "utf8")); } catch { continue; }
  if (manifest.error) continue;
  const pcms = [], chunkFeatures = [];
  for (const request of manifest.requests) {
    const pcm = audio.decodeM3Audio(await readFile(request.file), "audio/wav");
    pcms.push(pcm); chunkFeatures.push(audio.analyzeM3Pcm(pcm));
  }
  const wav = audio.joinM3Wav(pcms);
  await writeFile(join(root, `${label}-full.wav`), wav);
  const pcm = audio.decodeM3Audio(wav, "audio/wav"), screening = audio.screenM3Take(pcm);
  const analysis = { label, seconds: pcm.length / 48000, ttsRequests: manifest.requests.reduce((sum, r) => sum + Number(r.headers["x-m3-tts-requests"] ?? r.headers["x-gemini-tts-chunks"] ?? 1), 0), retries: manifest.requests.reduce((sum, r) => sum + Number(r.headers["x-m3-retries"] ?? 0), 0), chunks: chunkFeatures.map((f, i) => ({ index: i, ...f, comparison: audio.compareM3Voice(screening.anchor, f) })), screening, limitation: "Acoustic heuristics are not speaker embeddings or proof of perceived identity. Time windows are not exact news boundaries; alignment must be checked separately." };
  await writeFile(join(root, `${label}.analysis.json`), JSON.stringify(analysis, null, 2));
  console.log(JSON.stringify({ label, seconds: analysis.seconds, requests: analysis.ttsRequests, retries: analysis.retries, f0Median: screening.features.f0Median, detected: screening.detected, warningWindows: screening.windows.filter(w => w.comparison.detected).length }));
}
