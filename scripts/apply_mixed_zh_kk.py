from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
page_path = Path('app/page.tsx')
route = route_path.read_text()
page = page_path.read_text()

# 1) Chinese voices matched to the selected Kazakh Edge voice.
needle = '''const ALLOWED_EDGE_VOICES = new Set([\n  "kk-KZ-DauletNeural",\n  "kk-KZ-AigulNeural",\n]);\n'''
replacement = '''const ALLOWED_EDGE_VOICES = new Set([\n  "kk-KZ-DauletNeural",\n  "kk-KZ-AigulNeural",\n]);\n\nconst CHINESE_EDGE_VOICE_BY_KAZAKH: Record<string, string> = {\n  "kk-KZ-DauletNeural": "zh-CN-YunyangNeural",\n  "kk-KZ-AigulNeural": "zh-CN-XiaoxiaoNeural",\n};\n'''
assert needle in route, 'voice allowlist block not found'
route = route.replace(needle, replacement, 1)

# 2) Script-aware mixed-language segmentation. Neutral characters stay with the
# current language so punctuation/numbers around a Chinese name are not torn apart.
needle = '''function speedToRate(speed: number) {\n  return signedPercent((speed - 1) * 100);\n}\n'''
replacement = '''function speedToRate(speed: number) {\n  return signedPercent((speed - 1) * 100);\n}\n\ntype EdgeTextLanguage = "kk" | "zh";\ntype EdgeLanguageRun = { language: EdgeTextLanguage; text: string };\n\nfunction hasHanCharacters(text: string) {\n  return /\\p{Script=Han}/u.test(text);\n}\n\nfunction edgeLanguageForCharacter(character: string): EdgeTextLanguage | null {\n  if (/\\p{Script=Han}/u.test(character)) return "zh";\n  if (/\\p{Script=Cyrillic}/u.test(character)) return "kk";\n  return null;\n}\n\nfunction splitEdgeLanguageRuns(text: string): EdgeLanguageRun[] {\n  const runs: EdgeLanguageRun[] = [];\n  let language: EdgeTextLanguage = "kk";\n  let buffer = "";\n\n  for (const character of text) {\n    const detected = edgeLanguageForCharacter(character);\n    if (detected && detected !== language) {\n      if (buffer) runs.push({ language, text: buffer });\n      language = detected;\n      buffer = character;\n    } else {\n      buffer += character;\n    }\n  }\n\n  if (buffer) runs.push({ language, text: buffer });\n  return runs.length ? runs : [{ language: "kk", text }];\n}\n'''
assert needle in route, 'speedToRate block not found'
route = route.replace(needle, replacement, 1)

# 3) Replace the single-voice SSML wrapper with automatic Kazakh/Chinese voice switching.
old = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  _documentPlan?: EdgeDocumentPlan,\n) {\n  return [\n    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n    `<voice name="${voice}">`,\n    edgeNativeProsody(text, settings, voice, preset),\n    "</voice>",\n    "</speak>",\n  ].join("");\n}\n'''
new = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  _documentPlan?: EdgeDocumentPlan,\n) {\n  const runs = splitEdgeLanguageRuns(text);\n  const chineseVoice = CHINESE_EDGE_VOICE_BY_KAZAKH[voice] ?? "zh-CN-YunyangNeural";\n  const body = runs\n    .map((run) => {\n      const runVoice = run.language === "zh" ? chineseVoice : voice;\n      return `<voice name="${runVoice}">${edgeNativeProsody(run.text, settings, runVoice, preset)}</voice>`;\n    })\n    .join("");\n\n  return [\n    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n    body,\n    "</speak>",\n  ].join("");\n}\n'''
assert old in route, 'buildEdgeSsml block not found'
route = route.replace(old, new, 1)

# 4) ElevenLabs: keep kk normalization for pure Kazakh, but allow automatic
# language detection when Han characters appear. Auto normalization helps dates/numbers.
old = '''      body: JSON.stringify({\n        text,\n        model_id: ELEVEN_MODEL_ID,\n        language_code: "kk",\n        voice_settings: {\n'''
new = '''      body: JSON.stringify({\n        text,\n        model_id: ELEVEN_MODEL_ID,\n        ...(hasHanCharacters(text) ? {} : { language_code: "kk" }),\n        apply_text_normalization: "auto",\n        voice_settings: {\n'''
assert old in route, 'ElevenLabs request body block not found'
route = route.replace(old, new, 1)

# 5) UI copy: make automatic mixed reading visible without adding another control.
page = page.replace(
    '三种模式均面向哈萨克语播音，并提供各自适配的声线、倍速与表现力控制。',
    '三种模式均面向哈萨克语播音，并提供各自适配的声线、倍速与表现力控制。Edge 与 ElevenLabs v3 还能自动识别新闻稿中的中文片段并按普通话朗读。',
    1,
)
page = page.replace(
    '            <span>Edge / OmniVoice / ElevenLabs</span>\n            <span>三种模式均可调倍速</span>',
    '            <span>Edge / OmniVoice / ElevenLabs</span>\n            <span>Edge / v3 中哈自动混读</span>\n            <span>三种模式均可调倍速</span>',
    1,
)
page = page.replace(
    'Edge TTS · 声线 / 倍速 / 音调 / 音量',
    'Edge TTS · 声线 / 倍速 / 音调 / 音量 / 中文自动识别',
    1,
)
page = page.replace(
    'ElevenLabs v3 · 声线 / 倍速 / 音色',
    'ElevenLabs v3 · 声线 / 倍速 / 音色 / 中文自动识别',
    1,
)
page = page.replace(
    '支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格，不消耗 ElevenLabs 额度。',
    '支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格；稿件中出现中文汉字时，会自动切换匹配性别的普通话 Neural Voice，读完后无缝切回哈萨克语，不消耗 ElevenLabs 额度。',
    1,
)
page = page.replace(
    '支持最多 500 条账号声线、0.70×–1.20× 精细倍速，以及稳定度、声线相似度和风格强度等音色参数。',
    '支持最多 500 条账号声线、0.70×–1.20× 精细倍速，以及稳定度、声线相似度和风格强度等音色参数；检测到中文时自动使用 v3 的多语言识别，不再强制整段按哈萨克语解析。',
    1,
)

route_path.write_text(route)
page_path.write_text(page)
print('enabled automatic mixed Kazakh-Chinese reading for Edge and ElevenLabs v3')
