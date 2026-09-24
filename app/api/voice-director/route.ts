import { analyzeEdgeDocument } from "../../lib/edge-director";
import {
  analyzeEdgeEmotionPlan,
  type EdgeEmotionSentence,
} from "../../lib/edge-emotion-director";
import { prepareEdgeHumanText } from "../../lib/edge-humanizer";

const MAX_CHARACTERS = 15000;
const STUDIO_DIRECTION_TAG_PATTERN =
  /\[(?:开心|悲伤|惊讶|生气|害怕|厌恶|平静|耳语|短停顿|长停顿|叹气|轻笑|清嗓)\]/gu;

type IssaiEmotion =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "fearful"
  | "surprised"
  | "disgusted";

const EMOTION_META: Record<IssaiEmotion, { label: string; tag: string | null }> = {
  neutral: { label: "平静", tag: null },
  happy: { label: "开心", tag: "[开心]" },
  sad: { label: "悲伤", tag: "[悲伤]" },
  angry: { label: "生气", tag: "[生气]" },
  fearful: { label: "害怕", tag: "[害怕]" },
  surprised: { label: "惊讶", tag: "[惊讶]" },
  disgusted: { label: "厌恶", tag: "[厌恶]" },
};

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

const DISGUST = [
  "жиіркен", "жирен", "жек көр", "жексұрын", "лақсы",
  "厌恶", "恶心", "反感", "嫌恶", "令人作呕", "痛恨",
];

function sanitizeStudioDirectionTags(text: string) {
  return text
    .replaceAll("\u0000", "")
    .replaceAll("[长停顿]", "\n\n")
    .replaceAll("[短停顿]", "，")
    .replace(STUDIO_DIRECTION_TAG_PATTERN, "")
    .replace(/[ \t]+\n/gu, "\n")
    .trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\[\]【】(){}«»“”"'‘’]/gu, " ")
    .replace(/[，,；;：:—–…!?！？。.]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasCue(value: string, cues: string[]) {
  const normalized = normalize(value);
  return cues.some((cue) => normalized.includes(normalize(cue)));
}

function classifyEmotion(sentence: EdgeEmotionSentence): {
  emotion: IssaiEmotion;
  confidence: number;
  reason: string;
} {
  if (hasCue(sentence.text, DISGUST)) {
    return { emotion: "disgusted", confidence: Math.max(0.86, sentence.confidence), reason: "明确厌恶语义" };
  }
  if (hasCue(sentence.text, ANGER) || sentence.speechAct === "shout") {
    return { emotion: "angry", confidence: Math.max(0.84, sentence.confidence), reason: "明确愤怒或喊话语义" };
  }
  if (hasCue(sentence.text, FEAR)) {
    return { emotion: "fearful", confidence: Math.max(0.82, sentence.confidence), reason: "明确恐惧语义" };
  }
  if (hasCue(sentence.text, SURPRISE)) {
    return { emotion: "surprised", confidence: Math.max(0.82, sentence.confidence), reason: "明确惊讶语义" };
  }
  if (sentence.speechAct === "lament" || sentence.mood === "sad") {
    return { emotion: "sad", confidence: Math.max(0.76, sentence.confidence), reason: "悲伤语义或哀叹语气" };
  }
  if (sentence.speechAct === "humor" || sentence.mood === "positive") {
    return { emotion: "happy", confidence: Math.max(0.72, sentence.confidence), reason: "积极或轻松语义" };
  }

  // News-safe default: attacks, wars, sanctions and other serious subjects stay
  // neutral unless the actual sentence contains clear emotional evidence.
  return {
    emotion: "neutral",
    confidence: Math.max(0.62, Math.min(0.88, sentence.confidence + 0.08)),
    reason: "新闻稳健基线",
  };
}

function shouldApplyEmotion(emotion: IssaiEmotion, confidence: number) {
  if (emotion === "neutral") return false;
  return confidence >= 0.72;
}

function buildDirectedText(
  source: string,
  decisions: Array<{
    text: string;
    emotionTag: string | null;
    actionTag: string | null;
  }>,
) {
  let cursor = 0;
  let output = "";

  for (const decision of decisions) {
    const index = source.indexOf(decision.text, cursor);
    if (index < 0) continue;

    output += source.slice(cursor, index);
    output += decision.text;
    if (decision.emotionTag) output += decision.emotionTag;
    if (decision.actionTag) output += decision.actionTag;
    cursor = index + decision.text.length;
  }

  output += source.slice(cursor);
  return output.trim();
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ status: "failed", error: "请求内容无效。" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ status: "failed", error: "请求内容无效。" }, { status: 400 });
  }

  const { text } = payload as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ status: "failed", error: "请先输入稿件。" }, { status: 400 });
  }
  if (text.length > MAX_CHARACTERS) {
    return Response.json(
      { status: "failed", error: `文本不能超过 ${MAX_CHARACTERS} 个字符。` },
      { status: 413 },
    );
  }

  try {
    const cleanText = sanitizeStudioDirectionTags(text);
    const preparedText = prepareEdgeHumanText(cleanText);
    if (!preparedText) {
      return Response.json({ status: "failed", error: "没有可分析的有效文本。" }, { status: 422 });
    }

    const documentPlan = analyzeEdgeDocument(preparedText);
    const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);
    if (!emotionPlan.sentences.length) {
      return Response.json({ status: "failed", error: "未识别到可分析的句子。" }, { status: 422 });
    }

    const decisions = emotionPlan.sentences.map((sentence) => {
      const classified = classifyEmotion(sentence);
      const meta = EMOTION_META[classified.emotion];
      const applied = shouldApplyEmotion(classified.emotion, classified.confidence);
      const actionTag = sentence.speechAct === "whisper" && sentence.dialogueConfidence >= 0.7
        ? "[耳语]"
        : null;

      return {
        index: sentence.index,
        paragraphIndex: sentence.paragraphIndex,
        text: sentence.text,
        emotion: classified.emotion,
        label: meta.label,
        confidence: Math.round(classified.confidence * 100) / 100,
        reason: classified.reason,
        mood: sentence.mood,
        speechAct: sentence.speechAct,
        applied,
        emotionTag: applied ? meta.tag : null,
        actionTag,
      };
    });

    const counts = decisions.reduce<Record<string, number>>((result, item) => {
      result[item.emotion] = (result[item.emotion] ?? 0) + 1;
      return result;
    }, {});

    let directedText = buildDirectedText(cleanText, decisions);

    // Keep the final directed draft inside the same 15k studio limit.
    // If a very long article has almost no remaining character budget, remove
    // the lowest-confidence optional tags first rather than truncating speech.
    if (directedText.length > MAX_CHARACTERS) {
      const removable = [...decisions]
        .filter((item) => item.emotionTag || item.actionTag)
        .sort((left, right) => left.confidence - right.confidence);

      for (const item of removable) {
        item.emotionTag = null;
        item.actionTag = null;
        item.applied = false;
        directedText = buildDirectedText(cleanText, decisions);
        if (directedText.length <= MAX_CHARACTERS) break;
      }
    }

    const taggedCount = decisions.filter((item) => item.emotionTag || item.actionTag).length;

    return Response.json({
      status: "completed",
      mode: "news-safe",
      version: 1,
      sentenceCount: decisions.length,
      taggedCount,
      counts,
      decisions,
      directedText,
    });
  } catch (error) {
    console.error("Voice director analysis failed", error);
    return Response.json(
      { status: "failed", error: "AI 导演分析失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
