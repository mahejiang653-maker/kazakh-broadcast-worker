from pathlib import Path

# Frontend label
page_path = Path('app/page.tsx')
page = page_path.read_text()
page = page.replace(
    '{ id: "story", label: "故事版", note: "长语流 · 段落级自然过渡", rateFactor: 0.99 },',
    '{ id: "story", label: "故事版", note: "真人叙事 · 情绪对白 · 短逗号停顿", rateFactor: 0.99 },',
    1,
)
page_path.write_text(page)

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

# Add richer story-only cues.
anchor = '''const STORY_HUMOR_CUES = [
  "күліп", "күлді", "әзіл", "қалжың", "жымиды", "қарқылдап", "哈哈", "笑了", "大笑", "玩笑",
  "滑稽", "调皮", "忍不住笑", "扑哧",
];
'''
addition = '''const STORY_SORROW_CUES = [
  "жыла", "көз жас", "мұң", "қайғы", "ренжі", "жалғыз", "қимай", "өкініш",
  "哭", "流泪", "眼泪", "伤心", "悲伤", "难过", "孤独", "舍不得", "遗憾",
];
const STORY_FEAR_CUES = [
  "қорық", "үрей", "діріл", "қобалж", "шошып", "зәресі", "сескен",
  "害怕", "恐惧", "发抖", "颤抖", "紧张", "惊恐", "吓", "心跳",
];
const STORY_ANGER_CUES = [
  "ашулан", "ызал", "қаһар", "айғай", "долдан", "怒", "愤怒", "生气", "怒吼", "大怒", "发火",
];
'''
assert anchor in route, 'story humor cue anchor missing'
route = route.replace(anchor, anchor + addition, 1)

# Make story sentence classification richer.
old = '''  if (mood === "sad" || (mood === "concern" && storyContainsCue(text, STORY_TENDER_CUES))) {
    return { beat: "sorrow", ratePercent: -4.5, pitchDelta: -0.9, volumeDelta: -0.9 };
  }
  if (storyContainsCue(text, STORY_SUSPENSE_CUES) || hasEllipsis) {
    return { beat: "suspense", ratePercent: -4.0, pitchDelta: -0.7, volumeDelta: -0.6 };
  }
  if (mood === "urgent" || storyContainsCue(text, STORY_ACTION_CUES)) {
    return { beat: "action", ratePercent: 3.8, pitchDelta: 0.8, volumeDelta: 0.9 };
  }
'''
new = '''  if (
    mood === "sad" ||
    storyContainsCue(text, STORY_SORROW_CUES) ||
    (mood === "concern" && storyContainsCue(text, STORY_TENDER_CUES))
  ) {
    return { beat: "sorrow", ratePercent: -5.2, pitchDelta: -1.0, volumeDelta: -1.0 };
  }
  if (
    storyContainsCue(text, STORY_SUSPENSE_CUES) ||
    storyContainsCue(text, STORY_FEAR_CUES) ||
    hasEllipsis
  ) {
    return { beat: "suspense", ratePercent: -4.6, pitchDelta: -0.8, volumeDelta: -0.7 };
  }
  if (
    mood === "urgent" ||
    storyContainsCue(text, STORY_ACTION_CUES) ||
    storyContainsCue(text, STORY_ANGER_CUES)
  ) {
    return { beat: "action", ratePercent: 4.4, pitchDelta: 0.9, volumeDelta: 1.0 };
  }
'''
assert old in route, 'story direction block missing'
route = route.replace(old, new, 1)

# Replace the overly-flat paragraph renderer with continuous narration plus
# sparse local acting, and explicitly shorten comma pauses.
start = route.index('function renderContinuousStoryBody(')
end = route.index('\nfunction renderEmotionDirectedBody(', start)
replacement = r'''function renderStoryTextSegment(value: string, useMultilingual: boolean) {
  if (!value) return "";
  if (!useMultilingual) return escapeXml(value);
  return splitEdgeLanguageRuns(value)
    .map(
      (run) =>
        `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
    )
    .join("");
}

/**
 * Story punctuation policy: commas are a short breath, never a sentence stop.
 * Sentence-final punctuation is left untouched so the neural voice can still
 * create a complete cadence. Decimal commas/colons stay inside numbers.
 */
function renderStoryPunctuationAwareContent(value: string, useMultilingual: boolean) {
  let output = "";
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    output += renderStoryTextSegment(buffer, useMultilingual);
    buffer = "";
  };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1] ?? "";
    const next = value[index + 1] ?? "";
    const numericBoundary = /\d/u.test(previous) && /\d/u.test(next);

    if ((char === "," || char === "，") && !numericBoundary) {
      flush();
      // A real comma breath: deliberately much shorter than a full stop.
      output += '<break time="65ms"/>';
      continue;
    }
    if ((char === ";" || char === "；") && !numericBoundary) {
      flush();
      output += '<break time="125ms"/>';
      continue;
    }
    if ((char === ":" || char === "：") && !numericBoundary) {
      flush();
      output += '<break time="95ms"/>';
      continue;
    }

    buffer += char;
  }

  flush();
  return output;
}

function renderContinuousStoryBody(
  sentences: EdgeEmotionPlan["sentences"],
  baseSpeed: number,
  basePitch: number,
  baseVolume: number,
  useMultilingual: boolean,
) {
  // Story V5: one continuous narrator, with sparse local acting only when the
  // story actually changes emotional state. This preserves identity and flow
  // while restoring emotion that V4 flattened too aggressively.
  const paragraphs = new Map<number, typeof sentences>();
  for (const sentence of sentences) {
    const bucket = paragraphs.get(sentence.paragraphIndex) ?? [];
    bucket.push(sentence);
    paragraphs.set(sentence.paragraphIndex, bucket);
  }

  let body = "";

  for (const [, paragraphSentences] of paragraphs) {
    type StoryGroup = {
      beat: StoryBeat;
      items: typeof paragraphSentences;
    };

    const groups: StoryGroup[] = [];
    for (const sentence of paragraphSentences) {
      const direction = storyDirectionForSentence(sentence.text, sentence.mood, sentence.role);
      const previous = groups[groups.length - 1];
      const maxItems = direction.beat === "narrator" ? 8 : direction.beat === "dialogue" ? 2 : 3;
      const previousChars = previous
        ? previous.items.reduce((sum, item) => sum + item.text.length, 0)
        : 0;
      const maxChars = direction.beat === "narrator" ? 760 : 360;
      const canJoin =
        previous &&
        previous.beat === direction.beat &&
        previous.items.length < maxItems &&
        previousChars + sentence.text.length <= maxChars;

      if (canJoin) previous.items.push(sentence);
      else groups.push({ beat: direction.beat, items: [sentence] });
    }

    let paragraphBody = "";
    for (const group of groups) {
      const totalChars = Math.max(
        1,
        group.items.reduce((sum, sentence) => sum + sentence.text.length, 0),
      );
      const direction = group.items.reduce(
        (acc, sentence) => {
          const local = storyDirectionForSentence(sentence.text, sentence.mood, sentence.role);
          const weight = sentence.text.length / totalChars;
          acc.rate += local.ratePercent * weight;
          acc.pitch += local.pitchDelta * weight;
          acc.volume += local.volumeDelta * weight;
          return acc;
        },
        { rate: 0, pitch: 0, volume: 0 },
      );

      const rawText = group.items.map((sentence) => sentence.text).join(" ");
      const content = renderStoryPunctuationAwareContent(rawText, useMultilingual);

      if (group.beat === "narrator") {
        paragraphBody += `${content} `;
        continue;
      }

      // Emotion is visible but bounded. We never turn the narrator into a
      // different person, and only genuine story beats receive a local span.
      const strength = group.beat === "dialogue" ? 0.62 : group.beat === "ending" ? 0.72 : 0.7;
      const rate = clamp(direction.rate * strength, -3.8, 3.4);
      const pitch = clamp(direction.pitch * strength, -0.75, 0.75);
      const volume = clamp(direction.volume * strength, -0.7, 0.7);

      paragraphBody += `<prosody rate="${signedPercent(rate)}" pitch="${signedPercent(pitch)}" volume="${signedPercent(volume)}">${content}</prosody> `;
    }

    body += `<p>${paragraphBody.trim()}</p>`;
  }

  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${body}</prosody>`;
}
'''
route = route[:start] + replacement + route[end:]
route_path.write_text(route)
print('applied Story V5: short comma pauses and sparse emotional acting')
