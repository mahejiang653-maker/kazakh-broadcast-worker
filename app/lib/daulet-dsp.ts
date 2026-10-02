import type { NewsBoundary } from "./daulet-news";

export const DAULET_SAMPLE_RATE = 24000;
const SR = DAULET_SAMPLE_RATE;
const db = (x: number) => 20 * Math.log10(Math.max(1e-12, x));
const gain = (x: number) => 10 ** (x / 20);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(private b0: number, private b1: number, private b2: number, private a1: number, private a2: number) {}
  tick(x: number) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  static make(kind: "highpass" | "lowpass" | "bandpass" | "peaking" | "highshelf", frequency: number, q: number, amount = 0) {
    const w = 2 * Math.PI * frequency / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = 10 ** (amount / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    if (kind === "highpass") {
      b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
    } else if (kind === "lowpass") {
      b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
    } else if (kind === "bandpass") {
      b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
    } else if (kind === "peaking") {
      b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = b1; a2 = 1 - a / A;
    } else {
      const t = 2 * Math.sqrt(A) * a;
      b0 = A * ((A + 1) + (A - 1) * c + t); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - t);
      a0 = (A + 1) - (A - 1) * c + t; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - t;
    }
    return new Biquad(b0/a0, b1/a0, b2/a0, a1/a0, a2/a0);
  }
}

/** Low-period heuristic, not a trained creak classifier. Only controls a narrow
 * dynamic band; the audio itself is never decimated, retimed or resynthesised.
 */
class LowPulseProbe {
  private prefilter = Biquad.make("lowpass", 400, Math.SQRT1_2);
  private antialias = Biquad.make("lowpass", 400, Math.SQRT1_2);
  private ring = new Float64Array(120);
  private frame = new Float64Array(120);
  private correlation = new Float64Array(35);
  private cursor = 0;
  private count = 0;
  private decimation = 0;
  private hop = 0;
  private score = 0;
  speechFrames = 0;
  lowPulseFrames = 0;

  tick(x: number) {
    const sample = this.antialias.tick(this.prefilter.tick(x));
    if (++this.decimation < 16) return this.score;
    this.decimation = 0;
    this.ring[this.cursor] = sample;
    this.cursor = (this.cursor + 1) % this.ring.length;
    this.count = Math.min(this.count + 1, this.ring.length);
    // 80 ms window / 20 ms hop at 1.5 kHz; no extra output buffering.
    if (++this.hop < 30 || this.count < this.ring.length) return this.score;
    this.hop = 0;
    let mean = 0, energy = 0;
    for (let i=0; i<120; i++) { this.frame[i] = this.ring[(this.cursor+i)%120]; mean += this.frame[i]; }
    mean /= 120;
    for (let i=0; i<120; i++) { this.frame[i] -= mean; energy += this.frame[i]**2; }
    const level = db(Math.sqrt(energy/120));
    if (level < -50) { this.score = 0; return 0; }
    this.speechFrames++;
    for (let lag=7; lag<=34; lag++) {
      let cross = 0, left = 0, right = 0;
      for (let i=0; i<120-lag; i++) {
        const a = this.frame[i], b = this.frame[i+lag];
        cross += a*b; left += a*a; right += b*b;
      }
      this.correlation[lag] = cross / Math.sqrt(Math.max(left*right,1e-20));
    }
    let best = 0;
    for (let lag=8; lag<34; lag++) {
      const c = this.correlation[lag];
      if (c>=this.correlation[lag-1] && c>this.correlation[lag+1]) best = Math.max(best,c);
    }
    // Choose the first credible period, not a doubled/tripled period that would
    // misclassify a regular 100–160 Hz male fundamental as a low pulse.
    let period = 0;
    if (best >= 0.65) for (let lag=8; lag<34; lag++) {
      const c = this.correlation[lag];
      if (c>=Math.max(0.65,best*0.85) && c>=this.correlation[lag-1] && c>this.correlation[lag+1]) { period = lag; break; }
    }
    const pitch = period ? 1500/period : 0;
    this.score = pitch ? clamp((92-pitch)/24,0,1)*clamp((best-0.60)/0.22,0,1)*clamp((level+50)/10,0,1) : 0;
    if (this.score > 0.25) this.lowPulseFrames++;
    return this.score;
  }
}

/** BS.1770 K weighting, 400 ms blocks / 100 ms hop, absolute and relative gates. */
class LoudnessMeter {
  private shelf = Biquad.make("highshelf", 1681.974450955533, 0.7071752369554196, 4);
  private hp = Biquad.make("highpass", 38.135470876, 0.5003270373);
  private hops: number[] = [];
  private windows: number[] = [];
  private energy = 0;
  private count = 0;
  private totalEnergy = 0;
  private totalCount = 0;
  push(x: number) {
    const y = this.hp.tick(this.shelf.tick(x));
    this.energy += y*y; this.totalEnergy += y*y; this.totalCount++; this.count++;
    if (this.count === SR / 10) {
      this.hops.push(this.energy / this.count);
      if (this.hops.length > 4) this.hops.shift();
      if (this.hops.length === 4) this.windows.push(this.hops.reduce((a,b) => a+b,0)/4);
      this.energy = 0; this.count = 0;
    }
  }
  value() {
    const loud = (e: number) => -0.691 + 10 * Math.log10(Math.max(1e-16, e));
    const windows = this.windows.length ? this.windows : [this.totalEnergy / Math.max(1, this.totalCount)];
    const absolute = windows.filter(e => loud(e) > -70);
    if (!absolute.length) return -70;
    const relativeGate = loud(absolute.reduce((a,b) => a+b,0) / absolute.length) - 10;
    const gated = absolute.filter(e => loud(e) >= relativeGate);
    return loud(gated.reduce((a,b) => a+b,0) / Math.max(1,gated.length));
  }
}

function speechExtent(x: Float32Array) {
  const window = 120; // 5 ms: retain quiet consonants and release tails.
  let first = x.length, last = 0;
  const threshold = gain(-62) ** 2;
  for (let i = 0; i < x.length; i += window) {
    let sum = 0;
    const end = Math.min(i + window, x.length);
    for (let j = i; j < end; j++) sum += x[j] * x[j];
    if (sum / (end-i) > threshold) { first = Math.min(first, i); last = end; }
  }
  return {first, last};
}

export type DauletDspMetrics = {
  durationSeconds: number; inputLufs: number; processedLufs: number; gainDb: number;
  samplePeakDb: number; maxDynamicCutDb: number;
  maxLowPulseCutDb: number; maxResonanceCutDb: number;
  analyzedSpeechFrames: number; lowPulseFrames: number;
  seams: {kind: NewsBoundary; silenceMs: number; addedMs: number}[];
};

/** Deterministic light DSP. No voice conversion, pitch shifting, noise or reverb. */
export class DauletNewsProcessor {
  private hp = Biquad.make("highpass", 55, Math.SQRT1_2);
  private eq = Biquad.make("peaking", 210, 0.8, -0.6);
  private lowPulse = new LowPulseProbe();
  private pulseBand = Biquad.make("bandpass", 85, 1.1);
  // Three overlapping detectors target the characteristic Daulet low/low-mid
  // resonance without shaving the whole voice. They only engage on sustained
  // voiced energy, so consonants, breaths and ordinary bass remain intact.
  private lowResonance = Biquad.make("bandpass", 145, 1.25);
  private throatResonance = Biquad.make("bandpass", 285, 1.10);
  private upperThroatResonance = Biquad.make("bandpass", 410, 1.35);
  private inputMeter = new LoudnessMeter();
  private outputMeter = new LoudnessMeter();
  private wideEnvelope = 0;
  private lowEnvelope = 0;
  private throatEnvelope = 0;
  private upperThroatEnvelope = 0;
  private lowReduction = 0;
  private throatReduction = 0;
  private upperThroatReduction = 0;
  private pulseReduction = 0;
  private maxPulseCut = 0;
  private maxResonanceCut = 0;
  private maxCut = 0;
  private peak = 0;
  private length = 0;
  private previousBoundary: NewsBoundary = "end";
  private trailingSilence = 0;
  private pieces: Float32Array[] = [];
  private seams: DauletDspMetrics["seams"] = [];
  private finished = false;

  private process(piece: Float32Array) {
    const envelope = Math.exp(-1/(0.025*SR));
    const lowAttack = Math.exp(-1/(0.045*SR)), lowRelease = Math.exp(-1/(0.230*SR));
    const throatAttack = Math.exp(-1/(0.035*SR)), throatRelease = Math.exp(-1/(0.180*SR));
    const pulseAttack = Math.exp(-1/(0.020*SR)), pulseRelease = Math.exp(-1/(0.100*SR));
    for (let i=0; i<piece.length; i++) {
      let x = this.eq.tick(this.hp.tick(piece[i]));
      const pulseTarget = this.lowPulse.tick(x)*3.6;
      const pulseBand = this.pulseBand.tick(x);
      const lowBand = this.lowResonance.tick(x);
      const throatBand = this.throatResonance.tick(x);
      const upperThroatBand = this.upperThroatResonance.tick(x);
      this.wideEnvelope = envelope*this.wideEnvelope + (1-envelope)*x*x;
      this.lowEnvelope = envelope*this.lowEnvelope + (1-envelope)*lowBand*lowBand;
      this.throatEnvelope = envelope*this.throatEnvelope + (1-envelope)*throatBand*throatBand;
      this.upperThroatEnvelope = envelope*this.upperThroatEnvelope + (1-envelope)*upperThroatBand*upperThroatBand;

      const energy = Math.max(this.wideEnvelope, 1e-12);
      const lowRatio = Math.sqrt(this.lowEnvelope / energy);
      const throatRatio = Math.sqrt(this.throatEnvelope / energy);
      const upperThroatRatio = Math.sqrt(this.upperThroatEnvelope / energy);
      const voiced = this.wideEnvelope > gain(-40)**2;

      // Stage 1 catches chesty/bubbly fundamentals; stage 2 catches the main
      // low-mid "gurgle" overtone. Stage 3 is deliberately conditional: the
      // 410 Hz band only engages when a lower resonance is present too.
      const lowTarget = voiced ? clamp((lowRatio-0.56)/0.24,0,1)*2.4 : 0;
      const throatTarget = voiced ? clamp((throatRatio-0.42)/0.24,0,1)*1.8 : 0;
      const resonanceSignature = lowRatio > 0.56 || throatRatio > 0.44;
      const upperThroatTarget = voiced && resonanceSignature ? clamp((upperThroatRatio-0.34)/0.22,0,1)*0.75 : 0;
      const lowSmooth = lowTarget > this.lowReduction ? lowAttack : lowRelease;
      const throatSmooth = throatTarget > this.throatReduction ? throatAttack : throatRelease;
      const upperSmooth = upperThroatTarget > this.upperThroatReduction ? throatAttack : throatRelease;
      this.lowReduction = lowSmooth*this.lowReduction+(1-lowSmooth)*lowTarget;
      this.throatReduction = throatSmooth*this.throatReduction+(1-throatSmooth)*throatTarget;
      this.upperThroatReduction = upperSmooth*this.upperThroatReduction+(1-upperSmooth)*upperThroatTarget;
      const pulseSmooth = pulseTarget > this.pulseReduction ? pulseAttack : pulseRelease;
      this.pulseReduction = pulseSmooth*this.pulseReduction+(1-pulseSmooth)*pulseTarget;

      // Preserve the existing 3 dB resonance correction instead of weakening it
      // when a pulse is detected. Only low pulses can use the additional budget;
      // the sum of all four controls stays within 4.8 dB. This sum is a control
      // bound, not a claim about the composite filter's frequency response.
      const requested = this.lowReduction + this.throatReduction + this.upperThroatReduction;
      const scale = requested > 3.0 ? 3.0/requested : 1;
      const lowCut = this.lowReduction*scale, throatCut = this.throatReduction*scale, upperThroatCut = this.upperThroatReduction*scale;
      const resonanceCut = lowCut+throatCut+upperThroatCut;
      const pulseCut = Math.min(this.pulseReduction, Math.max(0,4.8-resonanceCut));
      x -= pulseBand * (1-gain(-pulseCut));
      x -= lowBand * (1-gain(-lowCut));
      x -= throatBand * (1-gain(-throatCut));
      x -= upperThroatBand * (1-gain(-upperThroatCut));
      this.maxPulseCut = Math.max(this.maxPulseCut, pulseCut);
      this.maxResonanceCut = Math.max(this.maxResonanceCut, resonanceCut);
      this.maxCut = Math.max(this.maxCut, pulseCut+resonanceCut);

      this.peak = Math.max(this.peak, Math.abs(x));
      this.outputMeter.push(x);
      piece[i] = x;
    }
    this.length += piece.length;
    this.pieces.push(piece);
  }

  addPcm(pcm: ArrayBuffer, boundary: NewsBoundary) {
    if (this.finished || pcm.byteLength % 2) throw new Error("Invalid PCM state");
    const view = new DataView(pcm), x = new Float32Array(pcm.byteLength/2);
    for (let i=0; i<x.length; i++) { x[i] = view.getInt16(i*2,true)/32768; this.inputMeter.push(x[i]); }
    const {first, last} = speechExtent(x);
    if (!last) throw new Error("语音服务返回了空白音频，请重试。");
    // Bound trimming retains a little more release on sentence/paragraph endings.
    // This preserves weak final consonants and lets the short SSML release decay.
    const start = Math.min(Math.max(0, first - SR*0.040), SR*1.2);
    const releaseRoom = boundary === "end" ? 0.200 : boundary === "paragraph" ? 0.140 : boundary === "sentence" ? 0.125 : 0.100;
    const end = Math.max(Math.min(x.length, last + SR*releaseRoom), x.length-SR*1.2);
    const leading = Math.max(0, first-start), trailing = Math.max(0, end-last);
    if (this.pieces.length) {
      const target = this.previousBoundary === "paragraph" ? 0.420 : this.previousBoundary === "clause" ? 0.160 : 0.280;
      const existing = (this.trailingSilence + leading)/SR;
      const added = Math.max(0, Math.round((target-existing)*SR));
      if (added) this.process(new Float32Array(added));
      this.seams.push({kind:this.previousBoundary, silenceMs:(existing+added/SR)*1000, addedMs:added/SR*1000});
    }
    const cut = x.slice(start,end), fade = Math.min(Math.round(SR*0.005), Math.floor(cut.length/2));
    // Fade only the outer 5 ms at quiet edges. Never crossfade spoken phonemes.
    for (let i=0;i<fade;i++) { cut[i] *= i/fade; cut[cut.length-1-i] *= i/fade; }
    this.process(cut);
    this.previousBoundary = boundary; this.trailingSilence = trailing;
  }

  finish() {
    if (this.finished || !this.pieces.length) throw new Error("没有完整音频。");
    this.finished = true;
    const before = this.outputMeter.value();
    // One gain for the entire article, capped to preserve dynamics and timbre.
    // Peak headroom also absorbs MP3 reconstruction overshoot; no hard clipping.
    const gainDb = Math.min(clamp(-22-before,-3,2), -2-db(this.peak));
    const metrics: DauletDspMetrics = {
      durationSeconds:this.length/SR, inputLufs:this.inputMeter.value(), processedLufs:before+gainDb,
      gainDb, samplePeakDb:db(this.peak)+gainDb, maxDynamicCutDb:this.maxCut, seams:this.seams,
      maxLowPulseCutDb:this.maxPulseCut, maxResonanceCutDb:this.maxResonanceCut,
      analyzedSpeechFrames:this.lowPulse.speechFrames, lowPulseFrames:this.lowPulse.lowPulseFrames,
    };
    return {pieces:this.pieces, gain:gain(gainDb), metrics};
  }
}

export function pcm16Blocks(pieces: Float32Array[], scale: number, blockSize = 1152) {
  return (function* () {
    let block = new Int16Array(blockSize), offset = 0;
    for (const piece of pieces) {
      for (const x of piece) {
        block[offset++] = Math.round(clamp(x*scale,-1,1)*32767);
        if (offset === block.length) { yield block; block = new Int16Array(blockSize); offset = 0; }
      }
    }
    if (offset) yield block.subarray(0,offset);
  })();
}
