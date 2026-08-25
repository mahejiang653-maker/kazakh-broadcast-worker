export type EdgeDirectorSettings = {
  speed: number;
  pitch: number;
  volume: number;
};

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
  const normalized = text
    .trim()
    .replace(/^[«“"'‘’(\[]+/u, "")
    .toLowerCase();

  return cues.some(
    (cue) =>
      normalized === cue ||
      normalized.startsWith(`${cue} `) ||
      normalized.startsWith(`${cue},`),
  );
}

function hasUppercaseAnchor(text: string) {
  return /(?:^|\s)[A-ZА-ЯӘҒҚҢӨҰҮҺІ]{2,8}(?=\s|$|[.,:;!?])/u.test(text);
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

  // Long clauses get a little more room, but the change stays subtle.
  if (length >= 120) rateFactor *= 0.97;
  else if (length >= 82) rateFactor *= 0.982;
  else if (length >= 48) rateFactor *= 0.992;

  // Start a new paragraph with a steadier onset instead of an abrupt pitch jump.
  if (paragraphStart) {
    rateFactor *= 0.994;
    volumeDelta += 0.1;
  }

  // A non-final opening clause gets a tiny continuation lift.
  if (sentenceStart && !isSentenceTerminal(punctuation) && punctuation !== "none") {
    pitchDelta += 0.1;
  } else if (clauseIndex > 0 && punctuation === "comma") {
    pitchDelta += 0.07;
  }

  // Information after a colon is usually the payload, so give it a soft focus.
  if (afterColon) {
    rateFactor *= 0.987;
    volumeDelta += 0.34;
    pitchDelta += 0.08;
  }

  // Short labels/headlines before a colon should sound intentional, not rushed.
  if (punctuation === "colon" && length > 0 && length <= 44) {
    rateFactor *= 0.992;
    volumeDelta += 0.24;
  }

  // Discourse cues approximate the context-aware emphasis that expressive TTS models learn.
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

  // Dense numbers/acronyms benefit from a slightly more deliberate read.
  const digitCount = clean.match(/[0-9]/gu)?.length ?? 0;
  if (digitCount >= 2) rateFactor *= 0.985;
  if (hasUppercaseAnchor(clean)) {
    rateFactor *= 0.99;
    volumeDelta += 0.12;
  }

  // Parenthetical asides are typically delivered a touch softer.
  if (/^\s*[([]/u.test(clean)) {
    rateFactor *= 0.988;
    volumeDelta -= 0.16;
  }

  // Sentence-final contours are intentionally small. Punctuation remains inside
  // the same prosody span so the speech model can still interpret it naturally.
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

function smoothMicro(
  previous: MicroProsody,
  target: MicroProsody,
  sentenceStart: boolean,
) {
  if (sentenceStart) return target;

  const carry = 0.22;
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
        previousMicro = NEUTRAL_MICRO;
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
    const target = phraseTarget(
      token.value,
      kind,
      paragraphStart,
      sentenceStart,
      clauseIndex,
      afterColon,
    );
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
      previousMicro = NEUTRAL_MICRO;
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
