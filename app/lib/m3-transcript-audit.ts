import { NUMBERED_OPENERS } from "./m3-script";

/**
 * Local, reference-vs-ASR-text heuristic only. Never makes requests and never
 * verifies audio or edits Kazakh text. The user's manuscript is immutable.
 */
export type M3TranscriptSectionAudit = {
  index: number; opener: string;
  referenceFound: boolean; recognizedCount: number;
  similarity: number | null;
  sentenceWarnings: Array<{ sentenceNumber: number; sourceExcerpt: string; bestSimilarity: number }>;
  status: "present" | "review-text" | "missing-heading" | "duplicate-heading" | "missing-source";
};
export type M3TranscriptAudit = {
  referenceHeadings: number; recognizedHeadings: number;
  presentHeadings: number; missingHeadings: number[];
  duplicatedHeadings: number[]; reviewSections: number[];
  sentenceReviewCount: number;
  introLikelyPresent: boolean; endingLikelyPresent: boolean;
  sections: M3TranscriptSectionAudit[];
  transcriptVerified: false;
  notice: string;
};

const entry = NUMBERED_OPENERS.map((name, i) => ({ name, index: i + 1 }))
  .sort((a, b) => b.name.length - a.name.length);
const pattern = new RegExp(`(^|\\s)(${entry.map(e => e.name.replaceAll(" ", "[ \\t]+")).join("|")})[.。:：](?=\\s|$)`, "giu");
const entryMap = new Map(NUMBERED_OPENERS.map((x, i) => [x.toLocaleLowerCase("kk"), i + 1]));

function parts(text: string) {
  const found: Array<{ index: number; start: number; end: number }> = [];
  for (const match of text.matchAll(pattern)) {
    const index = entryMap.get(match[2].toLocaleLowerCase("kk").replace(/\s+/g, " "));
    if (index) found.push({ index, start: match.index! + match[1].length, end: match.index! + match[0].length });
  }
  return found.map((item, k) => ({
    ...item,
    content: text.slice(item.end, found[k + 1]?.start ?? text.length),
  }));
}

function letters(text: string) {
  // Comparison-only normalization, NEVER modify the TTS source text or
  // spelling. Cyrillic-specific case folding is not speech recognition.
  return text.toLocaleLowerCase("kk").normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
function trigrams(text: string) {
  const chars = letters(text);
  const out = new Map<string, number>();
  for (let i = 0; i + 3 <= chars.length; i++) {
    const key = chars.slice(i, i + 3);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}
function similarity(a: string, b: string) {
  const left = trigrams(a), right = trigrams(b);
  const la = [...left.values()].reduce((x, y) => x + y, 0);
  const lb = [...right.values()].reduce((x, y) => x + y, 0);
  if (!la || !lb) return 0;
  let shared = 0;
  for (const [key, n] of left) shared += Math.min(n, right.get(key) ?? 0);
  return Math.round(1000 * 2 * shared / (la + lb)) / 1000;
}

function reviewSentences(original: string, recognized: string) {
  const sourceSentences = original.split(/(?<=[.!?。！？])\s+/u)
    .map(s => s.trim()).filter(s => letters(s).length >= 25);
  const heard = letters(recognized);
  const warnings: Array<{ sentenceNumber: number; sourceExcerpt: string; bestSimilarity: number }> = [];
  for (let i = 0; i < sourceSentences.length; i++) {
    const phrase = sourceSentences[i];
    const length = letters(phrase).length;
    if (!heard.length) {
      warnings.push({ sentenceNumber: i + 1, sourceExcerpt: phrase.slice(0, 65), bestSimilarity: 0 });
      continue;
    }
    // Windowed matching tolerates ASR punctuation and sentence splitting.
    // The word/character content is never changed, just compared locally.
    const stride = Math.max(8, Math.floor(length / 4));
    let best = 0;
    for (const factor of [0.8, 1, 1.2]) {
      const width = Math.max(1, Math.round(length * factor));
      for (let pos = 0; pos < heard.length; pos += stride) {
        best = Math.max(best, similarity(phrase, heard.slice(pos, Math.min(heard.length, pos + width))));
        if (best > 0.85) break;
      }
    }
    if (best < 0.48) warnings.push({
      sentenceNumber: i + 1, sourceExcerpt: phrase.slice(0, 65), bestSimilarity: best,
    });
  }
  return warnings;
}

export function auditM3Transcript(reference: string, recognized: string): M3TranscriptAudit {
  const source = parts(reference);
  const heard = parts(recognized);
  const refCount = new Map<number, number>(), heardCount = new Map<number, number>();
  for (const x of source) refCount.set(x.index, (refCount.get(x.index) ?? 0) + 1);
  for (const x of heard) heardCount.set(x.index, (heardCount.get(x.index) ?? 0) + 1);
  const sections: M3TranscriptSectionAudit[] = NUMBERED_OPENERS.map((opener, i) => {
    const index = i + 1;
    const a = source.find(x => x.index === index);
    const b = heard.find(x => x.index === index);
    const count = heardCount.get(index) ?? 0;
    const score = a && b ? similarity(a.content, b.content) : null;
    const sentenceWarnings = a && b ? reviewSentences(a.content, b.content) : [];
    return {
      index, opener, referenceFound: Boolean(a), recognizedCount: count,
      similarity: score, sentenceWarnings,
      status: !a ? "missing-source" : count > 1 ? "duplicate-heading" :
        !count ? "missing-heading" : score !== null && score < 0.55 ? "review-text" : "present",
    };
  });
  const intro = recognized.slice(0, heard[0]?.start ?? recognized.length);
  const ending = recognized.slice(heard[heard.length - 1]?.end ?? recognized.length);
  return {
    referenceHeadings: [...refCount.values()].reduce((x, y) => x + y, 0),
    recognizedHeadings: heard.length,
    presentHeadings: sections.filter(x => x.recognizedCount > 0).length,
    missingHeadings: sections.filter(x => x.status === "missing-heading").map(x => x.index),
    duplicatedHeadings: sections.filter(x => x.status === "duplicate-heading").map(x => x.index),
    reviewSections: sections.filter(x => x.status === "review-text" || x.sentenceWarnings.length > 0).map(x => x.index),
    sentenceReviewCount: sections.reduce((total, x) => total + x.sentenceWarnings.length, 0),
    introLikelyPresent: letters(intro).length >= 30,
    endingLikelyPresent: /осымен|осымен|осымен|ертең|сау\s+сәлемет|кездескенше/iu.test(ending),
    sections, transcriptVerified: false,
    notice: "仅对照原稿与独立转写文字的13条编号、段落及句级近似字形；句级警告不是已证实漏读。ASR错拼、语速、标点和哈萨克语变体可能产生假阳性/假阴性。未经独立语音识别的文字不能用于证明声音逐字完整。",
  };
}
