import type { EdgeDocumentPlan, EdgeDocumentRole, EdgePlannedSegment } from "./edge-director";
import { kazakhDependencyGuard } from "./edge-kazakh-dependency";

export type EdgeEmotionName =
  | "happy"
  | "angry"
  | "sad"
  | "afraid"
  | "disgusted"
  | "melancholic"
  | "surprised"
  | "calm";

export type EdgeEmotionOverride = {
  text: string;
  emotion: EdgeEmotionName;
  intensity: number;
};

export type EdgeOmniSettings = {
  speed: number;
  pitch: number;
  volume: number;
  emotionOverrides?: EdgeEmotionOverride[];
  // Native male voices can develop audible vocal-fry/creak when sentence tails
  // combine slower rate, lower pitch and lower energy. This guard is voice-specific
  // and only softens those risky closures; it does not brighten the whole voice.
  vocalFryGuard?: number;
  vocalFryBaseRate?: number;
  vocalFryBasePitch?: number;
  vocalFryBaseVolume?: number;
  fineGrainedFocus?: boolean;
  deliveryMode?: "neutral" | "broadcast" | "story";
  // V17: keep the same fluent sentence-closure mechanism across all four news
  // presets while preserving each presenter's own pause density.
  broadcastPreset?: "news" | "calm" | "bulletin" | "expressive";
  // V37: adjacent chunks contribute director context without becoming audible
  // duplicate text. This lets a new Edge request inherit the previous acoustic
  // movement while keeping the spoken slice lossless.
  continuityBefore?: string;
  continuityAfter?: string;
  continuityBoundaryBefore?: EdgeChunkBoundaryKind;
  continuityBoundaryAfter?: EdgeChunkBoundaryKind;
};

type PunctuationKind =
  | "none"
  | "comma"
  | "semicolon"
  | "colon"
  | "dash"
  | "ellipsis"
  | "period"
  | "question"
  | "exclamation"
  | "mixed"
  | "newline"
  | "paragraph";

type Token = {
  kind: "text" | "punct";
  value: string;
};

type MicroProsody = {
  rateFactor: number;
  pitchDelta: number;
  volumeDelta: number;
};

type Phrase = {
  text: string;
  punctuation: string;
  punctuationKind: PunctuationKind;
  // V30: preserve a line/paragraph break that follows terminal punctuation.
  // The terminal mark still controls intonation; this structural boundary controls
  // the larger breath before the next line/paragraph begins.
  layoutBoundary?: "newline" | "paragraph";
  segment: EdgePlannedSegment | null;
  micro: MicroProsody;
  quoted?: boolean;
  quoteStart?: boolean;
  quoteEnd?: boolean;
  directQuote?: boolean;
  reportingLead?: boolean;
  newsItemClose?: boolean;
  boundaryStrength?: number;
  vocalFryCompensation?: {
    risk: number;
    rateLift: number;
    pitchLift: number;
    volumeLift: number;
  };
};

type EdgeMarkupRenderer = (text: string) => string;

const NEUTRAL: MicroProsody = { rateFactor: 1, pitchDelta: 0, volumeDelta: 0 };

const CONTRAST_CUES = ["бірақ", "алайда", "дегенмен", "соған қарамастан", "керісінше"];
const COORDINATION_CUES = [
  "және", "әрі", "сондай-ақ", "сонымен бірге", "оған қоса", "бұған қоса",
];
const CHOICE_CUES = ["немесе", "я болмаса", "болмаса", "яки"];
const OPPOSITION_CUES = ["керісінше", "ал керісінше", "соған қарамастан"];
const RESULT_CUES = ["сондықтан", "сол себепті", "нәтижесінде", "осылайша", "демек"];
const FOCUS_CUES = [
  "ең бастысы",
  "маңыздысы",
  "әсіресе",
  "атап айтқанда",
  "назар аударайық",
  "назар аударыңыз",
  "бастысы",
];
const BREATH_CUES = new Set([
  "және",
  "әрі",
  "ал",
  "бірақ",
  "алайда",
  "дегенмен",
  "өйткені",
  "сондықтан",
  "яғни",
]);

// Conservative clause-level boundaries for long Kazakh phrases. These are
// stronger semantic connectors than simple coordination (және/әрі), so they
// are less likely to split a modifier from its head or a number from its unit.
const SOFT_SYNTAGMA_PATTERN =
  /(?<![\p{L}\p{N}])(?:бірақ|алайда|дегенмен|өйткені|сондықтан|сол себепті|нәтижесінде|осылайша|яғни|демек|керісінше|соған қарамастан)(?![\p{L}\p{N}])/giu;

const REPORTING_VERB_PATTERN =
  /(?<![\p{L}\p{N}_])(?:деді|дейді|деп|айтты|мәлімдеді|хабарлады|жазды|ескертті|түсіндірді|растады|қосты|атап өтті|said|says|stated|reported|announced|wrote|noted|added)(?![\p{L}\p{N}_])|(?:表示|称|说|指出|宣布|写道|强调|透露|回应)/iu;
const OPEN_QUOTE_CHARS = new Set(["«", "“", "„", "「", "『"]);
const CLOSE_QUOTE_CHARS = new Set(["»", "”", "」", "』"]);
const SENTENCE_TERMINAL_KINDS = new Set<PunctuationKind>([
  "period",
  "question",
  "exclamation",
  "mixed",
]);


// Broadcast item markers are discourse cues, not ordinary punctuation. When a
// presenter says "бірінші жаңалық" / "келесі жаңалық", the item label should
// receive a small reset and a short hand-off into the story that follows.
const NEWS_ITEM_CUE_PATTERN =
  /^(\s*)((?:(?:бірінші|екінші|үшінші|төртінші|бесінші|алтыншы|жетінші|сегізінші|тоғызыншы|оныншы|он\s+бірінші|он\s+екінші|он\s+үшінші|он\s+төртінші|он\s+бесінші|келесі|ендігі|тағы\s+бір)\s+жаңалы(?:қ|ғ)[\p{L}-]*|第[一二三四五六七八九十百]+(?:条|项)?新闻|(?:first|second|third|fourth|fifth|next)\s+(?:news|news\s+item)))(?![\p{L}\p{N}_])/iu;

function newsItemCueMatch(text: string) {
  return text.match(NEWS_ITEM_CUE_PATTERN);
}

function startsWithNewsItemCue(text: string) {
  return Boolean(newsItemCueMatch(text));
}

// V32: standalone ordinal labels are spoken discourse markers. When a presenter
// or narrator says "Бірінші." / "Екінші." / etc. as its own sentence, the
// following content must not crowd the label. Keep the period for native Edge
// sentence-final contour and add a deliberately larger semantic hand-off.
const STANDALONE_ORDINAL_PATTERN =
  /^(?:бірінші|екінші|үшінші|төртінші|бесінші|алтыншы|жетінші|сегізінші|тоғызыншы|оныншы|он\s+бірінші|он\s+екінші|он\s+үшінші|он\s+төртінші|он\s+бесінші|он\s+алтыншы|он\s+жетінші|он\s+сегізінші|он\s+тоғызыншы|жиырмасыншы)$/iu;

function isStandaloneOrdinalCue(text: string) {
  return STANDALONE_ORDINAL_PATTERN.test(normalize(text));
}

function scanQuoteState(value: string, initialActive = false) {
  let active = initialActive;
  let opened = false;
  let closed = false;
  let touched = initialActive;

  for (const char of value) {
    if (OPEN_QUOTE_CHARS.has(char)) {
      if (!active) opened = true;
      active = true;
      touched = true;
      continue;
    }
    if (CLOSE_QUOTE_CHARS.has(char)) {
      if (active) closed = true;
      active = false;
      touched = true;
      continue;
    }
    if (char === '"') {
      touched = true;
      if (active) {
        active = false;
        closed = true;
      } else {
        active = true;
        opened = true;
      }
    }
  }

  return { active, opened, closed, touched };
}

function isReportingText(text: string) {
  return REPORTING_VERB_PATTERN.test(normalize(text));
}

function hasOpenQuoteAtEnd(text: string) {
  return scanQuoteState(text, false).active;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function signedPercent(value: number) {
  let rounded = Math.round(value * 10) / 10;
  if (Object.is(rounded, -0)) rounded = 0;
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function speedToRate(speed: number) {
  return signedPercent((speed - 1) * 100);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\[\]【】(){}«»“”"'‘’]/gu, " ")
    .replace(/[，,；;：:—–…!?！？。.]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function startsWithCue(text: string, cues: string[]) {
  const value = normalize(text);
  return cues.some(
    (cue) => value === cue || value.startsWith(`${cue} `) || value.includes(` ${cue} `),
  );
}

function isDigit(value: string | undefined) {
  return Boolean(value && /[0-9]/u.test(value));
}

/**
 * OmniVoice estimates duration before decoding. Edge does not expose a duration
 * predictor, so we use a Kazakh-oriented phonetic weight budget. The absolute
 * number is approximate; the relative weight is what matters for chunking and
 * phrase-density compensation.
 */
function speechWeight(text: string) {
  let weight = 0;
  for (const char of text) {
    if (/\p{M}/u.test(char)) continue;
    if (/\p{N}/u.test(char)) {
      weight += 2.8;
    } else if (/\p{Script=Han}/u.test(char)) {
      // A Han character generally expands to a full spoken syllable; assign a
      // larger budget so mixed-language articles are not packed too tightly.
      weight += 2.15;
    } else if (/\s/u.test(char)) {
      weight += 0.18;
    } else if (/\p{P}|\p{S}/u.test(char)) {
      weight += 0.48;
    } else if (/[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/u.test(char)) {
      weight += 1;
    } else {
      weight += 1;
    }
  }
  return weight;
}

export function estimateEdgeSpeechSeconds(text: string, speed = 1) {
  const effectiveSpeed = clamp(speed, 0.6, 1.4);
  // Roughly 18 weighted units / second at neutral Edge broadcast pace.
  return Math.max(0.15, speechWeight(text) / (18 * effectiveSpeed));
}

export type EdgeChunkBoundaryKind =
  | "paragraph"
  | "line"
  | "sentence"
  | "whitespace"
  | "hard"
  | "end";

export type EdgeChunkPlan = {
  text: string;
  start: number;
  end: number;
  boundary: EdgeChunkBoundaryKind;
  estimatedSeconds: number;
  // Director-only overlap. These strings are never emitted as duplicate speech.
  contextBefore?: string;
  contextAfter?: string;
};

type NaturalBoundaryKind = Exclude<EdgeChunkBoundaryKind, "hard" | "end">;
type NaturalBoundary = { index: number; kind: NaturalBoundaryKind };

const EDGE_BOUNDARY_QUALITY: Record<NaturalBoundaryKind, number> = {
  paragraph: 1.15,
  line: 0.95,
  sentence: 0.85,
  whitespace: 0.15,
};

function collectEdgeNaturalBoundaries(source: string): NaturalBoundary[] {
  const definitions: Array<{ kind: NaturalBoundaryKind; regex: RegExp }> = [
    { kind: "paragraph", regex: /\n(?:[\t ]*\n)+/g },
    { kind: "line", regex: /\n/g },
    {
      kind: "sentence",
      regex: /[.!?。！？;；…]+["'”’»›》」』】）)\]]*(?=\s|$)/gu,
    },
    { kind: "whitespace", regex: /[^\S\r\n]+/gu },
  ];

  const byIndex = new Map<number, NaturalBoundaryKind>();
  for (const definition of definitions) {
    definition.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = definition.regex.exec(source)) !== null) {
      const index = match.index + match[0].length;
      if (index <= 0 || index >= source.length) continue;
      const previous = byIndex.get(index);
      if (!previous || EDGE_BOUNDARY_QUALITY[definition.kind] > EDGE_BOUNDARY_QUALITY[previous]) {
        byIndex.set(index, definition.kind);
      }
    }
  }

  return [...byIndex.entries()]
    .map(([index, kind]) => ({ index, kind }))
    .sort((a, b) => a.index - b.index);
}

function safeUtf16Cut(source: string, start: number, proposed: number) {
  let cut = Math.min(source.length, Math.max(start + 1, proposed));
  if (cut >= source.length || cut <= start) return cut;
  const previous = source.charCodeAt(cut - 1);
  const next = source.charCodeAt(cut);
  const highSurrogate = previous >= 0xd800 && previous <= 0xdbff;
  const lowSurrogate = next >= 0xdc00 && next <= 0xdfff;
  if (highSurrogate && lowSurrogate && cut - 1 > start) cut -= 1;
  return cut;
}

function durationLimitedEnd(
  source: string,
  start: number,
  hardEnd: number,
  speed: number,
  seconds: number,
) {
  if (seconds <= 0 || hardEnd <= start + 1) return hardEnd;
  if (estimateEdgeSpeechSeconds(source.slice(start, hardEnd), speed) <= seconds) {
    return hardEnd;
  }

  let low = start + 1;
  let high = hardEnd;
  let best = start + 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const duration = estimateEdgeSpeechSeconds(source.slice(start, mid), speed);
    if (duration <= seconds) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return safeUtf16Cut(source, start, best);
}

function dependencyScoreAtBoundary(source: string, start: number, boundary: number) {
  const left = source.slice(Math.max(start, boundary - 180), boundary).trim();
  const right = source.slice(boundary, Math.min(source.length, boundary + 180)).trim();
  if (!left || !right) return 0;
  return kazakhDependencyGuard(left, right).score;
}

function chooseEdgeNaturalBoundary(
  source: string,
  boundaries: NaturalBoundary[],
  start: number,
  end: number,
) {
  const span = Math.max(1, end - start);
  const minIndex = start + Math.max(32, Math.floor(span * 0.52));
  let best: { boundary: NaturalBoundary; score: number } | null = null;

  for (const boundary of boundaries) {
    if (boundary.index <= minIndex) continue;
    if (boundary.index > end) break;

    const fill = (boundary.index - start) / span;
    const dependency = boundary.kind === "whitespace"
      ? dependencyScoreAtBoundary(source, start, boundary.index)
      : 0;
    const quotePenalty = hasOpenQuoteAtEnd(source.slice(start, boundary.index)) ? 0.9 : 0;
    const dependencyPenalty = boundary.kind === "whitespace" ? dependency * 1.35 : dependency * 0.3;
    const score = fill * 2.35 + EDGE_BOUNDARY_QUALITY[boundary.kind] - quotePenalty - dependencyPenalty;

    if (!best || score > best.score) best = { boundary, score };
  }

  return best?.boundary ?? null;
}

function edgeContextTail(source: string, index: number, maxWords = 22, maxChars = 260) {
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

/**
 * V36: lossless Edge chunk planning inspired by modern Edge-TTS segmenters.
 * It never reconstructs the article from parsed sentences. Instead it slices the
 * prepared source directly so punctuation, quotes and layout survive exactly.
 * Natural seam priority is paragraph/line/sentence, then a dependency-safe word
 * boundary; a Unicode-safe hard split is used only as the final fallback.
 *
 * The returned metadata is intentionally kept separate from synthesis so a future
 * Read-Aloud/SentenceBoundary transport can reconcile observed boundaries without
 * rewriting the document/emotion/prosody layers.
 */
export function planEdgeTextChunks(
  source: string,
  speed: number,
  maxChars = 1600,
  targetSeconds = 34,
  thresholdSeconds = 52,
): EdgeChunkPlan[] {
  const normalized = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
  if (!normalized) return [];

  if (
    normalized.length <= maxChars &&
    estimateEdgeSpeechSeconds(normalized, speed) <= thresholdSeconds
  ) {
    return [{
      text: normalized,
      start: 0,
      end: normalized.length,
      boundary: "end",
      estimatedSeconds: estimateEdgeSpeechSeconds(normalized, speed),
    }];
  }

  const boundaries = collectEdgeNaturalBoundaries(normalized);
  const chunks: EdgeChunkPlan[] = [];
  let start = 0;

  while (start < normalized.length) {
    const rawHardEnd = Math.min(normalized.length, start + maxChars);
    const hardEnd = safeUtf16Cut(normalized, start, rawHardEnd);
    const allowedEnd = durationLimitedEnd(
      normalized,
      start,
      hardEnd,
      speed,
      thresholdSeconds,
    );

    if (allowedEnd >= normalized.length) {
      const value = normalized.slice(start);
      chunks.push({
        text: value,
        start,
        end: normalized.length,
        boundary: "end",
        estimatedSeconds: estimateEdgeSpeechSeconds(value, speed),
      });
      break;
    }

    const preferredSeconds = Math.min(thresholdSeconds, targetSeconds * 1.18);
    const preferredEnd = durationLimitedEnd(
      normalized,
      start,
      allowedEnd,
      speed,
      preferredSeconds,
    );

    let natural = chooseEdgeNaturalBoundary(normalized, boundaries, start, preferredEnd);
    if (!natural && preferredEnd < allowedEnd) {
      natural = chooseEdgeNaturalBoundary(normalized, boundaries, start, allowedEnd);
    }

    let end = natural?.index ?? safeUtf16Cut(normalized, start, allowedEnd);
    let boundary: EdgeChunkBoundaryKind = natural?.kind ?? "hard";

    // If the preferred window produced an unusually small chunk but there is
    // still plenty of safe room, retry across the full allowed window. This keeps
    // acoustic context long and avoids creating extra MP3 seams merely because a
    // paragraph boundary happened very early in the window.
    if (end - start < Math.min(900, Math.floor((allowedEnd - start) * 0.42))) {
      const wider = chooseEdgeNaturalBoundary(normalized, boundaries, start, allowedEnd);
      if (wider && wider.index > end) {
        end = wider.index;
        boundary = wider.kind;
      }
    }

    if (end <= start) {
      end = safeUtf16Cut(normalized, start, Math.min(normalized.length, start + maxChars));
      boundary = "hard";
    }

    const value = normalized.slice(start, end);
    chunks.push({
      text: value,
      start,
      end,
      boundary,
      estimatedSeconds: estimateEdgeSpeechSeconds(value, speed),
    });
    start = end;
  }

  // Do not leave a tiny trailing request. Merge it losslessly back into the
  // previous contiguous chunk when both character and duration budgets allow it.
  if (chunks.length >= 2) {
    const tail = chunks[chunks.length - 1];
    const previous = chunks[chunks.length - 2];
    const combinedText = `${previous.text}${tail.text}`;
    const combinedSeconds = estimateEdgeSpeechSeconds(combinedText, speed);
    if (
      tail.estimatedSeconds < 9 &&
      combinedText.length <= maxChars &&
      combinedSeconds <= thresholdSeconds
    ) {
      chunks.splice(chunks.length - 2, 2, {
        text: combinedText,
        start: previous.start,
        end: tail.end,
        boundary: tail.boundary,
        estimatedSeconds: combinedSeconds,
      });
    }
  }

  return attachEdgeChunkContext(normalized, chunks);
}

export function splitEdgeTextByDuration(
  source: string,
  speed: number,
  maxChars = 1600,
  targetSeconds = 34,
  thresholdSeconds = 52,
) {
  return planEdgeTextChunks(
    source,
    speed,
    maxChars,
    targetSeconds,
    thresholdSeconds,
  ).map((chunk) => chunk.text);
}

function tokenize(source: string) {
  const text = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\t ]+/gu, " ");
  const tokens: Token[] = [];
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    tokens.push({ kind: "text", value: buffer });
    buffer = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    const next = text[index + 1];

    if (char === "\n") {
      flush();
      let end = index + 1;
      while (text[end] === "\n") end += 1;
      tokens.push({ kind: "punct", value: text.slice(index, end) });
      index = end - 1;
      continue;
    }

    if ((char === "." || char === "," || char === ":") && isDigit(previous) && isDigit(next)) {
      buffer += char;
      continue;
    }

    if (/[.,，;；:：—–…!?！？。]/u.test(char)) {
      flush();
      let end = index + 1;
      if (/[.!?！？…—–]/u.test(char)) {
        while (text[end] === char || (/[!?！？]/u.test(char) && /[!?！？]/u.test(text[end] ?? ""))) {
          end += 1;
        }
      }
      // Closing quotes belong to the punctuation boundary acoustically. If they
      // become their own text token, Edge can create a tiny silent prosody span.
      while (/[»”"'’」』）\])}]/u.test(text[end] ?? "")) end += 1;
      tokens.push({ kind: "punct", value: text.slice(index, end) });
      index = end - 1;
      continue;
    }

    buffer += char;
  }
  flush();
  return tokens;
}

function punctuationKind(value: string): PunctuationKind {
  if (!value) return "none";
  const structural = value.replace(/[»”"'’」』）\])}]+$/gu, "");
  if (/^\n{2,}$/u.test(structural)) return "paragraph";
  if (/^\n$/u.test(structural)) return "newline";
  if (/^[，,]+$/u.test(structural)) return "comma";
  if (/^[；;]+$/u.test(structural)) return "semicolon";
  if (/^[：:]+$/u.test(structural)) return "colon";
  if (/^[—–]+$/u.test(structural)) return "dash";
  if (/^(?:…+|\.{2,})$/u.test(structural)) return "ellipsis";
  const question = /[?？]/u.test(structural);
  const exclamation = /[!！]/u.test(structural);
  if (question && exclamation) return "mixed";
  if (question) return "question";
  if (exclamation) return "exclamation";
  if (/^(?:。|\.)+$/u.test(structural)) return "period";
  return "none";
}

function segmentForFragment(text: string, plan?: EdgeDocumentPlan) {
  if (!plan?.segments.length) return null;
  const fragment = normalize(text);
  if (!fragment) return null;
  const fragmentWords = new Set(fragment.split(" ").filter((word) => word.length >= 3));
  let best: EdgePlannedSegment | null = null;
  let bestScore = -1;

  for (const segment of plan.segments) {
    let score = 0;
    if (segment.normalized.includes(fragment)) {
      score = 4 + fragment.length / Math.max(1, segment.normalized.length);
    } else if (fragment.includes(segment.normalized)) {
      score = 3.5 + segment.normalized.length / Math.max(1, fragment.length);
    } else {
      const words = segment.normalized.split(" ");
      let overlap = 0;
      for (const word of words) {
        if (word.length >= 3 && fragmentWords.has(word)) overlap += 1;
      }
      score = overlap / Math.max(3, Math.min(fragmentWords.size, words.length));
    }
    if (score > bestScore) {
      best = segment;
      bestScore = score;
    }
  }
  return bestScore >= 0.34 ? best : null;
}

function roleMicro(role: EdgeDocumentRole): MicroProsody {
  const values: Record<EdgeDocumentRole, MicroProsody> = {
    title: { rateFactor: 0.986, pitchDelta: -0.015, volumeDelta: 0.11 },
    lead: { rateFactor: 1.012, pitchDelta: 0.008, volumeDelta: 0.035 },
    body: { rateFactor: 1.002, pitchDelta: 0, volumeDelta: 0 },
    background: { rateFactor: 0.987, pitchDelta: -0.015, volumeDelta: -0.035 },
    transition: { rateFactor: 1.016, pitchDelta: 0.018, volumeDelta: 0.025 },
    key_number: { rateFactor: 0.976, pitchDelta: -0.008, volumeDelta: 0.07 },
    climax: { rateFactor: 1.009, pitchDelta: 0.028, volumeDelta: 0.11 },
    ending: { rateFactor: 0.981, pitchDelta: -0.045, volumeDelta: -0.018 },
  };
  return values[role];
}

function documentMicro(segment: EdgePlannedSegment | null, plan?: EdgeDocumentPlan) {
  if (!segment || !plan) return NEUTRAL;
  const role = roleMicro(segment.role);
  const distance = Math.abs(segment.progress - plan.climaxProgress);
  const climaxLift = Math.max(0, 1 - distance / 0.28);
  const beforeClimax = segment.progress <= plan.climaxProgress;
  const approachDistance = beforeClimax ? plan.climaxProgress - segment.progress : 1;
  const approachPush = beforeClimax ? Math.max(0, 1 - approachDistance / 0.24) : 0;
  const postClimaxDistance = segment.progress > plan.climaxProgress
    ? segment.progress - plan.climaxProgress
    : 1;
  const postClimaxSettle = segment.progress > plan.climaxProgress
    ? Math.max(0, 1 - postClimaxDistance / 0.2)
    : 0;
  const endingSettle = segment.progress > 0.84 ? (segment.progress - 0.84) / 0.16 : 0;
  const importance = 0.45 + segment.importance * 0.55;

  return {
    rateFactor: clamp(
      1 +
        (role.rateFactor - 1) * importance +
        approachPush * 0.008 -
        postClimaxSettle * 0.006 -
        endingSettle * 0.012,
      0.968,
      1.025,
    ),
    pitchDelta: clamp(
      role.pitchDelta * importance + climaxLift * 0.008 - endingSettle * 0.025,
      -0.12,
      0.1,
    ),
    volumeDelta: clamp(
      role.volumeDelta * importance + climaxLift * 0.018 - endingSettle * 0.01,
      -0.08,
      0.16,
    ),
  };
}

function localMicro(
  text: string,
  kind: PunctuationKind,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  const clean = text.trim();
  let rateFactor = 1;
  let pitchDelta = 0;
  let volumeDelta = 0;

  // Duration-density compensation inspired by OmniVoice's duration estimator.
  const density = speechWeight(clean) / Math.max(1, clean.length);
  if (density >= 1.36) rateFactor *= 0.976;
  else if (density >= 1.18) rateFactor *= 0.988;

  const words = clean.split(/\s+/u).filter(Boolean);
  const averageWordLength = words.length
    ? words.reduce((sum, word) => sum + word.length, 0) / words.length
    : 0;
  if (averageWordLength >= 8) rateFactor *= 0.992;

  // Human readers vary tempo by information structure, not only by punctuation.
  // Keep these changes small enough to feel like phrasing rather than a speed effect.
  const digitCount = (clean.match(/\d/gu) ?? []).length;
  if (digitCount >= 3) rateFactor *= 0.982;
  else if (digitCount >= 1) rateFactor *= 0.992;

  // V31: very long punctuation-free phrases carry a much higher information
  // load than ordinary clauses. Ease the local rate slightly before adding any
  // breathing so the voice does not race simply because the writer omitted marks.
  if (clean.length >= 260) rateFactor *= 0.974;
  // V32: begin the stronger long-span easing at about 90 characters instead of
  // waiting until 180. This matters most for poorly punctuated Kazakh passages.
  else if (clean.length >= 90) rateFactor *= 0.98;
  else if (clean.length <= 24 && digitCount === 0) rateFactor *= 1.012;

  // V35: only the four broadcast presets receive the richer connector cadence.
  // Story keeps the pre-V35 focus/contrast/result shaping unchanged.
  const normalizedClean = normalize(clean);
  const internalMenCoordination = /\p{L}+(?:\s+)(?:мен|бен|пен)(?:\s+)\p{L}+/iu.test(normalizedClean);
  if (deliveryMode === "broadcast") {
    if (startsWithCue(clean, FOCUS_CUES)) {
      rateFactor *= 0.99;
      volumeDelta += 0.045;
    } else if (startsWithCue(clean, OPPOSITION_CUES)) {
      // "on the contrary / despite that": slower and more marked.
      rateFactor *= 0.974;
      pitchDelta += 0.034;
      volumeDelta += 0.05;
    } else if (startsWithCue(clean, CONTRAST_CUES)) {
      // "but / however": controlled turn with modest pitch/energy lift.
      rateFactor *= 0.982;
      pitchDelta += 0.024;
      volumeDelta += 0.036;
    } else if (startsWithCue(clean, CHOICE_CUES)) {
      // "or / alternatively": slightly open/rising option contour.
      rateFactor *= 0.991;
      pitchDelta += 0.018;
      volumeDelta += 0.012;
    } else if (startsWithCue(clean, COORDINATION_CUES)) {
      // "and / also": forward continuation without a sentence restart.
      rateFactor *= 1.004;
      pitchDelta += 0.006;
      volumeDelta += 0.006;
    } else if (startsWithCue(clean, RESULT_CUES)) {
      rateFactor *= 1.009;
      volumeDelta += 0.022;
    } else if (internalMenCoordination) {
      // мен/бен/пен are treated only when structurally internal so initial Мен
      // ("I") is not falsely interpreted as a conjunction.
      rateFactor *= 0.997;
      pitchDelta += 0.004;
    }
  } else {
    if (startsWithCue(clean, FOCUS_CUES)) {
      rateFactor *= 0.99;
      volumeDelta += 0.045;
    } else if (startsWithCue(clean, CONTRAST_CUES)) {
      rateFactor *= 1.014;
      volumeDelta += 0.028;
      pitchDelta += 0.008;
    } else if (startsWithCue(clean, RESULT_CUES)) {
      rateFactor *= 1.009;
      volumeDelta += 0.022;
    }
  }

  // Semantic-first: commas and periods do not impose a contour merely because
  // they exist on the page. Their acoustic force is decided later from the
  // surrounding document context. Interrogative/exclamatory marks remain true
  // intonation instructions because they carry sentence-mode information.
  if (kind === "question") pitchDelta += 0.065;
  else if (kind === "exclamation") {
    pitchDelta += 0.038;
    volumeDelta += 0.025;
  } else if (kind === "mixed") {
    pitchDelta += 0.072;
    volumeDelta += 0.022;
  } else if (kind === "ellipsis") {
    rateFactor *= 0.995;
    pitchDelta -= 0.018;
  }

  return {
    rateFactor: clamp(rateFactor, 0.95, 1.025),
    pitchDelta: clamp(pitchDelta, -0.12, 0.12),
    volumeDelta: clamp(volumeDelta, -0.08, 0.12),
  };
}

function combine(a: MicroProsody, b: MicroProsody): MicroProsody {
  return {
    rateFactor: clamp(a.rateFactor * b.rateFactor, 0.945, 1.03),
    pitchDelta: clamp(a.pitchDelta + b.pitchDelta, -0.18, 0.18),
    volumeDelta: clamp(a.volumeDelta + b.volumeDelta, -0.12, 0.2),
  };
}

const INDEX_EMOTION_MICRO: Record<EdgeEmotionName, MicroProsody> = {
  happy: { rateFactor: 1.010, pitchDelta: 0.12, volumeDelta: 0.08 },
  angry: { rateFactor: 1.012, pitchDelta: 0.14, volumeDelta: 0.14 },
  sad: { rateFactor: 0.985, pitchDelta: -0.14, volumeDelta: -0.10 },
  afraid: { rateFactor: 0.992, pitchDelta: 0.08, volumeDelta: -0.08 },
  disgusted: { rateFactor: 0.988, pitchDelta: -0.10, volumeDelta: 0.06 },
  melancholic: { rateFactor: 0.982, pitchDelta: -0.15, volumeDelta: -0.12 },
  surprised: { rateFactor: 1.006, pitchDelta: 0.16, volumeDelta: 0.08 },
  calm: { rateFactor: 0.994, pitchDelta: -0.04, volumeDelta: -0.04 },
};

function emotionOverrideForPhrase(
  text: string,
  overrides: EdgeEmotionOverride[] | undefined,
) {
  if (!overrides?.length) return null;
  const phrase = normalize(text);
  if (!phrase) return null;

  let best: EdgeEmotionOverride | null = null;
  let bestScore = 0;

  for (const override of overrides) {
    const target = normalize(override.text);
    if (!target) continue;
    let score = 0;
    if (target === phrase) score = 4;
    else if (target.includes(phrase) && phrase.length >= 8) score = 3;
    else if (phrase.includes(target) && target.length >= 8) score = 2.8;
    else {
      const phraseWords = new Set(phrase.split(" ").filter((word) => word.length >= 3));
      const targetWords = target.split(" ").filter((word) => word.length >= 3);
      let overlap = 0;
      for (const word of targetWords) if (phraseWords.has(word)) overlap += 1;
      score = overlap / Math.max(3, Math.min(phraseWords.size, targetWords.length));
    }
    if (score > bestScore) {
      best = override;
      bestScore = score;
    }
  }

  return bestScore >= 0.46 ? best : null;
}

function emotionOverrideMicro(
  text: string,
  overrides: EdgeEmotionOverride[] | undefined,
): MicroProsody | null {
  const override = emotionOverrideForPhrase(text, overrides);
  if (!override) return null;

  // IndexTTS2.5's emo_alpha is 0..1. Mirror that interaction model while
  // translating it into deliberately small Edge SSML movements so news speech
  // stays natural and never becomes theatrical at ordinary 40-60% settings.
  const intensity = clamp(override.intensity, 0, 1);
  const target = INDEX_EMOTION_MICRO[override.emotion];
  return {
    rateFactor: 1 + (target.rateFactor - 1) * intensity,
    pitchDelta: target.pitchDelta * intensity,
    volumeDelta: target.volumeDelta * intensity,
  };
}

function buildPhrases(
  text: string,
  plan?: EdgeDocumentPlan,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
  emotionOverrides?: EdgeEmotionOverride[],
) {
  const tokens = tokenize(text);
  const phrases: Phrase[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "text" || !token.value.trim()) continue;

    const punctuationToken = tokens[index + 1];
    const punctuation = punctuationToken?.kind === "punct" ? punctuationToken.value : "";
    const kind = punctuationKind(punctuation);
    let consumed = punctuation ? 1 : 0;
    let layoutBoundary: Phrase["layoutBoundary"];

    // V30: punctuation and the following newline are separate tokenizer tokens.
    // Previously buildPhrases consumed only the punctuation token, so a source like
    // "sentence.\nnext paragraph" silently lost the line/paragraph boundary. Preserve it as
    // a structural attribute while leaving the real period/question/exclamation
    // available to Edge for sentence-final intonation.
    if (punctuation && !["newline", "paragraph"].includes(kind)) {
      let cursor = index + 2;
      while (tokens[cursor]?.kind === "text" && !tokens[cursor].value.trim()) cursor += 1;
      const layoutToken = tokens[cursor];
      if (layoutToken?.kind === "punct") {
        const detectedLayout = punctuationKind(layoutToken.value);
        if (["newline", "paragraph"].includes(detectedLayout)) {
          const completedSentence = ["period", "question", "exclamation", "mixed", "ellipsis"].includes(kind);
          // A completed sentence followed by even one explicit line break starts a
          // new spoken paragraph. Non-terminal punctuation keeps the lighter source
          // layout distinction.
          layoutBoundary = completedSentence
            ? "paragraph"
            : detectedLayout as "newline" | "paragraph";
          consumed = cursor - index;
        }
      }
    }

    const segment = segmentForFragment(token.value, plan);
    let micro = combine(localMicro(token.value, kind, deliveryMode), documentMicro(segment, plan));
    const directedEmotion = emotionOverrideMicro(token.value, emotionOverrides);
    if (directedEmotion) micro = combine(micro, directedEmotion);
    phrases.push({
      text: token.value,
      punctuation,
      punctuationKind: kind,
      layoutBoundary,
      segment,
      micro,
    });
    if (consumed) index += consumed;
  }
  return phrases;
}

function annotateQuoteContinuity(phrases: Phrase[]) {
  const annotated = phrases.map((phrase) => ({ ...phrase }));
  let active = false;
  let spanStart = -1;

  for (let index = 0; index < annotated.length; index += 1) {
    const phrase = annotated[index];
    phrase.reportingLead = phrase.punctuationKind === "colon" && isReportingText(phrase.text);

    const before = active;
    const state = scanQuoteState(`${phrase.text}${phrase.punctuation}`, active);
    active = state.active;
    phrase.quoted = before || state.opened || state.touched;
    phrase.quoteStart = state.opened;
    phrase.quoteEnd = state.closed;

    if (state.opened && spanStart < 0) spanStart = index;
    if (spanStart >= 0 && (state.closed || index === annotated.length - 1)) {
      const end = index;
      const previous = annotated[spanStart - 1];
      const following = annotated[end + 1];
      const wordCount = annotated
        .slice(spanStart, end + 1)
        .reduce((sum, item) => sum + normalize(item.text).split(" ").filter(Boolean).length, 0);
      const likelyDirectSpeech =
        Boolean(previous?.reportingLead) ||
        Boolean(following && isReportingText(following.text)) ||
        end > spanStart ||
        wordCount >= 5;

      if (likelyDirectSpeech) {
        for (let cursor = spanStart; cursor <= end; cursor += 1) {
          annotated[cursor].directQuote = true;
        }
      }
      spanStart = -1;
    }
  }

  // Kazakh also allows author words + colon + dash without quotation marks.
  // Treat the following paragraph as one quoted/reported voice turn, but keep
  // the same speaker identity and only adjust continuity, never change voice.
  for (let index = 1; index < annotated.length; index += 1) {
    if (!annotated[index - 1].reportingLead || annotated[index].directQuote) continue;
    let end = index;
    for (let cursor = index; cursor < annotated.length; cursor += 1) {
      if (cursor > index && isReportingText(annotated[cursor].text)) break;
      annotated[cursor].directQuote = true;
      if (cursor === index) annotated[cursor].quoteStart = true;
      end = cursor;
      if (["paragraph", "newline"].includes(
        annotated[cursor].layoutBoundary ?? annotated[cursor].punctuationKind,
      )) break;
      if (cursor - index >= 7) break;
    }
    annotated[end].quoteEnd = true;
    index = end;
  }

  return annotated;
}

function applyDirectQuoteContinuity(phrases: Phrase[]) {
  return phrases.map((phrase) => {
    if (!phrase.directQuote) return phrase;
    let rateFactor = phrase.micro.rateFactor;
    let pitchDelta = phrase.micro.pitchDelta;
    let volumeDelta = phrase.micro.volumeDelta;

    if (phrase.quoteStart) {
      rateFactor *= 0.999;
      volumeDelta += 0.004;
    }

    // Internal quote sentences should sound like a continued turn rather than
    // a fresh broadcast sentence. Keep punctuation audible, but reduce finality.
    if (SENTENCE_TERMINAL_KINDS.has(phrase.punctuationKind) && !phrase.quoteEnd) {
      rateFactor = 1 + (rateFactor - 1) * 0.94;
      pitchDelta *= 0.72;
      volumeDelta *= 0.97;
    }

    return {
      ...phrase,
      micro: {
        rateFactor: clamp(rateFactor, 0.95, 1.03),
        pitchDelta: clamp(pitchDelta, -0.18, 0.18),
        volumeDelta: clamp(volumeDelta, -0.12, 0.2),
      },
    };
  });
}

function blendMicros(items: Array<{ micro: MicroProsody; weight: number }>) {
  const total = items.reduce((sum, item) => sum + item.weight, 0) || 1;
  const rateDelta = items.reduce(
    (sum, item) => sum + (item.micro.rateFactor - 1) * item.weight,
    0,
  ) / total;
  const pitch = items.reduce((sum, item) => sum + item.micro.pitchDelta * item.weight, 0) / total;
  const volume = items.reduce((sum, item) => sum + item.micro.volumeDelta * item.weight, 0) / total;
  return { rateFactor: 1 + rateDelta, pitchDelta: pitch, volumeDelta: volume };
}

/**
 * Bidirectional smoothing is the closest SSML-side analogue to OmniVoice's
 * bidirectional acoustic-token refinement: each phrase is influenced by both
 * the phrase before it and the phrase after it, rather than only by history.
 */
function bidirectionalSmooth(
  phrases: Phrase[],
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  return phrases.map((phrase, index) => {
    const previous = phrases[index - 1];
    const next = phrases[index + 1];
    const sentenceTerminals = new Set<PunctuationKind>([
      "period",
      "question",
      "exclamation",
      "mixed",
      "ellipsis",
    ]);
    // V17: broadcast adopts V16's sentence-isolation principle too. We still keep
    // long prosody groups, but pitch/rate smoothing must not leak through a true
    // sentence ending and make the previous sentence lean into the next one.
    const isolateSentenceClosure = deliveryMode === "story" || deliveryMode === "broadcast";
    const hardBefore = Boolean(
      previous &&
      (["paragraph", "newline"].includes(previous.punctuationKind) ||
        (isolateSentenceClosure && sentenceTerminals.has(previous.punctuationKind))),
    );
    const hardAfter =
      ["paragraph", "newline"].includes(phrase.punctuationKind) ||
      (isolateSentenceClosure && sentenceTerminals.has(phrase.punctuationKind));
    const items: Array<{ micro: MicroProsody; weight: number }> = [
      { micro: phrase.micro, weight: hardBefore || hardAfter ? 0.8 : 0.52 },
    ];
    if (previous && !hardBefore) items.push({ micro: previous.micro, weight: 0.24 });
    if (next && !hardAfter) items.push({ micro: next.micro, weight: 0.24 });
    const blended = blendMicros(items);
    // Preserve most local tempo contrast while smoothing pitch/volume more strongly.
    // This avoids the previous "one flat speed for the whole paragraph" effect.
    const localRateWeight = hardBefore || hardAfter ? 0.88 : 0.72;
    const rateFactor =
      1 +
      (phrase.micro.rateFactor - 1) * localRateWeight +
      (blended.rateFactor - 1) * (1 - localRateWeight);
    return {
      ...phrase,
      micro: {
        rateFactor: clamp(rateFactor, 0.95, 1.03),
        pitchDelta: blended.pitchDelta,
        volumeDelta: blended.volumeDelta,
      },
    };
  });
}

function contextMicroSeed(
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
  if (boundary === "paragraph") return 0.05;
  if (boundary === "line" || boundary === "newline") return 0.08;
  if (["sentence", "period", "question", "exclamation", "mixed", "ellipsis"].includes(boundary ?? "")) {
    return 0.21;
  }
  // V38: technical seams need the strongest carry because Edge starts a fresh
  // acoustic request there. Real discourse boundaries remain much more independent.
  if (boundary === "hard" || boundary === "whitespace" || boundary === "none") return 0.38;
  if (["comma", "semicolon", "colon", "dash"].includes(boundary ?? "")) return 0.29;
  return 0.25;
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
    rateFactor: clamp(desiredRate, local.rateFactor - 0.008, local.rateFactor + 0.008),
    pitchDelta: clamp(desiredPitch, local.pitchDelta - 0.03, local.pitchDelta + 0.03),
    volumeDelta: clamp(desiredVolume, local.volumeDelta - 0.034, local.volumeDelta + 0.034),
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
    let weight = continuityCarryWeight(settings.continuityBoundaryAfter) * 0.55;
    if (isEmphasisRole(last.segment?.role)) weight *= 0.55;
    smoothed[lastIndex] = {
      ...last,
      micro: inertiaBlend(last.micro, afterSeed, weight),
    };
  }

  return smoothed;
}

function hasNumericFocusAnchor(text: string) {
  const value = normalize(text);
  return /(?:\d|пайыз|процент|мың|миллион|миллиард|триллион|теңге|доллар|еуро|юань|адам|километр|метр|тонна|килограмм|гектар|градус|мегаватт|гигаватт|киловатт|гигабайт|терабайт|герц)/u.test(value);
}

const NEGATIVE_WORD_PATTERN =
  /(?:^|\s)(?:емес|жоқ|мүмкін емес|орын алған жоқ|расталған жоқ|анықталған жоқ)(?:\s|$)|(?:不是|并非|没有|不会|不能|尚未|未曾)|(?:^|\s)(?:not|never|no longer)(?:\s|$)/iu;
const NEGATIVE_SUFFIX_PATTERN =
  /[\p{L}]{2,}(?:майды|мейді|байды|бейді|пайды|пейді|мады|меді|бады|беді|пады|педі|маған|меген|баған|беген|паған|пеген|мас|мес|бас|бес|пас|пес)(?![\p{L}\p{N}])/iu;
const EXCLUSIVE_FOCUS_PATTERN =
  /(?:^|\s)(?:тек қана|тек|небәрі|бар болғаны|ғана|қана)(?:\s|$)|(?:仅|仅仅|只|只有)|(?:^|\s)only(?:\s|$)/iu;
const CORRECTION_FOCUS_PATTERN =
  /(?:^|\s)(?:керісінше|шын мәнінде|дұрысы|қайта)(?:\s|$)|(?:而是|相反|实际上|反而)|(?:^|\s)(?:rather|instead)(?:\s|$)/iu;
const ENTITY_ROLE_PATTERN =
  /(?:министрлігі|үкіметі|комитеті|мекемесі|агенттігі|әкімдігі|парламенті|президенті|төрағасы|армиясы|соты|полициясы|компаниясы|министр|президент|төраға|政府|公司|集团|委员会|法院|军方|总统|主席|部长)/iu;
const ENTITY_NAME_PATTERN =
  /(?:^|\s)(?:[A-ZА-ЯӘҒҚҢӨҰҮҺІ][\p{L}'’.-]{2,})(?:\s+[A-ZА-ЯӘҒҚҢӨҰҮҺІ][\p{L}'’.-]{2,})+(?=\s|[,，]|$)/u;
const ACTION_FOCUS_CUES = [
  "мәлімдеді", "хабарлады", "растады", "жариялады", "бекітті", "қабылдады",
  "қол қойды", "іске қосты", "бастады", "тоқтатты", "жіберді", "аттандырды",
  "жетті", "қаза тапты", "жараланды", "宣布", "表示", "证实", "公布", "批准",
  "通过", "签署", "启动", "开始", "停止", "发射", "抵达", "袭击", "击中", "死亡",
  "受伤", "announced", "confirmed", "signed", "approved", "launched", "started", "stopped",
];

function negationFocusStrength(phrase: Phrase) {
  const value = normalize(phrase.text);
  let strength = NEGATIVE_WORD_PATTERN.test(value)
    ? 0.56
    : NEGATIVE_SUFFIX_PATTERN.test(value)
      ? 0.42
      : 0;
  // Confirmation questions such as "емес пе?" should not sound like a denial.
  if (phrase.punctuationKind === "question") strength *= 0.55;
  return strength;
}

function hasEntityActionAnchor(text: string) {
  const normalized = normalize(text);
  const hasEntity = ENTITY_ROLE_PATTERN.test(text) || ENTITY_NAME_PATTERN.test(text);
  const hasAction = ACTION_FOCUS_CUES.some((cue) => normalized.includes(cue));
  return hasEntity && hasAction;
}

function logicalFocusScore(phrase: Phrase) {
  const role = phrase.segment?.role;
  let score = 0;

  // A sentence can be classified as key_number because of one figure. Only the
  // phrase that actually carries a numeric/unit anchor gets strong prominence.
  if (role === "key_number") score += hasNumericFocusAnchor(phrase.text) ? 0.95 : 0.18;
  else if (role === "climax") score += 0.62;
  else if (role === "title") score += 0.3;

  score += negationFocusStrength(phrase);
  if (EXCLUSIVE_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.34;
  if (CORRECTION_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.46;
  if (role !== "background" && hasEntityActionAnchor(phrase.text)) score += role === "lead" ? 0.28 : 0.2;

  const novelty = phrase.segment?.noveltyScore ?? 0;
  const repetition = phrase.segment?.repetitionScore ?? 0;
  if (role !== "background" && novelty >= 0.55) score += 0.12 * novelty;
  if (role === "background" && repetition >= 0.55) score -= 0.1 * repetition;

  if (startsWithCue(phrase.text, FOCUS_CUES)) score += 0.62;
  if (startsWithCue(phrase.text, RESULT_CUES)) score += 0.24;
  if ((phrase.segment?.importance ?? 0) >= 0.78) score += 0.18;

  return clamp(score, 0, 1);
}

function applyLogicalFocusContrast(phrases: Phrase[]) {
  const sentenceTerminal = new Set<PunctuationKind>([
    "period",
    "question",
    "exclamation",
    "mixed",
    "paragraph",
    "newline",
  ]);

  return phrases.map((phrase, index) => {
    const score = logicalFocusScore(phrase);
    const next = phrases[index + 1];
    const nextScore = next ? logicalFocusScore(next) : 0;
    let rateFactor = phrase.micro.rateFactor;
    let pitchDelta = phrase.micro.pitchDelta;
    let volumeDelta = phrase.micro.volumeDelta;
    const novelty = phrase.segment?.noveltyScore ?? 0;
    const repetition = phrase.segment?.repetitionScore ?? 0;

    // Discourse memory is much weaker than explicit focus. It gently lifts new
    // material and relaxes highly repeated recap material without assuming that
    // every repeated mention must be deaccented.
    if (phrase.segment?.role !== "background" && novelty >= 0.55) {
      rateFactor *= 1 - 0.0028 * novelty;
      volumeDelta += 0.008 * novelty;
    }
    if (phrase.segment?.role === "background" && repetition >= 0.55) {
      rateFactor *= 1 + 0.0022 * repetition;
      volumeDelta -= 0.006 * repetition;
    }

    // Kazakh logical prominence is phrase-based. At sentence-final focus we rely
    // on duration + dynamics; non-final focus may receive only a tiny pitch cue.
    if (score >= 0.45) {
      rateFactor *= 1 - 0.006 * score;
      volumeDelta += 0.018 * score;
      if (!sentenceTerminal.has(phrase.punctuationKind)) pitchDelta += 0.006 * score;
    }

    // Human emphasis is relative: slightly release the setup phrase before a
    // strong focus target instead of making the target unnaturally loud.
    if (nextScore >= 0.65 && !sentenceTerminal.has(phrase.punctuationKind)) {
      rateFactor *= 1 + 0.003 * nextScore;
      volumeDelta -= 0.006 * nextScore;
    }

    return {
      ...phrase,
      micro: {
        rateFactor: clamp(rateFactor, 0.95, 1.03),
        pitchDelta: clamp(pitchDelta, -0.18, 0.18),
        volumeDelta: clamp(volumeDelta, -0.12, 0.2),
      },
    };
  });
}

const CONTINUATION_STARTERS = [
  "және", "әрі", "сондай-ақ", "сонымен бірге", "оған қоса", "бұған қоса",
  "немесе", "я болмаса", "болмаса", "яки",
  "осы ретте", "бұл ретте", "осы кезде", "бұл кезде", "сонымен", "тағы да",
  "此外", "同时", "另外", "与此同时", "其中", "对此", "因此",
  "and", "also", "meanwhile", "additionally", "furthermore", "therefore",
];

const STRONG_BOUNDARY_STARTERS = [
  ...CONTRAST_CUES,
  ...RESULT_CUES,
  ...FOCUS_CUES,
  "ал енді", "енді", "ақырында", "қорытындылай келе", "қорыта айтқанда",
  "不过", "但是", "然而", "因此", "所以", "最终", "总之", "最重要的是",
  "however", "but", "therefore", "finally", "in conclusion", "most importantly",
];

function baseBoundaryStrength(kind: PunctuationKind) {
  switch (kind) {
    case "paragraph": return 0.88;
    case "newline": return 0.42;
    case "period": return 0.56;
    case "question": return 0.58;
    case "exclamation": return 0.68;
    case "mixed": return 0.72;
    case "semicolon": return 0.42;
    case "colon": return 0.32;
    case "dash": return 0.24;
    case "ellipsis": return 0.48;
    case "comma": return 0.18;
    default: return 0;
  }
}

function semanticBoundaryStrength(
  current: Phrase,
  next?: Phrase,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  // V30: when terminal punctuation is followed by a source line break, use the
  // structural boundary for pause strength while preserving punctuationKind for
  // native Edge intonation in acousticPunctuation.
  const kind = current.layoutBoundary ?? current.punctuationKind;
  let strength = Math.max(
    baseBoundaryStrength(current.punctuationKind),
    current.layoutBoundary ? baseBoundaryStrength(current.layoutBoundary) : 0,
  );

  // The end of the whole synthesis span is a real discourse boundary even when
  // the writer used weak punctuation.
  if (!next) {
    if (["period", "paragraph", "exclamation", "mixed"].includes(kind)) {
      return clamp(Math.max(strength, 0.78), 0, 1);
    }
    if (kind === "question") return clamp(Math.max(strength, 0.66), 0, 1);
    return clamp(strength, 0, 1);
  }

  const sameSegment = Boolean(
    current.segment && next.segment && current.segment.index === next.segment.index,
  );
  const sameRole = Boolean(
    current.segment && next.segment && current.segment.role === next.segment.role,
  );
  const roleChanged = Boolean(
    current.segment && next.segment && current.segment.role !== next.segment.role,
  );
  const sameDirectQuote = Boolean(current.directQuote && next.directQuote);
  const reportingBridge = Boolean(
    current.reportingLead && next.directQuote && next.quoteStart,
  );

  // Whole-document continuity: phrases mapped to the same planned information
  // unit are usually one thought, even if the source writer inserted a period.
  if (sameSegment) strength -= kind === "period" ? 0.19 : 0.12;
  if (sameRole) strength -= 0.045;

  if (sameDirectQuote && !["question", "exclamation", "mixed"].includes(kind)) {
    strength -= kind === "period" ? 0.13 : 0.07;
  }

  // "X said: ..." is one reporting movement, not a speaker/acoustic restart.
  if (reportingBridge) strength = Math.min(strength, 0.17);

  if (startsWithCue(next.text, CONTINUATION_STARTERS)) {
    strength -= kind === "period" ? 0.16 : 0.1;
  }

  // Contrast, result, conclusion and focus are semantic boundaries even when the
  // punctuation mark itself is light.
  if (startsWithCue(next.text, STRONG_BOUNDARY_STARTERS)) strength += 0.17;

  if (roleChanged) {
    strength +=
      isEmphasisRole(current.segment?.role) || isEmphasisRole(next.segment?.role)
        ? 0.14
        : 0.075;
  }

  const currentImportance = current.segment?.importance ?? 0.5;
  const nextImportance = next.segment?.importance ?? 0.5;
  if (nextImportance - currentImportance >= 0.22) strength += 0.075;

  if (current.segment?.role === "ending") strength += 0.12;
  else if (current.segment?.role === "climax") strength += 0.075;

  // Short list-like fragments separated by commas should normally stay fluid.
  if (kind === "comma" && normalize(current.text).length <= 28 && sameSegment) {
    strength -= 0.065;
  }

  // Dependency protection outranks ordinary punctuation. A writer may insert a
  // comma, line break or weak period inside a phrase that must stay syntactically
  // bound (number+unit, genitive+head, modifier+head, name+title, etc.).
  const dependency = kazakhDependencyGuard(current.text, next.text);
  if (!["question", "exclamation", "mixed"].includes(kind)) {
    if (dependency.score >= 0.9) strength = Math.min(strength, 0.08);
    else if (dependency.score >= 0.84) strength = Math.min(strength, 0.12);
    else if (dependency.score >= 0.76) strength = Math.min(strength, 0.18);
    else if (dependency.score >= 0.55) strength -= dependency.score * 0.2;
  }

  // A numbered/next news item is a real presenter transition. Do not turn it
  // into a large sentence break; simply stop semantic smoothing from erasing
  // the small hand-off pause after the item label.
  if (
    deliveryMode === "broadcast" &&
    startsWithNewsItemCue(current.text) &&
    !["question", "exclamation", "mixed"].includes(kind)
  ) {
    strength = Math.max(strength, kind === "period" ? 0.6 : 0.48);
  }

  if (
    deliveryMode === "broadcast" &&
    startsWithNewsItemCue(next.text) &&
    !["question", "exclamation", "mixed"].includes(kind)
  ) {
    strength = Math.max(strength, kind === "period" ? 0.68 : 0.56);
  }

  // Story V12: a real source paragraph is a discourse event, not just layout.
  // Preserve a stronger boundary when the document moves into a new role,
  // transition, climax, ending or explicitly contrastive/resultative paragraph.
  // Same-segment paragraphs still receive a smaller but audible breath.
  if ((deliveryMode === "story" || deliveryMode === "broadcast") && kind === "paragraph") {
    const majorParagraphShift =
      roleChanged ||
      startsWithCue(next.text, STRONG_BOUNDARY_STARTERS) ||
      ["climax", "ending"].includes(current.segment?.role ?? "") ||
      ["lead", "transition", "climax", "ending"].includes(next.segment?.role ?? "");
    strength = Math.max(
      strength,
      majorParagraphShift ? 0.84 : sameSegment ? 0.7 : 0.77,
    );
  }

  // V34: every genuine written period is a hard sentence boundary even when it
  // appears inside the same source paragraph, semantic segment or quotation.
  // Semantic/dependency analysis may tune the release, but cannot erase the
  // sentence boundary. A following line/paragraph break can still raise it higher.
  if (
    (deliveryMode === "story" || deliveryMode === "broadcast") &&
    current.punctuationKind === "period"
  ) {
    strength = Math.max(strength, current.layoutBoundary === "paragraph" ? 0.78 : 0.62);
  }

  // Question marks retain question intonation regardless of this score. The
  // score controls boundary/pause strength only, not the interrogative contour.
  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);
  if (kind === "mixed") strength = Math.max(strength, 0.6);

  return clamp(strength, 0.04, 0.96);
}

function applyVocalFryGuardV2(
  phrases: Phrase[],
  settings: EdgeOmniSettings,
) {
  const amount = clamp(settings.vocalFryGuard ?? 0, 0, 1.15);
  if (amount <= 0) return phrases;

  return phrases.map((phrase) => {
    const kind = phrase.layoutBoundary ?? phrase.punctuationKind;
    const boundary = phrase.boundaryStrength ?? baseBoundaryStrength(kind);
    const endingRole = phrase.segment?.role === "ending";
    const backgroundRole = phrase.segment?.role === "background";

    const closureRisk =
      kind === "paragraph" ? 1 :
      kind === "ellipsis" ? 0.96 :
      kind === "period" ? 0.84 :
      endingRole ? 0.9 :
      kind === "question" ? 0.46 :
      kind === "mixed" ? 0.44 :
      kind === "exclamation" ? 0.34 :
      phrase.newsItemClose ? 0.7 :
      backgroundRole ? 0.22 :
      0.05;

    const baseRate = settings.vocalFryBaseRate ?? 1;
    const basePitch = settings.vocalFryBasePitch ?? 0;
    const baseVolume = settings.vocalFryBaseVolume ?? 0;
    const effectiveRate = baseRate * settings.speed * phrase.micro.rateFactor;
    const effectivePitch = basePitch + settings.pitch + phrase.micro.pitchDelta;
    const effectiveVolume = baseVolume + settings.volume + phrase.micro.volumeDelta;

    const slowRisk = clamp((1.01 - effectiveRate) / 0.07, 0, 1);
    const lowPitchRisk = clamp((0.72 - effectivePitch) / 1.15, 0, 1);
    const lowEnergyRisk = clamp((0.05 - effectiveVolume) / 0.55, 0, 1);
    const collapseRisk =
      slowRisk * 0.42 +
      lowPitchRisk * 0.38 +
      lowEnergyRisk * 0.2;

    // V2 reacts only when the final realized state is risky. A normal deep
    // sentence remains deep; a closure that is simultaneously low, slow and
    // quiet receives a narrowly targeted lift around its final phrase.
    let risk = amount * clamp(
      closureRisk * 0.5 +
      collapseRisk * 0.34 +
      boundary * 0.1 +
      (endingRole ? 0.08 : 0),
      0,
      1,
    );

    // Question/exclamation contours are naturally protected by their upward
    // movement. Avoid flattening them unless they are unusually slow/low.
    if (
      ["question", "exclamation", "mixed"].includes(kind) &&
      collapseRisk < 0.55
    ) {
      risk *= 0.58;
    }

    if (risk < 0.44) return phrase;

    const intervention = clamp((risk - 0.44) / 0.56, 0, 1);
    const rateLift = 0.12 + intervention * 0.52;
    const pitchLift = 0.2 + intervention * 0.62;
    const volumeLift = 0.04 + intervention * 0.18;

    return {
      ...phrase,
      vocalFryCompensation: {
        risk: Math.round(risk * 1000) / 1000,
        rateLift,
        pitchLift,
        volumeLift,
      },
    };
  });
}

function annotateBroadcastCadence(
  phrases: Phrase[],
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  if (deliveryMode !== "broadcast") return phrases;
  return phrases.map((phrase, index) => {
    const next = phrases[index + 1];
    if (!next || !startsWithNewsItemCue(next.text)) return phrase;
    return {
      ...phrase,
      newsItemClose: true,
      micro: {
        rateFactor: clamp(phrase.micro.rateFactor * 0.994, 0.95, 1.03),
        pitchDelta: clamp(phrase.micro.pitchDelta - 0.025, -0.18, 0.18),
        volumeDelta: clamp(phrase.micro.volumeDelta - 0.008, -0.12, 0.2),
      },
    };
  });
}

function annotateSemanticBoundaries(
  phrases: Phrase[],
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  return phrases.map((phrase, index) => ({
    ...phrase,
    boundaryStrength: semanticBoundaryStrength(phrase, phrases[index + 1], deliveryMode),
  }));
}

function closingPunctuationSuffix(value: string) {
  return value.match(/[»”"'’」』）\])}]+$/u)?.[0] ?? "";
}

function acousticPunctuation(
  phrase: Phrase,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  const strength = phrase.boundaryStrength ?? baseBoundaryStrength(phrase.punctuationKind);
  const kind = phrase.punctuationKind;

  // Sentence-mode marks always stay audible. They carry real intonation, not
  // merely layout timing.
  if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) {
    return phrase.punctuation;
  }

  if (["paragraph", "newline", "none"].includes(kind)) return "";

  // Story V11: punctuation is selective. Strong semantic punctuation is left to
  // the neural voice, while weak punctuation is suppressed and replaced later
  // by a much shorter in-stream breath. This avoids both sentence-by-sentence
  // restarting and the unnatural "whole paragraph in one breath" result.
  if (deliveryMode === "story") {
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
    if (kind === "comma") {
      return strength >= 0.36 && (clean.length >= 34 || words >= 7) ? phrase.punctuation : "";
    }
    if (kind === "period") {
      // V16: restore the real period so the neural voice receives an explicit
      // sentence-final intonation cue. The controlled post-sentence breath remains
      // in semanticBreak, so the sentence can settle before the next one starts.
      return phrase.punctuation;
    }
    if (kind === "semicolon") return strength >= 0.4 ? phrase.punctuation : "";
    if (kind === "colon") {
      return phrase.reportingLead || strength >= 0.37 ? phrase.punctuation : "";
    }
    if (kind === "dash") return strength >= 0.42 ? phrase.punctuation : "";
  }

  // V34: every genuine presenter period stays acoustically present, including
  // periods inside one paragraph. Dependency/semantic analysis may shape the
  // following pause, but must not strip the sentence-final contour itself.
  if (deliveryMode === "broadcast" && kind === "period") {
    return phrase.punctuation;
  }

  if (kind === "comma") return strength >= 0.43 ? phrase.punctuation : "";
  if (kind === "period") {
    return strength >= 0.57 ? phrase.punctuation : closingPunctuationSuffix(phrase.punctuation);
  }
  if (kind === "semicolon") return strength >= 0.48 ? phrase.punctuation : "";
  if (kind === "colon") {
    return phrase.reportingLead || strength >= 0.4 ? phrase.punctuation : "";
  }
  if (kind === "dash") return strength >= 0.4 ? phrase.punctuation : "";

  return phrase.punctuation;
}

function semanticBreak(
  phrase: Phrase,
  punctuationRendered: boolean,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
  broadcastPreset: EdgeOmniSettings["broadcastPreset"] = "news",
) {
  const strength = phrase.boundaryStrength ?? Math.max(
    baseBoundaryStrength(phrase.punctuationKind),
    phrase.layoutBoundary ? baseBoundaryStrength(phrase.layoutBoundary) : 0,
  );
  // V30: a terminal mark followed by a line break keeps its punctuation for
  // intonation, but the larger structural boundary decides the breathing tier.
  const kind = phrase.layoutBoundary ?? phrase.punctuationKind;

  // V32: "Бірінші.", "Екінші." and similar standalone ordinal labels need a
  // clear rhetorical hand-off. This is longer than an ordinary sentence but is
  // still context-sensitive rather than one fixed pause. If a source line break
  // is also present, this value naturally sits in the paragraph-transition band.
  if (
    phrase.punctuationKind === "period" &&
    isStandaloneOrdinalCue(phrase.text) &&
    (deliveryMode === "story" || deliveryMode === "broadcast")
  ) {
    const modeBias =
      deliveryMode === "story" ? 14 :
      broadcastPreset === "calm" ? 18 :
      broadcastPreset === "bulletin" ? -8 :
      broadcastPreset === "expressive" ? 10 : 0;
    return Math.round(clamp(258 + strength * 82 + modeBias, 270, 360));
  }

  // Story V28: natural word timing + layered breathing inside one continuous
  // acoustic state. There is no fixed word-to-word gap. Clause commas remain
  // 45-60 ms, completed sentences settle around 100-165 ms, and real paragraph
  // transitions sit around 240-400 ms depending on semantic/emotional strength.
  // Dependency guards still protect syntactically bound phrases.
  if (deliveryMode === "story") {
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
    const enoughSpeech = clean.length >= 28 || words >= 6;

    // V16: sentence-mode punctuation keeps its native contour, but it also gets
    // a short post-sentence breath. Previously these returned zero here, which
    // allowed a question/exclamation to rush straight into the next sentence.
    if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) {
      // V28: expressive endings need enough release time for the contour to land
      // before the next sentence starts. Ellipsis is deliberately roomier.
      const roleBonus =
        phrase.segment?.role === "ending" ? 18 :
        phrase.segment?.role === "climax" ? 12 :
        phrase.segment?.role === "transition" ? 6 : 0;
      const expressiveBreath =
        kind === "ellipsis"
          ? 112 + strength * 48 + roleBonus
          : 96 + strength * 54 + roleBonus;
      return Math.round(clamp(expressiveBreath, kind === "ellipsis" ? 115 : 100, kind === "ellipsis" ? 175 : 160));
    }

    if (kind === "paragraph") {
      if (strength < 0.64) return 0;
      // V28 paragraph cadence: keep a clearly larger discourse breath than a
      // sentence ending, while remaining inside the same acoustic stream. Normal
      // paragraph transitions settle around 240-320 ms; major role/emotion shifts
      // expand toward 320-400 ms so the next paragraph never crowds the previous one.
      return strength >= 0.84
        ? Math.round(clamp(150 + strength * 280, 320, 400))
        : Math.round(clamp(135 + strength * 210, 240, 320));
    }

    if (kind === "comma") {
      // V24: every written story comma keeps at least 45 ms after semantic/
      // dependency analysis. Stronger clause boundaries can expand toward 60 ms.
      const commaBreath = 45 + strength * 15;
      return Math.round(clamp(commaBreath, 45, 60));
    }

    if (kind === "period") {
      // V33: a genuine written period is a hard sentence-closure cue. Semantic
      // and dependency analysis may shape how long the release is, but must never
      // erase the pause entirely; otherwise the next sentence crowds the ending.
      const effectiveStrength = clamp(strength, 0.34, 0.96);
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.25));
      const roleBonus =
        phrase.segment?.role === "ending" ? 14 :
        phrase.segment?.role === "climax" ? 10 :
        phrase.segment?.role === "transition" ? 5 : 0;
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -4 : 0;
      const sentenceBreath =
        164 + effectiveStrength * 48 + lengthBonus + roleBonus + quoteAdjustment;
      return Math.round(clamp(sentenceBreath, 180, 235));
    }

    // If punctuation itself is audible, let the neural voice handle that local
    // timing rather than stacking an explicit pause on top of it.
    if (punctuationRendered) return 0;
    if (!enoughSpeech) return 0;
    if (kind === "newline" && strength >= 0.3) {
      return Math.round(clamp(38 + strength * 48, 50, 82));
    }
    if (["semicolon", "colon", "dash"].includes(kind) && strength >= 0.28) {
      return Math.round(clamp(28 + strength * 50, 40, 72));
    }
    return 0;
  }

  // V29 broadcast flow: the four presenter presets now use the same natural
  // layered breathing hierarchy as story mode while preserving their own base
  // rates, pitch/volume character and document-emotion direction. There is no
  // fixed word-to-word gap. Pauses are derived from semantic strength, sentence
  // length, document role and quotation continuity.
  if (deliveryMode === "broadcast") {
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
    const enoughSpeech = clean.length >= 24 || words >= 5;
    const presetBias =
      broadcastPreset === "calm" ? 0.05 :
      broadcastPreset === "bulletin" ? -0.04 :
      broadcastPreset === "expressive" ? 0.025 : 0;
    const adjustedStrength = clamp(strength + presetBias, 0.04, 0.96);
    const roleBonus =
      phrase.segment?.role === "ending" ? 18 :
      phrase.segment?.role === "climax" ? 12 :
      phrase.segment?.role === "transition" ? 6 : 0;

    // Keep the special news-item hand-off, but let it breathe with context rather
    // than forcing one identical timing in every preset.
    if (phrase.newsItemClose) {
      return Math.round(clamp(70 + adjustedStrength * 34 + roleBonus * 0.25, 72, 105));
    }

    if (kind === "paragraph") {
      if (adjustedStrength <= 0.18) return 0;
      // Real paragraph transitions are discourse boundaries. Ordinary paragraph
      // moves occupy the lower part of 240-400 ms; major role/emotion shifts land
      // toward the upper end so the next paragraph never crowds the previous one.
      return adjustedStrength >= 0.84
        ? Math.round(clamp(150 + adjustedStrength * 280 + roleBonus * 0.35, 320, 400))
        : Math.round(clamp(135 + adjustedStrength * 210 + roleBonus * 0.25, 240, 320));
    }

    if (kind === "comma") {
      // V35: user requested 2x the four presenter comma release. Preserve the
      // semantic-strength curve, but scale the explicit band from 45-60 ms to
      // 90-120 ms. Story mode intentionally remains at 45-60 ms.
      const commaBreath = 90 + adjustedStrength * 30;
      return Math.round(clamp(commaBreath, 90, 120));
    }

    if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) {
      const expressiveBreath =
        kind === "ellipsis"
          ? 112 + adjustedStrength * 48 + roleBonus
          : 96 + adjustedStrength * 54 + roleBonus;
      return Math.round(
        clamp(
          expressiveBreath,
          kind === "ellipsis" ? 115 : 100,
          kind === "ellipsis" ? 175 : 160,
        ),
      );
    }

    if (kind === "period") {
      // V33: presenters also treat every genuine written period as a completed
      // sentence. The document model can lengthen or shorten the release, but it
      // cannot collapse the pause to zero. Keep it clearly below paragraph timing.
      const effectiveStrength = clamp(adjustedStrength, 0.34, 0.96);
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.25));
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -4 : 0;
      const presetSentenceBias =
        broadcastPreset === "calm" ? 7 :
        broadcastPreset === "bulletin" ? -5 :
        broadcastPreset === "expressive" ? 4 : 0;
      const sentenceBreath =
        162 + effectiveStrength * 50 + lengthBonus + roleBonus + quoteAdjustment + presetSentenceBias;
      return Math.round(clamp(sentenceBreath, 178, 235));
    }

    // Single newlines are lighter than true paragraph changes. Semicolon, colon
    // and dash form the requested 40-72 ms middle layer when they are real
    // semantic boundaries; dependency-suppressed marks stay connected.
    if (kind === "newline" && adjustedStrength >= 0.3) {
      return Math.round(clamp(38 + adjustedStrength * 48, 50, 82));
    }
    if (["semicolon", "colon", "dash"].includes(kind)) {
      if (strength <= 0.18 || !enoughSpeech) return 0;
      return Math.round(clamp(28 + adjustedStrength * 50, 40, 72));
    }
  }

  // If native punctuation is rendered, let the neural voice realize its own
  // micro-timing. Explicit breaks are mainly for semantic/layout boundaries or
  // for punctuation that was intentionally acoustically suppressed.
  // Hard dependency zones can suppress even layout boundaries from bad source
  // formatting; sentence-mode punctuation is protected elsewhere.
  if (strength <= 0.16 && !["question", "exclamation", "mixed", "ellipsis"].includes(kind)) return 0;
  if (kind === "paragraph") return Math.round(62 + strength * 78);
  if (kind === "newline") return strength < 0.26 ? 0 : Math.round(8 + strength * 42);
  if (kind === "ellipsis") return punctuationRendered ? 0 : Math.round(18 + strength * 32);
  if (punctuationRendered) return 0;

  if (kind === "period" && strength >= 0.27) return Math.round(8 + strength * 38);
  if (kind === "comma" && strength >= 0.28) return Math.round(5 + strength * 24);
  if (["semicolon", "colon", "dash"].includes(kind) && strength >= 0.3) {
    return Math.round(6 + strength * 28);
  }
  return 0;
}

function renderPunctuationFreeFallback(
  text: string,
  renderNaturalText: EdgeMarkupRenderer,
  deliveryMode: "story" | "broadcast",
) {
  const matches = Array.from(text.matchAll(/\S+/gu));
  const cleanText = text.trim();
  const totalBreathSeconds = estimateEdgeSpeechSeconds(cleanText, 1);
  // V38 anti-false-pause rule: an ordinary sentence stays continuous. Synthetic
  // breathing is allowed only when a genuinely long punctuation-free span is
  // simultaneously long by words, characters, and estimated spoken duration.
  // This prevents a normal Kazakh sentence from being split merely because its
  // words are information-dense.
  const minimumWords = deliveryMode === "story" ? 20 : 18;
  const minimumChars = deliveryMode === "story" ? 140 : 125;
  const minimumSeconds = deliveryMode === "story" ? 5.6 : 5.0;
  if (
    matches.length < minimumWords ||
    cleanText.length < minimumChars ||
    totalBreathSeconds < minimumSeconds
  ) return renderNaturalText(text);

  const words = matches.map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const averageWordLength =
    words.reduce((sum, word) => sum + word.text.length, 0) / Math.max(1, words.length);
  const densityAdjustment = averageWordLength >= 8 ? -2 : averageWordLength <= 5.5 ? 1 : 0;
  const baseTarget = (deliveryMode === "story" ? 15 : 14) + densityAdjustment;
  const lexicalPressure = clamp((averageWordLength - 5.4) / 4.4, 0, 1);
  const targetBreathSeconds = clamp(
    (deliveryMode === "story" ? 5.3 : 4.85) - lexicalPressure * 0.25,
    deliveryMode === "story" ? 4.8 : 4.4,
    deliveryMode === "story" ? 5.5 : 5.05,
  );
  const timedBreaths = Math.max(0, Math.ceil(totalBreathSeconds / targetBreathSeconds) - 1);
  const wordBreaths = words.length >= 28
    ? Math.max(1, Math.ceil(words.length / Math.max(15, baseTarget + 3)) - 1)
    : 0;
  // V38: long sentences may breathe more than once, but do not force a pause
  // simply to satisfy a word-count quota. Four artificial breaths is a hard cap.
  const maxBreaths = Math.round(clamp(Math.max(timedBreaths, wordBreaths), 0, 4));
  if (maxBreaths <= 0) return renderNaturalText(text);

  let output = "";
  let charCursor = 0;
  let wordCursor = 0;
  let inserted = 0;

  while (inserted < maxBreaths) {
    const remainingWords = words.length - wordCursor;
    if (remainingWords < 16) break;

    // Re-estimate each breath from the remaining passage. Dense/long-word text
    // breathes earlier; a short tail pushes the candidate slightly forward/back.
    const remainingBreaths = Math.max(1, maxBreaths - inserted);
    const evenShare = Math.round(remainingWords / (remainingBreaths + 1));
    const tailAdjustment = remainingWords >= 42 ? 1 : remainingWords <= 23 ? -1 : 0;
    const targetWords = Math.round(clamp(
      (baseTarget * 0.58 + evenShare * 0.42) + tailAdjustment,
      10,
      19,
    ));
    const minWords = Math.max(9, targetWords - 4);
    const maxWords = targetWords + 5;
    const minTailWords = 7;
    const firstCandidate = wordCursor + minWords - 1;
    const lastCandidate = Math.min(
      wordCursor + maxWords - 1,
      words.length - minTailWords - 1,
    );
    if (firstCandidate > lastCandidate) break;

    let best: { index: number; score: number; dependency: number } | null = null;

    const chooseCandidate = (dependencyLimit: number) => {
      for (let index = firstCandidate; index <= lastCandidate; index += 1) {
        const leftWindow = words
          .slice(Math.max(wordCursor, index - 6), index + 1)
          .map((word) => word.text)
          .join(" ");
        const rightWindow = words
          .slice(index + 1, Math.min(words.length, index + 8))
          .map((word) => word.text)
          .join(" ");
        if (!leftWindow || !rightWindow) continue;

        const dependency = kazakhDependencyGuard(leftWindow, rightWindow);
        if (dependency.score >= dependencyLimit) continue;

        const chunkWords = index - wordCursor + 1;
        const semanticBonus = startsWithCue(rightWindow, STRONG_BOUNDARY_STARTERS)
          ? -1.6
          : startsWithCue(rightWindow, CONTINUATION_STARTERS)
            ? -0.55
            : 0;
        const balancePenalty = Math.abs((words.length - index - 1) - minTailWords) < 2 ? 0.5 : 0;
        const candidateSeconds = estimateEdgeSpeechSeconds(
          text.slice(charCursor, words[index].end),
          1,
        );
        const breathDebtPenalty = Math.abs(candidateSeconds - targetBreathSeconds) * 1.35;
        const score =
          Math.abs(chunkWords - targetWords) +
          dependency.score * 4.4 +
          breathDebtPenalty +
          balancePenalty +
          semanticBonus;
        if (!best || score < best.score) {
          best = { index, score, dependency: dependency.score };
        }
      }
    };

    // V38: false pauses are worse than a slightly long breath. Only split at a
    // genuinely dependency-safe boundary; never widen all the way into a tightly
    // bound modifier/head, name/title, number/unit, or predicate structure.
    chooseCandidate(0.40);
    if (!best) chooseCandidate(0.52);
    if (!best) chooseCandidate(0.62);
    if (!best) break;

    const boundary = words[best.index].end;
    const chunkWords = best.index - wordCursor + 1;
    const chunkLoad = clamp((chunkWords - 9) / 11, 0, 1);
    const lexicalLoad = clamp((averageWordLength - 5.2) / 4.3, 0, 1);
    const dependencyRelease = clamp(1 - best.dependency, 0, 1);
    const spokenSeconds = estimateEdgeSpeechSeconds(text.slice(charCursor, boundary), 1);
    const breathDebt = clamp((spokenSeconds - targetBreathSeconds * 0.72) / (targetBreathSeconds * 0.55), 0, 1);
    const breath = deliveryMode === "story"
      ? Math.round(clamp(36 + chunkLoad * 6 + lexicalLoad * 5 + dependencyRelease * 4 + breathDebt * 6, 40, 58))
      : Math.round(clamp(32 + chunkLoad * 6 + lexicalLoad * 5 + dependencyRelease * 4 + breathDebt * 6, 36, 54));

    output += renderNaturalText(text.slice(charCursor, boundary));
    output += `<break time="${breath}ms"/>`;
    charCursor = boundary;
    wordCursor = best.index + 1;
    inserted += 1;
  }

  if (!inserted) return renderNaturalText(text);
  output += renderNaturalText(text.slice(charCursor));
  return output;
}


type FineFocusKind = "number" | "entity" | "turn" | "critical" | "negation";
type FineFocusSpan = {
  start: number;
  end: number;
  kind: FineFocusKind;
  priority: number;
};

const KAZAKH_NUMBER_WORDS =
  "(?:нөл|бір|екі|үш|төрт|бес|алты|жеті|сегіз|тоғыз|он|жиырма|отыз|қырық|елу|алпыс|жетпіс|сексен|тоқсан|жүз|мың|миллион|миллиард|триллион)";
const NEWS_UNIT_WORDS =
  "(?:пайыз|процент|адам|километр|метр|тонна|килограмм|гектар|градус|мегаватт|гигаватт|киловатт|гигабайт|терабайт|герц|доллар|еуро|юань|теңге)";
const NEWS_ENTITY_ROOTS =
  "(?:Ресей|Украина|Қытай|АҚШ|Иран|Израиль|Палестина|Сирия|Ливан|Түркия|Катар|Үндістан|Пәкістан|Ауғанстан|Жапония|Молдова|Беларусь|Армения|Әзербайжан|Грузия|Қазақстан|Өзбекстан|Қырғызстан|Тәжікстан|Түрікменстан|НАТО|Еуропа Одағы)";
const INLINE_TURN_ROOTS =
  "(?:бірақ|алайда|дегенмен|сондықтан|сол себепті|нәтижесінде|осылайша|демек|керісінше|ең бастысы|маңыздысы|әсіресе|атап айтқанда)";
const INLINE_CRITICAL_ROOTS =
  "(?:қаза тапты|жараланды|расталды|мәлімдеді|хабарлады|растады|жариялады|қол қойды|іске қосты|бастады|тоқтатты|жіберді|аттандырды|жетті)";
const INLINE_NEGATION_ROOTS =
  "(?:емес|жоқ|расталған жоқ|анықталған жоқ|орын алған жоқ)";

function unicodeCapturedPattern(root: string, flags = "giu") {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])(${root})(?=$|[^\\p{L}\\p{N}])`,
    flags,
  );
}

function pushCapturedMatches(
  text: string,
  regex: RegExp,
  spans: FineFocusSpan[],
  kind: FineFocusKind,
  priority: number,
) {
  for (const match of text.matchAll(regex)) {
    const prefix = match[1] ?? "";
    const target = match[2] ?? "";
    if (!target) continue;
    const start = (match.index ?? 0) + prefix.length;
    pushFineFocusSpan(spans, start, start + target.length, kind, priority);
  }
}

function pushFineFocusSpan(
  spans: FineFocusSpan[],
  start: number,
  end: number,
  kind: FineFocusKind,
  priority: number,
) {
  if (start < 0 || end <= start) return;
  spans.push({ start, end, kind, priority });
}

function collectFishInlineFocusSpans(text: string, phrase: Phrase) {
  if (text.trim().length < 5) return [] as FineFocusSpan[];
  const spans: FineFocusSpan[] = [];

  const numberUnitRoot =
    `(?:\\d+(?:[.,]\\d+)?|${KAZAKH_NUMBER_WORDS}(?:\\s+${KAZAKH_NUMBER_WORDS}){0,5})\\s+${NEWS_UNIT_WORDS}`;
  pushCapturedMatches(
    text,
    unicodeCapturedPattern(numberUnitRoot),
    spans,
    "number",
    1,
  );

  // Capture the entity root plus ordinary Kazakh suffix letters so "Ресейдің"
  // or "Иранға" receives one contour instead of lifting only the stem.
  const entityWithSuffix = `${NEWS_ENTITY_ROOTS}[\\p{L}'’.-]*`;
  pushCapturedMatches(
    text,
    unicodeCapturedPattern(entityWithSuffix, "gu"),
    spans,
    "entity",
    0.82,
  );

  const multiWordEntity =
    /(^|[^\p{L}\p{N}])([A-ZА-ЯӘҒҚҢӨҰҮҺІ][\p{L}'’.-]{2,}(?:\s+[A-ZА-ЯӘҒҚҢӨҰҮҺІ][\p{L}'’.-]{2,}){1,3})(?=$|[^\p{L}\p{N}])/gu;
  pushCapturedMatches(text, multiWordEntity, spans, "entity", 0.76);

  pushCapturedMatches(
    text,
    unicodeCapturedPattern(INLINE_TURN_ROOTS),
    spans,
    "turn",
    0.73,
  );

  if (
    ["lead", "key_number", "climax"].includes(phrase.segment?.role ?? "") ||
    /(?:қаза тапты|жараланды)/iu.test(text)
  ) {
    pushCapturedMatches(
      text,
      unicodeCapturedPattern(INLINE_CRITICAL_ROOTS),
      spans,
      "critical",
      0.7,
    );
  }

  pushCapturedMatches(
    text,
    unicodeCapturedPattern(INLINE_NEGATION_ROOTS),
    spans,
    "negation",
    0.68,
  );

  const maxSpans = text.length >= 150 ? 3 : 2;
  const selected: FineFocusSpan[] = [];
  for (const candidate of spans.sort((a, b) => b.priority - a.priority || a.start - b.start)) {
    if (selected.some((item) => candidate.start < item.end && candidate.end > item.start)) continue;
    const selectedChars = selected.reduce((sum, item) => sum + item.end - item.start, 0);
    if ((selectedChars + candidate.end - candidate.start) / Math.max(1, text.length) > 0.4) continue;
    selected.push(candidate);
    if (selected.length >= maxSpans) break;
  }

  return selected.sort((a, b) => a.start - b.start);
}

function fineFocusProsody(kind: FineFocusKind) {
  switch (kind) {
    case "number":
      return { rate: -1.8, pitch: 0.65, volume: 0.9 };
    case "entity":
      return { rate: -0.7, pitch: 0.45, volume: 0.5 };
    case "turn":
      return { rate: -1.1, pitch: 0.55, volume: 0.55 };
    case "critical":
      return { rate: -1.0, pitch: 0.25, volume: 0.75 };
    case "negation":
      return { rate: -1.25, pitch: 0.3, volume: 0.7 };
  }
}

function renderFishStyleInlineFocus(
  text: string,
  phrase: Phrase,
  renderText: EdgeMarkupRenderer,
  enabled: boolean,
) {
  if (!enabled) return renderText(text);
  const spans = collectFishInlineFocusSpans(text, phrase);
  if (!spans.length) return renderText(text);

  let output = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) output += renderText(text.slice(cursor, span.start));
    const prosody = fineFocusProsody(span.kind);
    output += `<prosody rate="${signedPercent(prosody.rate)}" pitch="${signedPercent(prosody.pitch)}" volume="${signedPercent(prosody.volume)}">${renderText(text.slice(span.start, span.end))}</prosody>`;
    cursor = span.end;
  }
  if (cursor < text.length) output += renderText(text.slice(cursor));
  return output;
}

function naturalTextMarkup(
  text: string,
  renderText: EdgeMarkupRenderer = escapeXml,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  // V29: story and all four broadcast presets leave word-to-word timing entirely
  // to Edge's neural voice. No fixed <break> is inserted between ordinary words;
  // explicit breathing exists only at real semantic/discourse boundaries.
  const renderNaturalText = (value: string) => renderText(value);

  // A presenter may write "Бірінші жаңалық бүгін..." without punctuation after
  // the item label. Give that semantic marker a very short hand-off breath. If
  // punctuation already follows the cue, the boundary model handles it instead.
  if (deliveryMode === "broadcast") {
    const cue = newsItemCueMatch(text);
    if (cue) {
      const leading = cue[1] ?? "";
      const label = cue[2] ?? "";
      const rest = text.slice(cue[0].length);
      const labelMarkup = `<prosody rate="-1.6%" pitch="+0.4%" volume="+0.4%">${renderNaturalText(label)}</prosody>`;
      if (rest.trim().length >= 4) {
        // V29b: item-label hand-off is semantic too. Let the following phrase
        // length choose a light presenter transition instead of forcing 72 ms.
        const restLoad = clamp(rest.trim().length / 180, 0, 1);
        const cueBreath = Math.round(clamp(62 + restLoad * 18, 62, 80));
        return `${renderNaturalText(leading)}${labelMarkup}<break time="${cueBreath}ms"/>${renderNaturalText(rest)}`;
      }
      return `${renderNaturalText(leading)}${labelMarkup}${renderNaturalText(rest)}`;
    }
  }

  // V38: keep a normal sentence acoustically continuous. Strong connectors
  // (бірақ/сондықтан/etc.) influence candidate ranking inside the fallback,
  // but no longer create their own automatic break. Only truly long,
  // punctuation-free speech can enter the breathing planner.
  if (deliveryMode === "story") {
    const clean = text.trim();
    const wordCount = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
    const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);
    if (spokenLoad < 5.6 || wordCount < 20 || clean.length < 140) {
      return renderNaturalText(text);
    }
    return renderPunctuationFreeFallback(text, renderNaturalText, "story");
  }

  // V38 broadcast anti-false-pause rule. A conjunction or contrast word changes
  // local delivery, but it does not by itself justify silence. Artificial breath
  // is reserved for truly long punctuation-free spans; the dependency-safe
  // fallback then chooses the least disruptive semantic boundary.
  const clean = text.trim();
  const wordCount = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
  const spokenLoad = estimateEdgeSpeechSeconds(clean, 1);
  if (
    deliveryMode !== "broadcast" ||
    spokenLoad < 5.0 ||
    wordCount < 18 ||
    clean.length < 125
  ) {
    return renderNaturalText(text);
  }
  return renderPunctuationFreeFallback(text, renderNaturalText, "broadcast");
}

function microDistance(a: MicroProsody, b: MicroProsody) {
  return (
    Math.abs(a.rateFactor - b.rateFactor) / 0.012 +
    Math.abs(a.pitchDelta - b.pitchDelta) / 0.18 +
    Math.abs(a.volumeDelta - b.volumeDelta) / 0.2
  );
}

function isEmphasisRole(role: EdgeDocumentRole | undefined) {
  return role === "title" || role === "key_number" || role === "climax";
}

type HumanTimbreMotion = {
  rateFactor: number;
  pitchDelta: number;
  volumeDelta: number;
  rangePercent: number;
};

function stableMotionPhase(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000 * Math.PI * 2;
}

/**
 * V39 perceived-timbre humanizer.
 *
 * Edge's base speaker identity is fixed, so this layer does not pretend to
 * "clone" a new voice. Instead it removes part of the synthetic impression
 * caused by perfectly stable pitch range, loudness and tempo. Motion is slow,
 * deterministic and document-progress-aware so adjacent groups drift together
 * instead of jittering sentence by sentence.
 */
function humanTimbreMotion(
  group: Phrase[],
  settings: EdgeOmniSettings,
  groupIndex: number,
  totalGroups: number,
): HumanTimbreMotion {
  const cleanText = group.map((item) => item.text).join(" ").trim();
  const progresses = group
    .map((item) => item.segment?.progress)
    .filter((value): value is number => typeof value === "number");
  const progress = progresses.length
    ? progresses.reduce((sum, value) => sum + value, 0) / progresses.length
    : (groupIndex + 0.5) / Math.max(1, totalGroups);
  const fallbackPhase = progresses.length ? 0 : stableMotionPhase(cleanText) * 0.22;
  const primary = Math.sin(progress * Math.PI * 3.4 + fallbackPhase);
  const secondary = Math.sin(progress * Math.PI * 2.1 + 1.17 + fallbackPhase * 0.6);
  const importanceValues = group
    .map((item) => item.segment?.importance)
    .filter((value): value is number => typeof value === "number");
  const importance = importanceValues.length
    ? importanceValues.reduce((sum, value) => sum + value, 0) / importanceValues.length
    : 0.45;

  const presetStrength =
    settings.deliveryMode === "story" ? 1 :
    settings.deliveryMode === "broadcast"
      ? settings.broadcastPreset === "expressive" ? 0.95
        : settings.broadcastPreset === "calm" ? 0.62
        : settings.broadcastPreset === "bulletin" ? 0.7
        : 0.78
      : 0.66;
  const emphasisScale = group.some((item) => isEmphasisRole(item.segment?.role)) ? 0.68 : 1;
  const quoteScale = group.some((item) => item.directQuote) ? 1.06 : 1;
  const lengthScale = cleanText.length < 24 ? 0.3 : cleanText.length < 60 ? 0.65 : 1;
  const intensity = presetStrength * emphasisScale * quoteScale;

  const baseRange =
    settings.deliveryMode === "story" ? 8.2 :
    settings.deliveryMode === "broadcast"
      ? settings.broadcastPreset === "expressive" ? 7.8
        : settings.broadcastPreset === "calm" ? 4.8
        : settings.broadcastPreset === "bulletin" ? 5.4
        : 6.2
      : 5.2;
  const rangePercent = clamp(
    (baseRange + Math.abs(primary) * 1.2 + importance * 0.65) * (0.55 + lengthScale * 0.45),
    2.8,
    10.5,
  );

  return {
    rateFactor: 1 + primary * 0.0018 * intensity * lengthScale,
    pitchDelta: (primary * 0.11 + secondary * 0.05) * intensity * lengthScale,
    volumeDelta: (secondary * 0.06 - primary * 0.018) * intensity * lengthScale,
    rangePercent,
  };
}

function renderGroup(
  group: Phrase[],
  settings: EdgeOmniSettings,
  renderText: EdgeMarkupRenderer,
  groupIndex: number,
  totalGroups: number,
) {
  const average = blendMicros(group.map((item) => ({ micro: item.micro, weight: 1 })));
  const timbre = humanTimbreMotion(group, settings, groupIndex, totalGroups);
  const phraseSpeed = clamp(settings.speed * average.rateFactor * timbre.rateFactor, 0.6, 1.35);
  const phrasePitch = clamp(settings.pitch + average.pitchDelta + timbre.pitchDelta, -18, 18);
  const phraseVolume = clamp(settings.volume + average.volumeDelta + timbre.volumeDelta, -7, 7);
  let body = "";

  for (const item of group) {
    const fineRender: EdgeMarkupRenderer = (value) =>
      renderFishStyleInlineFocus(
        value,
        item,
        renderText,
        Boolean(settings.fineGrainedFocus),
      );
    let spoken = naturalTextMarkup(item.text, fineRender, settings.deliveryMode);
    const renderedPunctuation = acousticPunctuation(item, settings.deliveryMode);
    if (renderedPunctuation) spoken += escapeXml(renderedPunctuation);

    const fry = item.vocalFryCompensation;
    if (fry) {
      // Keep the punctuation inside the local prosody wrapper so Edge realizes
      // the protected closure contour itself, instead of lifting the words and
      // then dropping back into fry on the final period.
      spoken = `<prosody rate="${signedPercent(fry.rateLift)}" pitch="${signedPercent(fry.pitchLift)}" volume="${signedPercent(fry.volumeLift)}">${spoken}</prosody>`;
    }

    body += spoken;
    const pause = semanticBreak(
      item,
      Boolean(renderedPunctuation),
      settings.deliveryMode,
      settings.broadcastPreset,
    );
    if (pause) body += `<break time="${pause}ms"/>`;
  }

  // Pitch range is widened only at the long prosody-movement level. This gives
  // the neural voice more room for natural intonation without changing identity
  // or introducing sentence-by-sentence pitch effects.
  return `<prosody rate="${speedToRate(phraseSpeed)}" pitch="${signedPercent(phrasePitch)}" range="${signedPercent(timbre.rangePercent)}" volume="${signedPercent(phraseVolume)}">${body}</prosody>`;
}

/**
 * Render fewer, longer prosody spans. Edge's native neural voice gets to handle
 * punctuation and intra-span cadence instead of being reset at every comma.
 */
export function renderEdgeOmniInspiredMarkup(
  text: string,
  settings: EdgeOmniSettings,
  plan?: EdgeDocumentPlan,
  renderText: EdgeMarkupRenderer = escapeXml,
) {
  const phrases = applyVocalFryGuardV2(
    applyProsodyInertia(
      annotateSemanticBoundaries(
        annotateBroadcastCadence(
          applyDirectQuoteContinuity(
            applyLogicalFocusContrast(
              bidirectionalSmooth(
                annotateQuoteContinuity(buildPhrases(text, plan, settings.deliveryMode, settings.emotionOverrides)),
                settings.deliveryMode,
              ),
            ),
          ),
          settings.deliveryMode,
        ),
        settings.deliveryMode,
      ),
      settings,
    ),
    settings,
  );
  if (!phrases.length) return renderText(text);

  const groups: Phrase[][] = [];
  let current: Phrase[] = [];

  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };

  for (const phrase of phrases) {
    if (!current.length) {
      current.push(phrase);
      continue;
    }

    const previous = current[current.length - 1];
    const currentAverage = blendMicros(current.map((item) => ({ micro: item.micro, weight: 1 })));
    const sameDirectQuote = Boolean(previous.directQuote && phrase.directQuote);
    const reportingBridge = Boolean(
      previous.reportingLead && phrase.directQuote && phrase.quoteStart,
    );
    const roleChanged = previous.segment?.role !== phrase.segment?.role;
    const storyMode = settings.deliveryMode === "story";
    const broadcastMode = settings.deliveryMode === "broadcast";
    const strongRoleBoundary =
      storyMode
        ? !sameDirectQuote &&
          !reportingBridge &&
          roleChanged &&
          phrase.segment?.role === "ending"
        : broadcastMode
          ? !sameDirectQuote &&
            !reportingBridge &&
            roleChanged &&
            (["title", "climax", "ending"].includes(previous.segment?.role ?? "") ||
              ["title", "climax", "ending"].includes(phrase.segment?.role ?? ""))
          : !sameDirectQuote &&
            !reportingBridge &&
            roleChanged &&
            (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));
    const previousFocus = logicalFocusScore(previous);
    const incomingFocus = logicalFocusScore(phrase);
    // Keep strong focus sparse but audible. A reporting-colon bridge is not a
    // speaker reset, so do not isolate the opening quote merely for newness.
    const strongFocusBoundary =
      !storyMode &&
      !reportingBridge &&
      (broadcastMode
        ? ((incomingFocus >= 0.84 && previousFocus < 0.62) ||
          (previousFocus >= 0.84 && incomingFocus < 0.62))
        : ((incomingFocus >= 0.72 && previousFocus < 0.55) ||
          (previousFocus >= 0.72 && incomingFocus < 0.55)));
    // A paragraph inside the same open quotation still gets its punctuation
    // pause in renderGroup, but it should not create a new prosody state.
    const previousBoundaryStrength =
      previous.boundaryStrength ?? baseBoundaryStrength(previous.punctuationKind);
    const previousStructuralBoundary = previous.layoutBoundary ?? previous.punctuationKind;
    const hardBoundary =
      ["paragraph", "newline"].includes(previousStructuralBoundary) &&
      previousBoundaryStrength >= (storyMode ? 0.82 : broadcastMode ? 0.72 : 0.58) &&
      !sameDirectQuote;
    const tooDifferent =
      microDistance(currentAverage, phrase.micro) >
      (storyMode ? 3.6 : broadcastMode ? 3.05 : sameDirectQuote || reportingBridge ? 2.8 : 2.35);
    const sentenceBoundary =
      ["period", "question", "exclamation", "mixed"].includes(previous.punctuationKind) &&
      previousBoundaryStrength >= 0.57;
    const tempoBoundary =
      !storyMode &&
      sentenceBoundary &&
      !sameDirectQuote &&
      !reportingBridge &&
      previousBoundaryStrength >= (broadcastMode ? 0.68 : 0.57) &&
      Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= (broadcastMode ? 0.008 : 0.006);
    const tooLong =
      current.length >=
        (storyMode
          ? (sameDirectQuote ? 18 : 15)
          : broadcastMode
            ? (sameDirectQuote ? 15 : 12)
            : (sameDirectQuote ? 10 : 8)) &&
      previousBoundaryStrength >= (storyMode ? 0.62 : broadcastMode ? 0.52 : 0.36);

    if (
      hardBoundary ||
      strongRoleBoundary ||
      strongFocusBoundary ||
      tempoBoundary ||
      tooDifferent ||
      tooLong
    ) flush();
    current.push(phrase);
  }
  flush();

  return groups
    .map((group, groupIndex) => renderGroup(group, settings, renderText, groupIndex, groups.length))
    .join("");
}
