// A lightweight, deterministic speech frontend for Edge TTS.
//
// The goal is not to micromanage pitch or pauses. Modern TTS systems get much
// of their naturalness from a strong text frontend and from keeping enough
// context in one generation. We therefore normalize noisy typography and only
// add punctuation when a very long Kazakh news sentence has no natural breath
// boundary at all. The Microsoft voice still owns the actual prosody.

const INVALID_XML_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/gu;

const OPENING_CUES = [
  "сонымен қатар",
  "осыған байланысты",
  "бұған дейін",
  "осыған дейін",
  "атап айтқанда",
  "мәліметке сәйкес",
  "ресми мәлімет бойынша",
  "оның айтуынша",
  "бұл ретте",
  "осы арада",
] as const;

const MID_SENTENCE_CUES = [
  " бірақ ",
  " алайда ",
  " дегенмен ",
  " өйткені ",
  " сондықтан ",
  " сол себепті ",
  " нәтижесінде ",
  " керісінше ",
  " яғни ",
  " ал ",
] as const;

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
    .trim();
}

function hasStrongBoundary(value: string) {
  return /[，,；;：:—–.!?。！？…\n]/u.test(value);
}

function addOpeningBreath(sentence: string) {
  if (sentence.length < 64) return sentence;
  const lower = sentence.toLowerCase();
  for (const cue of OPENING_CUES) {
    if (!lower.startsWith(`${cue} `)) continue;
    const cut = cue.length;
    const tail = sentence.slice(cut);
    if (/^\s*[,，;；:：—–]/u.test(tail)) return sentence;
    return `${sentence.slice(0, cut)},${tail}`;
  }
  return sentence;
}

function addLongSentenceBreaths(sentence: string) {
  if (sentence.length < 118) return sentence;

  let output = sentence;
  let insertions = 0;
  let scanFrom = 42;

  while (insertions < 2 && scanFrom < output.length - 28) {
    const lower = output.toLowerCase();
    let bestIndex = -1;

    for (const cue of MID_SENTENCE_CUES) {
      const index = lower.indexOf(cue, scanFrom);
      if (index < 0 || index > output.length - 24) continue;
      if (bestIndex < 0 || index < bestIndex) bestIndex = index;
    }

    if (bestIndex < 0) break;

    const previousBoundary = Math.max(
      output.lastIndexOf(",", bestIndex - 1),
      output.lastIndexOf("，", bestIndex - 1),
      output.lastIndexOf(";", bestIndex - 1),
      output.lastIndexOf("；", bestIndex - 1),
      output.lastIndexOf(":", bestIndex - 1),
      output.lastIndexOf("：", bestIndex - 1),
      output.lastIndexOf("—", bestIndex - 1),
      output.lastIndexOf("–", bestIndex - 1),
      output.lastIndexOf(".", bestIndex - 1),
      output.lastIndexOf("。", bestIndex - 1),
      output.lastIndexOf("!", bestIndex - 1),
      output.lastIndexOf("！", bestIndex - 1),
      output.lastIndexOf("?", bestIndex - 1),
      output.lastIndexOf("？", bestIndex - 1),
    );

    // Only intervene when the voice has already been asked to run for a long
    // stretch without any punctuation. Otherwise preserve the author's text.
    if (bestIndex - previousBoundary >= 62) {
      const left = output.slice(Math.max(0, bestIndex - 3), bestIndex);
      if (!hasStrongBoundary(left)) {
        output = `${output.slice(0, bestIndex)},${output.slice(bestIndex)}`;
        insertions += 1;
        scanFrom = bestIndex + 18;
        continue;
      }
    }

    scanFrom = bestIndex + 18;
  }

  return output;
}

function humanizeSentence(sentence: string) {
  if (!sentence.trim()) return sentence;
  return addLongSentenceBreaths(addOpeningBreath(sentence));
}

function humanizeParagraph(paragraph: string) {
  if (!paragraph.trim()) return paragraph;

  // Keep sentence-final punctuation attached to its sentence so the native
  // Microsoft model, not our code, determines the actual pause duration.
  const pieces = paragraph.split(/(?<=[.!?。！？…])(?=\s|$)/u);
  return pieces.map(humanizeSentence).join("");
}

export function prepareEdgeHumanText(source: string) {
  const normalized = normalizeTypography(source);
  if (!normalized) return "";

  return normalized
    .split("\n")
    .map((line) => humanizeParagraph(line))
    .join("\n")
    .replace(/[ ]{2,}/gu, " ")
    .trim();
}
