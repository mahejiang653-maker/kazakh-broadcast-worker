/** Bounded, authorized comparison: one fresh Daulet reference and exactly three Fish requests. */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const site = "https://kazakh-broadcast-worker.mahejiang653.workers.dev";
const directory = resolve("work/fish-drama3");
const referenceText = "Сәлем тораптастар, баршаңызға қайырлы таң. Алдімен төмендегі тораптастардың жақында белсенді қолдағанына көптен-көп рахімет. Енді өткен жиырма төрт сағат ішінде елімізде және әлемде болған маңызды жаңалықтарға бірге назар аударайық.";
// Deliberate pronunciation/numbering fixture, not a report of today's news.
const text = "Сәлем тораптастар, баршаңызға қайырлы таң.\n\nБірінші. Бұл сөйлемде бірлескен мемлекеттер ұйымы және халықаралық жағдай деген сөздер оқылады.\n\nЕкінші. Келесі сөйлемде енергийә құрылғылары, халықтық нысаналар және адамсыз ұшақтар деген сөздер оқылады.\n\nҮшінші. Шинжиаңда, құлжа, бұратала және тәңіртәу боғда көлі деген атауларды анық айтайық.\n\nОсымен бүгінгі кескіннің барлық мазмұны айақталды. Ертең қайта кездескенше сау сәлемет болыңыздар.";
const variants = [{ name: "Drama3_run1", model: "drama-3" }, { name: "Drama3_run2", model: "drama-3" }, { name: "S21_control", model: "s2.1-pro-free" }];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

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
    if (text.length > 1200 || referenceText.length > 1200) throw Error("Fixture too long");
    console.log(JSON.stringify({ textCharacters: text.length, referenceCharacters: referenceText.length, requests: variants.length, models: variants.map(v => v.model), textSha256: hash(text) }));
    return;
  }
  const token = process.env.FISH_DRAMA3_RUN_TOKEN;
  if (!token) throw Error("Authorized operator run token is required");
  await mkdir(directory, { recursive: true });
  const report = { version: "fish-drama3-independent-v1", startedAt: new Date().toISOString(), textCharacters: text.length,
    textSha256: hash(text), referenceTextSha256: hash(referenceText), variants: [],
    protocol: "Same text, fresh Edge Daulet reference, sampling parameters and sample rate; two Drama 3 repetitions and one S2.1 Pro free-tier control. No automatic retries. No audio post-processing.",
    subjectiveReview: "Pending listener review: Kazakh pronunciation, same-speaker identity, age/tone changes, numbering pauses and vocal fry. Signal metrics cannot settle these judgments.",
    productionDefaultsChanged: false };
  await writeFile(resolve(directory, "test_text.txt"), text);
  await writeFile(resolve(directory, "reference_text.txt"), referenceText);
  try {
    const ready = await fetch(site + "/api/fish-independent-status", { signal: AbortSignal.timeout(30_000) });
    const status = await ready.json();
    if (!ready.ok || status.version !== report.version || !status.keyConfigured || !status.operatorRunActive) throw Error("Independent test deployment/readiness check failed");
    const referenceRequest = { text: referenceText, engine: "edge", voice: "kk-KZ-DauletNeural", preset: "news", speed: 1,
      edgePitch: 0, edgeVolume: 0, stability: 0.5, similarityBoost: 0.75, style: 0, speakerBoost: true };
    await writeFile(resolve(directory, "reference_request.json"), JSON.stringify(referenceRequest, null, 2));
    const referenceResponse = await fetch(site + "/api/synthesize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(referenceRequest), signal: AbortSignal.timeout(180_000) });
    if (!referenceResponse.ok || !referenceResponse.headers.get("content-type")?.startsWith("audio/")) throw Error("Edge Daulet reference generation failed (HTTP " + referenceResponse.status + ")");
    const reference = Buffer.from(await referenceResponse.arrayBuffer());
    if (reference.length < 1000 || reference.length > 2_000_000) throw Error("Invalid reference audio size");
    await writeFile(resolve(directory, "Daulet_reference.mp3"), reference);
    report.reference = { voice: "kk-KZ-DauletNeural", source: "Fresh authorized request to existing Edge endpoint", sha256: hash(reference), bytes: reference.length, exactTranscript: "reference_text.txt" };
    for (const variant of variants) {
      const entry = { ...variant, startedAt: new Date().toISOString(), status: "REQUESTED" };
      report.variants.push(entry);
      await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2));
      const request = { model: variant.model, text, reference: { audioBase64: reference.toString("base64"), text: referenceText } };
      const started = performance.now();
      const response = await fetch(site + "/api/fish-independent-test", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(request), signal: AbortSignal.timeout(150_000) });
      entry.httpStatus = response.status;
      if (!response.ok) {
        const error = await response.json().catch(() => ({})); entry.status = "FAILED";
        entry.errorCode = error.code || "HTTP_ERROR"; entry.upstreamStatus = error.upstreamStatus;
        console.log(JSON.stringify({ name: variant.name, status: entry.status, errorCode: entry.errorCode, upstreamStatus: entry.upstreamStatus }));
        // Authorization/balance/unsupported model errors require investigation, not more paid requests.
        if ([401, 402, 403, 422].includes(error.upstreamStatus) || response.status === 403) break;
        continue;
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
