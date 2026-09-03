from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()
old = '''      if (rest.trim().length >= 4) {\n        return `${renderNaturalText(leading)}${labelMarkup}<break time="72ms"/>${renderNaturalText(rest)}`;\n      }'''
new = '''      if (rest.trim().length >= 4) {\n        // V29b: item-label hand-off is semantic too. Let the following phrase\n        // length choose a light presenter transition instead of forcing 72 ms.\n        const restLoad = clamp(rest.trim().length / 180, 0, 1);\n        const cueBreath = Math.round(clamp(62 + restLoad * 18, 62, 80));\n        return `${renderNaturalText(leading)}${labelMarkup}<break time="${cueBreath}ms"/>${renderNaturalText(rest)}`;\n      }'''
assert old in text, 'fixed 72ms broadcast cue block not found'
text = text.replace(old, new, 1)
path.write_text(text)
