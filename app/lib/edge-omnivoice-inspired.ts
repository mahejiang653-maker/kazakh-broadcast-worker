import type { EdgeDocumentPlan, EdgeDocumentRole, EdgePlannedSegment } from "./edge-director";
import { structureEdgeText } from "./edge-natural-structure";

export type EdgeOmniSettings = {
  speed: number;
  pitch: number;
  volume: number;
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
  segment: EdgePlannedSegment | null;
  micro: MicroProsody;
  quoted?: boolean;
  quoteStart?: boolean;
  quoteEnd?: boolean;
  directQuote?: boolean;
  reportingLead?: boolean;
};

type EdgeMarkupRenderer = (text: string) => string;

const NEUTRAL: MicroProsody = { rateFactor: 1, pitchDelta: 0, volumeDelta: 0 };

const CONTRAST_CUES = ["бірақ", "алайда", "дегенмен", "соған қарамастан", "керісінше"];
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
  /(?:деді|дейді|деп|айтты|мәлімдеді|хабарлады|жазды|ескертті|түсіндірді|растады|қосты|атап өтті|表示|称|说|指出|宣布|写道|强调|透露|回应|said|says|stated|reported|announced|wrote|noted|added)/iu;
const OPEN_QUOTE_CHARS = new Set(["«", "“", "„", "「", "『"]);
const CLOSE_QUOTE_CHARS = new Set(["»", "”", "」", "』"]);
const SENTENCE_TERMINAL_KINDS = new Set<PunctuationKind>([
  "period",
  "question",
  "exclamation",
  "mixed",
]);

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

type DurationFragment = {
  text: string;
  paragraphIndex: number;
};

function sentenceFragments(source: string): DurationFragment[] {
  return structureEdgeText(source).flatMap((paragraph) =>
    paragraph.sentences.map((sentence) => ({
      text: sentence.text,
      paragraphIndex: paragraph.index,
    })),
  );
}

function splitOversizedFragment(fragment: string, maxChars: number) {
  if (fragment.length <= maxChars) return [fragment];
  const parts: string[] = [];
  let rest = fragment;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars + 1);
    const comma = Math.max(
      window.lastIndexOf(","),
      window.lastIndexOf("，"),
      window.lastIndexOf(";"),
      window.lastIndexOf("；"),
      window.lastIndexOf(":"),
      window.lastIndexOf("："),
      window.lastIndexOf("—"),
      window.lastIndexOf("–"),
    );
    const space = window.lastIndexOf(" ");
    const cut = comma > maxChars * 0.58 ? comma + 1 : space > maxChars * 0.58 ? space : maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * OmniVoice chunks by estimated audio duration rather than raw character count.
 * For Edge we deliberately use a longer target (~34 s) to preserve more native
 * Microsoft TTS context while still avoiding giant SSML requests.
 */
export function splitEdgeTextByDuration(
  source: string,
  speed: number,
  maxChars = 1600,
  targetSeconds = 34,
  thresholdSeconds = 52,
) {
  const normalized = source.replaceAll("\r\n", "\n").replace(/[\t ]+/gu, " ").trim();
  if (!normalized) return [];
  if (
    normalized.length <= maxChars &&
    estimateEdgeSpeechSeconds(normalized, speed) <= thresholdSeconds
  ) {
    return [normalized];
  }

  const atomic = sentenceFragments(normalized).flatMap((item) =>
    splitOversizedFragment(item.text, maxChars).map((fragmentText) => ({
      text: fragmentText,
      paragraphIndex: item.paragraphIndex,
    })),
  );
  const paragraphCharBudgets = new Map<number, number>();
  for (const fragment of atomic) {
    paragraphCharBudgets.set(
      fragment.paragraphIndex,
      (paragraphCharBudgets.get(fragment.paragraphIndex) ?? 0) + fragment.text.length + 1,
    );
  }

  const chunks: string[] = [];
  let current = "";
  let currentSeconds = 0;
  let currentParagraphIndex: number | null = null;

  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
    currentSeconds = 0;
    currentParagraphIndex = null;
  };

  for (const fragment of atomic) {
    const fragmentSeconds = estimateEdgeSpeechSeconds(fragment.text, speed);
    const paragraphBreak =
      current.length > 0 &&
      currentParagraphIndex !== null &&
      currentParagraphIndex !== fragment.paragraphIndex;
    const separator = current ? (paragraphBreak ? "\n\n" : " ") : "";
    const candidate = current ? `${current}${separator}${fragment.text}` : fragment.text;
    const candidateSeconds = currentSeconds + fragmentSeconds;
    const wouldOverflowChars = candidate.length > maxChars;
    const goodCurrentSize = currentSeconds >= targetSeconds * 0.62;
    const wouldOvershoot = candidateSeconds > targetSeconds * 1.22;
    const incomingParagraphChars =
      paragraphCharBudgets.get(fragment.paragraphIndex) ?? fragment.text.length;
    const currentInsideQuote = current ? hasOpenQuoteAtEnd(current) : false;
    const safeParagraphCut =
      paragraphBreak &&
      !currentInsideQuote &&
      current.length >= Math.min(1800, maxChars * 0.28) &&
      current.length + 2 + incomingParagraphChars > maxChars;

    // Preserve context whenever the next full paragraph still fits. When it
    // cannot fit, prefer ending this request at the existing paragraph boundary
    // instead of carrying part of the next paragraph into a separate MP3 seam.
    if (
      current &&
      (safeParagraphCut ||
        wouldOverflowChars ||
        (goodCurrentSize && wouldOvershoot && !currentInsideQuote))
    ) {
      flush();
    }

    const nextParagraphBreak =
      current.length > 0 &&
      currentParagraphIndex !== null &&
      currentParagraphIndex !== fragment.paragraphIndex;
    const nextSeparator = current ? (nextParagraphBreak ? "\n\n" : " ") : "";
    current = current ? `${current}${nextSeparator}${fragment.text}` : fragment.text;
    currentParagraphIndex = fragment.paragraphIndex;
    currentSeconds += fragmentSeconds;
  }
  flush();

  // Do not leave a tiny tail request: fold it back into the previous request if safe.
  if (chunks.length >= 2) {
    const tail = chunks[chunks.length - 1];
    const previous = chunks[chunks.length - 2];
    if (
      estimateEdgeSpeechSeconds(tail, speed) < 9 &&
      `${previous} ${tail}`.length <= maxChars
    ) {
      chunks.splice(chunks.length - 2, 2, `${previous} ${tail}`);
    }
  }

  return chunks;
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

function localMicro(text: string, kind: PunctuationKind) {
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

  if (clean.length >= 105) rateFactor *= 0.986;
  else if (clean.length <= 24 && digitCount === 0) rateFactor *= 1.012;

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

  // Native-first: punctuation remains the neural voice's primary cue.
  // Kazakh experimental phonetics commonly finds a level/rising contour at
  // non-final comma syntagms, while semicolon/colon boundaries settle more.
  // These hints are deliberately tiny and add no extra audible pause.
  if (kind === "comma") pitchDelta += 0.008;
  else if (kind === "semicolon") {
    rateFactor *= 0.997;
    pitchDelta -= 0.006;
  } else if (kind === "colon") {
    rateFactor *= 0.996;
    pitchDelta -= 0.008;
  } else if (kind === "dash") {
    pitchDelta += 0.005;
  } else if (kind === "question") pitchDelta += 0.065;
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

function buildPhrases(text: string, plan?: EdgeDocumentPlan) {
  const tokens = tokenize(text);
  const phrases: Phrase[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "text" || !token.value.trim()) continue;
    const punctuation = tokens[index + 1]?.kind === "punct" ? tokens[index + 1].value : "";
    const kind = punctuationKind(punctuation);
    const segment = segmentForFragment(token.value, plan);
    const micro = combine(localMicro(token.value, kind), documentMicro(segment, plan));
    phrases.push({ text: token.value, punctuation, punctuationKind: kind, segment, micro });
    if (punctuation) index += 1;
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
      if (["paragraph", "newline"].includes(annotated[cursor].punctuationKind)) break;
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
function bidirectionalSmooth(phrases: Phrase[]) {
  return phrases.map((phrase, index) => {
    const previous = phrases[index - 1];
    const next = phrases[index + 1];
    const hardBefore = previous && ["paragraph", "newline"].includes(previous.punctuationKind);
    const hardAfter = ["paragraph", "newline"].includes(phrase.punctuationKind);
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

function subtleBreak(kind: PunctuationKind, _text: string) {
  // Native-first: let punctuation drive Microsoft's learned cadence.
  // Explicit breaks are reserved for layout boundaries and true hesitation only.
  switch (kind) {
    case "paragraph":
      return 132;
    case "newline":
      return 48;
    case "dash":
      return 4;
    case "ellipsis":
      return 34;
    default:
      return 0;
  }
}

function naturalTextMarkup(text: string, renderText: EdgeMarkupRenderer = escapeXml) {
  // Short and normally punctuated phrases are best left entirely to the neural
  // voice. Only unusually long, punctuation-free spans receive soft syntagma
  // breathing, and only at strong semantic connectors.
  const clean = text.trim();
  const wordCount = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
  if (clean.length < 96 || wordCount < 15) return renderText(text);

  SOFT_SYNTAGMA_PATTERN.lastIndex = 0;
  let output = "";
  let cursor = 0;
  let lastBoundary = -1000;
  let inserted = 0;
  let match: RegExpExecArray | null;

  while ((match = SOFT_SYNTAGMA_PATTERN.exec(text)) && inserted < 2) {
    const boundary = match.index;
    const left = text.slice(cursor, boundary).trim();
    const right = text.slice(boundary).trim();

    // Avoid tiny fragments and avoid placing two artificial breaths close
    // together. This preserves modifier-head, name-title and number-unit groups.
    if (left.length < 42 || right.length < 30 || boundary - lastBoundary < 58) continue;

    output += renderText(text.slice(cursor, boundary));
    output += '<break time="16ms"/>';
    cursor = boundary;
    lastBoundary = boundary;
    inserted += 1;
  }

  if (!inserted) return renderText(text);
  output += renderText(text.slice(cursor));
  return output;
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

function renderGroup(
  group: Phrase[],
  settings: EdgeOmniSettings,
  renderText: EdgeMarkupRenderer,
) {
  const average = blendMicros(group.map((item) => ({ micro: item.micro, weight: 1 })));
  const phraseSpeed = clamp(settings.speed * average.rateFactor, 0.6, 1.35);
  const phrasePitch = clamp(settings.pitch + average.pitchDelta, -18, 18);
  const phraseVolume = clamp(settings.volume + average.volumeDelta, -7, 7);
  let body = "";

  for (const item of group) {
    body += naturalTextMarkup(item.text, renderText);
    if (!/^\n+$/u.test(item.punctuation)) body += escapeXml(item.punctuation);
    const pause = subtleBreak(item.punctuationKind, item.text);
    if (pause) body += `<break time="${pause}ms"/>`;
  }

  return `<prosody rate="${speedToRate(phraseSpeed)}" pitch="${signedPercent(phrasePitch)}" volume="${signedPercent(phraseVolume)}">${body}</prosody>`;
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
  const phrases = applyDirectQuoteContinuity(
    applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),
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
    const strongRoleBoundary =
      !sameDirectQuote &&
      !reportingBridge &&
      roleChanged &&
      (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));
    const previousFocus = logicalFocusScore(previous);
    const incomingFocus = logicalFocusScore(phrase);
    // Keep strong focus sparse but audible. A reporting-colon bridge is not a
    // speaker reset, so do not isolate the opening quote merely for newness.
    const strongFocusBoundary =
      !reportingBridge &&
      ((incomingFocus >= 0.72 && previousFocus < 0.55) ||
        (previousFocus >= 0.72 && incomingFocus < 0.55));
    const hardBoundary = ["paragraph", "newline"].includes(previous.punctuationKind);
    const tooDifferent =
      microDistance(currentAverage, phrase.micro) > (sameDirectQuote || reportingBridge ? 2.8 : 2.35);
    const sentenceBoundary = ["period", "question", "exclamation", "mixed"].includes(
      previous.punctuationKind,
    );
    const tempoBoundary =
      sentenceBoundary &&
      !sameDirectQuote &&
      !reportingBridge &&
      Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;
    const tooLong = current.length >= (sameDirectQuote ? 9 : 6);

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

  return groups.map((group) => renderGroup(group, settings, renderText)).join("");
}
