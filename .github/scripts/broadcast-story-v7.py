from pathlib import Path

repo = Path('.')
route_path = repo / 'app/api/synthesize/route.ts'
omni_path = repo / 'app/lib/edge-omnivoice-inspired.ts'
page_path = repo / 'app/page.tsx'

route = route_path.read_text(encoding='utf-8')
omni = omni_path.read_text(encoding='utf-8')
page = page_path.read_text(encoding='utf-8')

# ---------------- edge-omnivoice-inspired.ts ----------------
old = '''export type EdgeOmniSettings = {\n  speed: number;\n  pitch: number;\n  volume: number;\n};'''
new = '''export type EdgeOmniSettings = {\n  speed: number;\n  pitch: number;\n  volume: number;\n  deliveryMode?: "neutral" | "broadcast" | "story";\n};'''
if old not in omni:
    raise SystemExit('EdgeOmniSettings anchor not found')
omni = omni.replace(old, new, 1)

anchor = '''const SENTENCE_TERMINAL_KINDS = new Set<PunctuationKind>([\n  "period",\n  "question",\n  "exclamation",\n  "mixed",\n]);\n'''
insert = anchor + r'''

// Broadcast item markers are discourse cues, not ordinary punctuation. When a
// presenter says "бірінші жаңалық" / "келесі жаңалық", the item label should
// receive a small reset and a short hand-off into the story that follows.
const NEWS_ITEM_CUE_PATTERN =
  /^(\s*)((?:(?:бірінші|екінші|үшінші|төртінші|бесінші|алтыншы|жетінші|сегізінші|тоғызыншы|оныншы|он\s+бірінші|он\s+екінші|он\s+үшінші|он\s+төртінші|он\s+бесінші|келесі|ендігі|тағы\s+бір)\s+жаңалы(?:қ|ғ)[\p{L}-]*|第[一二三四五六七八九十百]+(?:条|项)?新闻|(?:first|second|third|fourth|fifth|next)\s+(?:news|news\s+item)))(?![\p{L}\p{N}_])/iu;

function newsItemCueMatch(text: string) {
  return text.match(NEWS_ITEM_CUE_PATTERN);
}

function startsWithNewsItemCue(text: string) {
  return Boolean(newsItemCueMatch(text));
}
'''
if anchor not in omni:
    raise SystemExit('sentence terminal anchor not found')
omni = omni.replace(anchor, insert, 1)

# Semantic boundary receives delivery mode and preserves a modest broadcast item pause.
omni = omni.replace(
    'function semanticBoundaryStrength(current: Phrase, next?: Phrase) {',
    'function semanticBoundaryStrength(\n  current: Phrase,\n  next?: Phrase,\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {',
    1,
)

old = '''  // Question marks retain question intonation regardless of this score. The\n  // score controls boundary/pause strength only, not the interrogative contour.\n  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);'''
new = '''  // A numbered/next news item is a real presenter transition. Do not turn it\n  // into a large sentence break; simply stop semantic smoothing from erasing\n  // the small hand-off pause after the item label.\n  if (\n    deliveryMode === "broadcast" &&\n    startsWithNewsItemCue(current.text) &&\n    !["question", "exclamation", "mixed"].includes(kind)\n  ) {\n    strength = Math.max(strength, kind === "period" ? 0.6 : 0.48);\n  }\n\n  // Question marks retain question intonation regardless of this score. The\n  // score controls boundary/pause strength only, not the interrogative contour.\n  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);'''
if old not in omni:
    raise SystemExit('question boundary anchor not found')
omni = omni.replace(old, new, 1)

old = '''function annotateSemanticBoundaries(phrases: Phrase[]) {\n  return phrases.map((phrase, index) => ({\n    ...phrase,\n    boundaryStrength: semanticBoundaryStrength(phrase, phrases[index + 1]),\n  }));\n}'''
new = '''function annotateSemanticBoundaries(\n  phrases: Phrase[],\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {\n  return phrases.map((phrase, index) => ({\n    ...phrase,\n    boundaryStrength: semanticBoundaryStrength(phrase, phrases[index + 1], deliveryMode),\n  }));\n}'''
if old not in omni:
    raise SystemExit('annotateSemanticBoundaries anchor not found')
omni = omni.replace(old, new, 1)

old = '''function naturalTextMarkup(text: string, renderText: EdgeMarkupRenderer = escapeXml) {\n  // Short and normally punctuated phrases are best left entirely to the neural\n  // voice. Only unusually long, punctuation-free spans receive soft syntagma\n  // breathing, and only at strong semantic connectors.\n  const clean = text.trim();\n  const wordCount = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;\n  if (clean.length < 96 || wordCount < 15) return renderText(text);'''
new = '''function naturalTextMarkup(\n  text: string,\n  renderText: EdgeMarkupRenderer = escapeXml,\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {\n  // A presenter may write "Бірінші жаңалық бүгін..." without punctuation after\n  // the item label. Give that semantic marker a very short hand-off breath. If\n  // punctuation already follows the cue, the boundary model handles it instead.\n  if (deliveryMode === "broadcast") {\n    const cue = newsItemCueMatch(text);\n    if (cue) {\n      const leading = cue[1] ?? "";\n      const label = cue[2] ?? "";\n      const rest = text.slice(cue[0].length);\n      const labelMarkup = `<prosody rate="-1.6%" pitch="+0.4%" volume="+0.4%">${renderText(label)}</prosody>`;\n      if (rest.trim().length >= 4) {\n        return `${renderText(leading)}${labelMarkup}<break time="72ms"/>${renderText(rest)}`;\n      }\n      return `${renderText(leading)}${labelMarkup}${renderText(rest)}`;\n    }\n  }\n\n  // Short and normally punctuated phrases are best left entirely to the neural\n  // voice. Only unusually long, punctuation-free spans receive soft syntagma\n  // breathing, and only at strong semantic connectors.\n  const clean = text.trim();\n  const wordCount = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;\n  if (clean.length < 96 || wordCount < 15) return renderText(text);'''
if old not in omni:
    raise SystemExit('naturalTextMarkup anchor not found')
omni = omni.replace(old, new, 1)

omni = omni.replace(
    '    body += naturalTextMarkup(item.text, renderText);',
    '    body += naturalTextMarkup(item.text, renderText, settings.deliveryMode);',
    1,
)

old = '''  const phrases = annotateSemanticBoundaries(\n    applyDirectQuoteContinuity(\n      applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),\n    ),\n  );'''
new = '''  const phrases = annotateSemanticBoundaries(\n    applyDirectQuoteContinuity(\n      applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),\n    ),\n    settings.deliveryMode,\n  );'''
if old not in omni:
    raise SystemExit('render phrases anchor not found')
omni = omni.replace(old, new, 1)

# ---------------- route.ts ----------------
old = '''const PRESETS = {\n  // All five styles are native-first. Each one keeps a continuous speaker identity\n  // while applying a different global pacing bias.\n  news: { rateFactor: 1, pitch: 0, volume: 0 },\n  calm: { rateFactor: 0.94, pitch: 0, volume: -0.2 },\n  bulletin: { rateFactor: 1.035, pitch: 0.2, volume: 0.2 },\n  expressive: { rateFactor: 0.99, pitch: 0.35, volume: 0.15 },\n  story: { rateFactor: 0.99, pitch: 0.03, volume: -0.02 },\n} as const;'''
new = '''const PRESETS = {\n  // The first four are variants of one professional presenter register: calm is\n  // steadier, bulletin is tighter, expressive has a little more range, but none\n  // should drift into theatrical story delivery. Story is intentionally separate.\n  news: { rateFactor: 1.01, pitch: 0, volume: 0 },\n  calm: { rateFactor: 0.97, pitch: -0.05, volume: -0.08 },\n  bulletin: { rateFactor: 1.045, pitch: 0.12, volume: 0.12 },\n  expressive: { rateFactor: 1.01, pitch: 0.18, volume: 0.1 },\n  story: { rateFactor: 1, pitch: 0.03, volume: -0.02 },\n} as const;'''
if old not in route:
    raise SystemExit('PRESETS anchor not found')
route = route.replace(old, new, 1)

old = '''const EMOTION_STRENGTH_BY_PRESET: Record<keyof typeof PRESETS, number> = {\n  news: 0.55,\n  calm: 0.45,\n  bulletin: 0.7,\n  expressive: 1,\n  story: 1,\n};'''
new = '''const EMOTION_STRENGTH_BY_PRESET: Record<keyof typeof PRESETS, number> = {\n  news: 0.62,\n  calm: 0.52,\n  bulletin: 0.68,\n  expressive: 0.82,\n  story: 1,\n};'''
if old not in route:
    raise SystemExit('emotion strength anchor not found')
route = route.replace(old, new, 1)

anchor = '''function emotionTempoZone(mood: string) {\n  if (mood === "urgent" || mood === "positive" || mood === "transition") return "forward";\n  if (mood === "sad" || mood === "concern" || mood === "emphasis" || mood === "ending") return "slow";\n  return "steady";\n}\n'''
insert = anchor + r'''

const NEWS_ITEM_OPENING_PATTERN =
  /^(?:\s*)(?:(?:бірінші|екінші|үшінші|төртінші|бесінші|алтыншы|жетінші|сегізінші|тоғызыншы|оныншы|он\s+бірінші|он\s+екінші|он\s+үшінші|он\s+төртінші|он\s+бесінші|келесі|ендігі|тағы\s+бір)\s+жаңалы(?:қ|ғ)[\p{L}-]*|第[一二三四五六七八九十百]+(?:条|项)?新闻|(?:first|second|third|fourth|fifth|next)\s+(?:news|news\s+item))(?![\p{L}\p{N}_])/iu;

function isNewsItemOpening(text: string) {
  return NEWS_ITEM_OPENING_PATTERN.test(text.trim());
}

function newsItemPresenterLift(preset: PresetName) {
  switch (preset) {
    case "calm":
      return { rate: -1.05, pitch: 0.1, volume: 0.06 };
    case "bulletin":
      return { rate: -0.45, pitch: 0.18, volume: 0.08 };
    case "expressive":
      return { rate: -0.7, pitch: 0.24, volume: 0.1 };
    default:
      return { rate: -0.8, pitch: 0.14, volume: 0.07 };
  }
}
'''
if anchor not in route:
    raise SystemExit('emotionTempoZone anchor not found')
route = route.replace(anchor, insert, 1)

# Story beat categories and cues.
old = '''type StoryBeat =\n  | "narrator"\n  | "dialogue"\n  | "suspense"'''
new = '''type StoryBeat =\n  | "narrator"\n  | "blogger"\n  | "description"\n  | "dialogue"\n  | "suspense"'''
if old not in route:
    raise SystemExit('StoryBeat anchor not found')
route = route.replace(old, new, 1)

anchor = '''const STORY_ANGER_CUES = [\n  "ашулан", "ызал", "қаһар", "айғай", "долдан", "怒", "愤怒", "生气", "怒吼", "大怒", "发火",\n];\n'''
insert = anchor + '''const STORY_BLOGGER_CUES = [\n  "сөйтіп", "содан кейін", "міне", "бір күні", "ал енді", "осылайша", "қысқасы",\n  "осы жерде", "сөйтсе", "солай", "енді қараңыз", "не керек",\n  "于是", "接着", "后来", "这时候", "说到这里", "你看", "没想到", "原来", "结果",\n];\n'''
if anchor not in route:
    raise SystemExit('story anger cue anchor not found')
route = route.replace(anchor, insert, 1)

# Stronger but still bounded role acting; then more conversational narration.
replacements = {
'''  if (speechAct === "lament") {\n    return { beat: "sorrow", ratePercent: -5.4, pitchDelta: -1.0, volumeDelta: -1.0 };\n  }\n  if (speechAct === "whisper") {\n    return { beat: "suspense", ratePercent: -4.2, pitchDelta: -0.65, volumeDelta: -0.85 };\n  }\n  if (speechAct === "shout" || speechAct === "command") {\n    return { beat: "action", ratePercent: 4.2, pitchDelta: 0.85, volumeDelta: 0.95 };\n  }\n  if (speechAct === "humor") {\n    return { beat: "humor", ratePercent: 2.0, pitchDelta: 0.65, volumeDelta: 0.45 };\n  }''':
'''  if (speechAct === "lament") {\n    return { beat: "sorrow", ratePercent: -6.4, pitchDelta: -1.4, volumeDelta: -1.35 };\n  }\n  if (speechAct === "whisper") {\n    return { beat: "suspense", ratePercent: -5.8, pitchDelta: -1.1, volumeDelta: -1.4 };\n  }\n  if (speechAct === "shout") {\n    return { beat: "action", ratePercent: 5.8, pitchDelta: 1.4, volumeDelta: 1.5 };\n  }\n  if (speechAct === "command") {\n    return { beat: "action", ratePercent: 4.8, pitchDelta: 1.05, volumeDelta: 1.2 };\n  }\n  if (speechAct === "humor") {\n    return { beat: "humor", ratePercent: 3.0, pitchDelta: 1.0, volumeDelta: 0.72 };\n  }''',
'''    if (hasQuestion) {\n      return { beat: "dialogue", ratePercent: -1.0, pitchDelta: 0.8, volumeDelta: 0.1 };\n    }\n    if (hasExclamation) {\n      return { beat: "dialogue", ratePercent: 2.2, pitchDelta: 0.8, volumeDelta: 0.9 };\n    }\n    if (mood === "concern" || mood === "sad") {\n      return { beat: "dialogue", ratePercent: -2.2, pitchDelta: -0.6, volumeDelta: -0.6 };\n    }\n    return { beat: "dialogue", ratePercent: 0, pitchDelta: 0, volumeDelta: 0 };''':
'''    if (hasQuestion) {\n      return { beat: "dialogue", ratePercent: -1.5, pitchDelta: 1.4, volumeDelta: 0.2 };\n    }\n    if (hasExclamation) {\n      return { beat: "dialogue", ratePercent: 3.4, pitchDelta: 1.4, volumeDelta: 1.3 };\n    }\n    if (mood === "concern" || mood === "sad") {\n      return { beat: "dialogue", ratePercent: -3.2, pitchDelta: -1.0, volumeDelta: -1.0 };\n    }\n    return { beat: "dialogue", ratePercent: 0.6, pitchDelta: 0.22, volumeDelta: 0.12 };''',
'''  // Ordinary narration stays completely native inside one long outer prosody.\n  return { beat: "narrator", ratePercent: 0, pitchDelta: 0, volumeDelta: 0 };''':
'''  // Blog-style storytelling: narration stays recognisably the same speaker,\n  // but it carries conversational forward motion instead of a flat audiobook\n  // read. Scene-setting is a touch slower; connective/story-turn phrases lean in.\n  if (storyContainsCue(text, STORY_BLOGGER_CUES) || role === "transition") {\n    return { beat: "blogger", ratePercent: 2.8, pitchDelta: 0.65, volumeDelta: 0.35 };\n  }\n  if (role === "background" && text.length >= 82) {\n    return { beat: "description", ratePercent: -1.8, pitchDelta: -0.35, volumeDelta: -0.15 };\n  }\n  return { beat: "narrator", ratePercent: 1.6, pitchDelta: 0.35, volumeDelta: 0.16 };'''
}
for old_text, new_text in replacements.items():
    if old_text not in route:
        raise SystemExit(f'story direction anchor not found: {old_text[:45]}')
    route = route.replace(old_text, new_text, 1)

# Remove the old fixed-punctuation story helper now that story uses Omni semantic pauses.
start_marker = '/**\n * Story punctuation policy: commas are a short breath, never a sentence stop.'
end_marker = '\nfunction renderContinuousStoryBody('
start = route.find(start_marker)
end = route.find(end_marker, start)
if start == -1 or end == -1:
    raise SystemExit('old story punctuation helper not found')
route = route[:start] + route[end + 1:]

# Story group sizes and expressive strength.
old = '''      const maxItems = direction.beat === "narrator" ? 8 : direction.beat === "dialogue" ? 2 : 3;'''
new = '''      const maxItems =\n        ["narrator", "blogger", "description"].includes(direction.beat)\n          ? 8\n          : direction.beat === "dialogue"\n            ? 3\n            : 2;'''
if old not in route:
    raise SystemExit('story maxItems anchor not found')
route = route.replace(old, new, 1)

old = '''      const maxChars = direction.beat === "narrator" ? 760 : 360;'''
new = '''      const maxChars =\n        ["narrator", "blogger", "description"].includes(direction.beat) ? 760 : 390;'''
if old not in route:
    raise SystemExit('story maxChars anchor not found')
route = route.replace(old, new, 1)

old = '''      const strength =\n        group.beat === "narrator" ? 0 : group.beat === "dialogue" ? 0.62 : group.beat === "ending" ? 0.72 : 0.7;\n      const rate = clamp(direction.rate * strength, -3.8, 3.4);\n      const pitch = clamp(direction.pitch * strength, -0.75, 0.75);\n      const volume = clamp(direction.volume * strength, -0.7, 0.7);'''
new = '''      const strength =\n        group.beat === "narrator"\n          ? 0.55\n          : group.beat === "blogger"\n            ? 0.78\n            : group.beat === "description"\n              ? 0.62\n              : group.beat === "dialogue"\n                ? 0.8\n                : group.beat === "ending"\n                  ? 0.82\n                  : 0.88;\n      const rate = clamp(direction.rate * strength, -5.5, 5.3);\n      const pitch = clamp(direction.pitch * strength, -1.35, 1.35);\n      const volume = clamp(direction.volume * strength, -1.25, 1.25);'''
if old not in route:
    raise SystemExit('story strength anchor not found')
route = route.replace(old, new, 1)

old = '''        {\n          speed: clamp(1 + rate / 100, 0.94, 1.06),\n          pitch,\n          volume,\n        },'''
new = '''        {\n          speed: clamp(1 + rate / 100, 0.94, 1.06),\n          pitch,\n          volume,\n          deliveryMode: "story",\n        },'''
if old not in route:
    raise SystemExit('story Omni settings anchor not found')
route = route.replace(old, new, 1)

# Non-story delivery groups: isolate item labels and give them presenter focus.
old = '''  type DeliveryGroup = {\n    paragraphIndex: number;\n    zone: string;\n    sentences: typeof sentences;\n  };'''
new = '''  type DeliveryGroup = {\n    paragraphIndex: number;\n    zone: string;\n    newsItemOpening: boolean;\n    sentences: typeof sentences;\n  };'''
if old not in route:
    raise SystemExit('DeliveryGroup type anchor not found')
route = route.replace(old, new, 1)

old = '''    const baseZone = storyDirection ? `story:${storyDirection.beat}` : emotionTempoZone(sentence.mood);\n    const zone = sentence.speakerTurn > 0 ? `${baseZone}:turn:${sentence.speakerTurn}` : baseZone;'''
new = '''    const newsItemOpening = preset !== "story" && isNewsItemOpening(sentence.text);\n    const baseZone = newsItemOpening\n      ? `news-item:${preset}`\n      : storyDirection\n        ? `story:${storyDirection.beat}`\n        : emotionTempoZone(sentence.mood);\n    const zone = sentence.speakerTurn > 0 ? `${baseZone}:turn:${sentence.speakerTurn}` : baseZone;'''
if old not in route:
    raise SystemExit('baseZone anchor not found')
route = route.replace(old, new, 1)

old = '''    if (canJoin) previous.sentences.push(sentence);\n    else groups.push({ paragraphIndex: sentence.paragraphIndex, zone, sentences: [sentence] });'''
new = '''    if (canJoin) previous.sentences.push(sentence);\n    else groups.push({\n      paragraphIndex: sentence.paragraphIndex,\n      zone,\n      newsItemOpening,\n      sentences: [sentence],\n    });'''
if old not in route:
    raise SystemExit('group push anchor not found')
route = route.replace(old, new, 1)

old = '''    weighted.rate *= emotionStrength;\n    weighted.pitch *= emotionStrength;\n    weighted.volume *= emotionStrength;'''
new = '''    weighted.rate *= emotionStrength;\n    weighted.pitch *= emotionStrength;\n    weighted.volume *= emotionStrength;\n\n    if (group.newsItemOpening) {\n      const presenter = newsItemPresenterLift(preset);\n      weighted.rate += presenter.rate;\n      weighted.pitch += presenter.pitch;\n      weighted.volume += presenter.volume;\n    }'''
if old not in route:
    raise SystemExit('weighted strength anchor not found')
route = route.replace(old, new, 1)

old = '''        {\n          speed: clamp(1 + weighted.rate / 100, 0.94, 1.06),\n          pitch: weighted.pitch,\n          volume: weighted.volume,\n        },\n        documentPlan,'''
new = '''        {\n          speed: clamp(1 + weighted.rate / 100, 0.94, 1.06),\n          pitch: weighted.pitch,\n          volume: weighted.volume,\n          deliveryMode: "broadcast",\n        },\n        documentPlan,'''
if old not in route:
    raise SystemExit('broadcast Omni settings anchor not found')
route = route.replace(old, new, 1)

# ---------------- page.tsx ----------------
old = '''const PRESETS = [\n  { id: "news", label: "标准新闻", note: "全文情绪分析 · 克制表达", rateFactor: 1 },\n  { id: "calm", label: "沉稳长稿", note: "全文情绪分析 · 平稳柔和", rateFactor: 0.94 },\n  { id: "bulletin", label: "简明快讯", note: "全文情绪分析 · 轻快紧凑", rateFactor: 1.035 },\n  { id: "expressive", label: "生动播报", note: "全文情绪分析 · 完整表现", rateFactor: 0.99 },\n  { id: "story", label: "故事版", note: "真人叙事 · 情绪对白 · 短逗号停顿", rateFactor: 0.99 },\n] as const;'''
new = '''const PRESETS = [\n  { id: "news", label: "标准新闻", note: "主持人语调 · 条目自然转场", rateFactor: 1.01 },\n  { id: "calm", label: "沉稳长稿", note: "沉稳主持 · 长稿连续播报", rateFactor: 0.97 },\n  { id: "bulletin", label: "简明快讯", note: "快讯主持 · 紧凑清晰", rateFactor: 1.045 },\n  { id: "expressive", label: "生动播报", note: "主持人表现 · 情绪有起伏", rateFactor: 1.01 },\n  { id: "story", label: "故事版", note: "博主讲述 · 角色融入 · 情绪对白", rateFactor: 1 },\n] as const;'''
if old not in page:
    raise SystemExit('page PRESETS anchor not found')
page = page.replace(old, new, 1)

route_path.write_text(route, encoding='utf-8')
omni_path.write_text(omni, encoding='utf-8')
page_path.write_text(page, encoding='utf-8')
