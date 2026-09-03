from pathlib import Path

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
omni = omni_path.read_text()

old = '''    if (kind === "period") {
      return strength >= 0.5 ? phrase.punctuation : closingPunctuationSuffix(phrase.punctuation);
    }'''
new = '''    if (kind === "period") {
      // V13: do not delegate ordinary declarative sentence timing to the voice.
      // Keep quote/bracket suffixes, but realize the actual sentence breath in
      // semanticBreak so a completed thought gets air without a prosody restart.
      return closingPunctuationSuffix(phrase.punctuation);
    }'''
assert old in omni, 'story period punctuation anchor not found'
omni = omni.replace(old, new, 1)

old = '''  // Story V11: human breathing sits between the two previous extremes. Keep one
  // acoustic/prosody stream, but allow tiny breaths after completed semantic
  // units. These are intentionally much shorter than sentence pauses. Boundary
  // strength already includes Kazakh dependency protection, so modifier-head,
  // subject-predicate, number-unit and name-title zones remain unbroken.
  if (deliveryMode === "story") {
    if (punctuationRendered) return 0;
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
    const enoughSpeech = clean.length >= 28 || words >= 6;

    if (kind === "paragraph") {
      if (strength < 0.64) return 0;
      // Keep the same speaker/prosody state while allowing the listener to feel
      // that one completed narrative unit has ended before the next begins.
      // Ordinary paragraph: roughly 120-145 ms. Major semantic/emotional shift:
      // roughly 165-205 ms.
      return strength >= 0.84
        ? Math.round(108 + strength * 92)
        : Math.round(82 + strength * 72);
    }
    if (!enoughSpeech) return 0;
    if (kind === "newline" && strength >= 0.3) {
      return Math.round(12 + strength * 28);
    }
    if (kind === "period" && strength >= 0.3) {
      return Math.round(15 + strength * 34);
    }
    if (kind === "comma" && strength >= 0.26 && (clean.length >= 42 || words >= 8)) {
      return Math.round(8 + strength * 24);
    }
    if (["semicolon", "colon", "dash"].includes(kind) && strength >= 0.28) {
      return Math.round(11 + strength * 28);
    }
    return 0;
  }'''
new = '''  // Story V13: three breathing levels inside one continuous acoustic state:
  // clause breath < completed-sentence breath < paragraph/discourse breath.
  // Declarative periods use a controlled in-stream breath instead of native
  // punctuation timing, which makes the pause audible without re-starting pitch
  // and delivery on every sentence. Dependency guards already lower strength in
  // modifier-head, subject-predicate, number-unit and name-title no-pause zones.
  if (deliveryMode === "story") {
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
    const enoughSpeech = clean.length >= 28 || words >= 6;

    // Questions/exclamations/ellipsis keep their native sentence-mode contour.
    if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) return 0;

    if (kind === "paragraph") {
      if (strength < 0.64) return 0;
      // Ordinary paragraph: roughly 120-145 ms. Major semantic/emotional shift:
      // roughly 165-205 ms. Same voice/prosody state is preserved throughout.
      return strength >= 0.84
        ? Math.round(108 + strength * 92)
        : Math.round(82 + strength * 72);
    }

    if (kind === "period") {
      // Hard syntactic dependencies can push the boundary to 0.18 or below;
      // never breathe there even when the source writer inserted a period.
      if (strength <= 0.18) return 0;
      const lengthBonus = Math.min(18, Math.max(0, (words - 7) * 1.6));
      if (clean.length < 20 && words < 4) {
        return Math.round(28 + strength * 40);
      }
      // Very tightly connected sentences get a small catch of breath; ordinary
      // completed thoughts land around 60-90 ms, enough to sound human without
      // producing the old sentence-by-sentence take-reset effect.
      if (strength < 0.28) {
        return Math.round(28 + strength * 55 + lengthBonus * 0.45);
      }
      return Math.round(46 + strength * 62 + lengthBonus);
    }

    // If punctuation itself is audible, let the neural voice handle that local
    // timing rather than stacking an explicit pause on top of it.
    if (punctuationRendered) return 0;
    if (!enoughSpeech) return 0;
    if (kind === "newline" && strength >= 0.3) {
      return Math.round(12 + strength * 28);
    }
    if (kind === "comma" && strength >= 0.26 && (clean.length >= 42 || words >= 8)) {
      return Math.round(8 + strength * 24);
    }
    if (["semicolon", "colon", "dash"].includes(kind) && strength >= 0.28) {
      return Math.round(11 + strength * 28);
    }
    return 0;
  }'''
assert old in omni, 'story semanticBreak anchor not found'
omni = omni.replace(old, new, 1)
omni_path.write_text(omni)

page_path = Path('app/page.tsx')
page = page_path.read_text()
old = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 段落感知 · 自然呼吸", rateFactor: 1 },'
new = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 句间呼吸 · 段落感知", rateFactor: 1 },'
assert old in page, 'story preset note anchor not found'
page = page.replace(old, new, 1)
page_path.write_text(page)
