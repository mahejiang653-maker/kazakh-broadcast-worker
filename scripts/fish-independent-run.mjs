/** Two Drama 3 takes, reusing the saved Daulet reference without Edge generation. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const site = "https://kazakh-broadcast-worker.mahejiang653.workers.dev";
const VERSION = "fish-drama3-independent-v4-drama-only";
const directory = resolve("work/fish-drama3");
const referenceText = "Сәлем тораптастар, баршаңызға қайырлы таң. Алдімен төмендегі тораптастардың жақында белсенді қолдағанына көптен-көп рахімет. Енді өткен жиырма төрт сағат ішінде елімізде және әлемде болған маңызды жаңалықтарға бірге назар аударайық.";
// Reuse the complete, source-backed archive-news fixture already in this repository.
const text = (await readFile(new URL("../tests/fixtures/m3-real-13-news.txt", import.meta.url), "utf8")).trim();
const variants = [{ name: "Drama3_run1", model: "drama-3" }, { name: "Drama3_run2", model: "drama-3" }];
const referenceSha256 = "ebe7fff6777cb6e6a65faebc0f523cfb2490cc5ea7a0e7eece26a2ba8f06a892";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function waitForIndependentReady({ token, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), onStatus = () => {}, attempts = 12 } = {}) {
  let observation;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(site + "/api/fish-independent-status", { signal: AbortSignal.timeout(5_000), cache: "no-store" });
      const status = await response.json();
      observation = { attempt, httpStatus: response.status, version: status.version, keyConfigured: Boolean(status.keyConfigured),
        operatorRunActive: Boolean(status.operatorRunActive), operatorTokenConfigured: Boolean(status.operatorTokenConfigured),
        operatorTokenFormatValid: Boolean(status.operatorTokenFormatValid), operatorTokenSecondsRemaining: status.operatorTokenSecondsRemaining, serverTime: status.serverTime };
      if (response.ok && status.version === VERSION && status.keyConfigured && status.operatorRunActive) {
        if (!token) { onStatus(observation); return status; }
        const check = await fetcher(site + "/api/fish-independent-test", { method: "POST", headers: { "Content-Type": "application/json", "X-Fish-Test-Token": token }, body: JSON.stringify({ preflight: true }), signal: AbortSignal.timeout(5_000) });
        const auth = await check.json();
        observation.preflightHttpStatus = check.status; observation.preflightAuthorized = Boolean(auth.authorized);
        if (auth.diagnostics) observation.authorizationDiagnostics = auth.diagnostics;
        onStatus(observation);
        if (check.ok && auth.version === VERSION && auth.authorized === true) return status;
      } else onStatus(observation);
    } catch { observation = { attempt, error: "Status request failed" }; onStatus(observation); }
    if (attempt < attempts) await wait(2_000);
  }
  throw Error("Independent readiness check failed: " + JSON.stringify(observation));
}

// A local authentication rejection happens before any Fish request. Only that
// explicit, unbilled rejection can be retried; never retry a provider call.
export async function sendAuthorizedFishRequest(request, token, { fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), onAuthorization = () => {}, attempts = 5 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetcher(site + "/api/fish-independent-test", { method: "POST", headers: { "Content-Type": "application/json", "X-Fish-Test-Token": token }, body: JSON.stringify(request), signal: AbortSignal.timeout(630_000) });
    if (response.status !== 403) return response;
    const result = await response.clone().json().catch(() => ({}));
    if (result.code !== "FISH_TEST_UNAUTHORIZED") return response;
    onAuthorization({ attempt, diagnostics: result.diagnostics });
    if (attempt === attempts) return response;
    await wait(2_000);
  }
}

export function inspectWav(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") throw Error("Invalid WAV signature");
  let fmt, pcm;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString("ascii", offset, offset + 4), declared = bytes.readUInt32LE(offset + 4);
    const end = Math.min(bytes.length, offset + 8 + declared);
    if (kind === "fmt ") fmt = bytes.subarray(offset + 8, end);
    if (kind === "data") { pcm = bytes.subarray(offset + 8, end); break; }
    offset += 8 + declared + (declared % 2);
  }
  if (!fmt || fmt.length < 16 || !pcm || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 1 || fmt.readUInt16LE(14) !== 16) throw Error("Expected 16-bit mono PCM WAV");
  const sampleRate = fmt.readUInt32LE(4), samples = Math.floor(pcm.length / 2);
  let energy = 0, peak = 0, clipped = 0;
  const frame = Math.round(sampleRate * 0.02), energies = [];
  for (let start = 0; start < samples; start += frame) {
    let sum = 0;
    for (let i = start; i < Math.min(samples, start + frame); i++) {
      const raw = pcm.readInt16LE(i * 2), value = raw / 32768;
      energy += value * value; sum += value * value; peak = Math.max(peak, Math.abs(value));
      if (Math.abs(raw) >= 32760) clipped++;
    }
    energies.push(Math.sqrt(sum / Math.min(frame, samples - start)));
  }
  const silences = []; let begin = null;
  for (let i = 0; i <= energies.length; i++) {
    if (i < energies.length && energies[i] < 10 ** (-45 / 20)) begin ??= i;
    else if (begin !== null) { if ((i - begin) * 0.02 >= 1) silences.push({ start: +(begin * 0.02).toFixed(2), end: +(i * 0.02).toFixed(2), seconds: +((i - begin) * 0.02).toFixed(2) }); begin = null; }
  }
  const duration = samples / sampleRate;
  return { sampleRate, channels: 1, bitsPerSample: 16, durationSeconds: +duration.toFixed(3),
    rmsDbfs: +(20 * Math.log10(Math.sqrt(energy / samples) || 1e-10)).toFixed(2),
    peakDbfs: +(20 * Math.log10(peak || 1e-10)).toFixed(2), clippedSamples: clipped,
    silenceOver1Second: silences, sha256: hash(bytes), bytes: bytes.length };
}

async function run() {
  if (process.argv.includes("--validate-fixture")) {
    if (text.length > 8000 || referenceText.length > 1200) throw Error("Fixture too long");
    console.log(JSON.stringify({ textCharacters: text.length, referenceCharacters: referenceText.length, requests: variants.length, models: variants.map(v => v.model), textSha256: hash(text), referenceSha256, edgeReferenceRegenerated: false }));
    return;
  }
  const token = process.env.FISH_DRAMA3_RUN_TOKEN;
  if (!token) throw Error("Authorized operator run token is required");
  await mkdir(directory, { recursive: true });
  const report = { version: VERSION, startedAt: new Date().toISOString(), textCharacters: text.length,
    mode: "drama3-only", expectedVariants: variants.length, generationRequests: 0, providerTtsResponses: 0,
    textSha256: hash(text), referenceTextSha256: hash(referenceText), variants: [],
    protocol: "Two complete Drama 3 takes of the same 13-item archive-news script, using identical saved Daulet reference bytes and sampling parameters. No Edge generation, other Fish TTS model, provider retries or audio post-processing. Only explicit local authorization rejections before any provider request may be retried.",
    comparisonBaseline: { file: "original.wav", durationSeconds: 48.864, sha256: "755912db66392fa6e3c2313b5fa70150a46bdc61c1893f7bb2d672e7942a5f0d", use: "Existing original voice and fry baseline; its full transcript is unavailable, so this is not a same-text comparison." },
    subjectiveReview: "Pending listener review: Kazakh pronunciation, same-speaker identity, age/tone changes, numbering pauses and vocal fry. Signal metrics cannot settle these judgments.",
    productionDefaultsChanged: false };
  await writeFile(resolve(directory, "test_text.txt"), text);
  await writeFile(resolve(directory, "reference_text.txt"), referenceText);
  try {
    report.readiness = [];
    await waitForIndependentReady({ token, onStatus: status => { report.readiness.push(status); console.log(JSON.stringify({ event: "readiness", ...status })); } });
    const creditResponse = await sendAuthorizedFishRequest({ creditCheck: true }, token);
    const credit = await creditResponse.json().catch(() => ({}));
    report.creditCheck = { httpStatus: creditResponse.status, providerHttpStatus: credit.providerHttpStatus, hasPositiveApiCredit: typeof credit.hasPositiveApiCredit === "boolean" ? credit.hasPositiveApiCredit : null };
    console.log(JSON.stringify({ event: "api-credit-availability", ...report.creditCheck }));
    const reference = await readFile(resolve(process.env.FISH_EXISTING_REFERENCE_DIR || "work/fish-drama3-reference", "Daulet_reference.mp3"));
    if (hash(reference) !== referenceSha256) throw Error("Saved Daulet reference hash mismatch");
    const savedTranscript = await readFile(resolve(process.env.FISH_EXISTING_REFERENCE_DIR || "work/fish-drama3-reference", "reference_text.txt"), "utf8");
    if (savedTranscript !== referenceText) throw Error("Saved Daulet transcript mismatch");
    await writeFile(resolve(directory, "Daulet_reference.mp3"), reference);
    report.reference = { voice: "kk-KZ-DauletNeural", source: "Existing artifact from workflow 38808897856", regenerated: false, durationSeconds: 16.680, sha256: hash(reference), bytes: reference.length, exactTranscript: "reference_text.txt" };
    for (const variant of variants) {
      const entry = { ...variant, startedAt: new Date().toISOString(), status: "REQUESTED" };
      report.variants.push(entry);
      await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2));
      const request = { model: variant.model, text, reference: { audioBase64: reference.toString("base64"), text: referenceText } };
      const started = performance.now();
      report.generationRequests++;
      const response = await sendAuthorizedFishRequest(request, token, { onAuthorization: state => {
        entry.authorizationRejections ??= []; entry.authorizationRejections.push(state);
        console.log(JSON.stringify({ name: variant.name, event: "local-authorization-rejection", ...state }));
      } });
      entry.httpStatus = response.status;
      if (response.ok) report.providerTtsResponses++;
      if (!response.ok) {
        const error = await response.json().catch(() => ({})); entry.status = "FAILED";
        entry.errorCode = error.code || "HTTP_ERROR"; entry.upstreamStatus = error.upstreamStatus;
        if (entry.upstreamStatus) report.providerTtsResponses++;
        entry.upstreamCategory = error.upstreamCategory;
        console.log(JSON.stringify({ name: variant.name, status: entry.status, errorCode: entry.errorCode, upstreamStatus: entry.upstreamStatus, upstreamCategory: entry.upstreamCategory }));
        // A provider failure blocks remaining takes; never retry or fall back.
        for (const remaining of variants.slice(report.variants.length)) report.variants.push({ ...remaining, status: "NOT_REQUESTED_PROVIDER_BLOCKED", blockingStatus: entry.upstreamStatus || entry.httpStatus });
        break;
      }
      entry.requestedModel = response.headers.get("X-Fish-Requested-Model");
      entry.upstreamModel = response.headers.get("X-Fish-Upstream-Model");
      entry.upstreamModelIndependentlyConfirmed = Boolean(entry.upstreamModel);
      if (entry.requestedModel !== variant.model) throw Error("Request model audit failed");
      const bytes = Buffer.from(await response.arrayBuffer());
      entry.signal = inspectWav(bytes); entry.elapsedSeconds = +((performance.now() - started) / 1000).toFixed(3);
      entry.filename = variant.name + ".wav"; entry.status = "GENERATED";
      await writeFile(resolve(directory, entry.filename), bytes);
      console.log(JSON.stringify({ name: variant.name, status: entry.status, seconds: entry.signal.durationSeconds, elapsedSeconds: entry.elapsedSeconds, upstreamModelConfirmed: entry.upstreamModelIndependentlyConfirmed }));
    }
    report.complete = report.variants.length === variants.length && report.variants.every(v => v.status === "GENERATED");
    report.audioGenerationComplete = report.complete;
    if (!report.complete) process.exitCode = 1;
  } catch (error) {
    report.complete = false; report.error = error instanceof Error ? error.message : "Run failed"; process.exitCode = 1;
    console.log(JSON.stringify({ status: "FAILED", error: report.error }));
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await run();
