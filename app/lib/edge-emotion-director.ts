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

export type EdgeSpeechAct =
  | "narration"
  | "dialogue"
  | "reported"
  | "question"
  | "command"
  | "reply"
  | "whisper"
  | "shout"
  | "lament"
  | "humor";

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
  speechAct: EdgeSpeechAct;
  speakerTurn: number;
  dialogueConfidence: number;
  paragraphMood: EdgeDeliveryMood | null;
};

export type EdgeEmotionPlan = {
  version: 3;
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

const ANGER = [
  "ашулан", "ызал", "ызаға", "қаһар", "долдан", "айғайлап",
  "愤怒", "震怒", "怒斥", "暴怒", "大发雷霆", "怒不可遏",
];

const FEAR = [
  "қорық", "үрей", "сескен", "шош", "зәресі", "қобалж",
  "害怕", "恐惧", "惊恐", "恐慌", "惶恐", "吓坏",
];

const SURPRISE = [
  "таңғал", "таңқал", "күтпеген", "ойламаған", "ғажап", "сенбеді",
  "惊讶", "震惊", "没想到", "出乎意料", "意想不到", "令人吃惊",
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

const REPORTING_SPEECH = [
  "деді", "дейді", "айтты", "айтады", "сұрады", "жауап берді", "жауап қайтарды",
  "бұйырды", "өтінді", "мәлімдеді", "хабарлады", "жазды", "түсіндірді", "ескертті",
  "деп айтты", "деп сұрады", "деп жауап берді",
  "说", "说道", "表示", "问道", "询问", "回答", "回应", "命令", "要求", "写道",
  "said", "asked", "replied", "answered", "ordered", "told", "wrote",
];
const ASK_SPEECH = ["сұрады", "сауал қойды", "问", "问道", "询问", "asked", "questioned"];
const REPLY_SPEECH = ["жауап берді", "жауап қайтарды", "回应", "回答", "replied", "answered"];
const COMMAND_SPEECH = ["бұйырды", "әмір етті", "талап етті", "命令", "要求", "ordered", "demanded"];
const WHISPER_SPEECH = ["сыбырлады", "сыбырлап", "ақырын айтты", "жай дауыспен", "低声", "轻声", "悄声", "whispered", "softly said"];
const SHOUT_SPEECH = ["айқайлады", "айғайлады", "дауыстап айтты", "ақырып", "喊道", "大喊", "怒吼", "shouted", "yelled"];
const LAMENT_SPEECH = ["жылап айтты", "еңіреп", "өкінішпен айтты", "哭着说", "哽咽", "悲伤地说", "sobbed", "cried"];
const HUMOR_SPEECH = ["күліп айтты", "жымиды", "әзілдеп", "笑着说", "开玩笑", "laughed", "joked"];

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


type SpeechInference = {
  speechAct: EdgeSpeechAct;
  speakerTurn: number;
  dialogueConfidence: number;
  inheritedMood: EdgeDeliveryMood | null;
};

function containsCue(value: string, cues: string[]) {
  const normalized = normalize(value);
  return cues.some((cue) => normalized.includes(normalize(cue)));
}

function hasExplicitDialogueMark(text: string) {
  const trimmed = text.trim();
  return (
    /^[—–-]\s*\S/u.test(trimmed) ||
    /[«“„「『][^»”」』]{1,700}[»”」』]/u.test(trimmed) ||
    /"[^"\n]{1,700}"/u.test(trimmed) ||
    /^[\p{Lu}][\p{L}'’.-]{1,30}(?:\s+[\p{Lu}][\p{L}'’.-]{1,30}){0,2}\s*[:：]\s*\S/u.test(trimmed)
  );
}

function hasReportingSpeech(text: string) {
  return containsCue(text, REPORTING_SPEECH);
}

function attributionMood(text: string): EdgeDeliveryMood | null {
  if (containsCue(text, LAMENT_SPEECH) || countHits(normalize(text), SAD) >= 1) return "sad";
  if (containsCue(text, SHOUT_SPEECH) || countHits(normalize(text), ANGER) >= 1) return "urgent";
  if (countHits(normalize(text), FEAR) >= 1) return "concern";
  if (containsCue(text, HUMOR_SPEECH)) return "positive";
  if (containsCue(text, WHISPER_SPEECH)) return "concern";
  return null;
}

function speechActFromAttribution(text: string): EdgeSpeechAct {
  if (containsCue(text, SHOUT_SPEECH)) return "shout";
  if (containsCue(text, WHISPER_SPEECH)) return "whisper";
  if (containsCue(text, LAMENT_SPEECH)) return "lament";
  if (containsCue(text, HUMOR_SPEECH)) return "humor";
  if (containsCue(text, COMMAND_SPEECH)) return "command";
  if (containsCue(text, ASK_SPEECH)) return "question";
  if (containsCue(text, REPLY_SPEECH)) return "reply";
  return "dialogue";
}

function looksLikeImplicitSpeech(text: string) {
  const value = normalize(text);
  if (!value) return false;
  if (/[?？!！]/u.test(text)) return true;
  if (/^(?:мен|біз|сен|сіз|сендер|сіздер|маған|менің|біздің|жоқ|иә|әрине|меніңше|ойымша|你|你们|我|我们|不|是的|当然)(?:\s|$)/iu.test(value)) return true;
  if (/(?:ңыз|ңіз|ыңдар|іңдер|шы|ші)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  if (text.length <= 185 && /(?:керек|тиіс|мүмкін|емес|жоқ|болмайды|болады|қажет)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  if (text.length <= 145 && /(?:мын|мін|бын|бін|пын|пін|мыз|міз|сың|сің|сыз|сіз)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  return false;
}

function inferSpeechStructure(units: Array<{ text: string; paragraphIndex: number }>): SpeechInference[] {
  const output: SpeechInference[] = [];
  let turnCounter = 0;
  let pending: { turn: number; act: EdgeSpeechAct; mood: EdgeDeliveryMood | null; paragraphIndex: number; remaining: number } | null = null;
  let activeDialogueTurn = 0;

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const text = unit.text;
    const explicit = hasExplicitDialogueMark(text);
    const reporting = hasReportingSpeech(text);
    const reportingBeforeContent = /(?:деді|дейді|айтты|айтады|сұрады|жауап берді|бұйырды|өтінді|表示|说道|问道|回答|回应|said|asked|replied|ordered)\s*[,，:：—–-]\s*\S/iu.test(text);
    const reportingAfterContent = /[,，]\s*[—–-]?\s*(?:деді|дейді|айтты|сұрады|жауап берді|said|asked|replied)(?![\p{L}\p{N}_])/iu.test(text);
    let speechAct: EdgeSpeechAct = "narration";
    let speakerTurn = 0;
    let dialogueConfidence = 0;
    let inheritedMood: EdgeDeliveryMood | null = null;

    if (pending && !reporting && looksLikeImplicitSpeech(text) && Math.abs(unit.paragraphIndex - pending.paragraphIndex) <= 1) {
      speechAct = pending.act;
      speakerTurn = pending.turn;
      dialogueConfidence = 0.78;
      inheritedMood = pending.mood;
      activeDialogueTurn = pending.turn;
      pending.remaining -= 1;
      if (pending.remaining <= 0 || /(?:деді|айтты|сұрады|жауап берді|мәлімдеді|хабарлады)/iu.test(text)) pending = null;
    }

    if (explicit || reportingBeforeContent || reportingAfterContent) {
      if (!activeDialogueTurn || /^[—–-]/u.test(text.trim()) || /^[\p{Lu}].{0,70}[:：]/u.test(text.trim())) {
        turnCounter += 1;
        activeDialogueTurn = turnCounter;
      }
      speechAct = speechActFromAttribution(text);
      if (speechAct === "dialogue" && /[?？]/u.test(text)) speechAct = "question";
      speakerTurn = activeDialogueTurn;
      dialogueConfidence = explicit ? 0.96 : 0.84;
      inheritedMood = attributionMood(text);
    } else if (reporting) {
      speechAct = "reported";
      dialogueConfidence = 0.58;
      const nextAct = speechActFromAttribution(text);
      const shouldLead = /[:：]\s*$/u.test(text.trim()) || /(?:деді|айтты|сұрады|жауап берді|бұйырды|өтінді|said|asked|replied|ordered)[.!。]?\s*$/iu.test(text.trim());
      if (shouldLead) {
        turnCounter += 1;
        pending = {
          turn: turnCounter,
          act: nextAct,
          mood: attributionMood(text),
          paragraphIndex: unit.paragraphIndex,
          remaining: 2,
        };
        activeDialogueTurn = turnCounter;
      } else {
        activeDialogueTurn = 0;
      }
    } else if (speakerTurn === 0) {
      activeDialogueTurn = 0;
    }

    if (speakerTurn > 0 && speechAct === "dialogue" && /[?？]/u.test(text)) speechAct = "question";
    if (speakerTurn > 0 && speechAct === "dialogue" && /[!！]/u.test(text) && countHits(normalize(text), ANGER) >= 1) speechAct = "shout";

    output.push({ speechAct, speakerTurn, dialogueConfidence, inheritedMood });
  }

  return output;
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
  speechAct: EdgeSpeechAct = "narration",
  inheritedMood: EdgeDeliveryMood | null = null,
): { mood: EdgeDeliveryMood; confidence: number } {
  const value = normalize(text);
  const urgent = countHits(value, URGENT);
  const angry = countHits(value, ANGER);
  const fear = countHits(value, FEAR);
  const surprise = countHits(value, SURPRISE);
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
  if (inheritedMood === "sad" || speechAct === "lament") return { mood: "sad", confidence: 0.86 };
  if (inheritedMood === "urgent" || speechAct === "shout") return { mood: "urgent", confidence: 0.84 };
  if (speechAct === "command") return { mood: urgent >= 1 || angry >= 1 ? "urgent" : "emphasis", confidence: 0.8 };
  if (speechAct === "whisper") return { mood: fear >= 1 ? "concern" : inheritedMood ?? "concern", confidence: 0.74 };
  if (speechAct === "humor" || inheritedMood === "positive") return { mood: "positive", confidence: 0.8 };
  if (speechAct === "question" && urgent === 0 && sad === 0 && concern === 0) return { mood: "serious", confidence: 0.65 };
  if (sad >= 1 && (urgent >= 1 || concern >= 1 || sad >= 2)) return { mood: "sad", confidence: 0.9 };
  if (urgent >= 2 || (urgent >= 1 && role === "climax") || (urgent >= 1 && strongPunctuation >= 1)) {
    return { mood: "urgent", confidence: 0.88 };
  }
  if (angry >= 2 || (angry >= 1 && (role === "climax" || strongPunctuation >= 1))) {
    return { mood: "urgent", confidence: 0.79 };
  }
  if (fear >= 2 || (fear >= 1 && (concern >= 1 || urgent >= 1))) {
    return { mood: "concern", confidence: 0.79 };
  }
  if (sad >= 1) return { mood: "sad", confidence: 0.78 };
  if (fear >= 1) return { mood: "concern", confidence: 0.68 };
  if (angry >= 1) return { mood: "emphasis", confidence: 0.68 };
  if (surprise >= 1) return { mood: "emphasis", confidence: 0.69 };
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

function speechActMicro(speechAct: EdgeSpeechAct) {
  const values: Record<EdgeSpeechAct, { rateFactor: number; pitchDelta: number; volumeDelta: number }> = {
    narration: { rateFactor: 1, pitchDelta: 0, volumeDelta: 0 },
    dialogue: { rateFactor: 1, pitchDelta: 0.005, volumeDelta: 0.004 },
    reported: { rateFactor: 0.996, pitchDelta: -0.008, volumeDelta: 0 },
    question: { rateFactor: 0.996, pitchDelta: 0.035, volumeDelta: 0.005 },
    command: { rateFactor: 1.012, pitchDelta: 0.03, volumeDelta: 0.028 },
    reply: { rateFactor: 0.998, pitchDelta: 0.004, volumeDelta: 0.006 },
    whisper: { rateFactor: 0.982, pitchDelta: -0.025, volumeDelta: -0.04 },
    shout: { rateFactor: 1.014, pitchDelta: 0.045, volumeDelta: 0.04 },
    lament: { rateFactor: 0.975, pitchDelta: -0.04, volumeDelta: -0.03 },
    humor: { rateFactor: 1.006, pitchDelta: 0.025, volumeDelta: 0.018 },
  };
  return values[speechAct];
}

function instructionForMood(sentence: EdgeEmotionSentence, mood: EdgeDeliveryMood, confidence: number) {
  const base = MOOD_BASE[mood];
  const speech = speechActMicro(sentence.speechAct);
  const paragraph = sentence.paragraphMood ? MOOD_BASE[sentence.paragraphMood] : MOOD_BASE.neutral;
  const paragraphWeight =
    sentence.speakerTurn > 0
      ? 0.08
      : confidence < 0.66
        ? 0.32
        : confidence < 0.76
          ? 0.18
          : 0.08;

  return {
    ...sentence,
    mood,
    confidence,
    rateFactor: clamp(
      base.rateFactor *
        speech.rateFactor *
        (1 + (paragraph.rateFactor - 1) * paragraphWeight) *
        lengthAdjustment(sentence.text),
      0.96,
      1.03,
    ),
    pitchDelta: clamp(
      base.pitchDelta + speech.pitchDelta + paragraph.pitchDelta * paragraphWeight,
      -0.11,
      0.11,
    ),
    volumeDelta: clamp(
      base.volumeDelta + speech.volumeDelta + paragraph.volumeDelta * paragraphWeight,
      -0.09,
      0.12,
    ),
  } satisfies EdgeEmotionSentence;
}

function applyParagraphMoodContext(sentences: EdgeEmotionSentence[]) {
  const byParagraph = new Map<number, EdgeEmotionSentence[]>();
  for (const sentence of sentences) {
    const bucket = byParagraph.get(sentence.paragraphIndex) ?? [];
    bucket.push(sentence);
    byParagraph.set(sentence.paragraphIndex, bucket);
  }

  const moodByParagraph = new Map<number, EdgeDeliveryMood | null>();
  for (const [paragraphIndex, items] of byParagraph) {
    const scores = new Map<EdgeDeliveryMood, number>();
    let total = 0;
    for (const item of items) {
      if (["neutral", "transition", "ending"].includes(item.mood)) continue;
      const weight = Math.max(0.2, Math.min(1.4, item.text.length / 90)) * item.confidence;
      scores.set(item.mood, (scores.get(item.mood) ?? 0) + weight);
      total += weight;
    }
    let best: EdgeDeliveryMood | null = null;
    let bestScore = 0;
    for (const [mood, score] of scores) {
      if (score > bestScore) {
        best = mood;
        bestScore = score;
      }
    }
    moodByParagraph.set(paragraphIndex, total > 0 && bestScore / total >= 0.42 ? best : null);
  }

  return sentences.map((sentence) => {
    const paragraphMood = moodByParagraph.get(sentence.paragraphIndex) ?? null;
    const contextual = { ...sentence, paragraphMood };
    return instructionForMood(contextual, sentence.mood, sentence.confidence);
  });
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
    if (
      isProtectedRole(sentence.role) ||
      sentence.confidence >= 0.76 ||
      sentence.speakerTurn > 0 ||
      !["narration", "reported"].includes(sentence.speechAct)
    ) return sentence;
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

    const roleTurnChanged =
      previous.speakerTurn > 0 &&
      sentence.speakerTurn > 0 &&
      previous.speakerTurn !== sentence.speakerTurn;
    const rateStep = roleTurnChanged ? 0.014 : 0.009;
    const pitchStep = roleTurnChanged ? 0.075 : 0.05;
    const volumeStep = roleTurnChanged ? 0.06 : 0.04;

    output.push({
      ...sentence,
      rateFactor: clamp(sentence.rateFactor, previous.rateFactor - rateStep, previous.rateFactor + rateStep),
      pitchDelta: clamp(sentence.pitchDelta, previous.pitchDelta - pitchStep, previous.pitchDelta + pitchStep),
      volumeDelta: clamp(sentence.volumeDelta, previous.volumeDelta - volumeStep, previous.volumeDelta + volumeStep),
    });
  }

  return output;
}

export function analyzeEdgeEmotionPlan(source: string, documentPlan?: EdgeDocumentPlan): EdgeEmotionPlan {
  const units = sentenceUnits(source);
  const speechStructure = inferSpeechStructure(units);
  const raw = units.map((unit, index) => {
    const normalized = normalize(unit.text);
    const role = roleForSentence(normalized, documentPlan);
    const speech = speechStructure[index] ?? {
      speechAct: "narration" as EdgeSpeechAct,
      speakerTurn: 0,
      dialogueConfidence: 0,
      inheritedMood: null,
    };
    const { mood, confidence } = chooseMood(
      unit.text,
      role,
      index,
      units.length,
      speech.speechAct,
      speech.inheritedMood,
    );

    const draft = {
      index,
      paragraphIndex: unit.paragraphIndex,
      text: unit.text,
      normalized,
      role,
      mood,
      confidence,
      speechAct: speech.speechAct,
      speakerTurn: speech.speakerTurn,
      dialogueConfidence: speech.dialogueConfidence,
      paragraphMood: null,
      rateFactor: 1,
      pitchDelta: 0,
      volumeDelta: 0,
    } satisfies EdgeEmotionSentence;
    return instructionForMood(draft, mood, confidence);
  });

  return {
    version: 3,
    sourceLength: source.length,
    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),
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
        speechAct: "narration",
        speakerTurn: 0,
        dialogueConfidence: 0,
        paragraphMood: null,
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
