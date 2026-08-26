from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

# Import hidden native-voice English pronunciation frontend.
anchor = 'import { prepareEdgeHumanText } from "../../lib/edge-humanizer";\n'
addition = 'import { prepareNativeKazakhEnglishPronunciation } from "../../lib/edge-english-pronunciation";\n'
if addition not in route:
    assert anchor in route
    route = route.replace(anchor, anchor + addition, 1)

# Three-language run detection.
route = route.replace(
    'type EdgeTextLanguage = "kk" | "zh";',
    'type EdgeTextLanguage = "kk" | "zh" | "en";',
    1,
)
route = route.replace(
    '  if (/\\p{Script=Han}/u.test(character)) return "zh";\n  if (/\\p{Script=Cyrillic}/u.test(character)) return "kk";',
    '  if (/\\p{Script=Han}/u.test(character)) return "zh";\n  if (/[A-Za-z]/u.test(character)) return "en";\n  if (/\\p{Script=Cyrillic}/u.test(character)) return "kk";',
    1,
)

# Add one canonical language-code mapper and use it everywhere.
insert_after = '''function edgeLanguageForCharacter(character: string): EdgeTextLanguage | null {\n  if (/\\p{Script=Han}/u.test(character)) return "zh";\n  if (/[A-Za-z]/u.test(character)) return "en";\n  if (/\\p{Script=Cyrillic}/u.test(character)) return "kk";\n  return null;\n}\n'''
helper = '''\nfunction edgeLanguageCode(language: EdgeTextLanguage) {\n  if (language === "zh") return "zh-CN";\n  if (language === "en") return "en-US";\n  return "kk-KZ";\n}\n'''
if 'function edgeLanguageCode(' not in route:
    assert insert_after in route
    route = route.replace(insert_after, insert_after + helper, 1)

route = route.replace(
    '${run.language === "zh" ? "zh-CN" : "kk-KZ"}',
    '${edgeLanguageCode(run.language)}',
)

# Native Daulet/Aigul should not switch the whole article away from their
# original acoustic voice just because CIA/FBI appears. Expand high-confidence
# English tokens into hidden pronunciation hints only for native profiles. If
# Chinese is present, or a unified profile is selected, keep Latin text and let
# the multilingual voice speak it under en-US.
old = '''  const endpoint = await getEndpoint();\n  // Build a hidden spoken form first (numbers, years, percentages, dates,\n  // common units), then do typography cleanup. The user's visible article is\n  // never changed.\n  const spokenText = normalizeKazakhSpeechText(text);\n  const preparedText = prepareEdgeHumanText(spokenText);\n  if (!preparedText) return [];\n'''
new = '''  const endpoint = await getEndpoint();\n  const isUnifiedProfile =\n    voice === "edge-unified-male" || voice === "edge-unified-female";\n  const articleHasHan = hasHanCharacters(text);\n  const pronunciationPreparedText =\n    isUnifiedProfile || articleHasHan\n      ? text\n      : prepareNativeKazakhEnglishPronunciation(text);\n\n  // Build a hidden spoken form first (English acronym pronunciation for native\n  // voices, then numbers/years/percentages/dates), followed by typography\n  // cleanup. The user's visible article is never changed.\n  const spokenText = normalizeKazakhSpeechText(pronunciationPreparedText);\n  const preparedText = prepareEdgeHumanText(spokenText);\n  if (!preparedText) return [];\n'''
assert old in route
route = route.replace(old, new, 1)

old_profile = '''  const isUnifiedProfile =\n    voice === "edge-unified-male" || voice === "edge-unified-female";\n  const useMultilingual = isUnifiedProfile || hasHanCharacters(preparedText);\n'''
new_profile = '''  const useMultilingual = isUnifiedProfile || articleHasHan;\n'''
assert old_profile in route
route = route.replace(old_profile, new_profile, 1)

route_path.write_text(route)
print('applied Edge kk/zh/en language routing and native acronym pronunciation')
