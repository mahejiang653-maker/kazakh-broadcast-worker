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
 * OmniVoice's long-form pipeline is punctuation-aware; Edge can express the
 * same intent more directly with SSML <p>/<s> elements while still sending the
 * whole article in one synthesis request.
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
