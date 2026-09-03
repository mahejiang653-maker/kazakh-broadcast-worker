from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old = '''    const profile = {
      news: { sentenceMin: 34, sentenceMax: 58, paragraphMin: 105, paragraphMax: 150, item: 82 },
      calm: { sentenceMin: 42, sentenceMax: 68, paragraphMin: 120, paragraphMax: 165, item: 92 },
      bulletin: { sentenceMin: 26, sentenceMax: 46, paragraphMin: 90, paragraphMax: 130, item: 72 },
      expressive: { sentenceMin: 38, sentenceMax: 64, paragraphMin: 110, paragraphMax: 160, item: 88 },
    }[broadcastPreset ?? "news"];'''
new = '''    const profile = {
      news: {
        commaMin: 30,
        commaMax: 46,
        sentenceMin: 34,
        sentenceMax: 58,
        paragraphMin: 105,
        paragraphMax: 150,
        item: 82,
      },
      calm: {
        commaMin: 36,
        commaMax: 54,
        sentenceMin: 42,
        sentenceMax: 68,
        paragraphMin: 120,
        paragraphMax: 165,
        item: 92,
      },
      bulletin: {
        commaMin: 24,
        commaMax: 38,
        sentenceMin: 26,
        sentenceMax: 46,
        paragraphMin: 90,
        paragraphMax: 130,
        item: 72,
      },
      expressive: {
        commaMin: 32,
        commaMax: 50,
        sentenceMin: 38,
        sentenceMax: 64,
        paragraphMin: 110,
        paragraphMax: 160,
        item: 88,
      },
    }[broadcastPreset ?? "news"];'''
assert old in text, 'V17 broadcast profile anchor not found'
text = text.replace(old, new, 1)

old = '''    if (kind === "paragraph") {
      if (strength <= 0.18) return 0;
      const paragraphBreath = profile.paragraphMin +
        (profile.paragraphMax - profile.paragraphMin) * clamp(strength, 0, 1);
      return Math.round(clamp(paragraphBreath, profile.paragraphMin, profile.paragraphMax));
    }

    if (["period", "question", "exclamation", "mixed", "ellipsis"].includes(kind)) {'''
new = '''    if (kind === "paragraph") {
      if (strength <= 0.18) return 0;
      const paragraphBreath = profile.paragraphMin +
        (profile.paragraphMax - profile.paragraphMin) * clamp(strength, 0, 1);
      return Math.round(clamp(paragraphBreath, profile.paragraphMin, profile.paragraphMax));
    }

    // V18: a broadcast comma is a presenter breathing point, not a near-zero gap.
    // Keep it clearly shorter than a completed-sentence pause, but long enough for
    // the first clause to release before the second clause begins. Very low boundary
    // strength still means the Kazakh dependency guard has found a syntactically
    // bound phrase, so no artificial breath is inserted there.
    if (kind === "comma") {
      if (strength <= 0.12) return 0;
      const normalizedStrength = clamp((strength - 0.12) / 0.38, 0, 1);
      const commaBreath = profile.commaMin +
        (profile.commaMax - profile.commaMin) * normalizedStrength;
      return Math.round(clamp(commaBreath, profile.commaMin, profile.commaMax));
    }

    if (["period", "question", "exclamation", "mixed", "ellipsis"].includes(kind)) {'''
assert old in text, 'broadcast paragraph/sentence anchor not found'
text = text.replace(old, new, 1)

path.write_text(text)
