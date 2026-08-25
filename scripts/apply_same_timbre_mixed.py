from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
page_path = Path('app/page.tsx')
route = route_path.read_text()
page = page_path.read_text()

# Use one multilingual voice for the entire mixed-language article.
old = '''const CHINESE_EDGE_VOICE_BY_KAZAKH: Record<string, string> = {\n  "kk-KZ-DauletNeural": "zh-CN-YunyangNeural",\n  "kk-KZ-AigulNeural": "zh-CN-XiaoxiaoNeural",\n};\n'''
new = '''const MULTILINGUAL_EDGE_VOICE_BY_KAZAKH: Record<string, string> = {\n  "kk-KZ-DauletNeural": "zh-CN-YunyiMultilingualNeural",\n  "kk-KZ-AigulNeural": "zh-CN-XiaoxiaoMultilingualNeural",\n};\n'''
assert old in route, 'mixed voice map not found'
route = route.replace(old, new, 1)

old = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  _documentPlan?: EdgeDocumentPlan,\n) {\n  const runs = splitEdgeLanguageRuns(text);\n  const chineseVoice = CHINESE_EDGE_VOICE_BY_KAZAKH[voice] ?? "zh-CN-YunyangNeural";\n  const body = runs\n    .map((run) => {\n      const runVoice = run.language === "zh" ? chineseVoice : voice;\n      return `<voice name="${runVoice}">${edgeNativeProsody(run.text, settings, runVoice, preset)}</voice>`;\n    })\n    .join("");\n\n  return [\n    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n    body,\n    "</speak>",\n  ].join("");\n}\n'''
new = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  _documentPlan?: EdgeDocumentPlan,\n  useMultilingual = false,\n) {\n  if (!useMultilingual) {\n    return [\n      '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n      `<voice name="${voice}">`,\n      edgeNativeProsody(text, settings, voice, preset),\n      "</voice>",\n      "</speak>",\n    ].join("");\n  }\n\n  const runs = splitEdgeLanguageRuns(text);\n  const multilingualVoice =\n    MULTILINGUAL_EDGE_VOICE_BY_KAZAKH[voice] ?? "zh-CN-YunyiMultilingualNeural";\n  const presetSettings = PRESETS[preset];\n  const isDauletProfile = voice === "kk-KZ-DauletNeural";\n  const antiCreakRate = isDauletProfile ? 1.002 : 1;\n  const antiCreakPitch = isDauletProfile ? 1.8 : 0;\n  const effectiveSpeed = clamp(\n    settings.speed * presetSettings.rateFactor * antiCreakRate,\n    0.58,\n    1.35,\n  );\n  const effectivePitch = clamp(\n    settings.pitch + presetSettings.pitch + antiCreakPitch,\n    -18,\n    18,\n  );\n  const effectiveVolume = clamp(\n    settings.volume + presetSettings.volume,\n    -7,\n    7,\n  );\n  const body = runs\n    .map((run) =>\n      `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,\n    )\n    .join("");\n\n  return [\n    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n    `<voice name="${multilingualVoice}">`,\n    `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">`,\n    body,\n    "</prosody>",\n    "</voice>",\n    "</speak>",\n  ].join("");\n}\n'''
assert old in route, 'buildEdgeSsml mixed block not found'
route = route.replace(old, new, 1)

old = '''async function synthesizeEdgeChunk(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  endpoint: TranslatorEndpoint,\n  documentPlan: EdgeDocumentPlan,\n) {\n'''
new = '''async function synthesizeEdgeChunk(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  endpoint: TranslatorEndpoint,\n  documentPlan: EdgeDocumentPlan,\n  useMultilingual: boolean,\n) {\n'''
assert old in route, 'synthesizeEdgeChunk signature not found'
route = route.replace(old, new, 1)
route = route.replace(
    '      body: buildEdgeSsml(text, voice, preset, settings, documentPlan),',
    '      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual),',
    1,
)

old = '''  return Promise.all(\n    chunks.map((chunk) =>\n      synthesizeEdgeChunk(chunk, voice, preset, settings, endpoint, documentPlan),\n    ),\n  );\n'''
new = '''  const useMultilingual = hasHanCharacters(text);\n  return Promise.all(\n    chunks.map((chunk) =>\n      synthesizeEdgeChunk(\n        chunk,\n        voice,\n        preset,\n        settings,\n        endpoint,\n        documentPlan,\n        useMultilingual,\n      ),\n    ),\n  );\n'''
assert old in route, 'synthesizeWithEdge map not found'
route = route.replace(old, new, 1)

# Make the UI wording accurate: mixed articles keep one multilingual timbre throughout.
page = page.replace(
    'Edge 与 ElevenLabs v3 还能自动识别新闻稿中的中文片段并按普通话朗读。',
    'Edge 与 ElevenLabs v3 还能自动识别新闻稿中的中文片段。Edge 检测到中文后会让整篇稿件使用同一条 Multilingual Neural Voice，中哈两种语言保持同一音色。',
    1,
)
page = page.replace(
    'Edge TTS · 声线 / 倍速 / 音调 / 音量 / 中文自动识别',
    'Edge TTS · 声线 / 倍速 / 音调 / 音量 / 中哈同音色混读',
    1,
)
page = page.replace(
    '支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格；稿件中出现中文汉字时，会自动切换匹配性别的普通话 Neural Voice，读完后无缝切回哈萨克语，不消耗 ElevenLabs 额度。',
    '支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格。纯哈萨克稿继续使用 Дәулет / Айгүл；只要检测到中文，整篇自动切换为匹配性别的一条 Multilingual Neural Voice，并在同一音色内分别按哈萨克语和普通话发音，不消耗 ElevenLabs 额度。',
    1,
)

route_path.write_text(route)
page_path.write_text(page)
print('enabled same-timbre Kazakh-Chinese mixed reading with one multilingual Edge voice')
