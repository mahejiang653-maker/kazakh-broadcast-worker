// A conservative speech frontend for Edge TTS, inspired by OmniVoice's
// punctuation-aware text preparation.
//
// The previous version inserted commas into long Kazakh sentences. That can
// help a few run-on sentences, but it also changes the author's phrasing and
// can make a neural voice sound algorithmically directed. The new frontend
// only cleans typography and makes paragraph endings explicit. Microsoft TTS
// owns the actual intra-sentence phrasing.

const INVALID_XML_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/gu;
const END_PUNCTUATION = /[.!?。！？…;；:：,，)\]】}»”’]$/u;

function normalizeTypography(source: string) {
  return source
    .replace(INVALID_XML_CONTROLS, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\u00A0\u2007\u202F]/gu, " ")
    .replace(/[\t ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\.{3,}/gu, "…")
    .replace(/…{2,}/gu, "…")
    .replace(/[!！]{3,}/gu, "!!")
    .replace(/[?？]{3,}/gu, "??")
    .replace(/\s+([,，;；:：.!?。！？…])/gu, "$1")
    .trim();
}

function hasHan(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function ensureTerminalPunctuation(value: string) {
  const line = value.trim();
  if (!line || END_PUNCTUATION.test(line)) return line;
  return `${line}${hasHan(line) ? "。" : "."}`;
}

/**
 * OmniVoice explicitly adds missing terminal punctuation before synthesis and
 * otherwise preserves punctuation-aware phrasing. We mirror that conservative
 * behaviour here instead of injecting synthetic pauses or commas.
 */
export function prepareEdgeHumanText(source: string) {
  const normalized = normalizeTypography(source);
  if (!normalized) return "";

  return normalized
    .split("\n")
    .map((line) => (line.trim() ? ensureTerminalPunctuation(line) : ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
