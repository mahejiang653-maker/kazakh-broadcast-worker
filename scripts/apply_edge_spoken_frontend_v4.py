from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
normalizer_path = Path('app/lib/kazakh-speech-normalizer.ts')
route = route_path.read_text()
normalizer = normalizer_path.read_text()

# 1) Wire hidden Kazakh speech normalization before the existing humanizer.
import_anchor = 'import { prepareEdgeHumanText } from "../../lib/edge-humanizer";\n'
normalizer_import = 'import { normalizeKazakhSpeechText } from "../../lib/kazakh-speech-normalizer";\n'
if normalizer_import not in route:
    assert import_anchor in route, 'humanizer import anchor not found'
    route = route.replace(import_anchor, import_anchor + normalizer_import, 1)

old_prepare = '''  const endpoint = await getEndpoint();
  const preparedText = prepareEdgeHumanText(text);
  if (!preparedText) return [];
'''
new_prepare = '''  const endpoint = await getEndpoint();
  // Build a hidden spoken form first (numbers, years, percentages, dates,
  // common units), then do typography cleanup. The user's visible article is
  // never changed.
  const spokenText = normalizeKazakhSpeechText(text);
  const preparedText = prepareEdgeHumanText(spokenText);
  if (!preparedText) return [];
'''
assert old_prepare in route, 'synthesizeWithEdge prepare anchor not found'
route = route.replace(old_prepare, new_prepare, 1)

# 2) Native speech: paragraphs stay explicit, but do not force every sentence
# through an SSML <s> boundary. Let the neural voice infer sentence cadence
# from punctuation inside a continuous paragraph.
old_structured = '''function renderStructuredNativeText(text: string) {
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
'''
new_structured = '''function renderStructuredNativeText(text: string) {
  const paragraphs = structureEdgeText(text);
  if (!paragraphs.length) return escapeXml(text);

  return paragraphs
    .map(
      (paragraph) =>
        `<p>${paragraph.sentences
          .map((sentence) => escapeXml(sentence.text))
          .join(" ")}</p>`,
    )
    .join("");
}
'''
assert old_structured in route, 'renderStructuredNativeText anchor not found'
route = route.replace(old_structured, new_structured, 1)

# 3) Expressive speech: sentence analysis remains, but execution is grouped
# into short continuous delivery spans. This avoids an acoustic/prosody reset
# at every sentence while preserving meaningful changes in tempo.
start = route.index('function renderEmotionDirectedBody(')
end = route.index('function buildEdgeSsml(', start)
old_block = route[start:end]
new_block = r'''function emotionTempoZone(mood: string) {
  if (mood === "urgent" || mood === "positive" || mood === "transition") return "forward";
  if (mood === "sad" || mood === "concern" || mood === "emphasis" || mood === "ending") return "slow";
  return "steady";
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

  type DeliveryGroup = {
    paragraphIndex: number;
    zone: string;
    sentences: typeof sentences;
  };

  const groups: DeliveryGroup[] = [];
  for (const sentence of sentences) {
    const zone = emotionTempoZone(sentence.mood);
    const previous = groups[groups.length - 1];
    const previousChars = previous
      ? previous.sentences.reduce((sum, item) => sum + item.text.length, 0)
      : 0;
    const canJoin =
      previous &&
      previous.paragraphIndex === sentence.paragraphIndex &&
      previous.zone === zone &&
      previous.sentences.length < 3 &&
      previousChars + sentence.text.length <= 300;

    if (canJoin) previous.sentences.push(sentence);
    else groups.push({ paragraphIndex: sentence.paragraphIndex, zone, sentences: [sentence] });
  }

  let body = "";
  let openParagraph: number | null = null;

  for (const group of groups) {
    if (openParagraph !== group.paragraphIndex) {
      if (openParagraph !== null) body += "</p>";
      body += "<p>";
      openParagraph = group.paragraphIndex;
    }

    const totalChars = Math.max(1, group.sentences.reduce((sum, item) => sum + item.text.length, 0));
    const weighted = group.sentences.reduce(
      (acc, sentence) => {
        const weight = sentence.text.length / totalChars;
        acc.rate += (sentence.rateFactor - 1) * 100 * weight;
        acc.pitch += sentence.pitchDelta * weight;
        acc.volume += sentence.volumeDelta * weight;
        return acc;
      },
      { rate: 0, pitch: 0, volume: 0 },
    );

    const rawText = group.sentences.map((sentence) => sentence.text).join(" ");
    const content = useMultilingual
      ? splitEdgeLanguageRuns(rawText)
          .map(
            (run) =>
              `<lang xml:lang="${run.language === "zh" ? "zh-CN" : "kk-KZ"}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : escapeXml(rawText);

    const hasLocalDirection =
      Math.abs(weighted.rate) >= 0.35 ||
      Math.abs(weighted.pitch) >= 0.02 ||
      Math.abs(weighted.volume) >= 0.02;

    if (hasLocalDirection) {
      body += `<prosody rate="${signedPercent(weighted.rate)}" pitch="${signedPercent(weighted.pitch)}" volume="${signedPercent(weighted.volume)}">${content}</prosody> `;
    } else {
      body += `${content} `;
    }
  }

  if (openParagraph !== null) body += "</p>";

  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${body}</prosody>`;
}

'''
route = route[:start] + new_block + route[end:]

# 4) Fix the mixed-language protection in the newly-added normalizer. Once a
# Han run starts, keep attached digits/punctuation with Chinese until whitespace
# or a Cyrillic letter begins the Kazakh run.
marker = 'export function normalizeKazakhSpeechText(source: string) {'
idx = normalizer.index(marker)
normalizer = normalizer[:idx] + r'''export function normalizeKazakhSpeechText(source: string) {
  if (!source || !/\d|[%$€₸¥]/u.test(source)) return source;
  if (!/\p{Script=Han}/u.test(source)) return normalizeKazakhSegment(source);

  let output = "";
  let buffer = "";
  let hanMode = false;

  const flush = () => {
    if (!buffer) return;
    output += hanMode ? buffer : normalizeKazakhSegment(buffer);
    buffer = "";
  };

  for (const char of source) {
    const isHan = /\p{Script=Han}/u.test(char);
    const isCyrillic = /\p{Script=Cyrillic}/u.test(char);

    if (!hanMode && isHan) {
      flush();
      hanMode = true;
      buffer = char;
      continue;
    }

    if (hanMode && isCyrillic) {
      flush();
      hanMode = false;
      buffer = char;
      continue;
    }

    buffer += char;

    if (hanMode && /\s/u.test(char)) {
      flush();
      hanMode = false;
    }
  }

  flush();
  return output;
}
'''

route_path.write_text(route)
normalizer_path.write_text(normalizer)
print('applied hidden Kazakh spoken normalization and continuous delivery groups')
