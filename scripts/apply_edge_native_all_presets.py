from pathlib import Path

route = Path('app/api/synthesize/route.ts')
page = Path('app/page.tsx')
r = route.read_text()
p = page.read_text()

old_presets = '''const PRESETS = {\n  news: { rateFactor: 1, pitch: 0, volume: 0 },\n  calm: { rateFactor: 0.9, pitch: -1.5, volume: -0.5 },\n  bulletin: { rateFactor: 1.03, pitch: -0.5, volume: 0.5 },\n  expressive: { rateFactor: 0.98, pitch: 1, volume: 0.5 },\n} as const;'''
new_presets = '''const PRESETS = {\n  // All four styles are native-first. They differ only by a very small global bias.\n  news: { rateFactor: 1, pitch: 0, volume: 0 },\n  calm: { rateFactor: 0.94, pitch: 0, volume: -0.2 },\n  bulletin: { rateFactor: 1.035, pitch: 0.2, volume: 0.2 },\n  expressive: { rateFactor: 0.99, pitch: 0.35, volume: 0.15 },\n} as const;'''
if old_presets not in r:
    raise SystemExit('preset block not found')
r = r.replace(old_presets, new_presets, 1)

old_native = '''function edgeNativeProsody(text: string, settings: EdgeVoiceSettings, voice: string) {\n  // Daulet's natural register can become slightly creaky in the low end.\n  // A tiny register lift reduces vocal-fry perception without changing his identity.\n  const isDaulet = voice === "kk-KZ-DauletNeural";\n  const antiCreakRate = isDaulet ? 1.004 : 1;\n  const antiCreakPitch = isDaulet ? 1.4 : 0;\n\n  const effectiveSpeed = clamp(settings.speed * antiCreakRate, 0.58, 1.35);\n  const effectivePitch = clamp(settings.pitch + antiCreakPitch, -18, 18);\n  const effectiveVolume = clamp(settings.volume, -7, 7);\n  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;\n}'''
new_native = '''function edgeNativeProsody(\n  text: string,\n  settings: EdgeVoiceSettings,\n  voice: string,\n  preset: PresetName,\n) {\n  // Native-first means one continuous prosody span for the whole chunk. Presets\n  // provide only tiny global biases; punctuation/cadence stays with Microsoft.\n  const presetSettings = PRESETS[preset];\n  const isDaulet = voice === "kk-KZ-DauletNeural";\n  // Slightly lift Daulet out of the lowest creaky register, without making him bright.\n  const antiCreakRate = isDaulet ? 1.002 : 1;\n  const antiCreakPitch = isDaulet ? 1.8 : 0;\n\n  const effectiveSpeed = clamp(\n    settings.speed * presetSettings.rateFactor * antiCreakRate,\n    0.58,\n    1.35,\n  );\n  const effectivePitch = clamp(\n    settings.pitch + presetSettings.pitch + antiCreakPitch,\n    -18,\n    18,\n  );\n  const effectiveVolume = clamp(\n    settings.volume + presetSettings.volume,\n    -7,\n    7,\n  );\n  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;\n}'''
if old_native not in r:
    raise SystemExit('native function not found')
r = r.replace(old_native, new_native, 1)

old_build = '''  // Standard news is deliberately native-first: one continuous prosody span,\n  // original punctuation, and no sentence-level director intervention. If the\n  // user explicitly adds an emotion tag, fall back to the enhanced pipeline.\n  if (preset === "news" && !hasRecognizedEdgeTag(text)) {\n    return [\n      '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n      `<voice name="${voice}">`,\n      edgeNativeProsody(text, settings, voice),\n      "</voice>",\n      "</speak>",\n    ].join("");\n  }'''
new_build = '''  // Every preset is native-first when there are no explicit emotion tags:\n  // one continuous prosody span, original punctuation, no sentence-level director.\n  // Explicit tags opt into the enhanced sentence-level pipeline only when requested.\n  if (!hasRecognizedEdgeTag(text)) {\n    return [\n      '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n      `<voice name="${voice}">`,\n      edgeNativeProsody(text, settings, voice, preset),\n      "</voice>",\n      "</speak>",\n    ].join("");\n  }'''
if old_build not in r:
    raise SystemExit('build native branch not found')
r = r.replace(old_build, new_build, 1)

old_ui = '''const PRESETS = [\n  { id: "news", label: "标准新闻", note: "原生自然 · 推荐", rateFactor: 1 },\n  { id: "calm", label: "沉稳长稿", note: "稍慢、便于听清", rateFactor: 0.92 },\n  { id: "bulletin", label: "简明快讯", note: "节奏更紧凑", rateFactor: 1.08 },\n  { id: "expressive", label: "生动播报", note: "更有起伏、适合旁白", rateFactor: 1.02 },\n] as const;'''
new_ui = '''const PRESETS = [\n  { id: "news", label: "标准新闻", note: "原生自然 · 推荐", rateFactor: 1 },\n  { id: "calm", label: "沉稳长稿", note: "原生自然 · 稍慢柔和", rateFactor: 0.94 },\n  { id: "bulletin", label: "简明快讯", note: "原生自然 · 轻快紧凑", rateFactor: 1.035 },\n  { id: "expressive", label: "生动播报", note: "原生自然 · 轻度表现", rateFactor: 0.99 },\n] as const;'''
if old_ui not in p:
    raise SystemExit('page preset block not found')
p = p.replace(old_ui, new_ui, 1)

route.write_text(r)
page.write_text(p)
print('applied native-first pipeline to all Edge presets')
