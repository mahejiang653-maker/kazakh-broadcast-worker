from pathlib import Path
import re

ROOT = Path('.')
page_path = ROOT / 'app/page.tsx'
omni_ui_path = ROOT / 'app/components/OmniVoiceStudio.tsx'
synth_path = ROOT / 'app/api/synthesize/route.ts'
omni_api_path = ROOT / 'app/api/omnivoice/route.ts'

page = page_path.read_text()
omni_ui = omni_ui_path.read_text()
synth = synth_path.read_text()
omni_api = omni_api_path.read_text()

# ---------------- Main page ----------------
page, n = re.subn(r'\nconst AUDIO_TAGS = \[.*?\n\] as const;\n', '\n', page, count=1, flags=re.S)
assert n == 1, 'page AUDIO_TAGS block not found'
page = page.replace('    note: "更响应情绪标签",', '    note: "更有自然起伏",')
page = page.replace('  const textareaRef = useRef<HTMLTextAreaElement | null>(null);\n', '')
page, n = re.subn(r'\n  function insertAudioTag\(tag: string\) \{.*?\n  \}\n\n  async function generateAudio', '\n  async function generateAudio', page, count=1, flags=re.S)
assert n == 1, 'page insertAudioTag not found'
page, n = re.subn(r'\n  const audioTagPanel = \(mode: "edge" \| "eleven"\) => \(.*?\n  \);\n\n  return \(', '\n  return (', page, count=1, flags=re.S)
assert n == 1, 'page audioTagPanel not found'
page = page.replace('                ref={textareaRef}\n', '')
page = page.replace('            <span>句尾情绪标签</span>\n', '')
page = page.replace('Edge TTS · 声线 / 倍速 / 音调 / 音量 / 情绪', 'Edge TTS · 声线 / 倍速 / 音调 / 音量')
page = page.replace('ElevenLabs v3 · 声线 / 倍速 / 音色 / 情绪', 'ElevenLabs v3 · 声线 / 倍速 / 音色')
page = page.replace('KazakhTTS-OmniVoice · 声线设计 / 倍速 / 情绪', 'KazakhTTS-OmniVoice · 声线设计 / 倍速 / 质量')
page = page.replace('\n              {audioTagPanel("edge")}\n', '\n')
page = page.replace('\n              {audioTagPanel("eleven")}\n', '\n')
page = page.replace('支持 0.70×–1.20× 精细倍速、音调、音量、4 种播音风格，以及句子级情绪标签。情绪效果由 SSML 模拟，不消耗 ElevenLabs 额度。', '支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格，不消耗 ElevenLabs 额度。')
page = page.replace('支持最多 500 条账号声线、0.70×–1.20× 精细倍速、音色参数，以及句子级情绪和表演控制。', '支持最多 500 条账号声线、0.70×–1.20× 精细倍速，以及稳定度、声线相似度和风格强度等音色参数。')
page = page.replace('这是共享 GPU 模式，支持男/女声设计、年龄、音高、耳语、倍速、质量档位和句尾情绪标签。下方是它的专用控制区。', '这是共享 GPU 模式，支持男/女声设计、年龄、音高、耳语、倍速和质量档位。下方是它的专用控制区。')
page = page.replace('免费共享 GPU · 声线设计 + 倍速 + 情绪标签', '免费共享 GPU · 声线设计 + 倍速 + 质量控制')
page = page.replace('声线 + 倍速 + 音色 + 情绪标签 · 生成后可试听并下载 MP3', '声线 + 倍速 + 音色参数 · 生成后可试听并下载 MP3')
page = page.replace('声线 + 倍速 + 音调 + 音量 + 情绪标签 · 免费生成 MP3', '声线 + 倍速 + 音调 + 音量 · 免费生成 MP3')
page = page.replace('低：更有情绪起伏　高：更稳定一致', '低：变化更灵活　高：更稳定一致')

# ---------------- OmniVoice UI ----------------
omni_ui, n = re.subn(r'\nconst AUDIO_TAGS = \[.*?\n\] as const;\n', '\n', omni_ui, count=1, flags=re.S)
assert n == 1, 'Omni UI AUDIO_TAGS not found'
omni_ui = omni_ui.replace('  const textareaRef = useRef<HTMLTextAreaElement | null>(null);\n', '')
omni_ui, n = re.subn(r'\n  const tagCount = useMemo\(.*?\n  \);\n', '\n', omni_ui, count=1, flags=re.S)
assert n == 1, 'Omni UI tagCount not found'
omni_ui, n = re.subn(r'\n  function insertAudioTag\(tag: string\) \{.*?\n  \}\n\n  async function createCacheKey', '\n  async function createCacheKey', omni_ui, count=1, flags=re.S)
assert n == 1, 'Omni UI insertAudioTag not found'
omni_ui, n = re.subn(r'\n    if \(tagCount > 3\) \{.*?\n    \}\n', '\n', omni_ui, count=1, flags=re.S)
assert n == 1, 'Omni UI tagCount validation not found'
omni_ui = omni_ui.replace('              ref={textareaRef}\n', '')
omni_ui = omni_ui.replace('          <span>句尾情绪标签</span>\n', '')
omni_ui, n = re.subn(r'\n        <fieldset className="field-block">\n          <legend>情绪与表演标签</legend>.*?\n        </fieldset>\n', '\n', omni_ui, count=1, flags=re.S)
assert n == 1, 'Omni UI tag panel not found'
omni_ui = omni_ui.replace('              不需要 ElevenLabs Key 或额度。Voice Design 是模型原生能力；“开心、悲伤、严肃”等中文标签由网站映射到速度、音高和 Whisper 风格进行句子级模拟。', '              不需要 ElevenLabs Key 或额度。Voice Design 的性别、年龄、音高和耳语风格均直接使用 OmniVoice 原生控制。')

# ---------------- Edge + Eleven backend ----------------
synth, n = re.subn(r'\nconst CHINESE_AUDIO_TAGS: Record<string, string> = \{.*?\n\};\n\nconst EDGE_TAG_STYLES: Record<.*?\n\};\n', '\n', synth, count=1, flags=re.S)
assert n == 1, 'synth tag constants not found'
synth, n = re.subn(r'\nfunction applyTagToPreviousSentence\(.*?\nfunction normalizeEdgeAudioTags\(text: string\) \{.*?\n\}\n', '\n', synth, count=1, flags=re.S)
assert n == 1, 'synth tag normalization functions not found'
# Remove the old sentence-level tag-aware Edge branch and keep native-first for every request.
synth, n = re.subn(r'\nfunction edgeProsody\(.*?\nfunction buildEdgeSsml\(', '\nfunction buildEdgeSsml(', synth, count=1, flags=re.S)
assert n == 1, 'synth edge tag pipeline block not found'
# Replace buildEdgeSsml body with a single native-first path.
pattern = r'function buildEdgeSsml\(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  documentPlan\?: EdgeDocumentPlan,\n\) \{.*?\n\}\n\nasync function synthesizeEdgeChunk'
replacement = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  _documentPlan?: EdgeDocumentPlan,\n) {\n  return [\n    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n    `<voice name="${voice}">`,\n    edgeNativeProsody(text, settings, voice, preset),\n    "</voice>",\n    "</speak>",\n  ].join("");\n}\n\nasync function synthesizeEdgeChunk'''
synth, n = re.subn(pattern, replacement, synth, count=1, flags=re.S)
assert n == 1, 'synth buildEdgeSsml body not found'
synth = synth.replace('  const directedText = normalizeElevenAudioTags(text);\n  const chunks = splitText(directedText, ELEVEN_MAX_CHUNK_SIZE);', '  const chunks = splitText(text, ELEVEN_MAX_CHUNK_SIZE);')

# ---------------- OmniVoice backend ----------------
omni_api = omni_api.replace('const MAX_TAGGED_SEGMENTS = 7;\n', '')
omni_api, n = re.subn(r'\nconst TAG_STYLES: Record<.*?\n\};\n', '\n', omni_api, count=1, flags=re.S)
assert n == 1, 'Omni API TAG_STYLES not found'
omni_api = omni_api.replace('\ntype OmniSegment = { text: string; tag?: string };\n', '\n')
omni_api, n = re.subn(r'\nfunction splitTagFromPreviousSentence\(.*?\nfunction writeAscii', '\nfunction writeAscii', omni_api, count=1, flags=re.S)
assert n == 1, 'Omni API split tag functions not found'
omni_api, n = re.subn(r'\nfunction settingsForTag\(.*?\nasync function generateSegment', '\nasync function generateSegment', omni_api, count=1, flags=re.S)
assert n == 1, 'Omni API settingsForTag not found'
omni_api, n = re.subn(r'\n  const \{ segments, recognizedTags \} = splitOmniSegments\(cleanText\);.*?\n  try \{\n    const buffers: ArrayBuffer\[\] = \[\];\n    for \(const segment of segments\) \{\n      buffers.push\(await generateSegment\(segment.text, settingsForTag\(baseSettings, segment.tag\)\)\);\n    \}\n    const output = concatWav\(buffers\);', '\n  try {\n    const output = await generateSegment(cleanText, baseSettings);', omni_api, count=1, flags=re.S)
assert n == 1, 'Omni API POST tag segment logic not found'
omni_api = omni_api.replace('        "X-Omni-Segments": String(segments.length),\n', '        "X-Omni-Segments": "1",\n')

page_path.write_text(page)
omni_ui_path.write_text(omni_ui)
synth_path.write_text(synth)
omni_api_path.write_text(omni_api)
print('removed emotion tags from UI and all three synthesis backends')
