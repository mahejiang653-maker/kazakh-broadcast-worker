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
  static make(kind: "highpass" | "bandpass" | "peaking" | "highshelf", frequency: number, q: number, amount = 0) {
    const w = 2 * Math.PI * frequency / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = 10 ** (amount / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    if (kind === "highpass") {
      b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
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
  seams: {kind: NewsBoundary; silenceMs: number; addedMs: number}[];
};

/** Deterministic light DSP. No voice conversion, pitch shifting, noise or reverb. */
export class DauletNewsProcessor {
  private hp = Biquad.make("highpass", 55, Math.SQRT1_2);
  private eq = Biquad.make("peaking", 210, 0.8, -0.6);
  // Two overlapping detectors target the characteristic Daulet low/low-mid
  // resonance without shaving the whole voice. They only engage on sustained
  // voiced energy, so consonants, breaths and ordinary bass remain intact.
  private lowResonance = Biquad.make("bandpass", 145, 1.25);
  private throatResonance = Biquad.make("bandpass", 285, 1.10);
  private inputMeter = new LoudnessMeter();
  private outputMeter = new LoudnessMeter();
  private wideEnvelope = 0;
  private lowEnvelope = 0;
  private throatEnvelope = 0;
  private lowReduction = 0;
  private throatReduction = 0;
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
    for (let i=0; i<piece.length; i++) {
      let x = this.eq.tick(this.hp.tick(piece[i]));
      const lowBand = this.lowResonance.tick(x);
      const throatBand = this.throatResonance.tick(x);
      this.wideEnvelope = envelope*this.wideEnvelope + (1-envelope)*x*x;
      this.lowEnvelope = envelope*this.lowEnvelope + (1-envelope)*lowBand*lowBand;
      this.throatEnvelope = envelope*this.throatEnvelope + (1-envelope)*throatBand*throatBand;

      const energy = Math.max(this.wideEnvelope, 1e-12);
      const lowRatio = Math.sqrt(this.lowEnvelope / energy);
      const throatRatio = Math.sqrt(this.throatEnvelope / energy);
      const voiced = this.wideEnvelope > gain(-40)**2;

      // Stage 1 catches chesty/bubbly fundamentals; stage 2 catches the
      // low-mid "gurgle" overtone. Both are ratio-gated and capped.
      const lowTarget = voiced ? clamp((lowRatio-0.56)/0.24,0,1)*2.4 : 0;
      const throatTarget = voiced ? clamp((throatRatio-0.42)/0.24,0,1)*1.8 : 0;
      const lowSmooth = lowTarget > this.lowReduction ? lowAttack : lowRelease;
      const throatSmooth = throatTarget > this.throatReduction ? throatAttack : throatRelease;
      this.lowReduction = lowSmooth*this.lowReduction+(1-lowSmooth)*lowTarget;
      this.throatReduction = throatSmooth*this.throatReduction+(1-throatSmooth)*throatTarget;

      // Keep the combined correction conservative enough to preserve Daulet's
      // mature weight. The filters never become a broadband bass cut.
      const requested = this.lowReduction + this.throatReduction;
      const scale = requested > 3.0 ? 3.0/requested : 1;
      const lowCut = this.lowReduction*scale, throatCut = this.throatReduction*scale;
      x -= lowBand * (1-gain(-lowCut));
      x -= throatBand * (1-gain(-throatCut));
      this.maxCut = Math.max(this.maxCut, lowCut+throatCut);

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
    // Bound trimming and retain 40 ms attack / 100–160 ms release room.
    const start = Math.min(Math.max(0, first - SR*0.040), SR*1.2);
    const end = Math.max(Math.min(x.length, last + SR*(boundary === "end" ? 0.160 : 0.100)), x.length-SR*1.2);
    const leading = Math.max(0, first-start), trailing = Math.max(0, end-last);
    if (this.pieces.length) {
      const target = this.previousBoundary === "paragraph" ? 0.420 : this.previousBoundary === "clause" ? 0.160 : 0.280;
      const existing = (this.trailingSilence + leading)/SR;
      const added = Math.max(0, Math.round((target-existing)*SR));
      if (added) this.process(new Float32Array(added));
      this.seams.push({kind:this.previousBoundary, silenceMs:(existing+added/SR)*1000, addedMs:added/SR*1000});
    }
    const cut = x.slice(start,end), fade = Math.min(Math.round(SR*0.003), Math.floor(cut.length/2));
    // Fade only the outer 3 ms at quiet edges. Never crossfade spoken phonemes.
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
