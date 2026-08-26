from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
page_path = Path('app/page.tsx')
route = route_path.read_text()
page = page_path.read_text()

old_allowed = '''const ALLOWED_EDGE_VOICES = new Set([\n  "kk-KZ-DauletNeural",\n  "kk-KZ-AigulNeural",\n]);\n'''
new_allowed = '''const ALLOWED_EDGE_VOICES = new Set([\n  "kk-KZ-DauletNeural",\n  "kk-KZ-AigulNeural",\n  "edge-unified-male",\n  "edge-unified-female",\n]);\n'''
assert old_allowed in route, 'allowed voices block not found'
route = route.replace(old_allowed, new_allowed, 1)

old_map = '''const MULTILINGUAL_EDGE_VOICE_BY_KAZAKH: Record<string, string> = {\n  "kk-KZ-DauletNeural": "zh-CN-YunyiMultilingualNeural",\n  "kk-KZ-AigulNeural": "zh-CN-XiaoxiaoMultilingualNeural",\n};\n'''
new_map = '''const MULTILINGUAL_EDGE_VOICE_BY_KAZAKH: Record<string, string> = {\n  "kk-KZ-DauletNeural": "zh-CN-YunyiMultilingualNeural",\n  "kk-KZ-AigulNeural": "zh-CN-XiaoxiaoMultilingualNeural",\n  "edge-unified-male": "zh-CN-YunyiMultilingualNeural",\n  "edge-unified-female": "zh-CN-XiaoxiaoMultilingualNeural",\n};\n'''
assert old_map in route, 'multilingual map not found'
route = route.replace(old_map, new_map, 1)

old_use = '''  // Keep the exact same timbre for pure Kazakh and mixed Kazakh+Chinese text.\n  // Daulet/Aigul are standard (not multilingual) voices, so switching only when\n  // Han text appears inevitably changes speaker identity. We therefore use the\n  // mapped multilingual voice for every Edge request and only switch language\n  // with <lang> inside that one voice.\n  const useMultilingual = true;\n'''
new_use = '''  // Native profiles keep the original Daulet/Aigul acoustic voice for pure\n  // Kazakh. Unified profiles always use one multilingual voice. If a native\n  // profile receives Chinese, switch that whole request to the matching\n  // multilingual voice so the Chinese can be pronounced correctly.\n  const isUnifiedProfile =\n    voice === "edge-unified-male" || voice === "edge-unified-female";\n  const useMultilingual = isUnifiedProfile || hasHanCharacters(preparedText);\n'''
assert old_use in route, 'useMultilingual block not found'
route = route.replace(old_use, new_use, 1)

old_voices = '''const EDGE_VOICES = [\n  {\n    id: "kk-KZ-DauletNeural",\n    name: "统一男声",\n    meta: "中哈同音色 · 多语言",\n    mark: "D",\n  },\n  {\n    id: "kk-KZ-AigulNeural",\n    name: "统一女声",\n    meta: "中哈同音色 · 多语言",\n    mark: "A",\n  },\n] as const;\n'''
new_voices = '''const EDGE_VOICES = [\n  {\n    id: "kk-KZ-DauletNeural",\n    name: "Дәулет",\n    meta: "原版男声 · 纯哈萨克语推荐",\n    mark: "D",\n  },\n  {\n    id: "kk-KZ-AigulNeural",\n    name: "Айгүл",\n    meta: "原版女声 · 纯哈萨克语推荐",\n    mark: "A",\n  },\n  {\n    id: "edge-unified-male",\n    name: "统一男声",\n    meta: "中哈同音色 · 多语言",\n    mark: "M",\n  },\n  {\n    id: "edge-unified-female",\n    name: "统一女声",\n    meta: "中哈同音色 · 多语言",\n    mark: "F",\n  },\n] as const;\n'''
assert old_voices in page, 'EDGE_VOICES block not found'
page = page.replace(old_voices, new_voices, 1)

page = page.replace(
    'Edge 现在无论纯哈萨克文还是中哈混合稿都固定使用同一条 Multilingual Neural Voice，只切换发音语言，不再因为出现中文而更换音色。',
    'Edge 现在同时提供原版 Дәулет / Айгүл 与统一多语男声 / 女声。原版声线适合纯哈萨克语；统一声线可让中哈混合稿从头到尾保持同一音色。',
    1,
)
page = page.replace(
    '纯哈萨克稿和中哈混合稿现在都固定使用匹配性别的同一条 Multilingual Neural Voice；中文只切换为普通话发音，哈萨克文使用 kk-KZ 发音，整篇不换音色，也不消耗 ElevenLabs 额度。',
    '可选择原版 Дәулет / Айгүл，或统一多语男声 / 女声。原版声线在纯哈萨克稿中保持原始音色；统一声线无论纯哈萨克文还是中哈混合稿都保持同一音色，中文仅切换普通话发音，不消耗 ElevenLabs 额度。',
    1,
)

route_path.write_text(route)
page_path.write_text(page)
print('restored native Daulet/Aigul and kept unified multilingual voices')
