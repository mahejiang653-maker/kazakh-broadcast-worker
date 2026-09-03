from pathlib import Path

path = Path('app/lib/edge-emotion-director.ts')
text = path.read_text()

old = '''function roleForSentence(\n  normalized: string,\n  documentPlan?: EdgeDocumentPlan,\n  preferredIndex?: number,\n) {\n  if (!documentPlan?.segments.length || !normalized) return null;\n\n  // V25: the document planner and emotion planner normally walk the same sentence\n  // order. Resolve that direct match first and only fall back to the full fuzzy\n  // scan when source formatting caused the two segmenters to disagree.\n  if (typeof preferredIndex === "number") {\n    const preferred = documentPlan.segments[preferredIndex];\n    if (\n      preferred &&\n      (preferred.normalized === normalized ||\n        preferred.normalized.includes(normalized) ||\n        normalized.includes(preferred.normalized))\n    ) {\n      return preferred.role;\n    }\n  }\n\n  let bestRole: EdgeDocumentRole | null = null;'''
new = '''function roleForSentence(normalized: string, documentPlan?: EdgeDocumentPlan) {\n  if (!documentPlan?.segments.length || !normalized) return null;\n  let bestRole: EdgeDocumentRole | null = null;'''
assert old in text, 'roleForSentence V25 block not found'
text = text.replace(old, new, 1)

text = text.replace('''  let totalTokenCount = 0;\n  let totalEmotionEvidenceCount = 0;\n  const raw = units.map((unit, index) => {\n    const normalized = normalize(unit.text);\n    const role = roleForSentence(normalized, documentPlan, index);''', '''  const raw = units.map((unit, index) => {\n    const normalized = normalize(unit.text);\n    const role = roleForSentence(normalized, documentPlan);''', 1)

text = text.replace('''    const wordTrajectory = analyzeStoryEmotionTrajectory(unit.text);\n    totalTokenCount += wordTrajectory.tokenCount;\n    totalEmotionEvidenceCount += wordTrajectory.evidenceCount;\n    const wordMood = moodFromStoryEmotion(wordTrajectory.dominantEmotion);''', '''    const wordTrajectory = analyzeStoryEmotionTrajectory(unit.text);\n    const wordMood = moodFromStoryEmotion(wordTrajectory.dominantEmotion);''', 1)

old = '''  // V25: every sentence has already been token/emotion-scanned above. Re-scanning\n  // the entire 9k-15k source here duplicated the most expensive story analysis.\n  // Aggregating the sentence trajectories preserves the same useful counters while\n  // keeping long-form CPU cost close to linear.\n  return {\n    version: 4,\n    sourceLength: source.length,\n    tokenCount: totalTokenCount,\n    emotionEvidenceCount: totalEmotionEvidenceCount,\n    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),\n  };'''
new = '''  // V26: restore the proven pre-V25 full-plan behavior for short texts and actual\n  // synthesis. Long UI preflight remains lightweight in the API route, while the\n  // core planner keeps its original semantics and counters.\n  const sourceTrajectory = analyzeStoryEmotionTrajectory(source);\n  return {\n    version: 4,\n    sourceLength: source.length,\n    tokenCount: sourceTrajectory.tokenCount,\n    emotionEvidenceCount: sourceTrajectory.evidenceCount,\n    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),\n  };'''
assert old in text, 'V25 aggregate return block not found'
text = text.replace(old, new, 1)

path.write_text(text)
