/** PCM16/24 kHz analysis only. Filters never touch delivered audio. No model or network calls. */
export type M3Cut = { start: number; end: number };
export type M3Gain = { start: number; end: number; gainDb: number; rampSamples: number };
type Frame = { start: number; end: number; rms: number; peak: number; bandRms: number; bandRatio: number; zcr: number; speech: boolean; speechEvidence: boolean; voiceBandRatio: number; digital: boolean; artifact: boolean };
export type M3SignalScan = ReturnType<typeof scanM3Signal>;
const RATE = 24000, FRAME = 480;
const db = (v: number) => 20 * Math.log10(Math.max(v, 1 / 32768 / 100));
const round = (v: number) => Math.round(v * 100) / 100;
function percentile(xs: number[], q: number) {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}
function biquad(frequency: number, q: number, highpass = false) {
  const w = 2 * Math.PI * frequency / RATE, c = Math.cos(w), alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = (highpass ? 1 + c : 1 - c) / 2 / a0;
  const b1 = (highpass ? -(1 + c) : 1 - c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - alpha) / a0;
  let z1 = 0, z2 = 0;
  return (x: number) => { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; };
}
function intervals(frames: Frame[], predicate: (f: Frame) => boolean, minSeconds = 0) {
  const result: Array<{ start: number; end: number; seconds: number }> = [];
  for (let i = 0; i < frames.length;) {
    if (!predicate(frames[i])) { i++; continue; }
    const start = frames[i].start;
    let j = i + 1;
    while (j < frames.length && predicate(frames[j])) j++;
    const end = frames[j - 1].end;
    if ((end - start) / RATE >= minSeconds) result.push({ start: start / RATE, end: end / RATE, seconds: (end - start) / RATE });
    i = j;
  }
  return result;
}

export function scanM3Signal(pcm: Uint8Array) {
  if (pcm.byteLength % 2) throw new Error("M3_PCM_ALIGNMENT");
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), count = pcm.byteLength / 2;
  const hp = biquad(80, Math.SQRT1_2, true), lp1 = biquad(3800, 0.5411961), lp2 = biquad(3800, 1.306563);
  // Independent 180–3800 Hz evidence channel. The older 80–3800 Hz passband
  // counts 50–100 Hz electrical hum as "speech" in very quiet sections.
  // This metric is diagnostic only: it never removes or fabricates samples.
  const evidenceHp = biquad(180, Math.SQRT1_2, true);
  const evidenceLp1 = biquad(3800, 0.5411961), evidenceLp2 = biquad(3800, 1.306563);
  const frames: Frame[] = [];
  let allEnergy = 0, peak = 0, previous = 0, speechSamples = 0, evidenceSamples = 0, artifactSamples = 0;
  for (let start = 0; start < count; start += FRAME) {
    const end = Math.min(count, start + FRAME), n = end - start;
    let energy = 0, bandEnergy = 0, evidenceEnergy = 0, max = 0, crossings = 0;
    for (let i = start; i < end; i++) {
      const x = view.getInt16(i * 2, true) / 32768;
      const band = lp2(lp1(hp(x)));
      const evidenceBand = evidenceLp2(evidenceLp1(evidenceHp(x)));
      energy += x * x; bandEnergy += band * band;
      evidenceEnergy += evidenceBand * evidenceBand; max = Math.max(max, Math.abs(x));
      if ((x < 0) !== (previous < 0)) crossings++;
      previous = x;
    }
    const rms = Math.sqrt(energy / n), bandRms = Math.sqrt(bandEnergy / n);
    const bandRatio = bandEnergy / Math.max(energy, 1e-20), zcr = crossings / n;
    const voiceBandRatio = evidenceEnergy / Math.max(energy, 1e-20);
    // Preserve legacy broad-band activity as a candidate signal, NOT verified
    // speaking time. A steady low-frequency hum can satisfy this predicate.
    const speech = bandRms >= 2 / 32768 && bandRatio >= 0.06 && zcr < 0.35;
    const speechEvidence = speech && Math.sqrt(evidenceEnergy / n) >= 2 / 32768 && voiceBandRatio >= 0.20;
    const digital = max <= 1 / 32768;
    const artifact = rms > 2 / 32768 && bandRatio < 0.012 && zcr > 0.35;
    frames.push({ start, end, rms, peak: max, bandRms, bandRatio, voiceBandRatio, zcr, speech, speechEvidence, digital, artifact });
    allEnergy += energy; peak = Math.max(peak, max);
    if (speech) speechSamples += n;
    if (speechEvidence) evidenceSamples += n;
    if (artifact) artifactSamples += n;
  }
  const inactive = intervals(frames, f => !f.speech);
  const highFrequency = intervals(frames, f => f.artifact, 0.5);
  const digitalSilence = intervals(frames, f => f.digital, 0.1);
  // Coarser, one-second statistics capture relative level collapses without following every syllable.
  const levels = frames.filter(f => f.speech).map(f => db(f.rms));
  const referenceDb = Math.min(-20, Math.max(-28, percentile(levels, 0.75)));
  const uncertainLow = intervals(frames, f => !f.digital && db(f.rms) < referenceDb - 30 && db(f.peak) < referenceDb - 18, 4);
  const lowFrequencyDominated = intervals(frames, f =>
    !f.digital && f.rms > 2 / 32768 && f.voiceBandRatio < 0.12 &&
    db(f.rms) < referenceDb - 12, 4);
  const lowSpeech = intervals(frames, f => f.speech && db(f.rms) < referenceDb - 14, 0.08);
  const blocks = [];
  for (let i = 0; i < frames.length; i += 50) {
    const block = frames.slice(i, i + 50), active = block.filter(f => f.speech);
    blocks.push({ start: block[0].start / RATE, end: block[block.length - 1].end / RATE,
      rmsDb: round(db(Math.sqrt(block.reduce((s, f) => s + f.rms ** 2, 0) / block.length))),
      speechFrames: active.length, speechEvidenceFrames: block.filter(f => f.speechEvidence).length,
      artifactFrames: block.filter(f => f.artifact).length,
      speechRmsDb: active.length ? round(percentile(active.map(f => db(f.rms)), 0.7)) : null });
  }
  const summary = {
    rawSeconds: round(count / RATE), sampledFrames: frames.length,
    activeSeconds: round(speechSamples / RATE), activeRatio: round(speechSamples / Math.max(1, count)),
    // These are acoustic heuristics; neither field verifies words or speaker.
    speechEvidenceSeconds: round(evidenceSamples / RATE),
    speechEvidenceRatio: round(evidenceSamples / Math.max(1, count)),
    lowFrequencyDominatedSeconds: round(lowFrequencyDominated.reduce((n, r) => n + r.seconds, 0)),
    lowFrequencyDominatedRegions: lowFrequencyDominated.slice(0, 32),
    longestInactiveSeconds: round(Math.max(0, ...inactive.map(r => r.seconds))),
    trailingInactiveSeconds: round(inactive.at(-1)?.end === count / RATE ? inactive.at(-1)!.seconds : 0),
    maxPeak: peak, meanRms: Math.sqrt(allEnergy / Math.max(1, count)), rmsDb: round(db(Math.sqrt(allEnergy / Math.max(1, count)))),
    highFrequencySeconds: round(artifactSamples / RATE), highFrequencyRegions: highFrequency.slice(0, 32),
    longestHighFrequencySeconds: round(Math.max(0, ...highFrequency.map(r => r.seconds))),
    digitalSilenceRegions: digitalSilence.filter(r => r.seconds >= 4).slice(0, 32),
    uncertainLowRegions: uncertainLow.slice(0, 32),
    lowSpeechSeconds: round(lowSpeech.reduce((s, r) => s + r.seconds, 0)), referenceDb: round(referenceDb),
    evidence: "candidate-activity-and-voice-band-evidence-only; no-transcription-or-speaker-verification",
  };
  return { frames, blocks, summary };
}

/** Only quantization-floor digital silence is automatically removable. Uncertain/noisy/quiet audio survives. */
export function planM3Repair(scan: M3SignalScan, minSilenceMs = 4000, keepMs = 680) {
  const cuts: M3Cut[] = [];
  for (const r of intervals(scan.frames, f => f.digital, minSilenceMs / 1000 + 0.02)) {
    if (r.seconds >= scan.summary.rawSeconds - 0.02) continue;
    const edge = Math.max(0.24, keepMs / 2000);
    if (r.seconds > edge * 2) cuts.push({ start: Math.round((r.start + edge) * RATE) * 2, end: Math.round((r.end - edge) * RATE) * 2 });
  }
  const gains: M3Gain[] = [];
  const frames = scan.frames;
  // Sustained low-level speech with real syllabic modulation: a constant scalar gain per region,
  // not per-frame AGC. No gain on stationary noise or on uncertain activity.
  for (let i = 0; i < scan.blocks.length;) {
    const eligible = (b: typeof scan.blocks[number]) => b.speechFrames >= 8 &&
      b.speechEvidenceFrames >= 8 && b.artifactFrames === 0 &&
      b.speechRmsDb !== null && b.speechRmsDb < scan.summary.referenceDb - 12;
    if (!eligible(scan.blocks[i])) { i++; continue; }
    let j = i + 1;
    while (j < scan.blocks.length && eligible(scan.blocks[j])) j++;
    const start = scan.blocks[i].start, end = scan.blocks[j - 1].end;
    const local = frames.slice(Math.floor(start * 50), Math.ceil(end * 50));
    const levels = local.filter(f => f.speech).map(f => db(f.rms));
    const modulation = percentile(local.map(f => db(f.rms)), 0.9) - percentile(local.map(f => db(f.rms)), 0.1);
    const bandMedian = percentile(local.filter(f => f.speech).map(f => f.bandRatio), 0.5);
    const peak = Math.max(0, ...local.map(f => f.peak));
    const gainDb = Math.min(24, scan.summary.referenceDb - percentile(levels, 0.7), db(0.85 / Math.max(peak, 1e-9)));
    if (end - start >= 1 && modulation >= 6 && bandMedian > 0.3 && percentile(levels, 0.7) > -65 && percentile(local.map(f => db(f.rms)), 0.95) < scan.summary.referenceDb - 8 && gainDb >= 3) {
      gains.push({ start: Math.round(start * RATE) * 2, end: Math.round(end * RATE) * 2, gainDb: round(gainDb), rampSamples: 2400 });
    }
    i = j;
  }
  return { cuts, gains, removedMs: cuts.reduce((s, c) => s + (c.end - c.start) / 48, 0), regions: cuts.length };
}

/** Same deterministic edit plan on Worker and phone; coordinates always reference original PCM bytes. */
export function applyM3Plan(pcm: Uint8Array, cuts: M3Cut[], gains: M3Gain[]) {
  validateM3Plan(pcm.byteLength, cuts, gains);
  const size = pcm.byteLength - cuts.reduce((s, c) => s + c.end - c.start, 0);
  if (!cuts.length && !gains.length) return pcm;
  const output = new Uint8Array(size), source = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), target = new DataView(output.buffer);
  let at = 0, cutAt = 0, gainAt = 0;
  for (let p = 0; p < pcm.length; p += 2) {
    if (cuts[cutAt] && p === cuts[cutAt].start) { p = cuts[cutAt++].end - 2; continue; }
    while (gains[gainAt] && p >= gains[gainAt].end) gainAt++;
    const g = gains[gainAt];
    let value = source.getInt16(p, true);
    if (g && p >= g.start) {
      const edge = Math.min(1, (p - g.start) / 2 / g.rampSamples, (g.end - p - 2) / 2 / g.rampSamples);
      const mix = 0.5 - 0.5 * Math.cos(Math.PI * edge);
      value = Math.round(value * (1 + (10 ** (g.gainDb / 20) - 1) * mix));
      if (value < -32768 || value > 32767) throw new Error("M3_UNSAFE_GAIN");
    }
    target.setInt16(at, value, true); at += 2;
  }
  return output;
}

export function validateM3Plan(bytes: number, cuts: M3Cut[], gains: M3Gain[]) {
  for (const list of [cuts, gains]) {
    let end = 0;
    for (const r of list) {
      if (!Number.isSafeInteger(r.start) || !Number.isSafeInteger(r.end) || r.start < end || r.end <= r.start || r.end > bytes || r.start % 2 || r.end % 2) throw new Error("M3_INVALID_EDIT_PLAN");
      end = r.end;
    }
  }
  for (const g of gains) if (!Number.isFinite(g.gainDb) || g.gainDb < 0 || g.gainDb > 24 || !Number.isSafeInteger(g.rampSamples) || g.rampSamples < 480) throw new Error("M3_INVALID_GAIN_PLAN");
}

// Incremental transport checksum, independent of SSE packet/chunk boundaries. SHA-256 is also recorded server-side.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function m3Crc32(bytes: Uint8Array, previous = 0) {
  let crc = previous ^ 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Linear scans only: a repeated-group regex over a 40 MB Base64 field can overflow V8's stack. */
export function isM3Base64(text: unknown): text is string {
  if (typeof text !== "string" || !text.length || text.length % 4 || /[^A-Za-z0-9+/=]/.test(text)) return false;
  const pad = text.indexOf("=");
  return pad < 0 || (pad >= text.length - 2 && /^={1,2}$/.test(text.slice(pad)));
}

export function unresolvedM3Low(scan: M3SignalScan, gains: M3Gain[]) {
  // A sustained 50–100 Hz hum may be loud enough to escape the old absolute
  // low-level test while remaining completely unlike speech. Fail closed.
  // Neither class is ever automatically deleted or amplified.
  const suspect = [
    ...scan.summary.uncertainLowRegions,
    ...scan.summary.lowFrequencyDominatedRegions,
  ].filter(r => !gains.some(g =>
    g.start / 48000 <= r.start + 0.12 &&
    g.end / 48000 >= r.end - 0.12 && g.gainDb >= 12,
  )).sort((a, b) => a.start - b.start);
  const merged: typeof suspect = [];
  for (const r of suspect) {
    const previous = merged[merged.length - 1];
    if (previous && r.start <= previous.end + 0.02) {
      previous.end = Math.max(previous.end, r.end);
      previous.seconds = previous.end - previous.start;
    } else merged.push({ ...r });
  }
  return merged;
}
