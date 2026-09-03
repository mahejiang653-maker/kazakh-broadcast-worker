import type { EdgeDocumentPlan, EdgeDocumentRole, EdgePlannedSegment } from "./edge-director";
import { structureEdgeText } from "./edge-natural-structure";
import { kazakhDependencyGuard } from "./edge-kazakh-dependency";

export type EdgeOmniSettings = {
  speed: number;
  pitch: number;
  volume: number;
  deliveryMode?: "neutral" | "broadcast" | "story";
  // V17: keep the same fluent sentence-closure mechanism across all four news
  // presets while preserving each presenter's own pause density.
  broadcastPreset?: "news" | "calm" | "bulletin" | "expressive";
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
  newsItemClose?: boolean;
  boundaryStrength?: number;
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
  const kind = current.punctuationKind;
  let strength = baseBoundaryStrength(kind);

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
  if (deliveryMode === "story" && kind === "paragraph") {
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

  // Question marks retain question intonation regardless of this score. The
  // score controls boundary/pause strength only, not the interrogative contour.
  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);
  if (kind === "mixed") strength = Math.max(strength, 0.6);

  return clamp(strength, 0.04, 0.96);
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

  // V17: news presenters also need a real sentence-final contour. Keep genuine
  // periods audible unless the Kazakh dependency guard has identified a likely
  // formatting mistake inside a syntactically bound phrase.
  if (deliveryMode === "broadcast" && kind === "period") {
    return strength <= 0.18
      ? closingPunctuationSuffix(phrase.punctuation)
      : phrase.punctuation;
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
  const strength = phrase.boundaryStrength ?? baseBoundaryStrength(phrase.punctuationKind);
  const kind = phrase.punctuationKind;

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
      // Hard syntactic dependencies can push the boundary to 0.18 or below;
      // never breathe there even when the source writer inserted a period.
      if (strength <= 0.18) return 0;
      // V28 completed-sentence breath: combine semantic strength, sentence length
      // and document role. The real period still carries the neural sentence-final
      // contour; this supplemental breath lets that contour finish before the next
      // sentence enters, without forcing a new TTS request or prosody reset.
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.45));
      const roleBonus =
        phrase.segment?.role === "ending" ? 18 :
        phrase.segment?.role === "climax" ? 12 :
        phrase.segment?.role === "transition" ? 6 : 0;
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -6 : 0;
      const sentenceBreath = 94 + strength * 62 + lengthBonus + roleBonus + quoteAdjustment;
      return Math.round(clamp(sentenceBreath, 100, 165));
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
      // Every written presenter comma keeps a 45 ms floor, but the exact release
      // grows with semantic boundary strength. This replaces the old universal
      // 45-75 ms profile with the requested 45-60 ms natural clause band.
      const commaBreath = 45 + adjustedStrength * 15;
      return Math.round(clamp(commaBreath, 45, 60));
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
      // A period suppressed by a very strong dependency guard is treated as bad
      // source formatting rather than a completed sentence. Genuine completed
      // sentences use semantic strength + length + document role within 100-165 ms.
      if (strength <= 0.18) return 0;
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.45));
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -6 : 0;
      const sentenceBreath =
        94 + adjustedStrength * 62 + lengthBonus + roleBonus + quoteAdjustment;
      return Math.round(clamp(sentenceBreath, 100, 165));
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
        return `${renderNaturalText(leading)}${labelMarkup}<break time="72ms"/>${renderNaturalText(rest)}`;
      }
      return `${renderNaturalText(leading)}${labelMarkup}${renderNaturalText(rest)}`;
    }
  }

  // Story V11: keep long acoustic continuity but reintroduce sparse, dependency-
  // safe breathing inside genuinely long punctuation-free clauses. This is not
  // a prosody reset: the short break remains inside the same rendered group.
  if (deliveryMode === "story") {
    const clean = text.trim();
    const wordCount = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
    if (clean.length < 112 || wordCount < 18) return renderNaturalText(text);

    SOFT_SYNTAGMA_PATTERN.lastIndex = 0;
    let output = "";
    let cursor = 0;
    let lastBoundary = -1000;
    let inserted = 0;
    const maxBreaths = clean.length >= 270 || wordCount >= 40 ? 2 : 1;
    let match: RegExpExecArray | null;

    while ((match = SOFT_SYNTAGMA_PATTERN.exec(text)) && inserted < maxBreaths) {
      const boundary = match.index;
      const left = text.slice(cursor, boundary).trim();
      const right = text.slice(boundary).trim();
      if (left.length < 54 || right.length < 34 || boundary - lastBoundary < 72) continue;
      const dependency = kazakhDependencyGuard(left, right);
      if (dependency.score >= 0.55) continue;

      output += renderNaturalText(text.slice(cursor, boundary));
      output += `<break time="${Math.round(clamp(45 + Math.max(0, clean.length - 112) * 0.08, 45, 60))}ms"/>`;
      cursor = boundary;
      lastBoundary = boundary;
      inserted += 1;
    }

    if (!inserted) return renderNaturalText(text);
    output += renderNaturalText(text.slice(cursor));
    return output;
  }

  // Short and normally punctuated phrases are best left entirely to the neural
  // voice. Only unusually long, punctuation-free spans receive soft syntagma
  // breathing, and only at strong semantic connectors.
  const clean = text.trim();
  const wordCount = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
  if (clean.length < 96 || wordCount < 15) return renderNaturalText(text);

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

    const dependency = kazakhDependencyGuard(left, right);
    if (dependency.score >= 0.55) continue;

    output += renderNaturalText(text.slice(cursor, boundary));
    // V29: long punctuation-free presenter spans breathe only at dependency-safe
    // semantic connectors. The pause is deliberately light and dynamic rather
    // than the previous fixed 16 ms, so long sentences remain continuous without
    // letting the second half press against the first.
    const clauseLoad = clamp((left.length - 42) / 120, 0, 1);
    const dependencyRelease = clamp(1 - dependency.score, 0, 1);
    const softBreath =
      deliveryMode === "broadcast"
        ? Math.round(clamp(30 + clauseLoad * 12 + dependencyRelease * 6, 32, 48))
        : 16;
    output += `<break time="${softBreath}ms"/>`;
    cursor = boundary;
    lastBoundary = boundary;
    inserted += 1;
  }

  if (!inserted) return renderNaturalText(text);
  output += renderNaturalText(text.slice(cursor));
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
    body += naturalTextMarkup(item.text, renderText, settings.deliveryMode);
    const renderedPunctuation = acousticPunctuation(item, settings.deliveryMode);
    if (renderedPunctuation) body += escapeXml(renderedPunctuation);
    const pause = semanticBreak(
      item,
      Boolean(renderedPunctuation),
      settings.deliveryMode,
      settings.broadcastPreset,
    );
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
  const phrases = annotateSemanticBoundaries(
    annotateBroadcastCadence(
      applyDirectQuoteContinuity(
        applyLogicalFocusContrast(
          bidirectionalSmooth(
            annotateQuoteContinuity(buildPhrases(text, plan)),
            settings.deliveryMode,
          ),
        ),
      ),
      settings.deliveryMode,
    ),
    settings.deliveryMode,
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
    const hardBoundary =
      ["paragraph", "newline"].includes(previous.punctuationKind) &&
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

  return groups.map((group) => renderGroup(group, settings, renderText)).join("");
}
