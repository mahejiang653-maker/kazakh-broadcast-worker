from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

# 1) Standalone Kazakh ordinal cues such as "Бірінші." / "Екінші."
anchor = '''function startsWithNewsItemCue(text: string) {\n  return Boolean(newsItemCueMatch(text));\n}\n'''
insert = '''function startsWithNewsItemCue(text: string) {\n  return Boolean(newsItemCueMatch(text));\n}\n\n// V32: standalone ordinal labels are spoken discourse markers. When a presenter\n// or narrator says \"Бірінші.\" / \"Екінші.\" / etc. as its own sentence, the\n// following content must not crowd the label. Keep the period for native Edge\n// sentence-final contour and add a deliberately larger semantic hand-off.\nconst STANDALONE_ORDINAL_PATTERN =\n  /^(?:бірінші|екінші|үшінші|төртінші|бесінші|алтыншы|жетінші|сегізінші|тоғызыншы|оныншы|он\\s+бірінші|он\\s+екінші|он\\s+үшінші|он\\s+төртінші|он\\s+бесінші|он\\s+алтыншы|он\\s+жетінші|он\\s+сегізінші|он\\s+тоғызыншы|жиырмасыншы)$/iu;\n\nfunction isStandaloneOrdinalCue(text: string) {\n  return STANDALONE_ORDINAL_PATTERN.test(normalize(text));\n}\n'''
assert anchor in text, 'news cue function anchor not found'
text = text.replace(anchor, insert, 1)

# 2) Move the stronger long-span slowdown threshold from 180 chars to 90 chars.
old_rate = '''  if (clean.length >= 260) rateFactor *= 0.974;\n  else if (clean.length >= 180) rateFactor *= 0.98;\n  else if (clean.length >= 105) rateFactor *= 0.986;\n  else if (clean.length <= 24 && digitCount === 0) rateFactor *= 1.012;'''
new_rate = '''  if (clean.length >= 260) rateFactor *= 0.974;\n  // V32: begin the stronger long-span easing at about 90 characters instead of\n  // waiting until 180. This matters most for poorly punctuated Kazakh passages.\n  else if (clean.length >= 90) rateFactor *= 0.98;\n  else if (clean.length <= 24 && digitCount === 0) rateFactor *= 1.012;'''
assert old_rate in text, 'V31 long-rate block not found'
text = text.replace(old_rate, new_rate, 1)

# 3) Give standalone ordinal sentences a larger, dynamic post-label hand-off.
sem_anchor = '''  // V30: a terminal mark followed by a line break keeps its punctuation for\n  // intonation, but the larger structural boundary decides the breathing tier.\n  const kind = phrase.layoutBoundary ?? phrase.punctuationKind;\n\n  // Story V28: natural word timing + layered breathing inside one continuous'''
sem_insert = '''  // V30: a terminal mark followed by a line break keeps its punctuation for\n  // intonation, but the larger structural boundary decides the breathing tier.\n  const kind = phrase.layoutBoundary ?? phrase.punctuationKind;\n\n  // V32: \"Бірінші.\", \"Екінші.\" and similar standalone ordinal labels need a\n  // clear rhetorical hand-off. This is longer than an ordinary sentence but is\n  // still context-sensitive rather than one fixed pause. If a source line break\n  // is also present, this value naturally sits in the paragraph-transition band.\n  if (\n    phrase.punctuationKind === \"period\" &&\n    isStandaloneOrdinalCue(phrase.text) &&\n    (deliveryMode === \"story\" || deliveryMode === \"broadcast\")\n  ) {\n    const modeBias =\n      deliveryMode === \"story\" ? 14 :\n      broadcastPreset === \"calm\" ? 18 :\n      broadcastPreset === \"bulletin\" ? -8 :\n      broadcastPreset === \"expressive\" ? 10 : 0;\n    return Math.round(clamp(258 + strength * 82 + modeBias, 270, 360));\n  }\n\n  // Story V28: natural word timing + layered breathing inside one continuous'''
assert sem_anchor in text, 'semanticBreak kind anchor not found'
text = text.replace(sem_anchor, sem_insert, 1)

# 4) Replace V31 punctuation-free fallback with a more proactive multi-breath planner.
start = text.index('function renderPunctuationFreeFallback(')
end = text.index('\nfunction naturalTextMarkup(', start)
new_helper = r'''function renderPunctuationFreeFallback(
  text: string,
  renderNaturalText: EdgeMarkupRenderer,
  deliveryMode: "story" | "broadcast",
) {
  const matches = Array.from(text.matchAll(/\S+/gu));
  // V32: a 14+ word unpunctuated span is already long enough to require a breath
  // check. The old 18-word gate left many medium-long sentences completely flat.
  if (matches.length < 14) return renderNaturalText(text);

  const words = matches.map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const averageWordLength =
    words.reduce((sum, word) => sum + word.text.length, 0) / Math.max(1, words.length);
  const densityAdjustment = averageWordLength >= 8 ? -2 : averageWordLength <= 5.5 ? 1 : 0;
  const baseTarget = (deliveryMode === "story" ? 15 : 14) + densityAdjustment;
  // Let the amount of breathing scale with actual length. This can yield 1, 2,
  // 3... breaths as needed, capped conservatively so it never becomes word-by-word.
  const idealSpan = Math.max(11, baseTarget + 1);
  const maxBreaths = Math.round(clamp(Math.ceil(words.length / idealSpan) - 1, 1, 6));

  let output = "";
  let charCursor = 0;
  let wordCursor = 0;
  let inserted = 0;

  while (inserted < maxBreaths) {
    const remainingWords = words.length - wordCursor;
    if (remainingWords < 16) break;

    // Re-estimate each breath from the remaining passage. Dense/long-word text
    // breathes earlier; a short tail pushes the candidate slightly forward/back.
    const remainingBreaths = Math.max(1, maxBreaths - inserted);
    const evenShare = Math.round(remainingWords / (remainingBreaths + 1));
    const tailAdjustment = remainingWords >= 42 ? 1 : remainingWords <= 23 ? -1 : 0;
    const targetWords = Math.round(clamp(
      (baseTarget * 0.58 + evenShare * 0.42) + tailAdjustment,
      10,
      19,
    ));
    const minWords = Math.max(9, targetWords - 4);
    const maxWords = targetWords + 5;
    const minTailWords = 7;
    const firstCandidate = wordCursor + minWords - 1;
    const lastCandidate = Math.min(
      wordCursor + maxWords - 1,
      words.length - minTailWords - 1,
    );
    if (firstCandidate > lastCandidate) break;

    let best: { index: number; score: number; dependency: number } | null = null;

    const chooseCandidate = (dependencyLimit: number) => {
      for (let index = firstCandidate; index <= lastCandidate; index += 1) {
        const leftWindow = words
          .slice(Math.max(wordCursor, index - 6), index + 1)
          .map((word) => word.text)
          .join(" ");
        const rightWindow = words
          .slice(index + 1, Math.min(words.length, index + 8))
          .map((word) => word.text)
          .join(" ");
        if (!leftWindow || !rightWindow) continue;

        const dependency = kazakhDependencyGuard(leftWindow, rightWindow);
        if (dependency.score >= dependencyLimit) continue;

        const chunkWords = index - wordCursor + 1;
        const semanticBonus = startsWithCue(rightWindow, STRONG_BOUNDARY_STARTERS)
          ? -1.6
          : startsWithCue(rightWindow, CONTINUATION_STARTERS)
            ? -0.55
            : 0;
        const balancePenalty = Math.abs((words.length - index - 1) - minTailWords) < 2 ? 0.5 : 0;
        const score =
          Math.abs(chunkWords - targetWords) +
          dependency.score * 4.4 +
          balancePenalty +
          semanticBonus;
        if (!best || score < best.score) {
          best = { index, score, dependency: dependency.score };
        }
      }
    };

    // Prefer strongly dependency-safe boundaries. If the writer supplied no
    // punctuation and no very safe option exists, widen gradually rather than
    // allowing the whole span to be spoken in one breath.
    chooseCandidate(0.55);
    if (!best) chooseCandidate(0.72);
    if (!best) chooseCandidate(0.82);
    if (!best) break;

    const boundary = words[best.index].end;
    const chunkWords = best.index - wordCursor + 1;
    const chunkLoad = clamp((chunkWords - 9) / 11, 0, 1);
    const lexicalLoad = clamp((averageWordLength - 5.2) / 4.3, 0, 1);
    const dependencyRelease = clamp(1 - best.dependency, 0, 1);
    const breath = deliveryMode === "story"
      ? Math.round(clamp(48 + chunkLoad * 9 + lexicalLoad * 8 + dependencyRelease * 5, 50, 72))
      : Math.round(clamp(44 + chunkLoad * 9 + lexicalLoad * 7 + dependencyRelease * 5, 46, 66));

    output += renderNaturalText(text.slice(charCursor, boundary));
    output += `<break time="${breath}ms"/>`;
    charCursor = boundary;
    wordCursor = best.index + 1;
    inserted += 1;
  }

  if (!inserted) return renderNaturalText(text);
  output += renderNaturalText(text.slice(charCursor));
  return output;
}
'''
text = text[:start] + new_helper + text[end:]

# 5) If a strong semantic connector was found, still run fallback inside the long
# prefix before that connector instead of emitting the entire prefix raw.
old_story_emit = '''      output += renderNaturalText(text.slice(cursor, boundary));\n      output += `<break time="${Math.round(clamp(45 + Math.max(0, clean.length - 112) * 0.08, 45, 60))}ms"/>`;'''
new_story_emit = '''      const prefix = text.slice(cursor, boundary);\n      output += renderPunctuationFreeFallback(prefix, renderNaturalText, "story");\n      output += `<break time="${Math.round(clamp(45 + Math.max(0, clean.length - 112) * 0.08, 45, 60))}ms"/>`;'''
assert old_story_emit in text, 'story semantic connector emit anchor not found'
text = text.replace(old_story_emit, new_story_emit, 1)

old_broadcast_emit = '''    output += renderNaturalText(text.slice(cursor, boundary));\n    // V29: long punctuation-free presenter spans breathe only at dependency-safe'''
new_broadcast_emit = '''    const prefix = text.slice(cursor, boundary);\n    output += deliveryMode === "broadcast"\n      ? renderPunctuationFreeFallback(prefix, renderNaturalText, "broadcast")\n      : renderNaturalText(prefix);\n    // V29: long punctuation-free presenter spans breathe only at dependency-safe'''
assert old_broadcast_emit in text, 'broadcast semantic connector emit anchor not found'
text = text.replace(old_broadcast_emit, new_broadcast_emit, 1)

path.write_text(text)
