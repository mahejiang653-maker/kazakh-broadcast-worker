export type EdgeDirectorSettings = {
  speed: number;
  pitch: number;
  volume: number;
};

export type EdgeDocumentRole =
  | "title"
  | "lead"
  | "body"
  | "background"
  | "transition"
  | "key_number"
  | "climax"
  | "ending";

type EdgeToken = {
  kind: "text" | "punct";
  value: string;
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

type MicroProsody = {
  rateFactor: number;
  pitchDelta: number;
  volumeDelta: number;
};

export type EdgePlannedSegment = {
  index: number;
  paragraphIndex: number;
  normalized: string;
  role: EdgeDocumentRole;
  progress: number;
  importance: number;
  numericScore: number;
  impactScore: number;
};

export type EdgeDocumentPlan = {
  version: 2;
  sourceLength: number;
  titleIndex: number | null;
  climaxIndex: number;
  climaxProgress: number;
  endingStartIndex: number;
  segments: EdgePlannedSegment[];
};

type AnalyzedUnit = {
  index: number;
  paragraphIndex: number;
  text: string;
  normalized: string;
  punctuation: PunctuationKind;
};

const NEUTRAL_MICRO: MicroProsody = {
  rateFactor: 1,
  pitchDelta: 0,
  volumeDelta: 0,
};

const CONTRAST_CUES = [
  "бірақ",
  "алайда",
  "дегенмен",
  "соған қарамастан",
  "керісінше",
];

const RESULT_CUES = [
  "сондықтан",
  "сол себепті",
  "нәтижесінде",
  "осылайша",
  "демек",
];

const FOCUS_CUES = [
  "ең бастысы",
  "маңыздысы",
  "әсіресе",
  "атап айтқанда",
  "назар аударайық",
  "назар аударыңыз",
  "бастысы",
];

const SEQUENCE_CUES = [
  "біріншіден",
  "екіншіден",
  "үшіншіден",
  "төртіншіден",
  "сонымен қатар",
  "бұдан бөлек",
  "ақырында",
];

const BACKGROUND_CUES = [
  "бұған дейін",
  "осыған дейін",
  "бұрын",
  "еске сала кетейік",
  "еске салайық",
  "өткен жылы",
  "өткен айда",
  "өткен аптада",
  "тарихында",
  "алдыңғы",
];

const TRANSITION_CUES = [
  ...CONTRAST_CUES,
  ...RESULT_CUES,
  "ал енді",
  "енді",
  "сонымен бірге",
  "сонымен қатар",
  "осы арада",
  "бұдан бөлек",
];

const IMPACT_CUES = [
  "қаза",
  "мерт",
  "жараланды",
  "жараланған",
  "соғыс",
  "соққы",
  "шабуыл",
  "жарылыс",
  "қауіп",
  "төтенше",
  "шұғыл",
  "алғаш рет",
  "рекорд",
  "ең үлкен",
  "ең жоғары",
  "ең төмен",
  "маңызды",
  "растады",
  "мәлімдеді",
];

const NUMBER_CUES = [
  "%",
  "пайыз",
  "миллион",
  "миллиард",
  "триллион",
  "мың",
  "теңге",
  "доллар",
  "еуро",
  "адам",
  "километр",
  "тонна",
  "жыл",
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

function isDigit(value: string | undefined) {
  return Boolean(value && /[0-9]/u.test(value));
}

function normalizeForAnalysis(value: string) {
  return value
    .toLowerCase()
    .replace(/[\[\]【】(){}«»“”"'‘’]/gu, " ")
    .replace(/[，,；;：:—–…!?！？。.]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenizeEdgeText(source: string) {
  const text = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\t ]+/gu, " ");
  const tokens: EdgeToken[] = [];
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

    if (char === ".") {
      if (isDigit(previous) && isDigit(next)) {
        buffer += char;
        continue;
      }
      flush();
      let end = index + 1;
      while (text[end] === ".") end += 1;
      tokens.push({ kind: "punct", value: text.slice(index, end) });
      index = end - 1;
      continue;
    }

    if (char === ",") {
      if (isDigit(previous) && isDigit(next)) {
        buffer += char;
        continue;
      }
      flush();
      tokens.push({ kind: "punct", value: char });
      continue;
    }

    if (char === ":") {
      if (isDigit(previous) && isDigit(next)) {
        buffer += char;
        continue;
      }
      flush();
      tokens.push({ kind: "punct", value: char });
      continue;
    }

    if (/[，；;：]/u.test(char)) {
      flush();
      tokens.push({ kind: "punct", value: char });
      continue;
    }

    if (/[—–]/u.test(char)) {
      flush();
      let end = index + 1;
      while (/[—–]/u.test(text[end] ?? "")) end += 1;
      tokens.push({ kind: "punct", value: text.slice(index, end) });
      index = end - 1;
      continue;
    }

    if (char === "…") {
      flush();
      let end = index + 1;
      while (text[end] === "…") end += 1;
      tokens.push({ kind: "punct", value: text.slice(index, end) });
      index = end - 1;
      continue;
    }

    if (/[!?！？]/u.test(char)) {
      flush();
      let end = index + 1;
      while (/[!?！？]/u.test(text[end] ?? "")) end += 1;
      tokens.push({ kind: "punct", value: text.slice(index, end) });
      index = end - 1;
      continue;
    }

    if (char === "。") {
      flush();
      tokens.push({ kind: "punct", value: char });
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

  const hasQuestion = /[?？]/u.test(value);
  const hasExclamation = /[!！]/u.test(value);
  if (hasQuestion && hasExclamation) return "mixed";
  if (hasQuestion) return "question";
  if (hasExclamation) return "exclamation";
  if (/^(?:。|\.)+$/u.test(value)) return "period";
  return "none";
}

function isSentenceTerminal(kind: PunctuationKind) {
  return (
    kind === "period" ||
    kind === "question" ||
    kind === "exclamation" ||
    kind === "mixed"
  );
}

function startsWithCue(text: string, cues: string[]) {
  const normalized = normalizeForAnalysis(text);
  return cues.some(
    (cue) =>
      normalized === cue ||
      normalized.startsWith(`${cue} `) ||
      normalized.includes(` ${cue} `),
  );
}

function containsCue(text: string, cues: string[]) {
  const normalized = normalizeForAnalysis(text);
  return cues.some((cue) => normalized.includes(cue));
}

function hasUppercaseAnchor(text: string) {
  return /(?:^|\s)[A-ZА-ЯӘҒҚҢӨҰҮҺІ]{2,8}(?=\s|$|[.,:;!?])/u.test(text);
}

function collectDocumentUnits(source: string) {
  const tokens = tokenizeEdgeText(source);
  const units: AnalyzedUnit[] = [];
  let paragraphIndex = 0;
  let buffer = "";
  let lastKind: PunctuationKind = "none";

  const flush = (kind: PunctuationKind) => {
    const text = buffer.trim();
    if (text) {
      units.push({
        index: units.length,
        paragraphIndex,
        text,
        normalized: normalizeForAnalysis(text),
        punctuation: kind,
      });
    }
    buffer = "";
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      buffer += token.value;
      continue;
    }

    const kind = punctuationKind(token.value);
    if (!/^\n+$/u.test(token.value)) buffer += token.value;
    lastKind = kind;

    if (isSentenceTerminal(kind) || kind === "newline" || kind === "paragraph") {
      flush(kind);
      if (kind === "newline" || kind === "paragraph") paragraphIndex += 1;
    }
  }

  if (buffer.trim()) flush(lastKind);
  return units;
}

function numericScore(text: string) {
  const normalized = normalizeForAnalysis(text);
  const digitCount = text.match(/[0-9]/gu)?.length ?? 0;
  const cueCount = NUMBER_CUES.reduce(
    (sum, cue) => sum + (normalized.includes(cue) ? 1 : 0),
    0,
  );
  return clamp(digitCount * 0.28 + cueCount * 0.55, 0, 2.5);
}

function impactScore(text: string) {
  const normalized = normalizeForAnalysis(text);
  const impact = IMPACT_CUES.reduce(
    (sum, cue) => sum + (normalized.includes(cue) ? 0.62 : 0),
    0,
  );
  const focus = FOCUS_CUES.reduce(
    (sum, cue) => sum + (normalized.includes(cue) ? 0.5 : 0),
    0,
  );
  const punctuation = /[!！]/u.test(text) ? 0.28 : 0;
  return clamp(impact + focus + punctuation, 0, 3.2);
}

function isLikelyTitle(unit: AnalyzedUnit, totalUnits: number) {
  if (unit.index !== 0 || totalUnits < 2) return false;
  const length = unit.normalized.length;
  if (length < 4 || length > 88) return false;
  if (unit.punctuation === "newline" || unit.punctuation === "paragraph") return true;
  return length <= 58 && !/[.!?。！？]/u.test(unit.text);
}

function chooseClimaxIndex(units: AnalyzedUnit[], titleIndex: number | null) {
  if (!units.length) return 0;
  let bestIndex = Math.min(units.length - 1, Math.max(0, Math.round(units.length * 0.62)));
  let bestScore = -Infinity;

  for (const unit of units) {
    if (unit.index === titleIndex) continue;
    const progress = units.length <= 1 ? 0.5 : unit.index / (units.length - 1);
    if (progress < 0.18 || progress > 0.9) continue;

    const centerWeight = 1 - Math.min(1, Math.abs(progress - 0.66) / 0.66);
    const score =
      impactScore(unit.text) * 1.25 +
      numericScore(unit.text) * 0.72 +
      centerWeight * 0.28 +
      (containsCue(unit.text, CONTRAST_CUES) ? 0.24 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = unit.index;
    }
  }

  return bestIndex;
}

function roleForUnit(
  unit: AnalyzedUnit,
  units: AnalyzedUnit[],
  titleIndex: number | null,
  climaxIndex: number,
  endingStartIndex: number,
): EdgeDocumentRole {
  if (unit.index === titleIndex) return "title";
  if (unit.index >= endingStartIndex) return "ending";
  if (unit.index === climaxIndex) return "climax";
  if (numericScore(unit.text) >= 0.9) return "key_number";
  if (containsCue(unit.text, BACKGROUND_CUES)) return "background";
  if (startsWithCue(unit.text, TRANSITION_CUES)) return "transition";

  const firstContent = titleIndex === 0 ? 1 : 0;
  if (unit.index >= firstContent && unit.index <= firstContent + 1 && units.length >= 3) {
    return "lead";
  }
  return "body";
}

function roleImportance(role: EdgeDocumentRole, numeric: number, impact: number) {
  const base: Record<EdgeDocumentRole, number> = {
    title: 0.68,
    lead: 0.58,
    body: 0.36,
    background: 0.22,
    transition: 0.48,
    key_number: 0.7,
    climax: 0.92,
    ending: 0.4,
  };
  return clamp(base[role] + numeric * 0.08 + impact * 0.07, 0.12, 1);
}

export function analyzeEdgeDocument(source: string): EdgeDocumentPlan {
  const units = collectDocumentUnits(source);
  if (!units.length) {
    return {
      version: 2,
      sourceLength: source.length,
      titleIndex: null,
      climaxIndex: 0,
      climaxProgress: 0.65,
      endingStartIndex: 0,
      segments: [],
    };
  }

  const titleIndex = isLikelyTitle(units[0], units.length) ? 0 : null;
  const climaxIndex = chooseClimaxIndex(units, titleIndex);
  const endingCount = units.length >= 8 ? 2 : 1;
  const endingStartIndex = Math.max(
    titleIndex === 0 ? 1 : 0,
    units.length - endingCount,
  );

  const segments = units.map((unit) => {
    const progress = units.length <= 1 ? 0.5 : unit.index / (units.length - 1);
    const numeric = numericScore(unit.text);
    const impact = impactScore(unit.text);
    const role = roleForUnit(
      unit,
      units,
      titleIndex,
      climaxIndex,
      endingStartIndex,
    );

    return {
      index: unit.index,
      paragraphIndex: unit.paragraphIndex,
      normalized: unit.normalized,
      role,
      progress,
      importance: roleImportance(role, numeric, impact),
      numericScore: numeric,
      impactScore: impact,
    };
  });

  return {
    version: 2,
    sourceLength: source.length,
    titleIndex,
    climaxIndex,
    climaxProgress:
      units.length <= 1 ? 0.65 : climaxIndex / Math.max(1, units.length - 1),
    endingStartIndex,
    segments,
  };
}

function phraseTarget(
  text: string,
  punctuation: PunctuationKind,
  paragraphStart: boolean,
  sentenceStart: boolean,
  clauseIndex: number,
  afterColon: boolean,
): MicroProsody {
  const clean = text.trim();
  const length = clean.length;
  let rateFactor = 1;
  let pitchDelta = 0;
  let volumeDelta = 0;

  if (length >= 120) rateFactor *= 0.97;
  else if (length >= 82) rateFactor *= 0.982;
  else if (length >= 48) rateFactor *= 0.992;

  if (paragraphStart) {
    rateFactor *= 0.994;
    volumeDelta += 0.1;
  }

  if (sentenceStart && !isSentenceTerminal(punctuation) && punctuation !== "none") {
    pitchDelta += 0.1;
  } else if (clauseIndex > 0 && punctuation === "comma") {
    pitchDelta += 0.07;
  }

  if (afterColon) {
    rateFactor *= 0.987;
    volumeDelta += 0.34;
    pitchDelta += 0.08;
  }

  if (punctuation === "colon" && length > 0 && length <= 44) {
    rateFactor *= 0.992;
    volumeDelta += 0.24;
  }

  if (startsWithCue(clean, FOCUS_CUES)) {
    rateFactor *= 0.982;
    volumeDelta += 0.42;
    pitchDelta += 0.08;
  } else if (startsWithCue(clean, CONTRAST_CUES)) {
    rateFactor *= 0.99;
    volumeDelta += 0.28;
    pitchDelta += 0.1;
  } else if (startsWithCue(clean, RESULT_CUES)) {
    rateFactor *= 0.988;
    volumeDelta += 0.24;
  } else if (startsWithCue(clean, SEQUENCE_CUES)) {
    rateFactor *= 0.993;
    volumeDelta += 0.18;
  }

  const digitCount = clean.match(/[0-9]/gu)?.length ?? 0;
  if (digitCount >= 2) rateFactor *= 0.985;
  if (hasUppercaseAnchor(clean)) {
    rateFactor *= 0.99;
    volumeDelta += 0.12;
  }

  if (/^\s*[([]/u.test(clean)) {
    rateFactor *= 0.988;
    volumeDelta -= 0.16;
  }

  if (punctuation === "period") {
    rateFactor *= 0.992;
    pitchDelta -= 0.45;
  } else if (punctuation === "question") {
    rateFactor *= 0.993;
    pitchDelta += 0.58;
  } else if (punctuation === "exclamation") {
    rateFactor *= 0.997;
    pitchDelta += 0.34;
    volumeDelta += 0.28;
  } else if (punctuation === "mixed") {
    rateFactor *= 0.995;
    pitchDelta += 0.62;
    volumeDelta += 0.24;
  } else if (punctuation === "ellipsis") {
    rateFactor *= 0.982;
    pitchDelta -= 0.2;
  } else if (punctuation === "semicolon") {
    rateFactor *= 0.996;
    pitchDelta -= 0.06;
  }

  return {
    rateFactor: clamp(rateFactor, 0.94, 1.03),
    pitchDelta: clamp(pitchDelta, -1.2, 1.2),
    volumeDelta: clamp(volumeDelta, -0.5, 0.9),
  };
}

function segmentForFragment(text: string, plan?: EdgeDocumentPlan) {
  if (!plan?.segments.length) return null;
  const fragment = normalizeForAnalysis(text);
  if (!fragment) return null;

  let best: EdgePlannedSegment | null = null;
  let bestScore = -1;
  const fragmentWords = new Set(fragment.split(" ").filter((word) => word.length >= 3));

  for (const segment of plan.segments) {
    let score = 0;
    if (segment.normalized.includes(fragment)) {
      score = 4 + fragment.length / Math.max(1, segment.normalized.length);
    } else if (fragment.includes(segment.normalized)) {
      score = 3.5 + segment.normalized.length / Math.max(1, fragment.length);
    } else {
      const segmentWords = segment.normalized.split(" ");
      let overlap = 0;
      for (const word of segmentWords) {
        if (word.length >= 3 && fragmentWords.has(word)) overlap += 1;
      }
      score = overlap / Math.max(3, Math.min(fragmentWords.size, segmentWords.length));
    }

    if (score > bestScore) {
      bestScore = score;
      best = segment;
    }
  }

  return bestScore >= 0.34 ? best : null;
}

function documentArc(progress: number, climaxProgress: number): MicroProsody {
  const distance = Math.abs(progress - climaxProgress);
  const climaxLift = Math.max(0, 1 - distance / 0.24);
  const endingSettle = progress > 0.82 ? (progress - 0.82) / 0.18 : 0;
  const openingPoise = progress < 0.14 ? (0.14 - progress) / 0.14 : 0;

  return {
    rateFactor: clamp(
      1 - climaxLift * 0.006 - endingSettle * 0.012 - openingPoise * 0.004,
      0.975,
      1.01,
    ),
    pitchDelta: clamp(
      climaxLift * 0.09 - endingSettle * 0.22 - openingPoise * 0.03,
      -0.32,
      0.14,
    ),
    volumeDelta: clamp(
      climaxLift * 0.16 - endingSettle * 0.08 + openingPoise * 0.04,
      -0.12,
      0.2,
    ),
  };
}

function roleTarget(segment: EdgePlannedSegment | null, plan?: EdgeDocumentPlan) {
  if (!segment || !plan) return NEUTRAL_MICRO;

  const role: Record<EdgeDocumentRole, MicroProsody> = {
    title: { rateFactor: 0.984, pitchDelta: -0.08, volumeDelta: 0.38 },
    lead: { rateFactor: 0.992, pitchDelta: 0.06, volumeDelta: 0.18 },
    body: { rateFactor: 1, pitchDelta: 0, volumeDelta: 0 },
    background: { rateFactor: 0.988, pitchDelta: -0.1, volumeDelta: -0.18 },
    transition: { rateFactor: 0.994, pitchDelta: 0.12, volumeDelta: 0.12 },
    key_number: { rateFactor: 0.978, pitchDelta: -0.04, volumeDelta: 0.34 },
    climax: { rateFactor: 0.976, pitchDelta: 0.18, volumeDelta: 0.5 },
    ending: { rateFactor: 0.984, pitchDelta: -0.34, volumeDelta: -0.08 },
  };

  const base = role[segment.role];
  const arc = documentArc(segment.progress, plan.climaxProgress);
  const importance = 0.55 + segment.importance * 0.45;

  return {
    rateFactor: clamp(
      1 + (base.rateFactor - 1) * importance + (arc.rateFactor - 1),
      0.95,
      1.02,
    ),
    pitchDelta: clamp(base.pitchDelta * importance + arc.pitchDelta, -0.75, 0.65),
    volumeDelta: clamp(base.volumeDelta * importance + arc.volumeDelta, -0.4, 0.75),
  };
}

function mergeMicro(local: MicroProsody, document: MicroProsody) {
  return {
    rateFactor: clamp(local.rateFactor * document.rateFactor, 0.92, 1.045),
    pitchDelta: clamp(local.pitchDelta + document.pitchDelta, -1.45, 1.45),
    volumeDelta: clamp(local.volumeDelta + document.volumeDelta, -0.75, 1.25),
  };
}

function smoothMicro(
  previous: MicroProsody,
  target: MicroProsody,
  sentenceStart: boolean,
) {
  const carry = sentenceStart ? 0.08 : 0.22;
  const fresh = 1 - carry;
  return {
    rateFactor:
      1 +
      (previous.rateFactor - 1) * carry +
      (target.rateFactor - 1) * fresh,
    pitchDelta: previous.pitchDelta * carry + target.pitchDelta * fresh,
    volumeDelta: previous.volumeDelta * carry + target.volumeDelta * fresh,
  };
}

function naturalBreathMarkup(text: string) {
  const parts = text.split(/(\s+)/u);
  let output = "";
  let charsSinceBreath = 0;

  for (const part of parts) {
    if (!part) continue;

    if (/^\s+$/u.test(part)) {
      output += escapeXml(part);
      continue;
    }

    const cue = part
      .replace(/^[«“"'‘’(\[]+/u, "")
      .replace(/[»”"'’),\]]+$/u, "")
      .toLowerCase();

    if (charsSinceBreath >= 74 && BREATH_CUES.has(cue)) {
      output += '<break time="28ms"/>';
      charsSinceBreath = 0;
    } else if (charsSinceBreath >= 126) {
      output += '<break time="22ms"/>';
      charsSinceBreath = 0;
    }

    output += escapeXml(part);
    charsSinceBreath += part.length;
  }

  return output;
}

function explicitPause(
  kind: PunctuationKind,
  phraseLength: number,
  nextPhraseLength: number,
) {
  const lengthBonus = Math.min(18, Math.max(0, Math.round((phraseLength - 28) * 0.22)));
  const shortFollowerDiscount = nextPhraseLength > 0 && nextPhraseLength <= 14 ? 7 : 0;

  switch (kind) {
    case "paragraph":
      return 260;
    case "newline":
      return 135;
    case "comma":
      return Math.max(10, 16 + Math.min(12, lengthBonus) - shortFollowerDiscount);
    case "semicolon":
      return 38 + Math.min(14, lengthBonus);
    case "colon":
      return 30 + Math.min(12, lengthBonus);
    case "dash":
      return 44 + Math.min(14, lengthBonus);
    case "ellipsis":
      return 105 + Math.min(24, lengthBonus);
    case "question":
      return 54 + Math.min(18, lengthBonus);
    case "exclamation":
      return 50 + Math.min(18, lengthBonus);
    case "mixed":
      return 58 + Math.min(18, lengthBonus);
    case "period":
      return 48 + Math.min(18, lengthBonus);
    default:
      return 0;
  }
}

function nextTextLength(tokens: EdgeToken[], fromIndex: number) {
  for (let index = fromIndex; index < tokens.length; index += 1) {
    if (tokens[index].kind === "text" && tokens[index].value.trim()) {
      return tokens[index].value.trim().length;
    }
  }
  return 0;
}

function renderProsody(
  text: string,
  punctuation: string,
  settings: EdgeDirectorSettings,
  micro: MicroProsody,
) {
  const phraseSpeed = clamp(settings.speed * micro.rateFactor, 0.58, 1.35);
  const phrasePitch = clamp(settings.pitch + micro.pitchDelta, -20, 20);
  const phraseVolume = clamp(settings.volume + micro.volumeDelta, -8, 8);
  const spokenPunctuation = /^\n+$/u.test(punctuation) ? "" : escapeXml(punctuation);

  return `<prosody rate="${speedToRate(phraseSpeed)}" pitch="${signedPercent(phrasePitch)}" volume="${signedPercent(phraseVolume)}">${naturalBreathMarkup(text)}${spokenPunctuation}</prosody>`;
}

export function renderEdgeDirectorMarkup(
  text: string,
  settings: EdgeDirectorSettings,
  documentPlan?: EdgeDocumentPlan,
) {
  const tokens = tokenizeEdgeText(text);
  let output = "";
  let paragraphStart = true;
  let sentenceStart = true;
  let clauseIndex = 0;
  let afterColon = false;
  let previousMicro = NEUTRAL_MICRO;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.kind === "punct") {
      const kind = punctuationKind(token.value);
      if (!/^\n+$/u.test(token.value)) output += escapeXml(token.value);
      const pause = explicitPause(kind, 0, nextTextLength(tokens, index + 1));
      if (pause) output += `<break time="${pause}ms"/>`;

      const terminal = isSentenceTerminal(kind) || kind === "newline" || kind === "paragraph";
      if (terminal) {
        sentenceStart = true;
        clauseIndex = 0;
      } else if (kind !== "none") {
        clauseIndex += 1;
      }
      paragraphStart = kind === "newline" || kind === "paragraph";
      afterColon = kind === "colon";
      continue;
    }

    const cleanLength = token.value.trim().length;
    if (!cleanLength) {
      output += escapeXml(token.value);
      continue;
    }

    const following = tokens[index + 1]?.kind === "punct" ? tokens[index + 1].value : "";
    const kind = punctuationKind(following);
    const localTarget = phraseTarget(
      token.value,
      kind,
      paragraphStart,
      sentenceStart,
      clauseIndex,
      afterColon,
    );
    const segment = segmentForFragment(token.value, documentPlan);
    const globalTarget = roleTarget(segment, documentPlan);
    const target = mergeMicro(localTarget, globalTarget);
    const micro = smoothMicro(previousMicro, target, sentenceStart);

    output += renderProsody(token.value, following, settings, micro);

    if (following) {
      const pause = explicitPause(
        kind,
        cleanLength,
        nextTextLength(tokens, index + 2),
      );
      if (pause) output += `<break time="${pause}ms"/>`;
      index += 1;
    }

    const terminal = isSentenceTerminal(kind) || kind === "newline" || kind === "paragraph";
    if (terminal) {
      sentenceStart = true;
      clauseIndex = 0;
      // Keep a small amount of the previous contour so sentence boundaries do not reset the whole article.
      previousMicro = {
        rateFactor: 1 + (micro.rateFactor - 1) * 0.16,
        pitchDelta: micro.pitchDelta * 0.16,
        volumeDelta: micro.volumeDelta * 0.16,
      };
    } else {
      sentenceStart = false;
      if (kind !== "none") clauseIndex += 1;
      previousMicro = micro;
    }

    paragraphStart = kind === "newline" || kind === "paragraph";
    afterColon = kind === "colon";
  }

  return output;
}
