from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

# Make the global story pace slightly closer to native speech.
route = route.replace(
'  story: { rateFactor: 0.985, pitch: 0.05, volume: -0.03 },',
'  story: { rateFactor: 0.99, pitch: 0.03, volume: -0.02 },',
1,
)

anchor = '''function renderEmotionDirectedBody(
  text: string,
  settings: EdgeVoiceSettings,
  profileVoice: string,
  preset: PresetName,
  emotionPlan: EdgeEmotionPlan,
  useMultilingual: boolean,
) {'''

addition = r'''function renderContinuousStoryBody(
  sentences: EdgeEmotionPlan["sentences"],
  baseSpeed: number,
  basePitch: number,
  baseVolume: number,
  useMultilingual: boolean,
) {
  // Story V4: one stable delivery envelope per paragraph. Sentence-level story
  // analysis still informs the paragraph, but it no longer creates a new prosody
  // state every one or two sentences. This removes the audible "waves" caused by
  // repeated rate/pitch resets while keeping a gentle narrative contour.
  const paragraphs = new Map<number, typeof sentences>();
  for (const sentence of sentences) {
    const bucket = paragraphs.get(sentence.paragraphIndex) ?? [];
    bucket.push(sentence);
    paragraphs.set(sentence.paragraphIndex, bucket);
  }

  let body = "";
  let previousRate = 0;
  let previousPitch = 0;
  let previousVolume = 0;
  let firstParagraph = true;

  for (const [, paragraphSentences] of paragraphs) {
    const totalChars = Math.max(
      1,
      paragraphSentences.reduce((sum, sentence) => sum + sentence.text.length, 0),
    );

    const direction = paragraphSentences.reduce(
      (acc, sentence) => {
        const weight = sentence.text.length / totalChars;
        const local = storyDirectionForSentence(sentence.text, sentence.mood, sentence.role);

        // Ordinary narration is the anchor. Strong story beats contribute, but
        // only as a mild paragraph-level tendency rather than a local jump.
        const beatWeight =
          local.beat === "narrator"
            ? 0.2
            : local.beat === "dialogue"
              ? 0.25
              : local.beat === "ending"
                ? 0.55
                : 0.42;

        acc.rate += local.ratePercent * weight * beatWeight;
        acc.pitch += local.pitchDelta * weight * beatWeight;
        acc.volume += local.volumeDelta * weight * beatWeight;
        return acc;
      },
      { rate: 0, pitch: 0, volume: 0 },
    );

    // Keep each paragraph very close to the native voice, and limit the step
    // between paragraphs so the contour changes gradually rather than in bursts.
    let rate = clamp(direction.rate, -1.35, 1.15);
    let pitch = clamp(direction.pitch, -0.28, 0.28);
    let volume = clamp(direction.volume, -0.22, 0.22);

    if (!firstParagraph) {
      rate = clamp(rate, previousRate - 0.45, previousRate + 0.45);
      pitch = clamp(pitch, previousPitch - 0.12, previousPitch + 0.12);
      volume = clamp(volume, previousVolume - 0.1, previousVolume + 0.1);
    }

    previousRate = rate;
    previousPitch = pitch;
    previousVolume = volume;
    firstParagraph = false;

    const rawText = paragraphSentences.map((sentence) => sentence.text).join(" ");
    const content = useMultilingual
      ? splitEdgeLanguageRuns(rawText)
          .map(
            (run) =>
              `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : escapeXml(rawText);

    const hasDirection =
      Math.abs(rate) >= 0.3 || Math.abs(pitch) >= 0.05 || Math.abs(volume) >= 0.05;

    body += hasDirection
      ? `<p><prosody rate="${signedPercent(rate)}" pitch="${signedPercent(pitch)}" volume="${signedPercent(volume)}">${content}</prosody></p>`
      : `<p>${content}</p>`;
  }

  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${body}</prosody>`;
}

'''

assert anchor in route, 'renderEmotionDirectedBody anchor not found'
route = route.replace(anchor, addition + anchor, 1)

fallback_anchor = '''  const sentences = resolveEdgeEmotionSentences(text, emotionPlan);
  if (!sentences.length) {
    const fallback = useMultilingual
      ? splitEdgeLanguageRuns(text)
          .map(
            (run) =>
              `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
          )
          .join("")
      : renderStructuredNativeText(text);
    return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${fallback}</prosody>`;
  }
'''

fallback_replacement = fallback_anchor + '''
  if (preset === "story") {
    return renderContinuousStoryBody(
      sentences,
      baseSpeed,
      basePitch,
      baseVolume,
      useMultilingual,
    );
  }
'''

assert fallback_anchor in route, 'sentence fallback anchor not found'
route = route.replace(fallback_anchor, fallback_replacement, 1)
route_path.write_text(route)

page_path = Path('app/page.tsx')
page = page_path.read_text()
page = page.replace(
'  { id: "story", label: "故事版", note: "连续叙事 · 自然对白 / 悬念 / 高潮", rateFactor: 0.985 },',
'  { id: "story", label: "故事版", note: "长语流 · 段落级自然过渡", rateFactor: 0.99 },',
1,
)
page_path.write_text(page)

print('applied story V4 paragraph-level continuous flow')
