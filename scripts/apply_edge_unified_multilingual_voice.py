from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
page_path = Path('app/page.tsx')
route = route_path.read_text()
page = page_path.read_text()

# Always use the same multilingual voice family for Edge, even for pure Kazakh.
old = '  const useMultilingual = hasHanCharacters(preparedText);\n'
new = '''  // Keep the exact same timbre for pure Kazakh and mixed Kazakh+Chinese text.\n  // Daulet/Aigul are standard (not multilingual) voices, so switching only when\n  // Han text appears inevitably changes speaker identity. We therefore use the\n  // mapped multilingual voice for every Edge request and only switch language\n  // with <lang> inside that one voice.\n  const useMultilingual = true;\n'''
assert old in route, 'useMultilingual anchor not found'
route = route.replace(old, new, 1)

# The anti-creak compensation was tuned for the real Daulet voice. Do not apply
# it when the actual acoustic voice is the multilingual replacement.
old = '''  const isDauletProfile = profileVoice === "kk-KZ-DauletNeural";\n  const antiCreakRate = isDauletProfile ? 1.002 : 1;\n  const antiCreakPitch = isDauletProfile ? 1.8 : 0;\n'''
new = '''  const isDauletProfile = profileVoice === "kk-KZ-DauletNeural";\n  const antiCreakRate = useMultilingual ? 1 : isDauletProfile ? 1.002 : 1;\n  const antiCreakPitch = useMultilingual ? 0 : isDauletProfile ? 1.8 : 0;\n'''
assert old in route, 'emotion anti-creak block not found'
route = route.replace(old, new, 1)

# In the multilingual build path, the actual voice is not Daulet, so do not use
# Daulet-specific compensation there either.
old = '''  const isDauletProfile = voice === "kk-KZ-DauletNeural";\n  const antiCreakRate = isDauletProfile ? 1.002 : 1;\n  const antiCreakPitch = isDauletProfile ? 1.8 : 0;\n'''
new = '''  const isDauletProfile = voice === "kk-KZ-DauletNeural";\n  const antiCreakRate = 1;\n  const antiCreakPitch = 0;\n'''
assert old in route, 'multilingual anti-creak block not found'
route = route.replace(old, new, 1)

# Make the UI honest: these are now stable male/female multilingual profiles,
# not the native Daulet/Aigul acoustic voices.
page = page.replace('''    name: "Дәулет",\n    meta: "男声 · 稳重清晰",''', '''    name: "统一男声",\n    meta: "中哈同音色 · 多语言",''', 1)
page = page.replace('''    name: "Айгүл",\n    meta: "女声 · 自然明亮",''', '''    name: "统一女声",\n    meta: "中哈同音色 · 多语言",''', 1)

page = page.replace(
    'Edge 检测到中文后会让整篇稿件使用同一条 Multilingual Neural Voice，中哈两种语言保持同一音色。',
    'Edge 现在无论纯哈萨克文还是中哈混合稿都固定使用同一条 Multilingual Neural Voice，只切换发音语言，不再因为出现中文而更换音色。',
    1,
)
page = page.replace(
    '纯哈萨克稿继续使用 Дәулет / Айгүл；只要检测到中文，整篇自动切换为匹配性别的一条 Multilingual Neural Voice，并在同一音色内分别按哈萨克语和普通话发音，不消耗 ElevenLabs 额度。',
    '纯哈萨克稿和中哈混合稿现在都固定使用匹配性别的同一条 Multilingual Neural Voice；中文只切换为普通话发音，哈萨克文使用 kk-KZ 发音，整篇不换音色，也不消耗 ElevenLabs 额度。',
    1,
)

route_path.write_text(route)
page_path.write_text(page)
print('applied unified multilingual Edge voice for pure and mixed text')
