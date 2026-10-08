import { NUMBERED_OPENERS } from "./m3-script";

/**
 * Local, reference-vs-ASR-text heuristic only. Never makes requests and never
 * verifies audio or edits Kazakh text. The user's manuscript is immutable.
 */
export type M3TranscriptSectionAudit = {
  index: number; opener: string;
  referenceFound: boolean; recognizedCount: number;
  similarity: number | null;
  status: "present" | "review-text" | "missing-heading" | "duplicate-heading" | "missing-source";
};
export type M3TranscriptAudit = {
  referenceHeadings: number; recognizedHeadings: number;
  presentHeadings: number; missingHeadings: number[];
  duplicatedHeadings: number[]; reviewSections: number[];
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
    return {
      index, opener, referenceFound: Boolean(a), recognizedCount: count,
      similarity: score,
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
    reviewSections: sections.filter(x => x.status === "review-text").map(x => x.index),
    introLikelyPresent: letters(intro).length >= 30,
    endingLikelyPresent: /осымен|осымен|осымен|ертең|сау\s+сәлемет|кездескенше/iu.test(ending),
    sections, transcriptVerified: false,
    notice: "仅对照原稿与独立转写文字的13条结构及近似字形；不能证明声音逐字完整。ASR错拼、语速、标点和哈萨克语变体可能产生假阳性/假阴性。未经独立语音识别的文字不能用于证明漏读。",
  };
}
