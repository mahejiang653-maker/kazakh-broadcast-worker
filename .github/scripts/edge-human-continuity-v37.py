from pathlib import Path
import re

edge_path = Path('app/lib/edge-omnivoice-inspired.ts')
route_path = Path('app/api/synthesize/route.ts')
edge = edge_path.read_text()
route = route_path.read_text()

# ---------------------------------------------------------------------------
# edge-omnivoice-inspired.ts
# ---------------------------------------------------------------------------

old = '''  broadcastPreset?: "news" | "calm" | "bulletin" | "expressive";\n};'''
new = '''  broadcastPreset?: "news" | "calm" | "bulletin" | "expressive";\n  // V37: adjacent chunks contribute director context without becoming audible\n  // duplicate text. This lets a new Edge request inherit the previous acoustic\n  // movement while keeping the spoken slice lossless.\n  continuityBefore?: string;\n  continuityAfter?: string;\n  continuityBoundaryBefore?: EdgeChunkBoundaryKind;\n  continuityBoundaryAfter?: EdgeChunkBoundaryKind;\n};'''
assert old in edge, 'EdgeOmniSettings anchor missing'
edge = edge.replace(old, new, 1)

old = '''export type EdgeChunkPlan = {\n  text: string;\n  start: number;\n  end: number;\n  boundary: EdgeChunkBoundaryKind;\n  estimatedSeconds: number;\n};'''
new = '''export type EdgeChunkPlan = {\n  text: string;\n  start: number;\n  end: number;\n  boundary: EdgeChunkBoundaryKind;\n  estimatedSeconds: number;\n  // Director-only overlap. These strings are never emitted as duplicate speech.\n  contextBefore?: string;\n  contextAfter?: string;\n};'''
assert old in edge, 'EdgeChunkPlan anchor missing'
edge = edge.replace(old, new, 1)

anchor = '''/**\n * V36: lossless Edge chunk planning inspired by modern Edge-TTS segmenters.'''
assert anchor in edge, 'V36 plan comment anchor missing'
context_helpers = r'''function edgeContextTail(source: string, index: number, maxWords = 22, maxChars = 260) {
  const raw = source.slice(Math.max(0, index - maxChars * 3), index).trim();
  if (!raw) return "";
  const words = Array.from(raw.matchAll(/\S+/gu));
  let start = 0;
  if (words.length > maxWords) start = words[words.length - maxWords].index ?? 0;
  let value = raw.slice(start);
  if (value.length > maxChars) {
    value = value.slice(-maxChars);
    value = value.replace(/^\S+\s*/u, "");
  }
  return value.trim();
}

function edgeContextHead(source: string, index: number, maxWords = 18, maxChars = 220) {
  const raw = source.slice(index, Math.min(source.length, index + maxChars * 3)).trim();
  if (!raw) return "";
  const words = Array.from(raw.matchAll(/\S+/gu));
  let end = raw.length;
  if (words.length > maxWords) end = words[maxWords].index ?? raw.length;
  let value = raw.slice(0, end);
  if (value.length > maxChars) {
    value = value.slice(0, maxChars).replace(/\s+\S*$/u, "");
  }
  return value.trim();
}

function attachEdgeChunkContext(source: string, chunks: EdgeChunkPlan[]) {
  return chunks.map((chunk) => ({
    ...chunk,
    contextBefore: chunk.start > 0 ? edgeContextTail(source, chunk.start) : "",
    contextAfter: chunk.end < source.length ? edgeContextHead(source, chunk.end) : "",
  }));
}

'''
edge = edge.replace(anchor, context_helpers + anchor, 1)

old = '''  return chunks;\n}\n\nexport function splitEdgeTextByDuration'''
new = '''  return attachEdgeChunkContext(normalized, chunks);\n}\n\nexport function splitEdgeTextByDuration'''
assert old in edge, 'plan final return anchor missing'
edge = edge.replace(old, new, 1)

# Prosody inertia: preserve local intent while limiting sudden per-sentence jumps.
anchor = '''function hasNumericFocusAnchor(text: string) {'''
assert anchor in edge, 'inertia insertion anchor missing'
inertia = r'''function contextMicroSeed(
  text: string | undefined,
  deliveryMode: EdgeOmniSettings["deliveryMode"],
  fromEnd: boolean,
) {
  if (!text?.trim()) return null;
  const contextPhrases = buildPhrases(text, undefined, deliveryMode);
  if (!contextPhrases.length) return null;
  return (fromEnd ? contextPhrases[contextPhrases.length - 1] : contextPhrases[0]).micro;
}

function continuityCarryWeight(boundary: EdgeChunkBoundaryKind | PunctuationKind | undefined) {
  if (boundary === "paragraph") return 0.06;
  if (boundary === "line" || boundary === "newline") return 0.1;
  if (["sentence", "period", "question", "exclamation", "mixed", "ellipsis"].includes(boundary ?? "")) {
    return 0.16;
  }
  if (boundary === "hard" || boundary === "whitespace" || boundary === "none") return 0.31;
  if (["comma", "semicolon", "colon", "dash"].includes(boundary ?? "")) return 0.27;
  return 0.22;
}

function inertiaBlend(local: MicroProsody, carry: MicroProsody, weight: number): MicroProsody {
  const desiredRate = 1 +
    (local.rateFactor - 1) * (1 - weight) +
    (carry.rateFactor - 1) * weight;
  const desiredPitch = local.pitchDelta * (1 - weight) + carry.pitchDelta * weight;
  const desiredVolume = local.volumeDelta * (1 - weight) + carry.volumeDelta * weight;
  return {
    // The limiter is important: inertia should remove abrupt resets, never erase
    // an intentional question, contrast, climax or character cue.
    rateFactor: clamp(desiredRate, local.rateFactor - 0.0065, local.rateFactor + 0.0065),
    pitchDelta: clamp(desiredPitch, local.pitchDelta - 0.024, local.pitchDelta + 0.024),
    volumeDelta: clamp(desiredVolume, local.volumeDelta - 0.028, local.volumeDelta + 0.028),
  };
}

/**
 * V37 prosody inertia. A human presenter does not return to a neutral rate/pitch
 * at every period. We carry a small amount of the previous movement across
 * sentence boundaries, and a stronger amount across artificial chunk seams.
 * Real paragraphs remain comparatively independent.
 */
function applyProsodyInertia(phrases: Phrase[], settings: EdgeOmniSettings) {
  if (!phrases.length) return phrases;
  const beforeSeed = contextMicroSeed(settings.continuityBefore, settings.deliveryMode, true);
  let carry = beforeSeed ?? phrases[0].micro;

  const smoothed = phrases.map((phrase, index) => {
    const previous = phrases[index - 1];
    const boundary = index === 0
      ? settings.continuityBoundaryBefore
      : (previous?.layoutBoundary ?? previous?.punctuationKind);
    let weight = continuityCarryWeight(boundary);
    if (isEmphasisRole(phrase.segment?.role)) weight *= 0.58;
    if (phrase.quoteStart) weight *= 0.72;

    const micro = inertiaBlend(phrase.micro, carry, weight);
    carry = micro;
    return { ...phrase, micro };
  });

  const afterSeed = contextMicroSeed(settings.continuityAfter, settings.deliveryMode, false);
  if (afterSeed && smoothed.length) {
    const lastIndex = smoothed.length - 1;
    const last = smoothed[lastIndex];
    let weight = continuityCarryWeight(settings.continuityBoundaryAfter) * 0.42;
    if (isEmphasisRole(last.segment?.role)) weight *= 0.55;
    smoothed[lastIndex] = {
      ...last,
      micro: inertiaBlend(last.micro, afterSeed, weight),
    };
  }

  return smoothed;
}

'''
edge = edge.replace(anchor, inertia + anchor, 1)

old = '''  const phrases = annotateSemanticBoundaries(\n    annotateBroadcastCadence(\n      applyDirectQuoteContinuity(\n        applyLogicalFocusContrast(\n          bidirectionalSmooth(\n            annotateQuoteContinuity(buildPhrases(text, plan, settings.deliveryMode)),\n            settings.deliveryMode,\n          ),\n        ),\n      ),\n      settings.deliveryMode,\n    ),\n    settings.deliveryMode,\n  );'''
new = '''  const phrases = applyProsodyInertia(\n    annotateSemanticBoundaries(\n      annotateBroadcastCadence(\n        applyDirectQuoteContinuity(\n          applyLogicalFocusContrast(\n            bidirectionalSmooth(\n              annotateQuoteContinuity(buildPhrases(text, plan, settings.deliveryMode)),\n              settings.deliveryMode,\n            ),\n          ),\n        ),\n        settings.deliveryMode,\n      ),\n      settings.deliveryMode,\n    ),\n    settings,\n  );'''
assert old in edge, 'render pipeline anchor missing'
edge = edge.replace(old, new, 1)

# Breathing budget: convert long no-punctuation cadence from mostly word-count to
# estimated spoken-time debt, while keeping dependency-safe candidate selection.
old = '''  const matches = Array.from(text.matchAll(/\\S+/gu));\n  // V32: a 14+ word unpunctuated span is already long enough to require a breath\n  // check. The old 18-word gate left many medium-long sentences completely flat.\n  if (matches.length < 14) return renderNaturalText(text);\n\n  const words = matches.map((match) => ({'''
new = '''  const matches = Array.from(text.matchAll(/\\S+/gu));\n  const totalBreathSeconds = estimateEdgeSpeechSeconds(text, 1);\n  // V37: breathing is based on accumulated spoken load, not a mechanical word\n  // interval. Dense Kazakh text can need air earlier even with fewer words.\n  if (matches.length < 10 && totalBreathSeconds < 3.4) return renderNaturalText(text);\n\n  const words = matches.map((match) => ({'''
assert old in edge, 'fallback gate anchor missing'
edge = edge.replace(old, new, 1)

old = '''  const densityAdjustment = averageWordLength >= 8 ? -2 : averageWordLength <= 5.5 ? 1 : 0;\n  const baseTarget = (deliveryMode === "story" ? 15 : 14) + densityAdjustment;\n  // Let the amount of breathing scale with actual length. This can yield 1, 2,\n  // 3... breaths as needed, capped conservatively so it never becomes word-by-word.\n  const idealSpan = Math.max(11, baseTarget + 1);\n  const maxBreaths = Math.round(clamp(Math.ceil(words.length / idealSpan) - 1, 1, 6));'''
new = '''  const densityAdjustment = averageWordLength >= 8 ? -2 : averageWordLength <= 5.5 ? 1 : 0;\n  const baseTarget = (deliveryMode === "story" ? 15 : 14) + densityAdjustment;\n  const lexicalPressure = clamp((averageWordLength - 5.4) / 4.4, 0, 1);\n  const targetBreathSeconds = clamp(\n    (deliveryMode === "story" ? 4.35 : 3.85) - lexicalPressure * 0.38,\n    deliveryMode === "story" ? 3.75 : 3.35,\n    deliveryMode === "story" ? 4.45 : 3.95,\n  );\n  const timedBreaths = Math.max(0, Math.ceil(totalBreathSeconds / targetBreathSeconds) - 1);\n  const wordBreaths = words.length >= 18 ? Math.max(1, Math.ceil(words.length / Math.max(11, baseTarget + 1)) - 1) : 0;\n  // Several breaths are allowed in a truly long sentence, but never dense enough\n  // to become a robotic every-N-words pattern.\n  const maxBreaths = Math.round(clamp(Math.max(timedBreaths, wordBreaths), 0, 7));\n  if (maxBreaths <= 0) return renderNaturalText(text);'''
assert old in edge, 'breath budget anchor missing'
edge = edge.replace(old, new, 1)

old = '''        const score =\n          Math.abs(chunkWords - targetWords) +\n          dependency.score * 4.4 +\n          balancePenalty +\n          semanticBonus;'''
new = '''        const candidateSeconds = estimateEdgeSpeechSeconds(\n          text.slice(charCursor, words[index].end),\n          1,\n        );\n        const breathDebtPenalty = Math.abs(candidateSeconds - targetBreathSeconds) * 1.35;\n        const score =\n          Math.abs(chunkWords - targetWords) +\n          dependency.score * 4.4 +\n          breathDebtPenalty +\n          balancePenalty +\n          semanticBonus;'''
assert old in edge, 'candidate score anchor missing'
edge = edge.replace(old, new, 1)

old = '''    const chunkLoad = clamp((chunkWords - 9) / 11, 0, 1);\n    const lexicalLoad = clamp((averageWordLength - 5.2) / 4.3, 0, 1);\n    const dependencyRelease = clamp(1 - best.dependency, 0, 1);\n    const breath = deliveryMode === "story"\n      ? Math.round(clamp(48 + chunkLoad * 9 + lexicalLoad * 8 + dependencyRelease * 5, 50, 72))\n      : Math.round(clamp(44 + chunkLoad * 9 + lexicalLoad * 7 + dependencyRelease * 5, 46, 66));'''
new = '''    const chunkLoad = clamp((chunkWords - 9) / 11, 0, 1);\n    const lexicalLoad = clamp((averageWordLength - 5.2) / 4.3, 0, 1);\n    const dependencyRelease = clamp(1 - best.dependency, 0, 1);\n    const spokenSeconds = estimateEdgeSpeechSeconds(text.slice(charCursor, boundary), 1);\n    const breathDebt = clamp((spokenSeconds - targetBreathSeconds * 0.72) / (targetBreathSeconds * 0.55), 0, 1);\n    const breath = deliveryMode === "story"\n      ? Math.round(clamp(48 + chunkLoad * 8 + lexicalLoad * 7 + dependencyRelease * 5 + breathDebt * 8, 50, 76))\n      : Math.round(clamp(44 + chunkLoad * 8 + lexicalLoad * 6 + dependencyRelease * 5 + breathDebt * 8, 46, 70));'''
assert old in edge, 'breath duration anchor missing'
edge = edge.replace(old, new, 1)

old = '''    if (clean.length < 112 || wordCount < 18) return renderNaturalText(text);'''
new = '''    const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);\n    if (spokenLoad < 3.6 && wordCount < 12 && clean.length < 80) return renderNaturalText(text);'''
assert old in edge, 'story gate missing'
edge = edge.replace(old, new, 1)

old = '''  if (clean.length < 96 || wordCount < 15) return renderNaturalText(text);'''
new = '''  const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);\n  if (spokenLoad < 3.3 && wordCount < 11 && clean.length < 72) return renderNaturalText(text);'''
assert old in edge, 'broadcast gate missing'
edge = edge.replace(old, new, 1)

edge_path.write_text(edge)

# ---------------------------------------------------------------------------
# app/api/synthesize/route.ts
# ---------------------------------------------------------------------------

old = '''import {\n  renderEdgeOmniInspiredMarkup,\n  splitEdgeTextByDuration,\n} from "../../lib/edge-omnivoice-inspired";'''
new = '''import {\n  planEdgeTextChunks,\n  renderEdgeOmniInspiredMarkup,\n  type EdgeChunkBoundaryKind,\n} from "../../lib/edge-omnivoice-inspired";'''
assert old in route, 'route import anchor missing'
route = route.replace(old, new, 1)

old = '''function renderContinuousStoryBody(\n  sentences: EdgeEmotionPlan["sentences"],\n  baseSpeed: number,\n  basePitch: number,\n  baseVolume: number,\n  useMultilingual: boolean,\n  documentPlan?: EdgeDocumentPlan,\n) {'''
new = '''function renderContinuousStoryBody(\n  sentences: EdgeEmotionPlan["sentences"],\n  baseSpeed: number,\n  basePitch: number,\n  baseVolume: number,\n  useMultilingual: boolean,\n  documentPlan?: EdgeDocumentPlan,\n  continuityBefore = "",\n  continuityAfter = "",\n  continuityBoundaryBefore?: EdgeChunkBoundaryKind,\n  continuityBoundaryAfter?: EdgeChunkBoundaryKind,\n) {'''
assert old in route, 'story signature missing'
route = route.replace(old, new, 1)

old = '''  for (const group of groups) {\n    const totalChars = Math.max('''
new = '''  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {\n    const group = groups[groupIndex];\n    const totalChars = Math.max('''
assert old in route, 'story loop missing'
route = route.replace(old, new, 1)

old = '''        volume: localVolume,\n        deliveryMode: "story",\n      },'''
new = '''        volume: localVolume,\n        deliveryMode: "story",\n        continuityBefore: groupIndex === 0 ? continuityBefore : undefined,\n        continuityAfter: groupIndex === groups.length - 1 ? continuityAfter : undefined,\n        continuityBoundaryBefore: groupIndex === 0 ? continuityBoundaryBefore : undefined,\n        continuityBoundaryAfter: groupIndex === groups.length - 1 ? continuityBoundaryAfter : undefined,\n      },'''
assert old in route, 'story settings anchor missing'
route = route.replace(old, new, 1)

old = '''  emotionPlan: EdgeEmotionPlan,\n  documentPlan: EdgeDocumentPlan | undefined,\n  useMultilingual: boolean,\n) {'''
new = '''  emotionPlan: EdgeEmotionPlan,\n  documentPlan: EdgeDocumentPlan | undefined,\n  useMultilingual: boolean,\n  continuityBefore = "",\n  continuityAfter = "",\n  continuityBoundaryBefore?: EdgeChunkBoundaryKind,\n  continuityBoundaryAfter?: EdgeChunkBoundaryKind,\n) {'''
assert old in route, 'emotion signature missing'
route = route.replace(old, new, 1)

old = '''      useMultilingual,\n      documentPlan,\n    );'''
new = '''      useMultilingual,\n      documentPlan,\n      continuityBefore,\n      continuityAfter,\n      continuityBoundaryBefore,\n      continuityBoundaryAfter,\n    );'''
assert old in route, 'story call context anchor missing'
route = route.replace(old, new, 1)

old = '''          broadcastPreset: preset,\n        },'''
new = '''          broadcastPreset: preset,\n          continuityBefore,\n          continuityAfter,\n          continuityBoundaryBefore,\n          continuityBoundaryAfter,\n        },'''
assert old in route, 'broadcast settings context anchor missing'
route = route.replace(old, new, 1)

old = '''  documentPlan?: EdgeDocumentPlan,\n  useMultilingual = false,\n  emotionPlan: EdgeEmotionPlan | null = null,\n) {'''
new = '''  documentPlan?: EdgeDocumentPlan,\n  useMultilingual = false,\n  emotionPlan: EdgeEmotionPlan | null = null,\n  continuityBefore = "",\n  continuityAfter = "",\n  continuityBoundaryBefore?: EdgeChunkBoundaryKind,\n  continuityBoundaryAfter?: EdgeChunkBoundaryKind,\n) {'''
assert old in route, 'build ssml signature missing'
route = route.replace(old, new, 1)

old = '''      ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, documentPlan, false)'''
new = '''      ? renderEmotionDirectedBody(\n          text, settings, voice, preset, emotionPlan, documentPlan, false,\n          continuityBefore, continuityAfter, continuityBoundaryBefore, continuityBoundaryAfter,\n        )'''
assert old in route, 'native body call missing'
route = route.replace(old, new, 1)

old = '''    ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, documentPlan, true)'''
new = '''    ? renderEmotionDirectedBody(\n        text, settings, voice, preset, emotionPlan, documentPlan, true,\n        continuityBefore, continuityAfter, continuityBoundaryBefore, continuityBoundaryAfter,\n      )'''
assert old in route, 'multi body call missing'
route = route.replace(old, new, 1)

old = '''  documentPlan: EdgeDocumentPlan,\n  useMultilingual: boolean,\n  emotionPlan: EdgeEmotionPlan | null,\n) {'''
new = '''  documentPlan: EdgeDocumentPlan,\n  useMultilingual: boolean,\n  emotionPlan: EdgeEmotionPlan | null,\n  continuityBefore = "",\n  continuityAfter = "",\n  continuityBoundaryBefore?: EdgeChunkBoundaryKind,\n  continuityBoundaryAfter?: EdgeChunkBoundaryKind,\n) {'''
assert old in route, 'synthesizeEdgeChunk signature missing'
route = route.replace(old, new, 1)

old = '''      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual, emotionPlan),'''
new = '''      body: buildEdgeSsml(\n        text, voice, preset, settings, documentPlan, useMultilingual, emotionPlan,\n        continuityBefore, continuityAfter, continuityBoundaryBefore, continuityBoundaryAfter,\n      ),'''
assert old in route, 'buildEdgeSsml invocation missing'
route = route.replace(old, new, 1)

# MP3 frame-aware seam cleanup. This stays dependency-free and Cloudflare-safe.
anchor = '''async function synthesizeWithEdge(\n'''
assert anchor in route, 'synthesizeWithEdge anchor missing'
mp3_helpers = r'''type Mp3FrameInfo = {
  length: number;
  sampleRate: number;
  bitrateKbps: number;
};

function synchsafeInt(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f);
}

function mp3FrameInfo(bytes: Uint8Array, offset: number): Mp3FrameInfo | null {
  if (offset + 4 > bytes.length) return null;
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  if (versionBits === 0x01 || layerBits !== 0x01) return null; // Layer III only.
  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 0x0f || sampleRateIndex === 0x03) return null;

  const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRates = [44100, 48000, 32000];
  const isMpeg1 = versionBits === 0x03;
  const divisor = versionBits === 0x03 ? 1 : versionBits === 0x02 ? 2 : 4;
  const bitrateKbps = (isMpeg1 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex];
  const sampleRate = Math.floor(sampleRates[sampleRateIndex] / divisor);
  const padding = (b2 >> 1) & 0x01;
  const length = Math.floor((isMpeg1 ? 144000 : 72000) * bitrateKbps / sampleRate) + padding;
  if (!Number.isFinite(length) || length < 24) return null;
  return { length, sampleRate, bitrateKbps };
}

function hasAscii(bytes: Uint8Array, start: number, end: number, value: string) {
  const pattern = Array.from(value).map((char) => char.charCodeAt(0));
  const limit = Math.min(bytes.length, end) - pattern.length;
  for (let index = Math.max(0, start); index <= limit; index += 1) {
    let match = true;
    for (let cursor = 0; cursor < pattern.length; cursor += 1) {
      if (bytes[index + cursor] !== pattern[cursor]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function firstMp3Frame(bytes: Uint8Array, offset: number) {
  for (let index = offset; index + 4 <= bytes.length; index += 1) {
    const first = mp3FrameInfo(bytes, index);
    if (!first || index + first.length > bytes.length) continue;
    const nextOffset = index + first.length;
    const next = mp3FrameInfo(bytes, nextOffset);
    if (next || nextOffset >= bytes.length - 4) return { offset: index, info: first };
  }
  return null;
}

/**
 * V37 seam cleaner: Edge returns a complete MP3 file for every REST request.
 * Concatenating those files byte-for-byte can leave ID3/Xing metadata in the
 * middle of the final stream. Remove container metadata, align every piece to
 * complete MPEG frames, and drop metadata-only Xing/Info lead frames. This is
 * intentionally codec-free so the Worker keeps the existing MP3 format and
 * avoids a heavy PCM decode/re-encode dependency.
 */
function cleanEdgeMp3Chunk(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let start = 0;
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  ) {
    const flags = bytes[5];
    start = 10 + synchsafeInt(bytes, 6) + ((flags & 0x10) ? 10 : 0);
  }

  const first = firstMp3Frame(bytes, start);
  if (!first) return buffer;
  start = first.offset;

  // Xing/Info/LAME headers describe one independent request and should not sit
  // between spoken chunks in the combined stream. Their first frame is normally
  // metadata/encoder priming rather than useful speech.
  if (
    hasAscii(bytes, start, start + first.info.length, "Xing") ||
    hasAscii(bytes, start, start + first.info.length, "Info")
  ) {
    const next = start + first.info.length;
    if (mp3FrameInfo(bytes, next)) start = next;
  }

  let cursor = start;
  let lastComplete = start;
  while (cursor + 4 <= bytes.length) {
    const frame = mp3FrameInfo(bytes, cursor);
    if (!frame || cursor + frame.length > bytes.length) break;
    cursor += frame.length;
    lastComplete = cursor;
  }

  // Ignore a trailing ID3v1 TAG or any non-frame bytes after the final complete
  // audio frame. If parsing looks suspicious, preserve the original response.
  if (lastComplete <= start) return buffer;
  return bytes.slice(start, lastComplete).buffer;
}

function smoothEdgeMp3Seams(chunks: ArrayBuffer[]) {
  if (chunks.length <= 1) return chunks;
  return chunks.map((chunk) => cleanEdgeMp3Chunk(chunk));
}

'''
route = route.replace(anchor, mp3_helpers + anchor, 1)

# Replace the whole Edge orchestration so each request gets overlap context and
# the final MP3 stream is frame-cleaned. Actual audible text remains lossless.
start = route.index('async function synthesizeWithEdge(')
end = route.index('async function synthesizeWithEleven(', start)
new_edge_synth = r'''async function synthesizeWithEdge(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
) {
  const endpoint = await getEndpoint();
  const isUnifiedProfile =
    voice === "edge-unified-male" || voice === "edge-unified-female";
  const articleHasHan = hasHanCharacters(text);
  const pronunciationPreparedText =
    isUnifiedProfile || articleHasHan
      ? text
      : prepareNativeKazakhEnglishPronunciation(text);

  const spokenText = normalizeKazakhSpeechText(pronunciationPreparedText);
  const preparedText = prepareEdgeHumanText(spokenText);
  if (!preparedText) return [];

  const documentPlan = analyzeEdgeDocument(preparedText);
  const effectiveSpeed = settings.speed * PRESETS[preset].rateFactor;
  const chunkPlans = planEdgeTextChunks(
    preparedText,
    effectiveSpeed,
    EDGE_MAX_CHUNK_SIZE,
    300,
    420,
  );
  const useMultilingual = isUnifiedProfile || articleHasHan;
  const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);
  const audioChunks: ArrayBuffer[] = [];

  for (let index = 0; index < chunkPlans.length; index += 1) {
    const chunk = chunkPlans[index];
    const beforeBoundary = index > 0 ? chunkPlans[index - 1].boundary : undefined;
    try {
      audioChunks.push(
        await synthesizeEdgeChunk(
          chunk.text,
          voice,
          preset,
          settings,
          endpoint,
          documentPlan,
          useMultilingual,
          emotionPlan,
          chunk.contextBefore ?? "",
          chunk.contextAfter ?? "",
          beforeBoundary,
          chunk.boundary,
        ),
      );
      continue;
    } catch (error) {
      // Keep the continuity model even on reliability fallback. The fallback
      // plan gets its own overlap windows inside the failed chunk, while the
      // outer article context is inherited at the first/last fallback edges.
      if (chunk.text.length < 2300) throw error;
      const fallbackPlans = planEdgeTextChunks(
        chunk.text,
        effectiveSpeed,
        2100,
        78,
        145,
      );
      if (fallbackPlans.length <= 1) throw error;

      for (let fallbackIndex = 0; fallbackIndex < fallbackPlans.length; fallbackIndex += 1) {
        const fallback = fallbackPlans[fallbackIndex];
        const fallbackBeforeBoundary = fallbackIndex > 0
          ? fallbackPlans[fallbackIndex - 1].boundary
          : beforeBoundary;
        const fallbackBefore = fallback.contextBefore || chunk.contextBefore || "";
        const fallbackAfter = fallback.contextAfter || chunk.contextAfter || "";
        audioChunks.push(
          await synthesizeEdgeChunk(
            fallback.text,
            voice,
            preset,
            settings,
            endpoint,
            documentPlan,
            useMultilingual,
            emotionPlan,
            fallbackBefore,
            fallbackAfter,
            fallbackBeforeBoundary,
            fallback.boundary,
          ),
        );
      }
    }
  }

  return smoothEdgeMp3Seams(audioChunks);
}

'''
route = route[:start] + new_edge_synth + route[end:]

route_path.write_text(route)
print('V37 patch applied')
