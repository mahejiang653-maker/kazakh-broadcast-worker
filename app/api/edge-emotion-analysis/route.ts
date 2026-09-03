import { analyzeEdgeDocument } from "../../lib/edge-director";
import { analyzeEdgeEmotionPlan } from "../../lib/edge-emotion-director";
import { prepareEdgeHumanText } from "../../lib/edge-humanizer";

const MAX_CHARACTERS = 15000;

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
    const preparedText = prepareEdgeHumanText(text);
    if (!preparedText) {
      return Response.json({ status: "failed", error: "没有可分析的有效文本。" }, { status: 422 });
    }

    const documentPlan = analyzeEdgeDocument(preparedText);

    // V25: this endpoint is only a UI preflight/status check. For long-form text,
    // do not spend Worker CPU running the same detailed word-level emotion pass that
    // synthesis will run again. The document planner already proves the text can be
    // structured and gives us a reliable unit count.
    if (preparedText.length >= 6000) {
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
        analysisMode: "long-form-preflight",
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
