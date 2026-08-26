// Conservative Kazakh text normalization for TTS.
//
// This module rewrites only high-confidence numeric/symbolic forms into words
// before synthesis. The visible article remains unchanged; this is a hidden
// spoken-text representation for Edge TTS.

const ONES = [
  "нөл",
  "бір",
  "екі",
  "үш",
  "төрт",
  "бес",
  "алты",
  "жеті",
  "сегіз",
  "тоғыз",
] as const;

const TENS = [
  "",
  "он",
  "жиырма",
  "отыз",
  "қырық",
  "елу",
  "алпыс",
  "жетпіс",
  "сексен",
  "тоқсан",
] as const;

const SCALES = [
  { value: 1_000_000_000_000, word: "триллион" },
  { value: 1_000_000_000, word: "миллиард" },
  { value: 1_000_000, word: "миллион" },
  { value: 1_000, word: "мың" },
] as const;

const ORDINAL_LAST_WORD: Record<string, string> = {
  "нөл": "нөлінші",
  "бір": "бірінші",
  "екі": "екінші",
  "үш": "үшінші",
  "төрт": "төртінші",
  "бес": "бесінші",
  "алты": "алтыншы",
  "жеті": "жетінші",
  "сегіз": "сегізінші",
  "тоғыз": "тоғызыншы",
  "он": "оныншы",
  "жиырма": "жиырмасыншы",
  "отыз": "отызыншы",
  "қырық": "қырқыншы",
  "елу": "елуінші",
  "алпыс": "алпысыншы",
  "жетпіс": "жетпісінші",
  "сексен": "сексенінші",
  "тоқсан": "тоқсаныншы",
  "жүз": "жүзінші",
  "мың": "мыңыншы",
  "миллион": "миллионыншы",
  "миллиард": "миллиардыншы",
  "триллион": "триллионыншы",
};

const MONTHS = [
  "",
  "қаңтар",
  "ақпан",
  "наурыз",
  "сәуір",
  "мамыр",
  "маусым",
  "шілде",
  "тамыз",
  "қыркүйек",
  "қазан",
  "қараша",
  "желтоқсан",
] as const;

function underThousand(value: number) {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;

  if (hundreds > 0) {
    // Natural Kazakh normally omits "бір" before жүз.
    if (hundreds > 1) parts.push(ONES[hundreds]);
    parts.push("жүз");
  }

  if (rest >= 10) {
    parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) parts.push(ONES[rest % 10]);
  } else if (rest > 0 || value === 0) {
    parts.push(ONES[rest]);
  }

  return parts.join(" ");
}

export function kazakhIntegerToWords(value: number): string {
  if (!Number.isSafeInteger(value)) return String(value);
  if (value === 0) return ONES[0];
  if (value < 0) return `минус ${kazakhIntegerToWords(Math.abs(value))}`;

  let rest = value;
  const parts: string[] = [];

  for (const scale of SCALES) {
    if (rest < scale.value) continue;
    const count = Math.floor(rest / scale.value);
    rest %= scale.value;
    // Natural Kazakh normally omits "бір" before мың, but keeps it before
    // миллион/миллиард/триллион in ordinary news reading.
    if (scale.value === 1_000 && count === 1) {
      parts.push(scale.word);
    } else {
      parts.push(kazakhIntegerToWords(count), scale.word);
    }
  }

  if (rest > 0) parts.push(underThousand(rest));
  return parts.join(" ").replace(/\s+/gu, " ").trim();
}

export function kazakhOrdinalToWords(value: number): string {
  const cardinal = kazakhIntegerToWords(value);
  const words = cardinal.split(/\s+/u);
  const last = words[words.length - 1];
  const ordinal = ORDINAL_LAST_WORD[last];
  if (!ordinal) return cardinal;
  words[words.length - 1] = ordinal;
  return words.join(" ");
}

function decimalToWords(integerPart: string, fractionPart: string) {
  const integer = Number(integerPart);
  if (!Number.isSafeInteger(integer)) return `${integerPart}.${fractionPart}`;

  const fraction = Number(fractionPart);
  if (!Number.isSafeInteger(fraction)) return `${integerPart}.${fractionPart}`;

  const denominator =
    fractionPart.length === 1
      ? "оннан"
      : fractionPart.length === 2
        ? "жүзден"
        : fractionPart.length === 3
          ? "мыңнан"
          : null;

  if (!denominator) {
    const digits = [...fractionPart].map((digit) => ONES[Number(digit)]).join(" ");
    return `${kazakhIntegerToWords(integer)} бүтін ${digits}`;
  }

  return `${kazakhIntegerToWords(integer)} бүтін ${denominator} ${kazakhIntegerToWords(fraction)}`;
}

function normalizeNumericDate(match: string, first: string, second: string, third: string) {
  let day: number;
  let month: number;
  let year: number;

  if (first.length === 4) {
    year = Number(first);
    month = Number(second);
    day = Number(third);
  } else {
    day = Number(first);
    month = Number(second);
    year = Number(third);
  }

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    year < 1000 ||
    year > 2999
  ) {
    return match;
  }

  return `${kazakhOrdinalToWords(year)} жылғы ${kazakhOrdinalToWords(day)} ${MONTHS[month]}`;
}

function normalizeKazakhSegment(source: string) {
  let text = source;

  // Numeric dates: 2026-08-26 / 26.08.2026 / 26/08/2026.
  text = text.replace(
    /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/gu,
    (match, y, m1, d1, d2, m2, y2) =>
      y
        ? normalizeNumericDate(match, y, m1, d1)
        : normalizeNumericDate(match, d2, m2, y2),
  );

  // Four-digit years before жыл/жылы/жылғы/жылдың/etc. Use ordinal reading.
  text = text.replace(
    /\b(\d{4})(?=\s+жыл(?:ы|ғы|дың|дыңғы|дан|ға|да|мен)?\b)/giu,
    (match, raw) => {
      const value = Number(raw);
      return value >= 1000 && value <= 2999 ? kazakhOrdinalToWords(value) : match;
    },
  );

  // Explicit numeric ordinals, e.g. 26-шы / 3-інші.
  text = text.replace(
    /\b(\d{1,15})-(?:шы|ші|ыншы|інші)\b/giu,
    (match, raw) => {
      const value = Number(raw);
      return Number.isSafeInteger(value) ? kazakhOrdinalToWords(value) : match;
    },
  );

  // Percentages, including decimal percentages.
  text = text.replace(
    /\b(\d{1,15})(?:[.,](\d{1,4}))?\s*%/gu,
    (_match, whole, fraction) => {
      const spoken = fraction
        ? decimalToWords(whole, fraction)
        : kazakhIntegerToWords(Number(whole));
      return `${spoken} пайыз`;
    },
  );

  // Currency symbols attached to an amount.
  const currency: Record<string, string> = {
    "$": "доллар",
    "€": "еуро",
    "₸": "теңге",
    "¥": "юань",
  };
  text = text.replace(
    /([$€₸¥])\s*(\d{1,15})(?:[.,](\d{1,4}))?|\b(\d{1,15})(?:[.,](\d{1,4}))?\s*([$€₸¥])/gu,
    (match, symbolA, wholeA, fracA, wholeB, fracB, symbolB) => {
      const symbol = symbolA || symbolB;
      const whole = wholeA || wholeB;
      const fraction = fracA || fracB;
      if (!symbol || !whole) return match;
      const spoken = fraction
        ? decimalToWords(whole, fraction)
        : kazakhIntegerToWords(Number(whole));
      return `${spoken} ${currency[symbol]}`;
    },
  );

  // Common news abbreviations that sound better expanded than letter-by-letter.
  text = text
    .replace(/\bмлрд\.?\b/giu, "миллиард")
    .replace(/\bмлн\.?\b/giu, "миллион")
    .replace(/\bтрлн\.?\b/giu, "триллион")
    .replace(/\bкм\b/giu, "километр")
    .replace(/\bкг\b/giu, "килограмм")
    .replace(/\bсм\b/giu, "сантиметр");

  // Decimal numbers. Protect version-like values with more than one separator by
  // only matching a single decimal point/comma between digit runs.
  text = text.replace(
    /\b(\d{1,12})[.,](\d{1,3})\b/gu,
    (_match, whole, fraction) => decimalToWords(whole, fraction),
  );

  // Clock time: 14:30 -> он төрт отыз. Keeping it compact sounds more like a
  // news reader than expanding to "сағат ... минут" in every context.
  text = text.replace(
    /\b([01]?\d|2[0-3]):([0-5]\d)\b/gu,
    (_match, hours, minutes) =>
      `${kazakhIntegerToWords(Number(hours))} ${kazakhIntegerToWords(Number(minutes))}`,
  );

  // Remaining safe-size integers. Skip digits immediately touching letters so
  // model names such as GPT-5 or product codes are not rewritten blindly.
  text = text.replace(
    /(?<![\p{L}\p{N}])\d{1,15}(?![\p{L}\p{N}])/gu,
    (raw) => {
      const value = Number(raw);
      return Number.isSafeInteger(value) ? kazakhIntegerToWords(value) : raw;
    },
  );

  return text.replace(/[ \t]{2,}/gu, " ");
}

/**
 * Normalize only non-Han runs. Chinese text (and digits directly embedded in a
 * Chinese run) is left for the Chinese/multilingual voice to interpret.
 */
export function normalizeKazakhSpeechText(source: string) {
  if (!source || !/\d|[%$€₸¥]/u.test(source)) return source;
  if (!/\p{Script=Han}/u.test(source)) return normalizeKazakhSegment(source);

  let output = "";
  let buffer = "";
  let hanMode = false;

  const flush = () => {
    if (!buffer) return;
    output += hanMode ? buffer : normalizeKazakhSegment(buffer);
    buffer = "";
  };

  for (const char of source) {
    const isHan = /\p{Script=Han}/u.test(char);
    const isCyrillic = /\p{Script=Cyrillic}/u.test(char);

    if (!hanMode && isHan) {
      flush();
      hanMode = true;
      buffer = char;
      continue;
    }

    if (hanMode && isCyrillic) {
      flush();
      hanMode = false;
      buffer = char;
      continue;
    }

    buffer += char;

    if (hanMode && /\s/u.test(char)) {
      flush();
      hanMode = false;
    }
  }

  flush();
  return output;
}
