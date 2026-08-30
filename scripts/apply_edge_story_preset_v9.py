from pathlib import Path

page_path = Path('app/page.tsx')
page = page_path.read_text()
old_page_presets = '''const PRESETS = [
  { id: "news", label: "标准新闻", note: "全文情绪分析 · 克制表达", rateFactor: 1 },
  { id: "calm", label: "沉稳长稿", note: "全文情绪分析 · 平稳柔和", rateFactor: 0.94 },
  { id: "bulletin", label: "简明快讯", note: "全文情绪分析 · 轻快紧凑", rateFactor: 1.035 },
  { id: "expressive", label: "生动播报", note: "全文情绪分析 · 完整表现", rateFactor: 0.99 },
] as const;'''
new_page_presets = '''const PRESETS = [
  { id: "news", label: "标准新闻", note: "全文情绪分析 · 克制表达", rateFactor: 1 },
  { id: "calm", label: "沉稳长稿", note: "全文情绪分析 · 平稳柔和", rateFactor: 0.94 },
  { id: "bulletin", label: "简明快讯", note: "全文情绪分析 · 轻快紧凑", rateFactor: 1.035 },
  { id: "expressive", label: "生动播报", note: "全文情绪分析 · 完整表现", rateFactor: 0.99 },
  { id: "story", label: "故事版", note: "全文情绪分析 · 叙事 / 对白 / 悬念", rateFactor: 0.965 },
] as const;'''
assert old_page_presets in page, 'page PRESETS block not found'
page = page.replace(old_page_presets, new_page_presets, 1)
page_path.write_text(page)

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()
old_route_presets = '''const PRESETS = {
  // All four styles are native-first. They differ only by a very small global bias.
  news: { rateFactor: 1, pitch: 0, volume: 0 },
  calm: { rateFactor: 0.94, pitch: 0, volume: -0.2 },
  bulletin: { rateFactor: 1.035, pitch: 0.2, volume: 0.2 },
  expressive: { rateFactor: 0.99, pitch: 0.35, volume: 0.15 },
} as const;

// Every Edge style uses the same full-article emotion plan, but each style
// applies a different amount of local direction so they remain audibly distinct.
const EMOTION_STRENGTH_BY_PRESET: Record<keyof typeof PRESETS, number> = {
  news: 0.55,
  calm: 0.45,
  bulletin: 0.7,
  expressive: 1,
};'''
new_route_presets = '''const PRESETS = {
  // All five styles are native-first. Each one keeps a continuous speaker identity
  // while applying a different global pacing bias.
  news: { rateFactor: 1, pitch: 0, volume: 0 },
  calm: { rateFactor: 0.94, pitch: 0, volume: -0.2 },
  bulletin: { rateFactor: 1.035, pitch: 0.2, volume: 0.2 },
  expressive: { rateFactor: 0.99, pitch: 0.35, volume: 0.15 },
  story: { rateFactor: 0.965, pitch: 0.1, volume: -0.05 },
} as const;

// Every Edge style uses the same full-article emotion plan, but each style
// applies a different amount of local direction so they remain audibly distinct.
const EMOTION_STRENGTH_BY_PRESET: Record<keyof typeof PRESETS, number> = {
  news: 0.55,
  calm: 0.45,
  bulletin: 0.7,
  expressive: 1,
  story: 1.05,
};'''
assert old_route_presets in route, 'route PRESETS block not found'
route = route.replace(old_route_presets, new_route_presets, 1)

story_helpers_anchor = '''function emotionTempoZone(mood: string) {
  if (mood === "urgent" || mood === "positive" || mood === "transition") return "forward";
  if (mood === "sad" || mood === "concern" || mood === "emphasis" || mood === "ending") return "slow";
  return "steady";
}
'''
story_helpers = r'''

type StoryBeat =
  | "narrator"
  | "dialogue"
  | "suspense"
  | "action"
  | "tender"
  | "sorrow"
  | "wonder"
  | "humor"
  | "ending";

type StoryDirection = {
  beat: StoryBeat;
  ratePercent: number;
  pitchDelta: number;
  volumeDelta: number;
};

const STORY_SUSPENSE_CUES = [
  "кенет", "бір кезде", "сол сәтте", "дәл сол кезде", "қараса", "үнсіз", "сыбыр",
  "қараңғы", "қорқыныш", "аяқ дыбысы", "құпия", "忽然", "突然", "就在这时", "这时",
  "悄悄", "沉默", "黑暗", "脚步声", "秘密", "神秘",
];
const STORY_ACTION_CUES = [
  "жүгір", "айқай", "ұмтыл", "секір", "қаш", "қуып", "соққы", "тартыс", "күрес",
  "抓", "冲", "跑", "喊", "跳", "追", "打", "扑", "逃", "搏斗", "冲向",
];
const STORY_TENDER_CUES = [
  "жылы", "мейір", "күлім", "құшақ", "ақырын", "жай ғана", "еркелет", "жұмсақ",
  "温柔", "微笑", "拥抱", "轻声", "轻轻", "温暖", "柔和", "抚摸",
];
const STORY_WONDER_CUES = [
  "таңғ", "ғажап", "керемет", "сенбеді", "күтпеген", "惊讶", "惊奇", "奇怪",
  "没想到", "不可思议", "竟然", "原来",
];
const STORY_HUMOR_CUES = [
  "күліп", "күлді", "әзіл", "қалжың", "жымиды", "哈哈", "笑了", "大笑", "玩笑",
  "滑稽", "调皮", "忍不住笑",
];

function storyContainsCue(value: string, cues: string[]) {
  const normalized = value.toLowerCase();
  return cues.some((cue) => normalized.includes(cue));
}

function isStoryDialogue(value: string) {
  const trimmed = value.trim();
  return (
    /^[—–-]\s*\S/u.test(trimmed) ||
    /[«“][^»”]{1,220}[»”]/u.test(trimmed) ||
    /^"[^"\n]{1,220}"/u.test(trimmed)
  );
}

function storyDirectionForSentence(
  text: string,
  mood: string,
  role: string | null,
): StoryDirection {
  if (role === "ending" || mood === "ending") {
    return { beat: "ending", ratePercent: -1.7, pitchDelta: -0.06, volumeDelta: -0.03 };
  }
  if (mood === "sad" || (mood === "concern" && storyContainsCue(text, STORY_TENDER_CUES))) {
    return { beat: "sorrow", ratePercent: -2.0, pitchDelta: -0.08, volumeDelta: -0.08 };
  }
  if (storyContainsCue(text, STORY_SUSPENSE_CUES)) {
    return { beat: "suspense", ratePercent: -1.8, pitchDelta: -0.1, volumeDelta: -0.05 };
  }
  if (mood === "urgent" || storyContainsCue(text, STORY_ACTION_CUES)) {
    return { beat: "action", ratePercent: 1.7, pitchDelta: 0.1, volumeDelta: 0.08 };
  }
  if (storyContainsCue(text, STORY_TENDER_CUES)) {
    return { beat: "tender", ratePercent: -1.4, pitchDelta: 0.03, volumeDelta: -0.06 };
  }
  if (storyContainsCue(text, STORY_WONDER_CUES)) {
    return { beat: "wonder", ratePercent: -0.5, pitchDelta: 0.1, volumeDelta: 0.02 };
  }
  if (storyContainsCue(text, STORY_HUMOR_CUES)) {
    return { beat: "humor", ratePercent: 0.6, pitchDelta: 0.06, volumeDelta: 0.02 };
  }
  if (isStoryDialogue(text)) {
    if (/[?？]/u.test(text)) {
      return { beat: "dialogue", ratePercent: 0.2, pitchDelta: 0.12, volumeDelta: 0.02 };
    }
    if (/[!！]/u.test(text)) {
      return { beat: "dialogue", ratePercent: 0.8, pitchDelta: 0.08, volumeDelta: 0.06 };
    }
    return { beat: "dialogue", ratePercent: 0.1, pitchDelta: 0.04, volumeDelta: 0.01 };
  }
  if (mood === "positive") {
    return { beat: "tender", ratePercent: -0.3, pitchDelta: 0.04, volumeDelta: 0.01 };
  }
  return { beat: "narrator", ratePercent: -0.3, pitchDelta: 0, volumeDelta: 0 };
}
'''
assert story_helpers_anchor in route, 'emotionTempoZone anchor not found'
route = route.replace(story_helpers_anchor, story_helpers_anchor + story_helpers, 1)

old_group_zone = '''  const groups: DeliveryGroup[] = [];
  for (const sentence of sentences) {
    const zone = emotionTempoZone(sentence.mood);'''
new_group_zone = '''  const groups: DeliveryGroup[] = [];
  for (const sentence of sentences) {
    const storyDirection =
      preset === "story"
        ? storyDirectionForSentence(sentence.text, sentence.mood, sentence.role)
        : null;
    const zone = storyDirection ? `story:${storyDirection.beat}` : emotionTempoZone(sentence.mood);'''
assert old_group_zone in route, 'group zone anchor not found'
route = route.replace(old_group_zone, new_group_zone, 1)

old_weight_reduce = '''    const weighted = group.sentences.reduce(
      (acc, sentence) => {
        const weight = sentence.text.length / totalChars;
        acc.rate += (sentence.rateFactor - 1) * 100 * weight;
        acc.pitch += sentence.pitchDelta * weight;
        acc.volume += sentence.volumeDelta * weight;
        return acc;
      },
      { rate: 0, pitch: 0, volume: 0 },
    );'''
new_weight_reduce = '''    const weighted = group.sentences.reduce(
      (acc, sentence) => {
        const weight = sentence.text.length / totalChars;
        const storyDirection =
          preset === "story"
            ? storyDirectionForSentence(sentence.text, sentence.mood, sentence.role)
            : null;
        acc.rate +=
          ((sentence.rateFactor - 1) * 100 + (storyDirection?.ratePercent ?? 0)) * weight;
        acc.pitch +=
          (sentence.pitchDelta + (storyDirection?.pitchDelta ?? 0)) * weight;
        acc.volume +=
          (sentence.volumeDelta + (storyDirection?.volumeDelta ?? 0)) * weight;
        return acc;
      },
      { rate: 0, pitch: 0, volume: 0 },
    );'''
assert old_weight_reduce in route, 'weighted reducer anchor not found'
route = route.replace(old_weight_reduce, new_weight_reduce, 1)

route_path.write_text(route)
print('added Edge story preset with narrative/dialogue/suspense direction')
