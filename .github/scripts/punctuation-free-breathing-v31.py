from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old_rate = '''  if (clean.length >= 105) rateFactor *= 0.986;\n  else if (clean.length <= 24 && digitCount === 0) rateFactor *= 1.012;'''
new_rate = '''  // V31: very long punctuation-free phrases carry a much higher information\n  // load than ordinary clauses. Ease the local rate slightly before adding any\n  // breathing so the voice does not race simply because the writer omitted marks.\n  if (clean.length >= 260) rateFactor *= 0.974;\n  else if (clean.length >= 180) rateFactor *= 0.98;\n  else if (clean.length >= 105) rateFactor *= 0.986;\n  else if (clean.length <= 24 && digitCount === 0) rateFactor *= 1.012;'''
assert old_rate in text, 'localMicro long-rate anchor not found'
text = text.replace(old_rate, new_rate, 1)

marker = 'function naturalTextMarkup(\n'
assert marker in text, 'naturalTextMarkup marker not found'
helper = r'''function renderPunctuationFreeFallback(
  text: string,
  renderNaturalText: EdgeMarkupRenderer,
  deliveryMode: "story" | "broadcast",
) {
  const matches = Array.from(text.matchAll(/\S+/gu));
  if (matches.length < 18) return renderNaturalText(text);

  const words = matches.map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const averageWordLength =
    words.reduce((sum, word) => sum + word.text.length, 0) / Math.max(1, words.length);
  const densityAdjustment = averageWordLength >= 8 ? -2 : averageWordLength <= 5.5 ? 1 : 0;
  const baseTarget = (deliveryMode === "story" ? 17 : 16) + densityAdjustment;
  const maxBreaths =
    words.length >= 72 ? 4 :
    words.length >= 50 ? 3 :
    words.length >= 32 ? 2 : 1;

  let output = "";
  let charCursor = 0;
  let wordCursor = 0;
  let inserted = 0;

  while (inserted < maxBreaths) {
    const remainingWords = words.length - wordCursor;
    if (remainingWords < 22) break;

    // Rebalance the target as the tail gets shorter so pauses do not fall at
    // mechanically equal intervals. Dense/long-word passages breathe a little
    // earlier; lighter passages can carry a few more words naturally.
    const tailAdjustment = remainingWords >= 45 ? 1 : remainingWords <= 27 ? -1 : 0;
    const targetWords = Math.max(12, baseTarget + tailAdjustment);
    const minWords = Math.max(11, targetWords - 4);
    const maxWords = targetWords + 5;
    const minTailWords = 9;
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
          .slice(Math.max(wordCursor, index - 5), index + 1)
          .map((word) => word.text)
          .join(" ");
        const rightWindow = words
          .slice(index + 1, Math.min(words.length, index + 7))
          .map((word) => word.text)
          .join(" ");
        if (!leftWindow || !rightWindow) continue;

        const dependency = kazakhDependencyGuard(leftWindow, rightWindow);
        if (dependency.score >= dependencyLimit) continue;

        const chunkWords = index - wordCursor + 1;
        const semanticBonus = startsWithCue(rightWindow, STRONG_BOUNDARY_STARTERS)
          ? -1.4
          : startsWithCue(rightWindow, CONTINUATION_STARTERS)
            ? -0.45
            : 0;
        const score =
          Math.abs(chunkWords - targetWords) +
          dependency.score * 4 +
          semanticBonus;
        if (!best || score < best.score) {
          best = { index, score, dependency: dependency.score };
        }
      }
    };

    // Prefer very safe dependency boundaries. If a poorly punctuated long span
    // has none, allow a still-conservative second pass rather than reading the
    // entire paragraph in one breath.
    chooseCandidate(0.55);
    if (!best) chooseCandidate(0.72);
    if (!best) break;

    const boundary = words[best.index].end;
    const chunkWords = best.index - wordCursor + 1;
    const chunkLoad = clamp((chunkWords - 11) / 11, 0, 1);
    const lexicalLoad = clamp((averageWordLength - 5.5) / 4, 0, 1);
    const dependencyRelease = clamp(1 - best.dependency, 0, 1);
    const breath = deliveryMode === "story"
      ? Math.round(clamp(46 + chunkLoad * 8 + lexicalLoad * 7 + dependencyRelease * 4, 48, 68))
      : Math.round(clamp(42 + chunkLoad * 8 + lexicalLoad * 6 + dependencyRelease * 4, 44, 62));

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
text = text.replace(marker, helper + marker, 1)

old_story_end = '''    if (!inserted) return renderNaturalText(text);\n    output += renderNaturalText(text.slice(cursor));\n    return output;\n  }'''
new_story_end = '''    if (!inserted) {\n      return renderPunctuationFreeFallback(text, renderNaturalText, "story");\n    }\n    const tail = text.slice(cursor);\n    output += renderPunctuationFreeFallback(tail, renderNaturalText, "story");\n    return output;\n  }'''
assert old_story_end in text, 'story connector fallback anchor not found'
text = text.replace(old_story_end, new_story_end, 1)

old_broadcast_end = '''  if (!inserted) return renderNaturalText(text);\n  output += renderNaturalText(text.slice(cursor));\n  return output;\n}\n\nfunction microDistance'''
new_broadcast_end = '''  if (!inserted) {\n    return deliveryMode === "broadcast"\n      ? renderPunctuationFreeFallback(text, renderNaturalText, "broadcast")\n      : renderNaturalText(text);\n  }\n  const tail = text.slice(cursor);\n  output += deliveryMode === "broadcast"\n    ? renderPunctuationFreeFallback(tail, renderNaturalText, "broadcast")\n    : renderNaturalText(tail);\n  return output;\n}\n\nfunction microDistance'''
assert old_broadcast_end in text, 'broadcast connector fallback anchor not found'
text = text.replace(old_broadcast_end, new_broadcast_end, 1)

path.write_text(text)
