from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()
old = '        commaMin: 36,'
new = '        commaMin: 35,'
assert old in text, 'calm commaMin anchor not found'
text = text.replace(old, new, 1)
path.write_text(text)
