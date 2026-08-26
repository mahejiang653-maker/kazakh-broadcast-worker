from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

import_anchor = 'import { prepareEdgeHumanText } from "../../lib/edge-humanizer";\n'
new_import = '''import { prepareEdgeHumanText } from "../../lib/edge-humanizer";\nimport {\n  analyzeEdgeEmotionPlan,\n  resolveEdgeEmotionSentences,\n  type EdgeEmotionPlan,\n} from "../../lib/edge-emotion-director";\n'''
assert import_anchor in route
route = route.replace(import_anchor, new_import, 1)

helper_anchor = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  _documentPlan?: EdgeDocumentPlan,\n  useMultilingual = false,\n) {\n'''
helper = r'''function renderEmotionDirectedBody(
  text: string,
  settings: EdgeVoiceSettings,
  profileVoice: string,
  preset: PresetName,
  emotionPlan: EdgeEmotionPlan,
  useMultilingual: boolean,
) {
  const presetSettings = PRESETS[preset];
  const isDauletProfile = profileVoice === "kk-KZ-DauletNeural";
  const antiCreakRate = isDauletProfile ? 1.002 : 1;
  const antiCreakPitch = isDauletProfile ? 1.8 : 0;
  const baseSpeed = clamp(
    settings.speed * presetSettings.rateFactor * antiCreakRate,
    0.58,
    1.35,
  );
  const basePitch = clamp(
    settings.pitch + presetSettings.pitch + antiCreakPitch,
    -18,
    18,
  );
  const baseVolume = clamp(
    settings.volume + presetSettings.volume,
    -7,
    7,
  );

  return resolveEdgeEmotionSentences(text, emotionPlan)
    .map((sentence) => {
      const sentenceSpeed = clamp(baseSpeed * sentence.rateFactor, 0.72, 1.24);
      const sentencePitch = clamp(basePitch + sentence.pitchDelta, -18, 18);
      const sentenceVolume = clamp(baseVolume + sentence.volumeDelta, -7, 7);
      const content = useMultilingual
        ? splitEdgeLanguageRuns(sentence.text)
            .map(
              (run) =>
                `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,
            )
            .join("")
        : escapeXml(sentence.text);

      return `<prosody rate="${speedToRate(sentenceSpeed)}" pitch="${signedPercent(sentencePitch)}" volume="${signedPercent(sentenceVolume)}">${content}</prosody>`;
    })
    .join(" ");
}

function buildEdgeSsml(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
  _documentPlan?: EdgeDocumentPlan,
  useMultilingual = false,
  emotionPlan: EdgeEmotionPlan | null = null,
) {
'''
assert helper_anchor in route
route = route.replace(helper_anchor, helper, 1)

old_non_multi = '''  if (!useMultilingual) {\n    return [\n      '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n      `<voice name="${voice}">`,\n      edgeNativeProsody(text, settings, voice, preset),\n      "</voice>",\n      "</speak>",\n    ].join("");\n  }\n'''
new_non_multi = '''  if (!useMultilingual) {\n    const body =\n      preset === "expressive" && emotionPlan\n        ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, false)\n        : edgeNativeProsody(text, settings, voice, preset);\n    return [\n      '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n      `<voice name="${voice}">`,\n      body,\n      "</voice>",\n      "</speak>",\n    ].join("");\n  }\n'''
assert old_non_multi in route
route = route.replace(old_non_multi, new_non_multi, 1)

old_multi_body = '''  const body = runs\n    .map((run) =>\n      `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,\n    )\n    .join("");\n\n  return [\n    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n    `<voice name="${multilingualVoice}">`,\n    `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">`,\n    body,\n    "</prosody>",\n    "</voice>",\n    "</speak>",\n  ].join("");\n'''
new_multi_body = '''  const body =\n    preset === "expressive" && emotionPlan\n      ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, true)\n      : runs\n          .map((run) =>\n            `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,\n          )\n          .join("");\n\n  return [\n    '<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ">',\n    `<voice name="${multilingualVoice}">`,\n    ...(preset === "expressive" && emotionPlan\n      ? [body]\n      : [\n          `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">`,\n          body,\n          "</prosody>",\n        ]),\n    "</voice>",\n    "</speak>",\n  ].join("");\n'''
assert old_multi_body in route
route = route.replace(old_multi_body, new_multi_body, 1)

old_sig = '''async function synthesizeEdgeChunk(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  endpoint: TranslatorEndpoint,\n  documentPlan: EdgeDocumentPlan,\n  useMultilingual: boolean,\n) {\n'''
new_sig = '''async function synthesizeEdgeChunk(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  endpoint: TranslatorEndpoint,\n  documentPlan: EdgeDocumentPlan,\n  useMultilingual: boolean,\n  emotionPlan: EdgeEmotionPlan | null,\n) {\n'''
assert old_sig in route
route = route.replace(old_sig, new_sig, 1)

old_build = '      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual),'
new_build = '      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual, emotionPlan),'
assert old_build in route
route = route.replace(old_build, new_build, 1)

old_after_use_multi = '''  const useMultilingual = hasHanCharacters(preparedText);\n  const audioChunks: ArrayBuffer[] = [];\n'''
new_after_use_multi = '''  const useMultilingual = hasHanCharacters(preparedText);\n  const emotionPlan =\n    preset === "expressive"\n      ? analyzeEdgeEmotionPlan(preparedText, documentPlan)\n      : null;\n  const audioChunks: ArrayBuffer[] = [];\n'''
assert old_after_use_multi in route
route = route.replace(old_after_use_multi, new_after_use_multi, 1)

needle = '''          documentPlan,\n          useMultilingual,\n        ),'''
replacement = '''          documentPlan,\n          useMultilingual,\n          emotionPlan,\n        ),'''
count = route.count(needle)
assert count >= 2, f'expected >=2 synthesizeEdgeChunk calls, found {count}'
route = route.replace(needle, replacement)

route_path.write_text(route)
print('wired full-article emotion director into expressive Edge preset')
