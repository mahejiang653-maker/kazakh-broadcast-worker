import { analyzeEdgeDocument } from "../../lib/edge-director";
import { analyzeEdgeEmotionPlan } from "../../lib/edge-emotion-director";
import { prepareEdgeHumanText } from "../../lib/edge-humanizer";

const MAX_CHARACTERS = 15000;
const STUDIO_DIRECTION_TAG_PATTERN =
  /\[(?:开心|悲伤|惊讶|生气|害怕|厌恶|平静|耳语|短停顿|长停顿|叹气|轻笑|清嗓)\]/gu;

function sanitizeStudioDirectionTags(text: string) {
  return text
    .replaceAll("[长停顿]", "\n\n")
    .replaceAll("[短停顿]", "，")
    .replace(STUDIO_DIRECTION_TAG_PATTERN, "")
    .trim();
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
    const preparedText = prepareEdgeHumanText(sanitizeStudioDirectionTags(text));
    if (!preparedText) {
      return Response.json({ status: "failed", error: "没有可分析的有效文本。" }, { status: 422 });
    }

    const documentPlan = analyzeEdgeDocument(preparedText);

    // This endpoint is only a UI preflight/status check. Do not duplicate the
    // expensive word-level emotion pass for normal/long broadcast scripts: actual
    // synthesis already runs the full director. Keeping the UI probe lightweight
    // prevents Cloudflare from terminating a preflight before TTS even starts.
    if (preparedText.length >= 1800) {
      if (!documentPlan.segments.length) {
        return Response.json({ status: "failed", error: "未识别到可分析的句子。" }, { status: 422 });
      }
      const tokenCount = preparedText.match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu)?.length ?? 0;
      return Response.json({
        status: "completed",
        sentenceCount: documentPlan.segments.length,
        moodCounts: {},
        tokenCount,
        emotionEvidenceCount: 0,
        version: 4,
        analysisMode: "lightweight-preflight",
      });
    }

    const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);
    if (!emotionPlan.sentences.length) {
      return Response.json({ status: "failed", error: "未识别到可分析的句子。" }, { status: 422 });
    }

    const moodCounts = emotionPlan.sentences.reduce<Record<string, number>>((counts, sentence) => {
      counts[sentence.mood] = (counts[sentence.mood] ?? 0) + 1;
      return counts;
    }, {});

    return Response.json({
      status: "completed",
      sentenceCount: emotionPlan.sentences.length,
      moodCounts,
      tokenCount: emotionPlan.tokenCount,
      emotionEvidenceCount: emotionPlan.emotionEvidenceCount,
      version: emotionPlan.version,
    });
  } catch (error) {
    console.error("Edge emotion analysis failed", error);
    return Response.json(
      { status: "failed", error: "全文情绪分析失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
