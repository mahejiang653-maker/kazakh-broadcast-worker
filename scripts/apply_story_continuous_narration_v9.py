from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

# 1) Story narration should not be globally over-slowed or over-directed.
route = route.replace(
    '  story: { rateFactor: 0.965, pitch: 0.1, volume: -0.05 },',
    '  story: { rateFactor: 0.985, pitch: 0.05, volume: -0.03 },',
    1,
)
route = route.replace('  story: 1.15,', '  story: 1,', 1)

# 2) A speech-reporting verb does not make the whole sentence dialogue.
# Keep only explicit quotation / dash dialogue detection.
speech_start = route.find('const STORY_SPEECH_CUES = [')
if speech_start != -1:
    speech_end_marker = '];\n\nfunction storyContainsCue'
    speech_end = route.find(speech_end_marker, speech_start)
    assert speech_end != -1, 'STORY_SPEECH_CUES end not found'
    route = route[:speech_start] + 'function storyContainsCue' + route[speech_end + len(speech_end_marker):]

is_dialogue_start = route.index('function isStoryDialogue(value: string) {')
is_dialogue_end = route.index('\nfunction storyDirectionForSentence(', is_dialogue_start)
route = route[:is_dialogue_start] + '''function isStoryDialogue(value: string) {
  const trimmed = value.trim();
  return (
    /^[—–-]\\s*\\S/u.test(trimmed) ||
    /[«“][^»”]{1,320}[»”]/u.test(trimmed) ||
    /"[^"\\n]{1,320}"/u.test(trimmed)
  );
}
''' + route[is_dialogue_end:]

# 3) Replace the old heavily parameterized story direction with sparse,
# narration-first direction. Narration itself stays native; only real dramatic
# beats get local changes.
story_dir_start = route.index('function storyDirectionForSentence(')
story_dir_end = route.index('\nfunction renderEmotionDirectedBody(', story_dir_start)
new_story_dir = r'''function storyDirectionForSentence(
  text: string,
  mood: string,
  role: string | null,
): StoryDirection {
  const dialogue = isStoryDialogue(text);
  const hasQuestion = /[?？]/u.test(text);
  const hasExclamation = /[!！]/u.test(text);
  const hasEllipsis = /…|\.\.\./u.test(text);

  // Story V3: narration is the anchor. We deliberately do NOT continuously
  // modulate ordinary narration. Local prosody is reserved for real story beats,
  // which avoids the "one sentence = one synthetic state" effect.
  if (role === "ending" || mood === "ending") {
    return { beat: "ending", ratePercent: -3.5, pitchDelta: -0.8, volumeDelta: -0.6 };
  }
  if (mood === "sad" || (mood === "concern" && storyContainsCue(text, STORY_TENDER_CUES))) {
    return { beat: "sorrow", ratePercent: -4.5, pitchDelta: -0.9, volumeDelta: -0.9 };
  }
  if (storyContainsCue(text, STORY_SUSPENSE_CUES) || hasEllipsis) {
    return { beat: "suspense", ratePercent: -4.0, pitchDelta: -0.7, volumeDelta: -0.6 };
  }
  if (mood === "urgent" || storyContainsCue(text, STORY_ACTION_CUES)) {
    return { beat: "action", ratePercent: 3.8, pitchDelta: 0.8, volumeDelta: 0.9 };
  }
  if (storyContainsCue(text, STORY_TENDER_CUES)) {
    return { beat: "tender", ratePercent: -2.8, pitchDelta: 0.6, volumeDelta: -0.7 };
  }
  if (storyContainsCue(text, STORY_WONDER_CUES)) {
    return { beat: "wonder", ratePercent: -1.5, pitchDelta: 0.8, volumeDelta: 0.2 };
  }
  if (storyContainsCue(text, STORY_HUMOR_CUES)) {
    return { beat: "humor", ratePercent: 1.8, pitchDelta: 0.7, volumeDelta: 0.2 };
  }

  if (dialogue) {
    // Let punctuation do most of the acting. Neutral dialogue receives no
    // synthetic pitch lift; questions/exclamations only get a small assist.
    if (hasQuestion) {
      return { beat: "dialogue", ratePercent: -1.0, pitchDelta: 0.8, volumeDelta: 0.1 };
    }
    if (hasExclamation) {
      return { beat: "dialogue", ratePercent: 2.2, pitchDelta: 0.8, volumeDelta: 0.9 };
    }
    if (mood === "concern" || mood === "sad") {
      return { beat: "dialogue", ratePercent: -2.2, pitchDelta: -0.6, volumeDelta: -0.6 };
    }
    return { beat: "dialogue", ratePercent: 0, pitchDelta: 0, volumeDelta: 0 };
  }

  if (mood === "positive") {
    return { beat: "tender", ratePercent: -0.8, pitchDelta: 0.5, volumeDelta: 0.1 };
  }
  if (mood === "concern") {
    return { beat: "suspense", ratePercent: -2.2, pitchDelta: -0.6, volumeDelta: -0.4 };
  }
  if (mood === "emphasis") {
    return { beat: "wonder", ratePercent: -1.2, pitchDelta: 0.5, volumeDelta: 0.4 };
  }

  // Ordinary narration stays completely native inside one long outer prosody.
  return { beat: "narrator", ratePercent: 0, pitchDelta: 0, volumeDelta: 0 };
}
'''
route = route[:story_dir_start] + new_story_dir + route[story_dir_end:]

# 4) Let ordinary narration form much longer continuous groups. Dialogue remains
# sentence-local so punctuation and quote boundaries are preserved.
old_limits = '''    const storyGroupLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 3
          : 2
        : 3;
    const storyCharLimit = preset === "story" ? 230 : 300;'''
new_limits = '''    const storyGroupLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 6
          : storyDirection?.beat === "dialogue"
            ? 1
            : 2
        : 3;
    const storyCharLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 520
          : 260
        : 300;'''
assert old_limits in route, 'story grouping block not found'
route = route.replace(old_limits, new_limits, 1)

# 5) Story mode must not stack the news emotion director underneath the story
# director. Use news emotion values only to classify beats; do not add their
# rate/pitch/volume to story rendering.
old_acc = '''        acc.rate +=
          ((sentence.rateFactor - 1) * 100 + (storyDirection?.ratePercent ?? 0)) * weight;
        acc.pitch +=
          (sentence.pitchDelta + (storyDirection?.pitchDelta ?? 0)) * weight;
        acc.volume +=
          (sentence.volumeDelta + (storyDirection?.volumeDelta ?? 0)) * weight;'''
new_acc = '''        if (preset === "story") {
          acc.rate += (storyDirection?.ratePercent ?? 0) * weight;
          acc.pitch += (storyDirection?.pitchDelta ?? 0) * weight;
          acc.volume += (storyDirection?.volumeDelta ?? 0) * weight;
        } else {
          acc.rate += (sentence.rateFactor - 1) * 100 * weight;
          acc.pitch += sentence.pitchDelta * weight;
          acc.volume += sentence.volumeDelta * weight;
        }'''
assert old_acc in route, 'story/news stacked prosody block not found'
route = route.replace(old_acc, new_acc, 1)

route_path.write_text(route)

# Keep UI expectation aligned with the new, more continuous narration profile.
page_path = Path('app/page.tsx')
page = page_path.read_text()
page = page.replace(
    '{ id: "story", label: "故事版", note: "真人故事导演 · 对白 / 悬念 / 高潮", rateFactor: 0.965 },',
    '{ id: "story", label: "故事版", note: "连续叙事 · 自然对白 / 悬念 / 高潮", rateFactor: 0.985 },',
    1,
)
page_path.write_text(page)

print('applied story V3 continuous narration and restrained dialogue')
