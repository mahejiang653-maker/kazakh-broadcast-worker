from pathlib import Path

page_path = Path('app/page.tsx')
page = page_path.read_text()

# All four Edge presets advertise and run full-article emotion analysis.
page = page.replace(
'''const PRESETS = [
  { id: "news", label: "标准新闻", note: "原生自然 · 推荐", rateFactor: 1 },
  { id: "calm", label: "沉稳长稿", note: "原生自然 · 稍慢柔和", rateFactor: 0.94 },
  { id: "bulletin", label: "简明快讯", note: "原生自然 · 轻快紧凑", rateFactor: 1.035 },
  { id: "expressive", label: "生动播报", note: "全文情绪导演 · 自动分析", rateFactor: 0.99 },
] as const;''',
'''const PRESETS = [
  { id: "news", label: "标准新闻", note: "全文情绪分析 · 克制表达", rateFactor: 1 },
  { id: "calm", label: "沉稳长稿", note: "全文情绪分析 · 平稳柔和", rateFactor: 0.94 },
  { id: "bulletin", label: "简明快讯", note: "全文情绪分析 · 轻快紧凑", rateFactor: 1.035 },
  { id: "expressive", label: "生动播报", note: "全文情绪分析 · 完整表现", rateFactor: 0.99 },
] as const;''',
1,
)

page = page.replace(
'    if (engine !== "edge" || preset !== "expressive" || !cleanText) {',
'    if (engine !== "edge" || !cleanText) {',
1,
)
page = page.replace(
'      const shouldAnalyzeEmotion = engine === "edge" && preset === "expressive";',
'      const shouldAnalyzeEmotion = engine === "edge";',
1,
)
page = page.replace(
'              {engine === "edge" && preset === "expressive" ? (',
'              {engine === "edge" ? (',
1,
)
page_path.write_text(page)

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

preset_anchor = '''const PRESETS = {
  // All four styles are native-first. They differ only by a very small global bias.
  news: { rateFactor: 1, pitch: 0, volume: 0 },
  calm: { rateFactor: 0.94, pitch: 0, volume: -0.2 },
  bulletin: { rateFactor: 1.035, pitch: 0.2, volume: 0.2 },
  expressive: { rateFactor: 0.99, pitch: 0.35, volume: 0.15 },
} as const;
'''
strength_addition = '''
// Every Edge style uses the same full-article emotion plan, but each style
// applies a different amount of local direction so they remain audibly distinct.
const EMOTION_STRENGTH_BY_PRESET: Record<keyof typeof PRESETS, number> = {
  news: 0.55,
  calm: 0.45,
  bulletin: 0.7,
  expressive: 1,
};
'''
assert preset_anchor in route
route = route.replace(preset_anchor, preset_anchor + strength_addition, 1)

render_anchor = '''  const presetSettings = PRESETS[preset];
  const isDauletProfile = profileVoice === "kk-KZ-DauletNeural";'''
render_replacement = '''  const presetSettings = PRESETS[preset];
  const emotionStrength = EMOTION_STRENGTH_BY_PRESET[preset];
  const isDauletProfile = profileVoice === "kk-KZ-DauletNeural";'''
assert render_anchor in route
route = route.replace(render_anchor, render_replacement, 1)

weighted_anchor = '''      { rate: 0, pitch: 0, volume: 0 },
    );

    const rawText = group.sentences.map((sentence) => sentence.text).join(" ");'''
weighted_replacement = '''      { rate: 0, pitch: 0, volume: 0 },
    );
    weighted.rate *= emotionStrength;
    weighted.pitch *= emotionStrength;
    weighted.volume *= emotionStrength;

    const rawText = group.sentences.map((sentence) => sentence.text).join(" ");'''
assert weighted_anchor in route
route = route.replace(weighted_anchor, weighted_replacement, 1)

route = route.replace(
'''    const body =
      preset === "expressive" && emotionPlan
        ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, false)
        : edgeNativeProsody(text, settings, voice, preset);''',
'''    const body = emotionPlan
      ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, false)
      : edgeNativeProsody(text, settings, voice, preset);''',
1,
)

route = route.replace(
'''  const body =
    preset === "expressive" && emotionPlan
      ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, true)
      : runs
          .map((run) =>
            `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
          )
          .join("");''',
'''  const body = emotionPlan
    ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, true)
    : runs
        .map((run) =>
          `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
        )
        .join("");''',
1,
)

route = route.replace(
'''    ...(preset === "expressive" && emotionPlan
      ? [body]
      : [''',
'''    ...(emotionPlan
      ? [body]
      : [''',
1,
)

route = route.replace(
'''  const emotionPlan =
    preset === "expressive"
      ? analyzeEdgeEmotionPlan(preparedText, documentPlan)
      : null;''',
'''  const emotionPlan = analyzeEdgeEmotionPlan(preparedText, documentPlan);''',
1,
)

route_path.write_text(route)
print('enabled full-article emotion analysis for all Edge presets with style-specific strength')
