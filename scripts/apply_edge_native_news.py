from pathlib import Path

route = Path('app/api/synthesize/route.ts')
page = Path('app/page.tsx')

r = route.read_text()
p = page.read_text()

old = '  news: { rateFactor: 0.96, pitch: -0.5, volume: 0 },'
new = '  news: { rateFactor: 1, pitch: 0, volume: 0 },'
if old not in r:
    raise SystemExit('route preset marker not found')
r = r.replace(old, new, 1)

marker = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  documentPlan?: EdgeDocumentPlan,\n) {\n'''
if marker not in r:
    raise SystemExit('buildEdgeSsml marker not found')

replacement = '''function hasRecognizedEdgeTag(text: string) {\n  const matcher = /[\\[【]([^\\]】\\r\\n]{1,30})[\\]】]/gu;\n  for (const match of text.matchAll(matcher)) {\n    const rawTag = (match[1] ?? \"\").trim();\n    if (EDGE_TAG_STYLES[rawTag]) return true;\n  }\n  return false;\n}\n\nfunction edgeNativeProsody(text: string, settings: EdgeVoiceSettings) {\n  const effectiveSpeed = clamp(settings.speed, 0.58, 1.35);\n  const effectivePitch = clamp(settings.pitch, -18, 18);\n  const effectiveVolume = clamp(settings.volume, -7, 7);\n  return `<prosody rate=\"${speedToRate(effectiveSpeed)}\" pitch=\"${signedPercent(effectivePitch)}\" volume=\"${signedPercent(effectiveVolume)}\">${escapeXml(text)}</prosody>`;\n}\n\nfunction buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  documentPlan?: EdgeDocumentPlan,\n) {\n  // Standard news is deliberately native-first: one continuous prosody span,\n  // original punctuation, and no sentence-level director intervention. If the\n  // user explicitly adds an emotion tag, fall back to the enhanced pipeline.\n  if (preset === \"news\" && !hasRecognizedEdgeTag(text)) {\n    return [\n      '<speak xmlns=\"http://www.w3.org/2001/10/synthesis\" version=\"1.0\" xml:lang=\"kk-KZ\">',\n      `<voice name=\"${voice}\">`,\n      edgeNativeProsody(text, settings),\n      \"</voice>\",\n      \"</speak>\",\n    ].join(\"\");\n  }\n'''
r = r.replace(marker, replacement, 1)

old_page = '  { id: "news", label: "标准新闻", note: "清晰、有分量", rateFactor: 1 },'
new_page = '  { id: "news", label: "标准新闻", note: "原生自然 · 推荐", rateFactor: 1 },'
if old_page not in p:
    raise SystemExit('page preset marker not found')
p = p.replace(old_page, new_page, 1)

route.write_text(r)
page.write_text(p)
print('applied native Edge standard-news pipeline')
