from pathlib import Path

emotion_path = Path('app/lib/edge-emotion-director.ts')
emotion = emotion_path.read_text()

old = 'import { structureEdgeText } from "./edge-natural-structure";\n'
new = old + 'import { analyzeStoryEmotionTrajectory, type StoryEmotionKind } from "./edge-story-emotion-trajectory";\n'
assert old in emotion
emotion = emotion.replace(old, new, 1)

old = '''export type EdgeEmotionPlan = {\n  version: 3;\n  sourceLength: number;\n  sentences: EdgeEmotionSentence[];\n};'''
new = '''export type EdgeEmotionPlan = {\n  version: 4;\n  sourceLength: number;\n  tokenCount: number;\n  emotionEvidenceCount: number;\n  sentences: EdgeEmotionSentence[];\n};'''
assert old in emotion
emotion = emotion.replace(old, new, 1)

anchor = '''function lengthAdjustment(text: string) {'''
insert = '''function moodFromStoryEmotion(emotion: StoryEmotionKind): EdgeDeliveryMood | null {\n  switch (emotion) {\n    case "joy":\n    case "relief":\n    case "humor":\n      return "positive";\n    case "sadness":\n    case "shame":\n      return "sad";\n    case "fear":\n    case "suspense":\n      return "concern";\n    case "anger":\n      return "urgent";\n    case "surprise":\n    case "determination":\n      return "emphasis";\n    case "tender":\n      return "positive";\n    default:\n      return null;\n  }\n}\n\n'''
assert anchor in emotion
emotion = emotion.replace(anchor, insert + anchor, 1)

old = '''    const { mood, confidence } = chooseMood(\n      unit.text,\n      role,\n      index,\n      units.length,\n      speech.speechAct,\n      speech.inheritedMood,\n    );\n\n    const draft = {'''
new = '''    let { mood, confidence } = chooseMood(\n      unit.text,\n      role,\n      index,\n      units.length,\n      speech.speechAct,\n      speech.inheritedMood,\n    );\n\n    // V9: every word is tokenized and participates in the story emotion scan.\n    // Emotion-bearing roots, morphology, intensifiers, softeners, negation and\n    // punctuation can enrich a weak sentence-level classification. This remains\n    // subordinate to strong dialogue/document-role decisions.\n    const wordTrajectory = analyzeStoryEmotionTrajectory(unit.text);\n    const wordMood = moodFromStoryEmotion(wordTrajectory.dominantEmotion);\n    if (wordMood && wordTrajectory.evidenceCount > 0 && !isProtectedRole(role)) {\n      const wordConfidence = clamp(\n        0.57 + Math.min(0.2, wordTrajectory.evidenceCount * 0.045) + wordTrajectory.volatility * 0.08,\n        0.57,\n        0.82,\n      );\n      if (mood === "neutral" || confidence < wordConfidence) {\n        mood = wordMood;\n        confidence = wordConfidence;\n      }\n    }\n\n    const draft = {'''
assert old in emotion
emotion = emotion.replace(old, new, 1)

old = '''  return {\n    version: 3,\n    sourceLength: source.length,\n    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),\n  };'''
new = '''  const sourceTrajectory = analyzeStoryEmotionTrajectory(source);\n  return {\n    version: 4,\n    sourceLength: source.length,\n    tokenCount: sourceTrajectory.tokenCount,\n    emotionEvidenceCount: sourceTrajectory.evidenceCount,\n    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),\n  };'''
assert old in emotion
emotion = emotion.replace(old, new, 1)

emotion_path.write_text(emotion)

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

old = '''import { structureEdgeText } from "../../lib/edge-natural-structure";\n'''
new = old + '''import { analyzeStoryEmotionTrajectory } from "../../lib/edge-story-emotion-trajectory";\n'''
assert old in route
route = route.replace(old, new, 1)

old = '''      const content = renderEdgeOmniInspiredMarkup(\n        rawText,\n        {\n          speed: clamp(1 + rate / 100, 0.94, 1.06),\n          pitch,\n          volume,\n          deliveryMode: "story",\n        },\n        documentPlan,\n        renderLanguageAwareText,\n      );\n\n      paragraphBody += `${content} `;'''
new = '''      // V9 word-aware story delivery: analyze every token, then collapse the\n      // evidence into at most four smooth emotional spans. We never create a\n      // prosody span per word; that would destroy long-form speaker continuity.\n      const trajectory = analyzeStoryEmotionTrajectory(rawText);\n      const emotionalSpans = trajectory.spans.length\n        ? trajectory.spans\n        : [{\n            text: rawText,\n            emotion: "neutral" as const,\n            intensity: 0,\n            evidenceCount: 0,\n            rateFactor: 1,\n            pitchDelta: 0,\n            volumeDelta: 0,\n          }];\n      const trajectoryStrength = clamp(\n        0.54 + trajectory.volatility * 0.2 + (group.beat === "dialogue" ? 0.12 : 0),\n        0.54,\n        0.84,\n      );\n      const content = emotionalSpans\n        .map((span) => {\n          const evidenceScale = span.evidenceCount > 0 ? trajectoryStrength : 0.28;\n          const localSpeed = clamp(\n            (1 + rate / 100) * (1 + (span.rateFactor - 1) * evidenceScale),\n            0.92,\n            1.085,\n          );\n          const localPitch = clamp(\n            pitch + span.pitchDelta * evidenceScale,\n            -1.85,\n            1.85,\n          );\n          const localVolume = clamp(\n            volume + span.volumeDelta * evidenceScale,\n            -1.65,\n            1.65,\n          );\n          return renderEdgeOmniInspiredMarkup(\n            span.text,\n            {\n              speed: localSpeed,\n              pitch: localPitch,\n              volume: localVolume,\n              deliveryMode: "story",\n            },\n            documentPlan,\n            renderLanguageAwareText,\n          );\n        })\n        .join("");\n\n      paragraphBody += `${content} `;'''
assert old in route
route = route.replace(old, new, 1)
route_path.write_text(route)

analysis_path = Path('app/api/edge-emotion-analysis/route.ts')
analysis = analysis_path.read_text()
old = '''      moodCounts,\n      version: emotionPlan.version,\n'''
new = '''      moodCounts,\n      tokenCount: emotionPlan.tokenCount,\n      emotionEvidenceCount: emotionPlan.emotionEvidenceCount,\n      version: emotionPlan.version,\n'''
assert old in analysis
analysis = analysis.replace(old, new, 1)
analysis_path.write_text(analysis)

page_path = Path('app/page.tsx')
page = page_path.read_text()
old = '{ id: "story", label: "故事版", note: "博主讲述 · 角色融入 · 情绪对白", rateFactor: 1 },'
new = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 真人旁白 · 角色融入", rateFactor: 1 },'
assert old in page
page = page.replace(old, new, 1)
page_path.write_text(page)
