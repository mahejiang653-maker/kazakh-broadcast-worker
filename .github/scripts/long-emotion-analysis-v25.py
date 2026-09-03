from pathlib import Path

# V25: make 9k-15k character emotion analysis safe on Cloudflare Worker CPU.

# 1) Optimize story emotion boundary discovery from repeated set sorting to O(n).
trajectory_path = Path('app/lib/edge-story-emotion-trajectory.ts')
text = trajectory_path.read_text()
old = '''function candidateBoundaries(text: string, tokens: Token[]) {
  const boundaries = new Set<number>([0, text.length]);
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[。.!?！？；;：:—–…]/u.test(char)) boundaries.add(index + 1);
    else if (/[，,]/u.test(char)) {
      const previous = [...boundaries].sort((a, b) => a - b).at(-1) ?? 0;
      if (index - previous >= 28) boundaries.add(index + 1);
    }
  }
  for (const token of tokens) {
    if (TURN_WORDS.has(token.normalized) && token.start >= 18 && text.length - token.start >= 20) {
      boundaries.add(token.start);
    }
  }
  return [...boundaries].sort((a, b) => a - b);
}'''
new = '''function candidateBoundaries(text: string, tokens: Token[]) {
  const boundaries = new Set<number>([0, text.length]);
  let lastPunctuationBoundary = 0;

  // V25: scan punctuation in one linear pass. The old implementation rebuilt
  // and sorted the entire boundary set at every comma, which became expensive
  // on 9k-15k character long-form scripts with many commas.
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[。.!?！？；;：:—–…]/u.test(char)) {
      const boundary = index + 1;
      boundaries.add(boundary);
      lastPunctuationBoundary = boundary;
    } else if (/[，,]/u.test(char) && index - lastPunctuationBoundary >= 28) {
      const boundary = index + 1;
      boundaries.add(boundary);
      lastPunctuationBoundary = boundary;
    }
  }

  for (const token of tokens) {
    if (TURN_WORDS.has(token.normalized) && token.start >= 18 && text.length - token.start >= 20) {
      boundaries.add(token.start);
    }
  }
  return [...boundaries].sort((a, b) => a - b);
}'''
assert old in text, 'candidateBoundaries anchor not found'
text = text.replace(old, new, 1)
trajectory_path.write_text(text)

# 2) Avoid O(sentence_count * segment_count) role lookup in the normal case,
# and avoid rescanning the full source trajectory after every sentence was already scanned.
emotion_path = Path('app/lib/edge-emotion-director.ts')
text = emotion_path.read_text()
old = '''function roleForSentence(normalized: string, documentPlan?: EdgeDocumentPlan) {
  if (!documentPlan?.segments.length || !normalized) return null;
  let bestRole: EdgeDocumentRole | null = null;
  let bestScore = 0;
  const words = new Set(normalized.split(" ").filter((word) => word.length >= 3));

  for (const segment of documentPlan.segments) {'''
new = '''function roleForSentence(
  normalized: string,
  documentPlan?: EdgeDocumentPlan,
  preferredIndex?: number,
) {
  if (!documentPlan?.segments.length || !normalized) return null;

  // V25: the document planner and emotion planner normally walk the same sentence
  // order. Resolve that direct match first and only fall back to the full fuzzy
  // scan when source formatting caused the two segmenters to disagree.
  if (typeof preferredIndex === "number") {
    const preferred = documentPlan.segments[preferredIndex];
    if (
      preferred &&
      (preferred.normalized === normalized ||
        preferred.normalized.includes(normalized) ||
        normalized.includes(preferred.normalized))
    ) {
      return preferred.role;
    }
  }

  let bestRole: EdgeDocumentRole | null = null;
  let bestScore = 0;
  const words = new Set(normalized.split(" ").filter((word) => word.length >= 3));

  for (const segment of documentPlan.segments) {'''
assert old in text, 'roleForSentence anchor not found'
text = text.replace(old, new, 1)

old = '''export function analyzeEdgeEmotionPlan(source: string, documentPlan?: EdgeDocumentPlan): EdgeEmotionPlan {
  const units = sentenceUnits(source);
  const speechStructure = inferSpeechStructure(units);
  const raw = units.map((unit, index) => {
    const normalized = normalize(unit.text);
    const role = roleForSentence(normalized, documentPlan);'''
new = '''export function analyzeEdgeEmotionPlan(source: string, documentPlan?: EdgeDocumentPlan): EdgeEmotionPlan {
  const units = sentenceUnits(source);
  const speechStructure = inferSpeechStructure(units);
  let totalTokenCount = 0;
  let totalEmotionEvidenceCount = 0;
  const raw = units.map((unit, index) => {
    const normalized = normalize(unit.text);
    const role = roleForSentence(normalized, documentPlan, index);'''
assert old in text, 'analyzeEdgeEmotionPlan head anchor not found'
text = text.replace(old, new, 1)

old = '''    const wordTrajectory = analyzeStoryEmotionTrajectory(unit.text);
    const wordMood = moodFromStoryEmotion(wordTrajectory.dominantEmotion);'''
new = '''    const wordTrajectory = analyzeStoryEmotionTrajectory(unit.text);
    totalTokenCount += wordTrajectory.tokenCount;
    totalEmotionEvidenceCount += wordTrajectory.evidenceCount;
    const wordMood = moodFromStoryEmotion(wordTrajectory.dominantEmotion);'''
assert old in text, 'wordTrajectory anchor not found'
text = text.replace(old, new, 1)

old = '''  const sourceTrajectory = analyzeStoryEmotionTrajectory(source);
  return {
    version: 4,
    sourceLength: source.length,
    tokenCount: sourceTrajectory.tokenCount,
    emotionEvidenceCount: sourceTrajectory.evidenceCount,
    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),
  };'''
new = '''  // V25: every sentence has already been token/emotion-scanned above. Re-scanning
  // the entire 9k-15k source here duplicated the most expensive story analysis.
  // Aggregating the sentence trajectories preserves the same useful counters while
  // keeping long-form CPU cost close to linear.
  return {
    version: 4,
    sourceLength: source.length,
    tokenCount: totalTokenCount,
    emotionEvidenceCount: totalEmotionEvidenceCount,
    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),
  };'''
assert old in text, 'sourceTrajectory return anchor not found'
text = text.replace(old, new, 1)
emotion_path.write_text(text)

# 3) The UI preflight endpoint does not need to compute the entire detailed emotion
# plan for long texts just to display "analysis completed" and a sentence count.
# Synthesis still performs the full optimized plan later.
route_path = Path('app/api/edge-emotion-analysis/route.ts')
text = route_path.read_text()
old = '''    const documentPlan = analyzeEdgeDocument(preparedText);
    const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);
    if (!emotionPlan.sentences.length) {
      return Response.json({ status: "failed", error: "未识别到可分析的句子。" }, { status: 422 });
    }

    const moodCounts = emotionPlan.sentences.reduce<Record<string, number>>((counts, sentence) => {'''
new = '''    const documentPlan = analyzeEdgeDocument(preparedText);

    // V25: this endpoint is only a UI preflight/status check. For long-form text,
    // do not spend Worker CPU running the same detailed word-level emotion pass that
    // synthesis will run again. The document planner already proves the text can be
    // structured and gives us a reliable unit count.
    if (preparedText.length >= 6000) {
      if (!documentPlan.segments.length) {
        return Response.json({ status: "failed", error: "未识别到可分析的句子。" }, { status: 422 });
      }
      const tokenCount = preparedText.match(/[\\p{L}\\p{M}]+(?:[’'-][\\p{L}\\p{M}]+)*/gu)?.length ?? 0;
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

    const moodCounts = emotionPlan.sentences.reduce<Record<string, number>>((counts, sentence) => {'''
assert old in text, 'emotion route anchor not found'
text = text.replace(old, new, 1)
route_path.write_text(text)
