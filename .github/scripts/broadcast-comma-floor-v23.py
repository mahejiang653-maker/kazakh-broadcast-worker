from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old_profile = '''      news: {
        commaMin: 35,
        commaMax: 46,
        sentenceMin: 34,
        sentenceMax: 58,
        paragraphMin: 105,
        paragraphMax: 150,
        item: 82,
      },
      calm: {
        commaMin: 35,
        commaMax: 54,
        sentenceMin: 42,
        sentenceMax: 68,
        paragraphMin: 120,
        paragraphMax: 165,
        item: 92,
      },
      bulletin: {
        commaMin: 35,
        commaMax: 38,
        sentenceMin: 26,
        sentenceMax: 46,
        paragraphMin: 90,
        paragraphMax: 130,
        item: 72,
      },
      expressive: {
        commaMin: 35,
        commaMax: 50,
        sentenceMin: 38,
        sentenceMax: 64,
        paragraphMin: 110,
        paragraphMax: 160,
        item: 88,
      },'''
new_profile = '''      news: {
        commaMin: 45,
        commaMax: 75,
        sentenceMin: 34,
        sentenceMax: 58,
        paragraphMin: 105,
        paragraphMax: 150,
        item: 82,
      },
      calm: {
        commaMin: 45,
        commaMax: 75,
        sentenceMin: 42,
        sentenceMax: 68,
        paragraphMin: 120,
        paragraphMax: 165,
        item: 92,
      },
      bulletin: {
        commaMin: 45,
        commaMax: 75,
        sentenceMin: 26,
        sentenceMax: 46,
        paragraphMin: 90,
        paragraphMax: 130,
        item: 72,
      },
      expressive: {
        commaMin: 45,
        commaMax: 75,
        sentenceMin: 38,
        sentenceMax: 64,
        paragraphMin: 110,
        paragraphMax: 160,
        item: 88,
      },'''
assert old_profile in text, 'V22 broadcast comma profile anchor not found'
text = text.replace(old_profile, new_profile, 1)

old_floor = '''      // V22: 35 ms is the absolute floor after semantic/dependency analysis.
      // Strong syntactic binding may still suppress the normal presenter comma
      // profile, but every written comma keeps at least a 35 ms presenter gap.
      if (strength <= 0.12) return 35;'''
new_floor = '''      // V23: 45 ms is the absolute floor after semantic/dependency analysis.
      // Every written broadcast comma keeps at least a 45 ms presenter gap,
      // while normal presenter commas dynamically expand up to 75 ms.
      if (strength <= 0.12) return 45;'''
assert old_floor in text, 'V22 absolute comma floor anchor not found'
text = text.replace(old_floor, new_floor, 1)

path.write_text(text)
