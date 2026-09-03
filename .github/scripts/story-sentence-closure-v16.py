from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old = '''function bidirectionalSmooth(phrases: Phrase[]) {
  return phrases.map((phrase, index) => {
    const previous = phrases[index - 1];
    const next = phrases[index + 1];
    const hardBefore = previous && ["paragraph", "newline"].includes(previous.punctuationKind);
    const hardAfter = ["paragraph", "newline"].includes(phrase.punctuationKind);'''
new = '''function bidirectionalSmooth(
  phrases: Phrase[],
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  return phrases.map((phrase, index) => {
    const previous = phrases[index - 1];
    const next = phrases[index + 1];
    const storySentenceTerminals = new Set<PunctuationKind>([
      "period",
      "question",
      "exclamation",
      "mixed",
      "ellipsis",
    ]);
    const hardBefore = Boolean(
      previous &&
      (["paragraph", "newline"].includes(previous.punctuationKind) ||
        (deliveryMode === "story" && storySentenceTerminals.has(previous.punctuationKind))),
    );
    const hardAfter =
      ["paragraph", "newline"].includes(phrase.punctuationKind) ||
      (deliveryMode === "story" && storySentenceTerminals.has(phrase.punctuationKind));'''
assert old in text, 'bidirectionalSmooth anchor not found'
text = text.replace(old, new, 1)

old = '''    if (kind === "period") {
      // V13: do not delegate ordinary declarative sentence timing to the voice.
      // Keep quote/bracket suffixes, but realize the actual sentence breath in
      // semanticBreak so a completed thought gets air without a prosody restart.
      return closingPunctuationSuffix(phrase.punctuation);
    }'''
new = '''    if (kind === "period") {
      // V16: restore the real period so the neural voice receives an explicit
      // sentence-final intonation cue. The controlled post-sentence breath remains
      // in semanticBreak, so the sentence can settle before the next one starts.
      return phrase.punctuation;
    }'''
assert old in text, 'story period punctuation anchor not found'
text = text.replace(old, new, 1)

old = '''    // Questions/exclamations/ellipsis keep their native sentence-mode contour.
    if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) return 0;

    if (kind === "paragraph") {'''
new = '''    // V16: sentence-mode punctuation keeps its native contour, but it also gets
    // a short post-sentence breath. Previously these returned zero here, which
    // allowed a question/exclamation to rush straight into the next sentence.
    if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) {
      const expressiveBreath =
        kind === "ellipsis"
          ? 92 + strength * 38
          : 78 + strength * 48;
      return Math.round(clamp(expressiveBreath, 80, 130));
    }

    if (kind === "paragraph") {'''
assert old in text, 'story expressive sentence breath anchor not found'
text = text.replace(old, new, 1)

old = '''        applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),'''
new = '''        applyLogicalFocusContrast(
          bidirectionalSmooth(
            annotateQuoteContinuity(buildPhrases(text, plan)),
            settings.deliveryMode,
          ),
        ),'''
assert old in text, 'bidirectionalSmooth call anchor not found'
text = text.replace(old, new, 1)

path.write_text(text)
