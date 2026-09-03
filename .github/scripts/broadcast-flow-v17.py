from pathlib import Path

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
omni = omni_path.read_text()

old = '''export type EdgeOmniSettings = {
  speed: number;
  pitch: number;
  volume: number;
  deliveryMode?: "neutral" | "broadcast" | "story";
};'''
new = '''export type EdgeOmniSettings = {
  speed: number;
  pitch: number;
  volume: number;
  deliveryMode?: "neutral" | "broadcast" | "story";
  // V17: keep the same fluent sentence-closure mechanism across all four news
  // presets while preserving each presenter's own pause density.
  broadcastPreset?: "news" | "calm" | "bulletin" | "expressive";
};'''
assert old in omni, 'EdgeOmniSettings anchor not found'
omni = omni.replace(old, new, 1)

old = '''    const storySentenceTerminals = new Set<PunctuationKind>([
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
new = '''    const sentenceTerminals = new Set<PunctuationKind>([
      "period",
      "question",
      "exclamation",
      "mixed",
      "ellipsis",
    ]);
    // V17: broadcast adopts V16's sentence-isolation principle too. We still keep
    // long prosody groups, but pitch/rate smoothing must not leak through a true
    // sentence ending and make the previous sentence lean into the next one.
    const isolateSentenceClosure = deliveryMode === "story" || deliveryMode === "broadcast";
    const hardBefore = Boolean(
      previous &&
      (["paragraph", "newline"].includes(previous.punctuationKind) ||
        (isolateSentenceClosure && sentenceTerminals.has(previous.punctuationKind))),
    );
    const hardAfter =
      ["paragraph", "newline"].includes(phrase.punctuationKind) ||
      (isolateSentenceClosure && sentenceTerminals.has(phrase.punctuationKind));'''
assert old in omni, 'bidirectional sentence boundary anchor not found'
omni = omni.replace(old, new, 1)

old = '''  if (deliveryMode === "story") {
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
    if (kind === "comma") {'''
new = '''  if (deliveryMode === "story") {
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
    if (kind === "comma") {'''
assert old in omni, 'story punctuation branch anchor not found'
# no textual change here; use the branch end below to insert broadcast handling

old = '''    if (kind === "dash") return strength >= 0.42 ? phrase.punctuation : "";
  }

  if (kind === "comma") return strength >= 0.43 ? phrase.punctuation : "";
  if (kind === "period") {
    return strength >= 0.57 ? phrase.punctuation : closingPunctuationSuffix(phrase.punctuation);
  }'''
new = '''    if (kind === "dash") return strength >= 0.42 ? phrase.punctuation : "";
  }

  // V17: news presenters also need a real sentence-final contour. Keep genuine
  // periods audible unless the Kazakh dependency guard has identified a likely
  // formatting mistake inside a syntactically bound phrase.
  if (deliveryMode === "broadcast" && kind === "period") {
    return strength <= 0.18
      ? closingPunctuationSuffix(phrase.punctuation)
      : phrase.punctuation;
  }

  if (kind === "comma") return strength >= 0.43 ? phrase.punctuation : "";
  if (kind === "period") {
    return strength >= 0.57 ? phrase.punctuation : closingPunctuationSuffix(phrase.punctuation);
  }'''
assert old in omni, 'broadcast period punctuation insertion anchor not found'
omni = omni.replace(old, new, 1)

old = '''function semanticBreak(
  phrase: Phrase,
  punctuationRendered: boolean,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {'''
new = '''function semanticBreak(
  phrase: Phrase,
  punctuationRendered: boolean,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
  broadcastPreset: EdgeOmniSettings["broadcastPreset"] = "news",
) {'''
assert old in omni, 'semanticBreak signature anchor not found'
omni = omni.replace(old, new, 1)

old = '''  // Broadcast V11 keeps the presenter pause characteristic without turning every
  // sentence into a restart. Only the end of a detected news item receives a
  // small deliberate hand-off; native punctuation still supplies the main timing.
  if (deliveryMode === "broadcast" && phrase.newsItemClose) {
    return punctuationRendered ? 48 : 62;
  }

  // If native punctuation is rendered, let the neural voice realize its own'''
new = '''  // V17 broadcast flow: borrow V16's "finish the sentence before continuing"
  // principle, but keep newsroom pauses much tighter than story mode. Each preset
  // keeps its own presenter character: calm is roomier, bulletin is the tightest,
  // expressive has a little more air around turns, and standard news sits between.
  if (deliveryMode === "broadcast") {
    const profile = {
      news: { sentenceMin: 34, sentenceMax: 58, paragraphMin: 105, paragraphMax: 150, item: 82 },
      calm: { sentenceMin: 42, sentenceMax: 68, paragraphMin: 120, paragraphMax: 165, item: 92 },
      bulletin: { sentenceMin: 26, sentenceMax: 46, paragraphMin: 90, paragraphMax: 130, item: 72 },
      expressive: { sentenceMin: 38, sentenceMax: 64, paragraphMin: 110, paragraphMax: 160, item: 88 },
    }[broadcastPreset ?? "news"];

    if (phrase.newsItemClose) return profile.item;

    if (kind === "paragraph") {
      if (strength <= 0.18) return 0;
      const paragraphBreath = profile.paragraphMin +
        (profile.paragraphMax - profile.paragraphMin) * clamp(strength, 0, 1);
      return Math.round(clamp(paragraphBreath, profile.paragraphMin, profile.paragraphMax));
    }

    if (["period", "question", "exclamation", "mixed", "ellipsis"].includes(kind)) {
      if (kind === "period" && strength <= 0.18) return 0;
      const sentenceBreath = profile.sentenceMin +
        (profile.sentenceMax - profile.sentenceMin) * clamp(strength, 0, 1);
      return Math.round(clamp(sentenceBreath, profile.sentenceMin, profile.sentenceMax));
    }
  }

  // If native punctuation is rendered, let the neural voice realize its own'''
assert old in omni, 'broadcast semanticBreak anchor not found'
omni = omni.replace(old, new, 1)

old = '''    const pause = semanticBreak(item, Boolean(renderedPunctuation), settings.deliveryMode);'''
new = '''    const pause = semanticBreak(
      item,
      Boolean(renderedPunctuation),
      settings.deliveryMode,
      settings.broadcastPreset,
    );'''
assert old in omni, 'semanticBreak call anchor not found'
omni = omni.replace(old, new, 1)

omni_path.write_text(omni)

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()
old = '''          deliveryMode: "broadcast",
        },'''
new = '''          deliveryMode: "broadcast",
          // V17: the shared fluent closure engine knows which presenter cadence
          // to preserve, without changing the preset's existing base speed.
          broadcastPreset: preset,
        },'''
assert old in route, 'broadcast preset call anchor not found'
route = route.replace(old, new, 1)
route_path.write_text(route)
