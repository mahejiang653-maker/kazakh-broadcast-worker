from pathlib import Path
import re

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

pattern = re.compile(r'''  type DeliveryGroup = \{[\s\S]*?  return `<prosody rate="\$\{speedToRate\(baseSpeed\)\}" pitch="\$\{signedPercent\(basePitch\)\}" volume="\$\{signedPercent\(baseVolume\)\}">\$\{body\}</prosody>`;\n\}''')
replacement = '''  // V11 broadcast continuity: preserve fine document/emotion analysis, but feed
  // Edge one long presenter movement per synthesis chunk. Item openings/closings,
  // questions, exclamations and true semantic paragraph boundaries are handled
  // locally inside the Omni renderer instead of creating a fresh acoustic block
  // for every paragraph or emotion tempo zone.
  const totalChars = Math.max(
    1,
    sentences.reduce((sum, sentence) => sum + sentence.text.length, 0),
  );
  const weighted = sentences.reduce(
    (acc, sentence) => {
      const weight = sentence.text.length / totalChars;
      acc.rate += (sentence.rateFactor - 1) * 100 * weight;
      acc.pitch += sentence.pitchDelta * weight;
      acc.volume += sentence.volumeDelta * weight;
      return acc;
    },
    { rate: 0, pitch: 0, volume: 0 },
  );

  // News delivery should react to the document without sounding like every
  // sentence received a new voice setting. Keep mood shading restrained and
  // let the semantic/news-cadence layer carry most local prominence.
  const continuityEmotionStrength = emotionStrength *
    (preset === "expressive" ? 0.64 : preset === "bulletin" ? 0.58 : 0.52);
  weighted.rate = clamp(weighted.rate * continuityEmotionStrength, -2.1, 2.1);
  weighted.pitch = clamp(weighted.pitch * continuityEmotionStrength, -0.42, 0.42);
  weighted.volume = clamp(weighted.volume * continuityEmotionStrength, -0.38, 0.38);

  const renderLanguageAwareText = useMultilingual
    ? (value: string) =>
        splitEdgeLanguageRuns(value)
          .map(
            (run) =>
              `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
    : undefined;

  const content = documentPlan
    ? renderEdgeOmniInspiredMarkup(
        text,
        {
          speed: clamp(1 + weighted.rate / 100, 0.965, 1.035),
          pitch: weighted.pitch,
          volume: weighted.volume,
          deliveryMode: "broadcast",
        },
        documentPlan,
        renderLanguageAwareText,
      )
    : useMultilingual
      ? splitEdgeLanguageRuns(text)
          .map(
            (run) =>
              `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : escapeXml(text);

  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${content}</prosody>`;
}'''
route, count = pattern.subn(replacement, route, count=1)
assert count == 1, f'broadcast body replacement count={count}'
route_path.write_text(route)

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
omni = omni_path.read_text()

# Add local flag to Phrase.
old = '''  reportingLead?: boolean;\n  boundaryStrength?: number;\n};'''
new = '''  reportingLead?: boolean;\n  newsItemClose?: boolean;\n  boundaryStrength?: number;\n};'''
assert old in omni
omni = omni.replace(old, new, 1)

# Add broadcast cadence annotation before semantic boundaries.
anchor = '''function annotateSemanticBoundaries(\n  phrases: Phrase[],\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {'''
insert = '''function annotateBroadcastCadence(\n  phrases: Phrase[],\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {\n  if (deliveryMode !== "broadcast") return phrases;\n  return phrases.map((phrase, index) => {\n    const next = phrases[index + 1];\n    if (!next || !startsWithNewsItemCue(next.text)) return phrase;\n    return {\n      ...phrase,\n      newsItemClose: true,\n      micro: {\n        rateFactor: clamp(phrase.micro.rateFactor * 0.994, 0.95, 1.03),\n        pitchDelta: clamp(phrase.micro.pitchDelta - 0.025, -0.18, 0.18),\n        volumeDelta: clamp(phrase.micro.volumeDelta - 0.008, -0.12, 0.2),\n      },\n    };\n  });\n}\n\n'''
assert anchor in omni
omni = omni.replace(anchor, insert + anchor, 1)

# Make the previous item ending a semantic presenter boundary when a new item starts.
old = '''  if (\n    deliveryMode === "broadcast" &&\n    startsWithNewsItemCue(current.text) &&\n    !["question", "exclamation", "mixed"].includes(kind)\n  ) {\n    strength = Math.max(strength, kind === "period" ? 0.6 : 0.48);\n  }'''
new = '''  if (\n    deliveryMode === "broadcast" &&\n    startsWithNewsItemCue(current.text) &&\n    !["question", "exclamation", "mixed"].includes(kind)\n  ) {\n    strength = Math.max(strength, kind === "period" ? 0.6 : 0.48);\n  }\n\n  if (\n    deliveryMode === "broadcast" &&\n    startsWithNewsItemCue(next.text) &&\n    !["question", "exclamation", "mixed"].includes(kind)\n  ) {\n    strength = Math.max(strength, kind === "period" ? 0.68 : 0.56);\n  }'''
assert old in omni
omni = omni.replace(old, new, 1)

# Presenter hand-off belongs at actual item boundaries only.
old = '''  if (deliveryMode === "story") {\n    if (punctuationRendered) return 0;\n    if (kind === "paragraph") return strength >= 0.82 ? 24 : 0;\n    return 0;\n  }\n\n  // If native punctuation is rendered, let the neural voice realize its own'''
new = '''  if (deliveryMode === "story") {\n    if (punctuationRendered) return 0;\n    if (kind === "paragraph") return strength >= 0.82 ? 24 : 0;\n    return 0;\n  }\n\n  // Broadcast V11 keeps the presenter pause characteristic without turning every\n  // sentence into a restart. Only the end of a detected news item receives a\n  // small deliberate hand-off; native punctuation still supplies the main timing.\n  if (deliveryMode === "broadcast" && phrase.newsItemClose) {\n    return punctuationRendered ? 48 : 62;\n  }\n\n  // If native punctuation is rendered, let the neural voice realize its own'''
assert old in omni
omni = omni.replace(old, new, 1)

# Apply broadcast cadence before semantic-boundary annotation.
old = '''  const phrases = annotateSemanticBoundaries(\n    applyDirectQuoteContinuity(\n      applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),\n    ),\n    settings.deliveryMode,\n  );'''
new = '''  const phrases = annotateSemanticBoundaries(\n    annotateBroadcastCadence(\n      applyDirectQuoteContinuity(\n        applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),\n      ),\n      settings.deliveryMode,\n    ),\n    settings.deliveryMode,\n  );'''
assert old in omni
omni = omni.replace(old, new, 1)

# Broadcast mode: fewer internal prosody resets than neutral, but more structure than story.
old = '''    const storyMode = settings.deliveryMode === "story";\n    const strongRoleBoundary =\n      storyMode\n        ? !sameDirectQuote &&\n          !reportingBridge &&\n          roleChanged &&\n          phrase.segment?.role === "ending"\n        : !sameDirectQuote &&\n          !reportingBridge &&\n          roleChanged &&\n          (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));'''
new = '''    const storyMode = settings.deliveryMode === "story";\n    const broadcastMode = settings.deliveryMode === "broadcast";\n    const strongRoleBoundary =\n      storyMode\n        ? !sameDirectQuote &&\n          !reportingBridge &&\n          roleChanged &&\n          phrase.segment?.role === "ending"\n        : broadcastMode\n          ? !sameDirectQuote &&\n            !reportingBridge &&\n            roleChanged &&\n            (["title", "climax", "ending"].includes(previous.segment?.role ?? "") ||\n              ["title", "climax", "ending"].includes(phrase.segment?.role ?? ""))\n          : !sameDirectQuote &&\n            !reportingBridge &&\n            roleChanged &&\n            (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''    const strongFocusBoundary =\n      !storyMode &&\n      !reportingBridge &&\n      ((incomingFocus >= 0.72 && previousFocus < 0.55) ||\n        (previousFocus >= 0.72 && incomingFocus < 0.55));'''
new = '''    const strongFocusBoundary =\n      !storyMode &&\n      !reportingBridge &&\n      (broadcastMode\n        ? ((incomingFocus >= 0.84 && previousFocus < 0.62) ||\n          (previousFocus >= 0.84 && incomingFocus < 0.62))\n        : ((incomingFocus >= 0.72 && previousFocus < 0.55) ||\n          (previousFocus >= 0.72 && incomingFocus < 0.55)));'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''      previousBoundaryStrength >= (storyMode ? 0.82 : 0.58) &&'''
new = '''      previousBoundaryStrength >= (storyMode ? 0.82 : broadcastMode ? 0.72 : 0.58) &&'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''      (storyMode ? 3.6 : sameDirectQuote || reportingBridge ? 2.8 : 2.35);'''
new = '''      (storyMode ? 3.6 : broadcastMode ? 3.05 : sameDirectQuote || reportingBridge ? 2.8 : 2.35);'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''    const tempoBoundary =\n      !storyMode &&\n      sentenceBoundary &&\n      !sameDirectQuote &&\n      !reportingBridge &&\n      Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;'''
new = '''    const tempoBoundary =\n      !storyMode &&\n      sentenceBoundary &&\n      !sameDirectQuote &&\n      !reportingBridge &&\n      previousBoundaryStrength >= (broadcastMode ? 0.68 : 0.57) &&\n      Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= (broadcastMode ? 0.008 : 0.006);'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''        (storyMode ? (sameDirectQuote ? 18 : 15) : (sameDirectQuote ? 10 : 8)) &&\n      previousBoundaryStrength >= (storyMode ? 0.62 : 0.36);'''
new = '''        (storyMode\n          ? (sameDirectQuote ? 18 : 15)\n          : broadcastMode\n            ? (sameDirectQuote ? 15 : 12)\n            : (sameDirectQuote ? 10 : 8)) &&\n      previousBoundaryStrength >= (storyMode ? 0.62 : broadcastMode ? 0.52 : 0.36);'''
assert old in omni
omni = omni.replace(old, new, 1)

omni_path.write_text(omni)

page_path = Path('app/page.tsx')
page = page_path.read_text()
replacements = {
  '{ id: "news", label: "标准新闻", note: "主持人语调 · 条目开场与收尾", rateFactor: 1.01 },':
    '{ id: "news", label: "标准新闻", note: "连续主持 · 条目开场与收尾", rateFactor: 1.01 },',
  '{ id: "calm", label: "沉稳长稿", note: "沉稳主持 · 条目自然收束", rateFactor: 0.97 },':
    '{ id: "calm", label: "沉稳长稿", note: "长稿连续 · 沉稳主持", rateFactor: 0.97 },',
  '{ id: "bulletin", label: "简明快讯", note: "快讯主持 · 紧凑条目节奏", rateFactor: 1.045 },':
    '{ id: "bulletin", label: "简明快讯", note: "连续快讯 · 紧凑转场", rateFactor: 1.045 },',
  '{ id: "expressive", label: "生动播报", note: "主持人表现 · 转场有起伏", rateFactor: 1.01 },':
    '{ id: "expressive", label: "生动播报", note: "连续主持 · 动态表现", rateFactor: 1.01 },',
}
for old, new in replacements.items():
  assert old in page
  page = page.replace(old, new, 1)
page_path.write_text(page)
