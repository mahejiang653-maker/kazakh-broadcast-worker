import type { EdgeDocumentPlan, EdgeDocumentRole, EdgePlannedSegment } from "./edge-director";

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
};

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

function sentenceFragments(source: string) {
  const text = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const fragments: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    const next = text[index + 1];
    const decimal = (char === "." || char === ":" || char === ",") && isDigit(previous) && isDigit(next);
    if (decimal) continue;

    const terminal = /[.!?。！？]/u.test(char) || char === "\n";
    if (!terminal) continue;

    let end = index + 1;
    while (/[.!?。！？]/u.test(text[end] ?? "")) end += 1;
    while (/[»”"'’）\])}]/u.test(text[end] ?? "")) end += 1;

    // Keep a sentence-end [情绪] tag attached to the sentence it controls.
    let cursor = end;
    while (/\s/u.test(text[cursor] ?? "")) cursor += 1;
    const tail = text.slice(cursor, cursor + 48);
    const tag = tail.match(/^[\[【][^\]】\r\n]{1,30}[\]】]/u);
    if (tag) end = cursor + tag[0].length;

    const fragment = text.slice(start, end).trim();
    if (fragment) fragments.push(fragment);
    start = end;
    index = Math.max(index, end - 1);
  }

  const tail = text.slice(start).trim();
  if (tail) fragments.push(tail);
  return fragments;
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

  const atomic = sentenceFragments(normalized).flatMap((item) => splitOversizedFragment(item, maxChars));
  const chunks: string[] = [];
  let current = "";
  let currentSeconds = 0;

  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
    currentSeconds = 0;
  };

  for (const fragment of atomic) {
    const fragmentSeconds = estimateEdgeSpeechSeconds(fragment, speed);
    const candidate = current ? `${current} ${fragment}` : fragment;
    const candidateSeconds = currentSeconds + fragmentSeconds;
    const wouldOverflowChars = candidate.length > maxChars;
    const goodCurrentSize = currentSeconds >= targetSeconds * 0.62;
    const wouldOvershoot = candidateSeconds > targetSeconds * 1.22;

    if (current && (wouldOverflowChars || (goodCurrentSize && wouldOvershoot))) {
      flush();
    }

    current = current ? `${current} ${fragment}` : fragment;
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
  if (/^\n{2,}$/u.test(value)) return "paragraph";
  if (/^\n$/u.test(value)) return "newline";
  if (/^[，,]+$/u.test(value)) return "comma";
  if (/^[；;]+$/u.test(value)) return "semicolon";
  if (/^[：:]+$/u.test(value)) return "colon";
  if (/^[—–]+$/u.test(value)) return "dash";
  if (/^(?:…+|\.{2,})$/u.test(value)) return "ellipsis";
  const question = /[?？]/u.test(value);
  const exclamation = /[!！]/u.test(value);
  if (question && exclamation) return "mixed";
  if (question) return "question";
  if (exclamation) return "exclamation";
  if (/^(?:。|\.)+$/u.test(value)) return "period";
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

  // Native-first: punctuation already carries intonation for the neural voice.
  // Only questions/exclamations get a nearly inaudible hint; statements are untouched.
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

function naturalTextMarkup(text: string) {
  // Kazakh is highly agglutinative and phrase prominence is more reliable than
  // artificial word-level breaks. Preserve the phrase as one continuous stream.
  return escapeXml(text);
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

function renderGroup(group: Phrase[], settings: EdgeOmniSettings) {
  const average = blendMicros(group.map((item) => ({ micro: item.micro, weight: 1 })));
  const phraseSpeed = clamp(settings.speed * average.rateFactor, 0.6, 1.35);
  const phrasePitch = clamp(settings.pitch + average.pitchDelta, -18, 18);
  const phraseVolume = clamp(settings.volume + average.volumeDelta, -7, 7);
  let body = "";

  for (const item of group) {
    body += naturalTextMarkup(item.text);
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
) {
  const phrases = bidirectionalSmooth(buildPhrases(text, plan));
  if (!phrases.length) return escapeXml(text);

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
    const roleChanged = previous.segment?.role !== phrase.segment?.role;
    const strongRoleBoundary = roleChanged &&
      (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));
    const hardBoundary = ["paragraph", "newline"].includes(previous.punctuationKind);
    const tooDifferent = microDistance(currentAverage, phrase.micro) > 2.35;
    const sentenceBoundary = ["period", "question", "exclamation", "mixed"].includes(
      previous.punctuationKind,
    );
    const tempoBoundary =
      sentenceBoundary && Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;
    const tooLong = current.length >= 6;

    if (hardBoundary || strongRoleBoundary || tempoBoundary || tooDifferent || tooLong) flush();
    current.push(phrase);
  }
  flush();

  return groups.map((group) => renderGroup(group, settings)).join("");
}
