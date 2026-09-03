from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old_profile = '''      news: {
        commaMin: 15,
        commaMax: 46,
        sentenceMin: 34,
        sentenceMax: 58,
        paragraphMin: 105,
        paragraphMax: 150,
        item: 82,
      },
      calm: {
        commaMin: 15,
        commaMax: 54,
        sentenceMin: 42,
        sentenceMax: 68,
        paragraphMin: 120,
        paragraphMax: 165,
        item: 92,
      },
      bulletin: {
        commaMin: 15,
        commaMax: 38,
        sentenceMin: 26,
        sentenceMax: 46,
        paragraphMin: 90,
        paragraphMax: 130,
        item: 72,
      },
      expressive: {
        commaMin: 15,
        commaMax: 50,
        sentenceMin: 38,
        sentenceMax: 64,
        paragraphMin: 110,
        paragraphMax: 160,
        item: 88,
      },'''
new_profile = '''      news: {
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
      },'''
assert old_profile in text, 'V19 comma profile anchor not found'
text = text.replace(old_profile, new_profile, 1)

old_floor = '''    if (kind === "comma") {
      if (strength <= 0.12) return 0;
      const normalizedStrength = clamp((strength - 0.12) / 0.38, 0, 1);'''
new_floor = '''    if (kind === "comma") {
      // V20: 15 ms is the absolute floor after semantic/dependency analysis.
      // Strong syntactic binding may still suppress the normal presenter comma
      // profile, but it never collapses a written comma to a zero-gap handoff.
      if (strength <= 0.12) return 15;
      const normalizedStrength = clamp((strength - 0.12) / 0.38, 0, 1);'''
assert old_floor in text, 'V18 comma floor anchor not found'
text = text.replace(old_floor, new_floor, 1)

path.write_text(text)
