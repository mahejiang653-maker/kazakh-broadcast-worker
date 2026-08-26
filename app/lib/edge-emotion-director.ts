import type { EdgeDocumentPlan, EdgeDocumentRole } from "./edge-director";

export type EdgeDeliveryMood =
  | "neutral"
  | "serious"
  | "concern"
  | "urgent"
  | "sad"
  | "positive"
  | "emphasis"
  | "transition"
  | "ending";

export type EdgeEmotionInstruction = {
  mood: EdgeDeliveryMood;
  rateFactor: number;
  pitchDelta: number;
  volumeDelta: number;
  confidence: number;
};

export type EdgeEmotionSentence = EdgeEmotionInstruction & {
  index: number;
  paragraphIndex: number;
  text: string;
  normalized: string;
  role: EdgeDocumentRole | null;
};

export type EdgeEmotionPlan = {
  version: 1;
  sourceLength: number;
  sentences: EdgeEmotionSentence[];
};

const SERIOUS = [
  "ресми",
  "мәлімдеді",
  "хабарлады",
  "қаулы",
  "шешім",
  "заң",
  "қауіпсіздік",
  "қорғаныс",
  "келіссөз",
  "мәжіліс",
  "жиналыс",
  "үкімет",
  "министр",
  "президент",
  "сот",
  "тергеу",
];

const URGENT = [
  "шұғыл",
  "төтенше",
  "жарылыс",
  "шабуыл",
  "соққы",
  "дабыл",
  "қақтығыс",
  "соғыс",
  "өрт",
  "эвакуация",
  "қауіп төн",
  "дереу",
];

const SAD = [
  "қаза",
  "қайтыс",
  "мерт",
  "жараланды",
  "жараланған",
  "аза",
  "апат",
  "құрбан",
  "жоғалды",
  "үйінді",
  "қайғ",
];

const CONCERN = [
  "алаң",
  "ескерт",
  "қауіп",
  "қиын",
  "тапшылық",
  "төменд",
  "қысым",
  "шиеленіс",
  "нашар",
  "зиян",
  "зардап",
  "белгісіз",
];

const POSITIVE = [
  "жеңіс",
  "жетістік",
  "өсім",
  "өсті",
  "артты",
  "жақсар",
  "келісімге кел",
  "қол жеткіз",
  "қалпына кел",
  "ашылды",
  "іске қосылды",
  "сәтті",
  "қуанышты",
];

const TRANSITION = [
  "бірақ",
  "алайда",
  "дегенмен",
  "соған қарамастан",
  "керісінше",
  "сонымен қатар",
  "бұдан бөлек",
  "осы арада",
  "енді",
  "нәтижесінде",
  "сондықтан",
  "осылайша",
];

const EMPHASIS = [
  "ең бастысы",
  "маңыздысы",
  "әсіресе",
  "атап айтқанда",
  "алғаш рет",
  "рекорд",
  "ең жоғары",
  "ең төмен",
  "негізгі",
];

const MOOD_BASE: Record<EdgeDeliveryMood, Omit<EdgeEmotionInstruction, "mood" | "confidence">> = {
  neutral: { rateFactor: 1, pitchDelta: 0, volumeDelta: 0 },
  serious: { rateFactor: 0.988, pitchDelta: -0.18, volumeDelta: 0.08 },
  concern: { rateFactor: 0.978, pitchDelta: -0.12, volumeDelta: -0.02 },
  urgent: { rateFactor: 1.012, pitchDelta: 0.22, volumeDelta: 0.22 },
  sad: { rateFactor: 0.966, pitchDelta: -0.42, volumeDelta: -0.12 },
  positive: { rateFactor: 1.008, pitchDelta: 0.24, volumeDelta: 0.16 },
  emphasis: { rateFactor: 0.976, pitchDelta: 0.06, volumeDelta: 0.24 },
  transition: { rateFactor: 1.01, pitchDelta: 0.12, volumeDelta: 0.06 },
  ending: { rateFactor: 0.972, pitchDelta: -0.34, volumeDelta: -0.04 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\[\]【】(){}«»“”"'‘’]/gu, " ")
    .replace(/[，,；;：:—–…!?！？。.]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function countHits(value: string, cues: string[]) {
  let hits = 0;
  for (const cue of cues) if (value.includes(cue)) hits += 1;
  return hits;
}

function sentenceUnits(source: string) {
  const text = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const units: Array<{ text: string; paragraphIndex: number }> = [];
  let paragraphIndex = 0;
  let buffer = "";

  const flush = () => {
    const value = buffer.trim();
    if (value) units.push({ text: value, paragraphIndex });
    buffer = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    buffer += char;

    if (char === "\n") {
      flush();
      paragraphIndex += 1;
      continue;
    }

    if (!/[.!?。！？…]/u.test(char)) continue;
    const previous = text[index - 1];
    const next = text[index + 1];
    if (char === "." && /\d/u.test(previous ?? "") && /\d/u.test(next ?? "")) continue;

    while (/[.!?。！？…]/u.test(text[index + 1] ?? "")) {
      index += 1;
      buffer += text[index];
    }
    while (/[»”"'’）\])}]/u.test(text[index + 1] ?? "")) {
      index += 1;
      buffer += text[index];
    }
    flush();
  }
  flush();
  return units;
}

function roleForSentence(normalized: string, documentPlan?: EdgeDocumentPlan) {
  if (!documentPlan?.segments.length || !normalized) return null;
  let bestRole: EdgeDocumentRole | null = null;
  let bestScore = 0;
  const words = new Set(normalized.split(" ").filter((word) => word.length >= 3));

  for (const segment of documentPlan.segments) {
    let score = 0;
    if (segment.normalized === normalized) score = 4;
    else if (segment.normalized.includes(normalized) || normalized.includes(segment.normalized)) score = 2.5;
    else {
      const segmentWords = segment.normalized.split(" ").filter((word) => word.length >= 3);
      let overlap = 0;
      for (const word of segmentWords) if (words.has(word)) overlap += 1;
      score = overlap / Math.max(3, Math.min(words.size, segmentWords.length));
    }
    if (score > bestScore) {
      bestScore = score;
      bestRole = segment.role;
    }
  }

  return bestScore >= 0.34 ? bestRole : null;
}

function chooseMood(
  text: string,
  role: EdgeDocumentRole | null,
  index: number,
  total: number,
): { mood: EdgeDeliveryMood; confidence: number } {
  const value = normalize(text);
  const urgent = countHits(value, URGENT);
  const sad = countHits(value, SAD);
  const concern = countHits(value, CONCERN);
  const positive = countHits(value, POSITIVE);
  const serious = countHits(value, SERIOUS);
  const transition = countHits(value, TRANSITION);
  const emphasis = countHits(value, EMPHASIS);
  const numeric = (text.match(/[0-9%％]/gu) ?? []).length;

  if (index === total - 1 || role === "ending") return { mood: "ending", confidence: 0.82 };
  if (sad >= 1 && (urgent >= 1 || concern >= 1 || sad >= 2)) return { mood: "sad", confidence: 0.9 };
  if (urgent >= 2 || (urgent >= 1 && role === "climax")) return { mood: "urgent", confidence: 0.88 };
  if (sad >= 1) return { mood: "sad", confidence: 0.78 };
  if (concern >= 2 || (concern >= 1 && serious >= 1)) return { mood: "concern", confidence: 0.76 };
  if (positive >= 2 || (positive >= 1 && role === "climax")) return { mood: "positive", confidence: 0.78 };
  if (role === "climax" || role === "key_number" || emphasis >= 1 || numeric >= 3) {
    return { mood: "emphasis", confidence: 0.74 };
  }
  if (transition >= 1 || role === "transition") return { mood: "transition", confidence: 0.7 };
  if (serious >= 1 || role === "title" || role === "lead") return { mood: "serious", confidence: 0.64 };
  if (positive >= 1) return { mood: "positive", confidence: 0.62 };
  if (concern >= 1) return { mood: "concern", confidence: 0.6 };
  return { mood: "neutral", confidence: 0.52 };
}

function lengthAdjustment(text: string) {
  const normalized = normalize(text);
  const words = normalized ? normalized.split(" ").length : 0;
  if (text.length >= 145 || words >= 24) return 0.986;
  if (text.length <= 34 && words <= 7) return 1.008;
  return 1;
}

function smoothInstructions(sentences: EdgeEmotionSentence[]) {
  if (sentences.length <= 1) return sentences;

  return sentences.map((sentence, index) => {
    const previous = sentences[index - 1] ?? sentence;
    const next = sentences[index + 1] ?? sentence;
    const ownWeight = sentence.confidence >= 0.82 ? 0.74 : 0.68;
    const sideWeight = (1 - ownWeight) / 2;

    return {
      ...sentence,
      rateFactor: clamp(
        sentence.rateFactor * ownWeight + previous.rateFactor * sideWeight + next.rateFactor * sideWeight,
        0.955,
        1.028,
      ),
      pitchDelta: clamp(
        sentence.pitchDelta * ownWeight + previous.pitchDelta * sideWeight + next.pitchDelta * sideWeight,
        -0.55,
        0.38,
      ),
      volumeDelta: clamp(
        sentence.volumeDelta * ownWeight + previous.volumeDelta * sideWeight + next.volumeDelta * sideWeight,
        -0.18,
        0.32,
      ),
    };
  });
}

export function analyzeEdgeEmotionPlan(source: string, documentPlan?: EdgeDocumentPlan): EdgeEmotionPlan {
  const units = sentenceUnits(source);
  const raw = units.map((unit, index) => {
    const normalized = normalize(unit.text);
    const role = roleForSentence(normalized, documentPlan);
    const { mood, confidence } = chooseMood(unit.text, role, index, units.length);
    const base = MOOD_BASE[mood];

    return {
      index,
      paragraphIndex: unit.paragraphIndex,
      text: unit.text,
      normalized,
      role,
      mood,
      confidence,
      rateFactor: clamp(base.rateFactor * lengthAdjustment(unit.text), 0.95, 1.035),
      pitchDelta: base.pitchDelta,
      volumeDelta: base.volumeDelta,
    } satisfies EdgeEmotionSentence;
  });

  return {
    version: 1,
    sourceLength: source.length,
    sentences: smoothInstructions(raw),
  };
}

export function resolveEdgeEmotionSentences(fragment: string, plan: EdgeEmotionPlan) {
  const units = sentenceUnits(fragment);
  const resolved: EdgeEmotionSentence[] = [];
  let searchFrom = 0;

  for (const unit of units) {
    const normalized = normalize(unit.text);
    let best: EdgeEmotionSentence | null = null;
    let bestIndex = -1;

    for (let index = searchFrom; index < plan.sentences.length; index += 1) {
      const candidate = plan.sentences[index];
      if (
        candidate.normalized === normalized ||
        candidate.normalized.includes(normalized) ||
        normalized.includes(candidate.normalized)
      ) {
        best = candidate;
        bestIndex = index;
        break;
      }
    }

    if (!best) {
      const fallback = MOOD_BASE.neutral;
      best = {
        index: -1,
        paragraphIndex: unit.paragraphIndex,
        text: unit.text,
        normalized,
        role: null,
        mood: "neutral",
        confidence: 0.45,
        ...fallback,
      };
    } else {
      searchFrom = bestIndex + 1;
      best = { ...best, text: unit.text, normalized };
    }

    resolved.push(best);
  }

  return resolved;
}
