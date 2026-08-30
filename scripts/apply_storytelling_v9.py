from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

old_cues = '''const STORY_SUSPENSE_CUES = [
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
];'''

new_cues = '''const STORY_SUSPENSE_CUES = [
  "кенет", "бір кезде", "сол сәтте", "дәл сол кезде", "қараса", "үнсіз", "сыбыр",
  "қараңғы", "қорқыныш", "аяқ дыбысы", "құпия", "сезді", "тың тыңдап", "демін ішіне",
  "忽然", "突然", "就在这时", "这时", "悄悄", "沉默", "黑暗", "脚步声", "秘密", "神秘",
  "屏住呼吸", "没出声", "静静地",
];
const STORY_ACTION_CUES = [
  "жүгір", "айқай", "ұмтыл", "секір", "қаш", "қуып", "соққы", "тартыс", "күрес",
  "атып шық", "жалма-жан", "тұра ұмтыл", "抓", "冲", "跑", "喊", "跳", "追", "打",
  "扑", "逃", "搏斗", "冲向", "猛地", "飞快",
];
const STORY_TENDER_CUES = [
  "жылы", "мейір", "күлім", "құшақ", "ақырын", "жай ғана", "еркелет", "жұмсақ",
  "аялап", "маңдайынан", "温柔", "微笑", "拥抱", "轻声", "轻轻", "温暖", "柔和", "抚摸",
  "慢慢地", "柔声",
];
const STORY_WONDER_CUES = [
  "таңғ", "ғажап", "керемет", "сенбеді", "күтпеген", "сөйтсе", "расында",
  "惊讶", "惊奇", "奇怪", "没想到", "不可思议", "竟然", "原来", "没想到的是",
];
const STORY_HUMOR_CUES = [
  "күліп", "күлді", "әзіл", "қалжың", "жымиды", "қарқылдап", "哈哈", "笑了", "大笑", "玩笑",
  "滑稽", "调皮", "忍不住笑", "扑哧",
];
const STORY_SPEECH_CUES = [
  "деді", "деген еді", "деп сұрады", "сұрады", "жауап берді", "айқайлады", "сыбырлады",
  "деді де", "деп жауап", "说道", "问道", "回答", "喊道", "低声说", "轻声说", "大声说",
];'''
assert old_cues in route
route = route.replace(old_cues, new_cues, 1)

old_dialogue = '''function isStoryDialogue(value: string) {
  const trimmed = value.trim();
  return (
    /^[—–-]\\s*\\S/u.test(trimmed) ||
    /[«“][^»”]{1,220}[»”]/u.test(trimmed) ||
    /^\"[^\"\\n]{1,220}\"/u.test(trimmed)
  );
}'''
new_dialogue = '''function isStoryDialogue(value: string) {
  const trimmed = value.trim();
  return (
    /^[—–-]\\s*\\S/u.test(trimmed) ||
    /[«“][^»”]{1,260}[»”]/u.test(trimmed) ||
    /\"[^\"\\n]{1,260}\"/u.test(trimmed) ||
    storyContainsCue(trimmed, STORY_SPEECH_CUES)
  );
}'''
assert old_dialogue in route
route = route.replace(old_dialogue, new_dialogue, 1)

start = route.index('function storyDirectionForSentence(')
end = route.index('\nfunction renderEmotionDirectedBody(', start)
old_function = route[start:end]
new_function = r'''function storyDirectionForSentence(
  text: string,
  mood: string,
  role: string | null,
): StoryDirection {
  const dialogue = isStoryDialogue(text);
  const hasQuestion = /[?？]/u.test(text);
  const hasExclamation = /[!！]/u.test(text);
  const hasEllipsis = /…|\.\.\./u.test(text);

  // Story mode intentionally uses clearly audible ranges. The previous values
  // were mostly below 0.5%, then rounded to zero by signedPercent(). These
  // values remain gentle enough to preserve one speaker identity while making
  // the narrative beat perceptible.
  if (role === "ending" || mood === "ending") {
    return { beat: "ending", ratePercent: -5.5, pitchDelta: -1.3, volumeDelta: -1.0 };
  }
  if (mood === "sad" || (mood === "concern" && storyContainsCue(text, STORY_TENDER_CUES))) {
    return { beat: "sorrow", ratePercent: -7.0, pitchDelta: -1.6, volumeDelta: -1.5 };
  }
  if (storyContainsCue(text, STORY_SUSPENSE_CUES) || hasEllipsis) {
    return { beat: "suspense", ratePercent: -6.2, pitchDelta: -1.2, volumeDelta: -1.0 };
  }
  if (mood === "urgent" || storyContainsCue(text, STORY_ACTION_CUES)) {
    return { beat: "action", ratePercent: 6.2, pitchDelta: 1.3, volumeDelta: 1.4 };
  }
  if (storyContainsCue(text, STORY_TENDER_CUES)) {
    return { beat: "tender", ratePercent: -4.2, pitchDelta: 0.7, volumeDelta: -1.1 };
  }
  if (storyContainsCue(text, STORY_WONDER_CUES)) {
    return { beat: "wonder", ratePercent: -2.2, pitchDelta: 1.8, volumeDelta: 0.5 };
  }
  if (storyContainsCue(text, STORY_HUMOR_CUES)) {
    return { beat: "humor", ratePercent: 2.8, pitchDelta: 1.1, volumeDelta: 0.5 };
  }
  if (dialogue) {
    if (hasQuestion) {
      return { beat: "dialogue", ratePercent: -1.2, pitchDelta: 2.0, volumeDelta: 0.4 };
    }
    if (hasExclamation) {
      return { beat: "dialogue", ratePercent: 4.0, pitchDelta: 1.4, volumeDelta: 1.6 };
    }
    if (mood === "concern" || mood === "sad") {
      return { beat: "dialogue", ratePercent: -3.2, pitchDelta: -0.8, volumeDelta: -0.8 };
    }
    return { beat: "dialogue", ratePercent: 0.8, pitchDelta: 0.8, volumeDelta: 0.3 };
  }
  if (mood === "positive") {
    return { beat: "tender", ratePercent: -1.0, pitchDelta: 0.8, volumeDelta: 0.3 };
  }
  if (mood === "concern") {
    return { beat: "suspense", ratePercent: -3.2, pitchDelta: -0.7, volumeDelta: -0.5 };
  }
  if (mood === "emphasis") {
    return { beat: "wonder", ratePercent: -2.6, pitchDelta: 0.9, volumeDelta: 0.8 };
  }
  return { beat: "narrator", ratePercent: -1.0, pitchDelta: 0, volumeDelta: 0 };
}
'''
route = route[:start] + new_function + route[end:]

old_join = '''    const canJoin =
      previous &&
      previous.paragraphIndex === sentence.paragraphIndex &&
      previous.zone === zone &&
      previous.sentences.length < 3 &&
      previousChars + sentence.text.length <= 300;'''
new_join = '''    const storyGroupLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 3
          : 2
        : 3;
    const storyCharLimit = preset === "story" ? 230 : 300;
    const canJoin =
      previous &&
      previous.paragraphIndex === sentence.paragraphIndex &&
      previous.zone === zone &&
      previous.sentences.length < storyGroupLimit &&
      previousChars + sentence.text.length <= storyCharLimit;'''
assert old_join in route
route = route.replace(old_join, new_join, 1)

# Make story mode's strength clearly distinct, but avoid over-amplifying global news mood deltas.
route = route.replace('  story: 1.05,', '  story: 1.15,', 1)

route_path.write_text(route)

page_path = Path('app/page.tsx')
page = page_path.read_text()
page = page.replace(
    '{ id: "story", label: "故事版", note: "全文情绪分析 · 叙事 / 对白 / 悬念", rateFactor: 0.965 },',
    '{ id: "story", label: "故事版", note: "真人故事导演 · 对白 / 悬念 / 高潮", rateFactor: 0.965 },',
    1,
)
page_path.write_text(page)
print('upgraded story mode with audible narrative beats and richer dialogue detection')
