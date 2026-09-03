from pathlib import Path

emotion_path = Path('app/lib/edge-emotion-director.ts')
route_path = Path('app/api/synthesize/route.ts')

emotion = emotion_path.read_text(encoding='utf-8')
route = route_path.read_text(encoding='utf-8')

# Make implicit unquoted speech useful but conservative: require speech-like grammar,
# not merely a short sentence after any reporting verb.
old = r'''function looksLikeImplicitSpeech(text: string) {
  const value = normalize(text);
  if (!value) return false;
  if (/[?？!！]/u.test(text)) return true;
  if (/^(?:мен|біз|сен|сіз|сендер|сіздер|маған|мағанша|менің|біздің|你|你们|我|我们)(?:\s|$)/iu.test(value)) return true;
  if (/(?:ңыз|ңіз|ыңдар|іңдер|шы|ші)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  return text.length <= 220;
}'''
new = r'''function looksLikeImplicitSpeech(text: string) {
  const value = normalize(text);
  if (!value) return false;
  if (/[?？!！]/u.test(text)) return true;
  if (/^(?:мен|біз|сен|сіз|сендер|сіздер|маған|менің|біздің|жоқ|иә|әрине|меніңше|ойымша|你|你们|我|我们|不|是的|当然)(?:\s|$)/iu.test(value)) return true;
  if (/(?:ңыз|ңіз|ыңдар|іңдер|шы|ші)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  if (text.length <= 185 && /(?:керек|тиіс|мүмкін|емес|жоқ|болмайды|болады|қажет)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  if (text.length <= 145 && /(?:мын|мін|бын|бін|пын|пін|мыз|міз|сың|сің|сыз|сіз)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  return false;
}'''
if old not in emotion:
    raise SystemExit('implicit speech anchor not found')
emotion = emotion.replace(old, new, 1)
emotion = emotion.replace('          remaining: 3,', '          remaining: 2,', 1)

# Never flatten a detected live role turn back to neighboring neutral narration.
old = '''  return sentences.map((sentence, index) => {\n    if (isProtectedRole(sentence.role) || sentence.confidence >= 0.76) return sentence;'''
new = '''  return sentences.map((sentence, index) => {\n    if (\n      isProtectedRole(sentence.role) ||\n      sentence.confidence >= 0.76 ||\n      sentence.speakerTurn > 0 ||\n      !["narration", "reported"].includes(sentence.speechAct)\n    ) return sentence;'''
if old not in emotion:
    raise SystemExit('contextualize role-turn anchor not found')
emotion = emotion.replace(old, new, 1)

# Story renderer receives the same document plan as news/calm/expressive so it can
# use semantic punctuation gating and Kazakh dependency no-pause zones.
old = '''function renderContinuousStoryBody(\n  sentences: EdgeEmotionPlan["sentences"],\n  baseSpeed: number,\n  basePitch: number,\n  baseVolume: number,\n  useMultilingual: boolean,\n) {'''
new = '''function renderContinuousStoryBody(\n  sentences: EdgeEmotionPlan["sentences"],\n  baseSpeed: number,\n  basePitch: number,\n  baseVolume: number,\n  useMultilingual: boolean,\n  documentPlan?: EdgeDocumentPlan,\n) {'''
if old not in route:
    raise SystemExit('story body signature anchor not found')
route = route.replace(old, new, 1)

old = '''      const canJoin =\n        previous &&\n        previous.beat === direction.beat &&\n        previous.items.length < maxItems &&\n        previousChars + sentence.text.length <= maxChars;'''
new = '''      const previousTurn = previous?.items[0]?.speakerTurn ?? 0;\n      const sameRoleTurn =\n        (previousTurn === 0 && sentence.speakerTurn === 0) ||\n        previousTurn === sentence.speakerTurn;\n      const canJoin =\n        previous &&\n        previous.beat === direction.beat &&\n        sameRoleTurn &&\n        previous.items.length < maxItems &&\n        previousChars + sentence.text.length <= maxChars;'''
if old not in route:
    raise SystemExit('story canJoin anchor not found')
route = route.replace(old, new, 1)

old = '''      const rawText = group.items.map((sentence) => sentence.text).join(" ");\n      const content = renderStoryPunctuationAwareContent(rawText, useMultilingual);\n\n      if (group.beat === "narrator") {\n        paragraphBody += `${content} `;\n        continue;\n      }\n\n      // Emotion is visible but bounded. We never turn the narrator into a\n      // different person, and only genuine story beats receive a local span.\n      const strength = group.beat === "dialogue" ? 0.62 : group.beat === "ending" ? 0.72 : 0.7;\n      const rate = clamp(direction.rate * strength, -3.8, 3.4);\n      const pitch = clamp(direction.pitch * strength, -0.75, 0.75);\n      const volume = clamp(direction.volume * strength, -0.7, 0.7);\n\n      paragraphBody += `<prosody rate="${signedPercent(rate)}" pitch="${signedPercent(pitch)}" volume="${signedPercent(volume)}">${content}</prosody> `;'''
new = '''      const rawText = group.items.map((sentence) => sentence.text).join(" ");\n\n      // Emotion is visible but bounded. All story text now passes through the\n      // same semantic punctuation + Kazakh dependency layer as broadcast text.\n      const strength =\n        group.beat === "narrator" ? 0 : group.beat === "dialogue" ? 0.62 : group.beat === "ending" ? 0.72 : 0.7;\n      const rate = clamp(direction.rate * strength, -3.8, 3.4);\n      const pitch = clamp(direction.pitch * strength, -0.75, 0.75);\n      const volume = clamp(direction.volume * strength, -0.7, 0.7);\n      const renderLanguageAwareText = useMultilingual\n        ? (value: string) => renderStoryTextSegment(value, true)\n        : undefined;\n      const content = renderEdgeOmniInspiredMarkup(\n        rawText,\n        {\n          speed: clamp(1 + rate / 100, 0.94, 1.06),\n          pitch,\n          volume,\n        },\n        documentPlan,\n        renderLanguageAwareText,\n      );\n\n      paragraphBody += `${content} `;'''
if old not in route:
    raise SystemExit('story content anchor not found')
route = route.replace(old, new, 1)

old = '''      baseVolume,\n      useMultilingual,\n    );'''
new = '''      baseVolume,\n      useMultilingual,\n      documentPlan,\n    );'''
# Only first matching call is story return.
if old not in route:
    raise SystemExit('story call anchor not found')
route = route.replace(old, new, 1)

emotion_path.write_text(emotion, encoding='utf-8')
route_path.write_text(route, encoding='utf-8')
