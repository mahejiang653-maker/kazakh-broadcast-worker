from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

import_anchor = '''import {
  analyzeEdgeEmotionPlan,
  resolveEdgeEmotionSentences,
  type EdgeEmotionPlan,
} from "../../lib/edge-emotion-director";
'''
if 'from "../../lib/edge-natural-structure"' not in route:
    assert import_anchor in route, 'emotion import anchor not found'
    route = route.replace(
        import_anchor,
        import_anchor + 'import { structureEdgeText } from "../../lib/edge-natural-structure";\n',
        1,
    )

start = route.index('function edgeNativeProsody(')
end = route.index('function buildEdgeSsml(', start)

replacement = r'''function renderStructuredNativeText(text: string) {
  const paragraphs = structureEdgeText(text);
  if (!paragraphs.length) return escapeXml(text);

  return paragraphs
    .map(
      (paragraph) =>
        `<p>${paragraph.sentences
          .map((sentence) => `<s>${escapeXml(sentence.text)}</s>`)
          .join("")}</p>`,
    )
    .join("");
}

function edgeNativeProsody(
  text: string,
  settings: EdgeVoiceSettings,
  voice: string,
  preset: PresetName,
) {
  const presetSettings = PRESETS[preset];
  const isDaulet = voice === "kk-KZ-DauletNeural";
  const antiCreakRate = isDaulet ? 1.002 : 1;
  const antiCreakPitch = isDaulet ? 1.8 : 0;

  const effectiveSpeed = clamp(
    settings.speed * presetSettings.rateFactor * antiCreakRate,
    0.58,
    1.35,
  );
  const effectivePitch = clamp(
    settings.pitch + presetSettings.pitch + antiCreakPitch,
    -18,
    18,
  );
  const effectiveVolume = clamp(
    settings.volume + presetSettings.volume,
    -7,
    7,
  );

  // Explicit paragraph/sentence structure gives the neural voice the same
  // punctuation hierarchy that OmniVoice preserves during long-form inference.
  // We keep one global prosody envelope so the speaker does not restart its
  // acoustic character at every sentence.
  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${renderStructuredNativeText(text)}</prosody>`;
}

function renderEmotionDirectedBody(
  text: string,
  settings: EdgeVoiceSettings,
  profileVoice: string,
  preset: PresetName,
  emotionPlan: EdgeEmotionPlan,
  useMultilingual: boolean,
) {
  const presetSettings = PRESETS[preset];
  const isDauletProfile = profileVoice === "kk-KZ-DauletNeural";
  const antiCreakRate = useMultilingual ? 1 : isDauletProfile ? 1.002 : 1;
  const antiCreakPitch = useMultilingual ? 0 : isDauletProfile ? 1.8 : 0;
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

  const sentences = resolveEdgeEmotionSentences(text, emotionPlan);
  if (!sentences.length) {
    const fallback = useMultilingual
      ? splitEdgeLanguageRuns(text)
          .map(
            (run) =>
              `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : renderStructuredNativeText(text);
    return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${fallback}</prosody>`;
  }

  let body = "";
  let openParagraph: number | null = null;

  for (const sentence of sentences) {
    if (openParagraph !== sentence.paragraphIndex) {
      if (openParagraph !== null) body += "</p>";
      body += "<p>";
      openParagraph = sentence.paragraphIndex;
    }

    const content = useMultilingual
      ? splitEdgeLanguageRuns(sentence.text)
          .map(
            (run) =>
              `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : escapeXml(sentence.text);

    const rateDelta = (sentence.rateFactor - 1) * 100;
    const hasLocalDirection =
      Math.abs(rateDelta) >= 0.35 ||
      Math.abs(sentence.pitchDelta) >= 0.02 ||
      Math.abs(sentence.volumeDelta) >= 0.02;

    if (hasLocalDirection) {
      body += `<s><prosody rate="${signedPercent(rateDelta)}" pitch="${signedPercent(sentence.pitchDelta)}" volume="${signedPercent(sentence.volumeDelta)}">${content}</prosody></s>`;
    } else {
      body += `<s>${content}</s>`;
    }
  }

  if (openParagraph !== null) body += "</p>";

  // One global envelope preserves speaker identity; sentence-level directions
  // are small relative adjustments rather than absolute per-sentence resets.
  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${body}</prosody>`;
}

'''

route = route[:start] + replacement + route[end:]
route_path.write_text(route)
print('applied OmniVoice-inspired p/s structure and duration-first expressive delivery')
