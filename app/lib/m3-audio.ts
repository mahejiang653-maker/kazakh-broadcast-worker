/** Bounded, dependency-free acoustic screening; NOT biometric speaker verification. */
export const M3_SAMPLE_RATE = 24000;
export type M3Features = {
  seconds: number; voicedFrames: number; frames: number;
  f0Median: number; f0P10: number; f0P90: number; rmsDb: number;
  centroid: number; mfccMean: number[]; mfccStd: number[];
};
export type M3Drift = { detected: boolean; score: number; pitchSemitones: number; pitchRangeDelta: number; loudnessDb: number; centroidLogRatio: number; mfccDistance: number; reliable: boolean };
const N = 512, ANALYSIS_RATE = 8000;
const hann = Float64Array.from({ length: 320 }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 319));
const mel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
const bins = Array.from({ length: 28 }, (_, i) => Math.floor((N + 1) * hz(mel(80) + i / 27 * (mel(3800) - mel(80))) / ANALYSIS_RATE));
function quantile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}
function fftPower(samples: Float64Array) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < samples.length; i++) re[i] = samples[i] * hann[i];
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let length = 2; length <= N; length <<= 1) {
    const angle = -2 * Math.PI / length, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < N; start += length) {
      let ur = 1, ui = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = start + j, b = a + length / 2;
        const vr = re[b] * ur - im[b] * ui, vi = re[b] * ui + im[b] * ur;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        [ur, ui] = [ur * wr - ui * wi, ur * wi + ui * wr];
      }
    }
  }
  return Array.from({ length: N / 2 + 1 }, (_, i) => re[i] ** 2 + im[i] ** 2);
}
function framePitch(s: Float64Array) {
  const correlations = new Float64Array(126);
  for (let lag = 22; lag <= 124; lag++) {
    let cross = 0, a = 0, b = 0;
    for (let i = 0; i < s.length - lag; i++) { cross += s[i] * s[i + lag]; a += s[i] ** 2; b += s[i + lag] ** 2; }
    correlations[lag] = cross / Math.sqrt(a * b + 1e-20);
  }
  const peaks: number[] = [];
  for (let lag = 23; lag < 124; lag++) if (correlations[lag] > 0.70 && correlations[lag] >= correlations[lag - 1] && correlations[lag] > correlations[lag + 1]) peaks.push(lag);
  if (!peaks.length) return 0;
  const best = Math.max(...peaks.map(l => correlations[l]));
  const lag = peaks.find(l => correlations[l] >= Math.max(0.70, best * 0.93))!;
  const a = correlations[lag - 1], b = correlations[lag], c = correlations[lag + 1];
  const delta = 0.5 * (a - c) / (a - 2 * b + c || 1);
  return ANALYSIS_RATE / (lag + Math.max(-0.5, Math.min(0.5, delta)));
}
export function analyzeM3Pcm(pcm: Uint8Array, startSeconds = 0, endSeconds = pcm.byteLength / 48000): M3Features {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const total = pcm.byteLength / 2, first = Math.floor(startSeconds * 24000), end = Math.min(total, Math.floor(endSeconds * 24000));
  const frames = Math.min(240, Math.max(1, Math.floor((end - first) / 24000 * 12)));
  const f0: number[] = [], levels: number[] = [], centroids: number[] = [], mfcc: number[][] = [];
  for (let frame = 0; frame < frames; frame++) {
    const offset = first + Math.floor(frame / Math.max(1, frames - 1) * Math.max(0, end - first - 960));
    if (offset + 960 > end) continue;
    const s = new Float64Array(320);
    let mean = 0, energy = 0;
    for (let i = 0; i < 320; i++) {
      s[i] = (view.getInt16((offset + i * 3) * 2, true) + view.getInt16((offset + i * 3 + 1) * 2, true) + view.getInt16((offset + i * 3 + 2) * 2, true)) / 98304;
      mean += s[i] / 320;
    }
    for (let i = 0; i < s.length; i++) { s[i] -= mean; energy += s[i] ** 2 / 320; }
    const rms = Math.sqrt(energy);
    if (rms < 0.008) continue;
    const pitch = framePitch(s);
    if (!pitch) continue; // compare voiced phonation, not differing silence/fricative proportions
    f0.push(pitch); levels.push(20 * Math.log10(rms));
    const power = fftPower(s);
    let sum = 0, weighted = 0;
    for (let i = 1; i < power.length; i++) { sum += power[i]; weighted += power[i] * i * ANALYSIS_RATE / N; }
    centroids.push(weighted / Math.max(1e-12, sum));
    const bands = Array.from({ length: 26 }, (_, m) => {
      let value = 0;
      for (let k = bins[m]; k < bins[m + 1]; k++) value += power[k] * (k - bins[m]) / Math.max(1, bins[m + 1] - bins[m]);
      for (let k = bins[m + 1]; k < bins[m + 2]; k++) value += power[k] * (bins[m + 2] - k) / Math.max(1, bins[m + 2] - bins[m + 1]);
      return Math.log(Math.max(value, 1e-10));
    });
    mfcc.push(Array.from({ length: 12 }, (_, c) => bands.reduce((acc, v, m) => acc + v * Math.cos(Math.PI * (c + 1) * (m + 0.5) / 26), 0) * Math.sqrt(2 / 26)));
  }
  const means = Array.from({ length: 12 }, (_, c) => mfcc.reduce((a, row) => a + row[c], 0) / Math.max(1, mfcc.length));
  const stds = means.map((mean, c) => Math.sqrt(mfcc.reduce((a, row) => a + (row[c] - mean) ** 2, 0) / Math.max(1, mfcc.length)));
  return { seconds: (end - first) / 24000, voicedFrames: f0.length, frames, f0Median: quantile(f0, 0.5), f0P10: quantile(f0, 0.1), f0P90: quantile(f0, 0.9), rmsDb: quantile(levels, 0.5), centroid: quantile(centroids, 0.5), mfccMean: means, mfccStd: stds };
}
export function compareM3Voice(reference: M3Features, candidate: M3Features): M3Drift {
  const reliable = reference.voicedFrames >= 18 && candidate.voicedFrames >= 18;
  const pitchSemitones = reliable ? Math.abs(12 * Math.log2(candidate.f0Median / reference.f0Median)) : 0;
  const range = (f: M3Features) => 12 * Math.log2(Math.max(1, f.f0P90) / Math.max(1, f.f0P10));
  const pitchRangeDelta = Math.abs(range(candidate) - range(reference));
  const loudnessDb = Math.abs(candidate.rmsDb - reference.rmsDb);
  const centroidLogRatio = Math.abs(Math.log(Math.max(1, candidate.centroid) / Math.max(1, reference.centroid)));
  const mfccDistance = Math.sqrt(candidate.mfccMean.reduce((sum, v, c) => sum + ((v - reference.mfccMean[c]) / Math.max(2, reference.mfccStd[c], candidate.mfccStd[c])) ** 2, 0) / 12);
  const spectralVotes = Number(centroidLogRatio > 0.48) + Number(mfccDistance > 1.65);
  // A gain change alone is not a new speaker. Multiple independent signals are required.
  const detected = reliable && (pitchSemitones > 6 || (pitchSemitones > 3.2 && spectralVotes >= 1) || spectralVotes === 2);
  const score = reliable ? pitchSemitones / 6 + centroidLogRatio / 0.8 + mfccDistance / 2.5 + Math.min(1, loudnessDb / 12) * 0.15 : 0;
  return { detected, reliable, score, pitchSemitones, pitchRangeDelta, loudnessDb, centroidLogRatio, mfccDistance };
}
export function screenM3Take(pcm: Uint8Array, reference?: M3Features) {
  const seconds = pcm.byteLength / 48000;
  const features = analyzeM3Pcm(pcm);
  const anchor = reference ?? analyzeM3Pcm(pcm, 0, Math.min(24, seconds));
  const windows: Array<{ start: number; end: number; comparison: M3Drift }> = [];
  // Cover the WHOLE take, so one-request audio is not exempt from screening.
  for (let start = reference ? 0 : 24; start + 6 <= seconds; start += 12) {
    const end = Math.min(seconds, start + 18);
    windows.push({ start, end, comparison: compareM3Voice(anchor, analyzeM3Pcm(pcm, start, end)) });
  }
  const overall = compareM3Voice(anchor, features);
  // An isolated phonetic window is only a warning; sustained changes or whole-take shifts block.
  const sustained = windows.some((w, i) => w.comparison.detected && windows[i + 1]?.comparison.detected);
  return { features, anchor, overall, windows, detected: (Boolean(reference) && overall.detected) || sustained, score: overall.score + (sustained ? 5 : 0) };
}
/** Scalar gain only: at most 3 dB, with measured peak headroom. No pitch/EQ/resampling. */
export function matchM3Loudness(pcm: Uint8Array, referenceDb: number, candidateDb: number) {
  const desired = Math.max(-3, Math.min(3, referenceDb - candidateDb));
  if (Math.abs(desired) < 1) return 0;
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let peak = 0;
  for (let p = 0; p < pcm.length; p += 2) peak = Math.max(peak, Math.abs(view.getInt16(p, true)));
  const gain = Math.min(10 ** (desired / 20), peak ? 32700 / peak : 1);
  const db = 20 * Math.log10(gain);
  for (let p = 0; p < pcm.length; p += 2) view.setInt16(p, Math.round(view.getInt16(p, true) * gain), true);
  return db;
}
export function decodeM3Audio(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (p: number, n: number) => String.fromCharCode(...bytes.subarray(p, p + n));
  if (tag(0, 4) === "RIFF") {
    if (bytes.length < 44 || tag(8, 4) !== "WAVE" || view.getUint32(4, true) + 8 > bytes.length) throw new Error("M3_INVALID_WAV");
    let valid = false; const parts: Uint8Array[] = [];
    for (let p = 12; p + 8 <= bytes.length;) {
      const name = tag(p, 4), size = view.getUint32(p + 4, true), start = p + 8;
      if (start + size > bytes.length) throw new Error("M3_TRUNCATED_WAV");
      if (name === "fmt ") {
        valid = size >= 16 && view.getUint16(start, true) === 1 && view.getUint16(start + 2, true) === 1 && view.getUint32(start + 4, true) === 24000 && view.getUint16(start + 14, true) === 16;
        if (!valid) throw new Error("M3_AUDIO_FORMAT_MISMATCH: expected PCM16 mono 24000 Hz");
      }
      if (name === "data") parts.push(bytes.subarray(start, start + size));
      p = start + size + (size & 1);
    }
    if (!valid || parts.length !== 1 || !parts[0].length || parts[0].length % 2) throw new Error("M3_INVALID_WAV");
    return parts[0];
  }
  if (!/^audio\/(?:l16|pcm)(?:;|$)/i.test(mime) || /(?:rate|samplerate)=(?!24000(?:;|$))\d+/i.test(mime) || /channels=(?!1(?:;|$))\d+/i.test(mime) || !bytes.length || bytes.length % 2) throw new Error("M3_AUDIO_FORMAT_MISMATCH");
  return bytes;
}
export function compressM3InternalSilence(
  pcm: Uint8Array,
  minSilenceMs = 1800,
  keepMs = 500,
) {
  const frameSamples = 480; // 20 ms at 24 kHz
  const frameBytes = frameSamples * 2;
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const frameCount = Math.floor(pcm.byteLength / frameBytes);
  const silent = new Array<boolean>(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    const byteOffset = frame * frameBytes;
    let energy = 0;
    let peak = 0;
    for (let i = 0; i < frameSamples; i++) {
      const sample = Math.abs(view.getInt16(byteOffset + i * 2, true)) / 32768;
      peak = Math.max(peak, sample);
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / frameSamples);
    // Conservative digital-silence threshold: do not classify low-level speech,
    // breaths or room tone as removable silence.
    silent[frame] = rms < 0.0025 && peak < 0.012;
  }

  const minFrames = Math.ceil(minSilenceMs / 20);
  const keepFrames = Math.max(1, Math.ceil(keepMs / 20));
  const ranges: Array<{ startFrame: number; endFrame: number; removedFrames: number }> = [];

  for (let start = 0; start < frameCount;) {
    if (!silent[start]) { start += 1; continue; }
    let end = start + 1;
    while (end < frameCount && silent[end]) end += 1;
    const length = end - start;

    // Only compress internal silence. Keep leading/trailing silence untouched.
    if (start > 0 && end < frameCount && length > minFrames) {
      ranges.push({
        startFrame: start,
        endFrame: end,
        removedFrames: length - keepFrames,
      });
    }
    start = end;
  }

  if (!ranges.length) return { pcm, removedMs: 0, regions: 0 };

  const chunks: Uint8Array[] = [];
  let cursor = 0;
  let removedFrames = 0;
  for (const range of ranges) {
    const startByte = range.startFrame * frameBytes;
    const endByte = range.endFrame * frameBytes;
    const preservedFrames = Math.max(1, (range.endFrame - range.startFrame) - range.removedFrames);
    const headFrames = Math.floor(preservedFrames / 2);
    const tailFrames = preservedFrames - headFrames;
    const headEnd = startByte + headFrames * frameBytes;
    const tailStart = endByte - tailFrames * frameBytes;

    if (startByte > cursor) chunks.push(pcm.subarray(cursor, startByte));
    if (headEnd > startByte) chunks.push(pcm.subarray(startByte, headEnd));
    if (endByte > tailStart) chunks.push(pcm.subarray(tailStart, endByte));
    cursor = endByte;
    removedFrames += range.removedFrames;
  }
  if (cursor < pcm.byteLength) chunks.push(pcm.subarray(cursor));

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    pcm: output,
    removedMs: removedFrames * 20,
    regions: ranges.length,
  };
}

function edgeSilence(pcm: Uint8Array, tail: boolean) {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const frames = Math.min(Math.floor(pcm.length / 480), 50);
  let ms = 0;
  for (let f = 0; f < frames; f++) {
    const start = tail ? pcm.length - (f + 1) * 480 : f * 480;
    let energy = 0;
    for (let i = 0; i < 240; i++) energy += (view.getInt16(start + i * 2, true) / 32768) ** 2;
    if (Math.sqrt(energy / 240) > 0.004) break;
    ms += 10;
  }
  return ms;
}
export function joinM3Wav(parts: Uint8Array[]) {
  const gaps = parts.map((p, i) => i === 0 ? 0 : Math.max(0, 220 - edgeSilence(parts[i - 1], true) - edgeSilence(p, false)) * 48);
  const size = parts.reduce((sum, p, i) => sum + p.length + gaps[i], 0);
  const bytes = new Uint8Array(44 + size), view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, 36 + size, true); ascii(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, size, true);
  let offset = 44;
  parts.forEach((p, i) => { offset += gaps[i]; bytes.set(p, offset); offset += p.length; });
  return bytes;
}
