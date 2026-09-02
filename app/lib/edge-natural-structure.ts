export type EdgeStructuredSentence = {
  text: string;
  paragraphIndex: number;
  sentenceIndex: number;
};

export type EdgeStructuredParagraph = {
  index: number;
  sentences: EdgeStructuredSentence[];
};

function isDecimalBoundary(text: string, index: number) {
  const char = text[index];
  if (char !== "." && char !== "," && char !== ":") return false;
  return /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "");
}

function nextNonSpace(text: string, index: number) {
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    if (!/\s/u.test(text[cursor])) return text[cursor];
  }
  return "";
}

/**
 * A period is not always a sentence boundary in Kazakh news text. Common forms
 * such as т.б., т.с.с., б.з.д. and personal-name initials otherwise cause the
 * TTS frontend to restart prosody several times inside one sentence.
 */
function isAbbreviationPeriod(text: string, index: number) {
  if (text[index] !== ".") return false;

  const previous = text[index - 1] ?? "";
  const immediateNext = text[index + 1] ?? "";

  // Internal dot in an initialism/abbreviation: т.б. / б.з.д. / А.Байтұрсынұлы
  if (/\p{L}/u.test(previous) && /\p{L}/u.test(immediateNext)) return true;

  const beforePrevious = text[index - 2] ?? "";
  const following = nextNonSpace(text, index);

  // Single-letter personal initial before a capitalized name: А. Байтұрсынұлы
  if (
    /\p{L}/u.test(previous) &&
    !/\p{L}|\p{N}/u.test(beforePrevious) &&
    /\p{Lu}/u.test(following)
  ) {
    return true;
  }

  // Final dot of a multi-part abbreviation when the same sentence continues
  // with lowercase text or a number. If a new capitalized sentence follows, we
  // keep the normal sentence boundary.
  const tail = text.slice(Math.max(0, index - 18), index + 1);
  if (
    /(?:\p{L}\.){1,5}\p{L}\.$/u.test(tail) &&
    (/[\p{Ll}\p{N}]/u.test(following) || !following)
  ) {
    return true;
  }

  return false;
}

function splitSentences(paragraph: string, paragraphIndex: number) {
  const sentences: EdgeStructuredSentence[] = [];
  let buffer = "";

  const flush = () => {
    const value = buffer.trim();
    if (value) {
      sentences.push({
        text: value,
        paragraphIndex,
        sentenceIndex: sentences.length,
      });
    }
    buffer = "";
  };

  for (let index = 0; index < paragraph.length; index += 1) {
    const char = paragraph[index];
    buffer += char;

    if (isDecimalBoundary(paragraph, index)) continue;
    if (isAbbreviationPeriod(paragraph, index)) continue;
    if (!/[.!?。！？…]/u.test(char)) continue;

    while (/[.!?。！？…]/u.test(paragraph[index + 1] ?? "")) {
      index += 1;
      buffer += paragraph[index];
    }
    while (/[»”"'’）\])}]/u.test(paragraph[index + 1] ?? "")) {
      index += 1;
      buffer += paragraph[index];
    }
    flush();
  }

  flush();
  return sentences;
}

/**
 * Keep the user's paragraph and sentence structure explicit for Microsoft TTS.
 * Long-form systems are punctuation-aware; Edge can express the same intent
 * with semantic sentence/paragraph structure while still sending a large
 * article context in one synthesis request.
 */
export function structureEdgeText(source: string): EdgeStructuredParagraph[] {
  const normalized = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  if (!normalized) return [];

  const rawParagraphs = normalized
    .split(/\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return rawParagraphs
    .map((paragraph, index) => ({
      index,
      sentences: splitSentences(paragraph, index),
    }))
    .filter((paragraph) => paragraph.sentences.length > 0);
}
