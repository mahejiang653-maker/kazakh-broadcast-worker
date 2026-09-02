import type { EdgeDocumentPlan, EdgeDocumentRole } from "./edge-director";
import { structureEdgeText } from "./edge-natural-structure";

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
  version: 2;
  sourceLength: number;
  sentences: EdgeEmotionSentence[];
};

const SERIOUS = [
  "ресми", "мәлімдеді", "хабарлады", "қаулы", "шешім", "заң", "қауіпсіздік",
  "қорғаныс", "келіссөз", "мәжіліс", "жиналыс", "үкімет", "министр", "президент",
  "сот", "тергеу",
  "官方", "宣布", "表示", "声明", "决定", "法律", "安全", "国防", "谈判", "会议",
  "政府", "部长", "总统", "主席", "法院", "调查", "政策", "外交",
];

const URGENT = [
  "шұғыл", "төтенше", "жарылыс", "шабуыл", "соққы", "дабыл", "қақтығыс",
  "соғыс", "өрт", "эвакуация", "қауіп төн", "дереу",
  "紧急", "突发", "爆炸", "袭击", "攻击", "空袭", "警报", "冲突", "战争", "交火",
  "大火", "火灾", "撤离", "疏散", "危险", "立即", "导弹", "无人机",
];

const SAD = [
  "қаза", "қайтыс", "мерт", "жараланды", "жараланған", "аза", "апат", "құрбан",
  "жоғалды", "үйінді", "қайғ",
  "死亡", "去世", "遇难", "身亡", "伤亡", "受伤", "伤者", "遇难者", "牺牲", "灾难",
  "事故", "失踪", "废墟", "哀悼", "悲痛",
];

const CONCERN = [
  "алаң", "ескерт", "қауіп", "қиын", "тапшылық", "төменд", "қысым", "шиеленіс",
  "нашар", "зиян", "зардап", "белгісіз",
  "担忧", "担心", "警告", "风险", "危险", "困难", "短缺", "下降", "下跌", "压力",
  "紧张", "恶化", "损失", "损害", "影响", "不确定", "危机",
];

const POSITIVE = [
  "жеңіс", "жетістік", "өсім", "өсті", "артты", "жақсар", "келісімге кел",
  "қол жеткіз", "қалпына кел", "ашылды", "іске қосылды", "сәтті", "қуанышты",
  "胜利", "成功", "增长", "上涨", "上升", "增加", "改善", "达成协议", "达成", "取得",
  "恢复", "开放", "启动", "投入使用", "突破", "创新高", "利好",
];

const TRANSITION = [
  "бірақ", "алайда", "дегенмен", "соған қарамастан", "керісінше", "сонымен қатар",
  "бұдан бөлек", "осы арада", "енді", "нәтижесінде", "сондықтан", "осылайша",
  "但是", "但", "然而", "不过", "尽管如此", "相反", "与此同时", "此外", "另外",
  "另一方面", "因此", "所以", "由此", "结果", "随后", "目前",
];

const EMPHASIS = [
  "ең бастысы", "маңыздысы", "әсіресе", "атап айтқанда", "алғаш рет", "рекорд",
  "ең жоғары", "ең төмен", "негізгі",
  "最重要", "重要", "尤其", "特别是", "值得注意", "首次", "第一次", "纪录", "创纪录",
  "最高", "最低", "关键", "核心", "重点", "必须指出",
];

// Modern long-form TTS systems sound more human when semantic context owns most
// of the delivery and local controls stay subtle. Edge does not expose a true
// long-form acoustic context API, so rate is our main signal while pitch/volume
// remain deliberately tiny suggestions.
const MOOD_BASE: Record<EdgeDeliveryMood, Omit<EdgeEmotionInstruction, "mood" | "confidence">> = {
  neutral: { rateFactor: 1, pitchDelta: 0, volumeDelta: 0 },
  serious: { rateFactor: 0.994, pitchDelta: -0.03, volumeDelta: 0.01 },
  concern: { rateFactor: 0.987, pitchDelta: -0.04, volumeDelta: -0.01 },
  urgent: { rateFactor: 1.008, pitchDelta: 0.04, volumeDelta: 0.03 },
  sad: { rateFactor: 0.981, pitchDelta: -0.05, volumeDelta: -0.02 },
  positive: { rateFactor: 1.006, pitchDelta: 0.04, volumeDelta: 0.02 },
  emphasis: { rateFactor: 0.986, pitchDelta: 0, volumeDelta: 0.04 },
  transition: { rateFactor: 1.006, pitchDelta: 0.02, volumeDelta: 0.01 },
  ending: { rateFactor: 0.983, pitchDelta: -0.04, volumeDelta: -0.02 },
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
  return structureEdgeText(source).flatMap((paragraph) =>
    paragraph.sentences.map((sentence) => ({
      text: sentence.text,
      paragraphIndex: paragraph.index,
    })),
  );
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
  const hasHan = /\p{Script=Han}/u.test(text);
  const strongPunctuation = (text.match(/[!！?？]/gu) ?? []).length;

  if (index === total - 1 || role === "ending") return { mood: "ending", confidence: 0.82 };
  if (sad >= 1 && (urgent >= 1 || concern >= 1 || sad >= 2)) return { mood: "sad", confidence: 0.9 };
  if (urgent >= 2 || (urgent >= 1 && role === "climax") || (urgent >= 1 && strongPunctuation >= 1)) {
    return { mood: "urgent", confidence: 0.88 };
  }
  if (sad >= 1) return { mood: "sad", confidence: 0.78 };
  if (concern >= 2 || (concern >= 1 && serious >= 1)) return { mood: "concern", confidence: 0.76 };
  if (positive >= 2 || (positive >= 1 && role === "climax")) return { mood: "positive", confidence: 0.78 };
  if (role === "climax" || role === "key_number" || emphasis >= 1 || numeric >= 3) {
    return { mood: "emphasis", confidence: 0.74 };
  }
  if (transition >= 1 || role === "transition") return { mood: "transition", confidence: 0.7 };
  if (serious >= 1 || role === "title" || role === "lead") {
    return { mood: "serious", confidence: hasHan && serious >= 1 ? 0.7 : 0.64 };
  }
  if (positive >= 1) return { mood: "positive", confidence: 0.62 };
  if (concern >= 1) return { mood: "concern", confidence: 0.6 };
  return { mood: "neutral", confidence: 0.52 };
}

function lengthAdjustment(text: string) {
  const normalized = normalize(text);
  const words = normalized ? normalized.split(" ").length : 0;
  if (text.length >= 145 || words >= 24) return 0.992;
  if (text.length <= 34 && words <= 7) return 1.004;
  return 1;
}

function instructionForMood(sentence: EdgeEmotionSentence, mood: EdgeDeliveryMood, confidence: number) {
  const base = MOOD_BASE[mood];
  return {
    ...sentence,
    mood,
    confidence,
    rateFactor: clamp(base.rateFactor * lengthAdjustment(sentence.text), 0.97, 1.02),
    pitchDelta: base.pitchDelta,
    volumeDelta: base.volumeDelta,
  } satisfies EdgeEmotionSentence;
}

function isProtectedRole(role: EdgeDocumentRole | null) {
  return role === "title" || role === "lead" || role === "climax" || role === "key_number" || role === "ending";
}

/**
 * Long-form systems such as ElevenLabs and generative/long-form TTS use wider
 * context so one weak keyword does not make a single sentence suddenly act in
 * a different voice. Reproduce that behaviour conservatively: only low-
 * confidence isolated moods are reconciled with matching neighbours. Strong
 * urgent/sad cues and document-role decisions are never flattened.
 */
function contextualizeMoods(sentences: EdgeEmotionSentence[]) {
  return sentences.map((sentence, index) => {
    if (isProtectedRole(sentence.role) || sentence.confidence >= 0.76) return sentence;
    if (sentence.mood === "urgent" || sentence.mood === "sad" || sentence.mood === "ending") return sentence;

    const previous = sentences[index - 1];
    const next = sentences[index + 1];
    const sameParagraphPrevious = previous?.paragraphIndex === sentence.paragraphIndex ? previous : null;
    const sameParagraphNext = next?.paragraphIndex === sentence.paragraphIndex ? next : null;

    if (
      sameParagraphPrevious &&
      sameParagraphNext &&
      sameParagraphPrevious.mood === sameParagraphNext.mood &&
      sameParagraphPrevious.mood !== "transition" &&
      sameParagraphPrevious.confidence >= 0.58 &&
      sameParagraphNext.confidence >= 0.58
    ) {
      const inheritedConfidence = Math.min(
        0.72,
        Math.max(0.58, (sameParagraphPrevious.confidence + sameParagraphNext.confidence) * 0.45),
      );
      return instructionForMood(sentence, sameParagraphPrevious.mood, inheritedConfidence);
    }

    // A weak one-off positive/concern/emphasis reading between neutral delivery
    // should sound like a natural shading, not a fresh synthetic prosody state.
    if (
      sentence.confidence < 0.66 &&
      sentence.mood !== "transition" &&
      (sameParagraphPrevious?.mood === "neutral" || !sameParagraphPrevious) &&
      (sameParagraphNext?.mood === "neutral" || !sameParagraphNext)
    ) {
      return instructionForMood(sentence, "neutral", 0.54);
    }

    return sentence;
  });
}

/**
 * Preserve local tempo contrast while limiting abrupt sentence-to-sentence
 * control jumps. Narrower deltas reduce the audible "new setting every sentence"
 * effect and let Microsoft's acoustic model keep a continuous speaker identity.
 */
function smoothInstructions(sentences: EdgeEmotionSentence[]) {
  const output: EdgeEmotionSentence[] = [];

  for (const sentence of sentences) {
    const previous = output[output.length - 1];
    if (!previous || previous.paragraphIndex !== sentence.paragraphIndex) {
      output.push(sentence);
      continue;
    }

    output.push({
      ...sentence,
      rateFactor: clamp(sentence.rateFactor, previous.rateFactor - 0.009, previous.rateFactor + 0.009),
      pitchDelta: clamp(sentence.pitchDelta, previous.pitchDelta - 0.05, previous.pitchDelta + 0.05),
      volumeDelta: clamp(sentence.volumeDelta, previous.volumeDelta - 0.04, previous.volumeDelta + 0.04),
    });
  }

  return output;
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
      rateFactor: clamp(base.rateFactor * lengthAdjustment(unit.text), 0.97, 1.02),
      pitchDelta: base.pitchDelta,
      volumeDelta: base.volumeDelta,
    } satisfies EdgeEmotionSentence;
  });

  return {
    version: 2,
    sourceLength: source.length,
    sentences: smoothInstructions(contextualizeMoods(raw)),
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
