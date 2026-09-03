from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

replacements = {
    'commaMin: 30,': 'commaMin: 15,',
    'commaMin: 36,': 'commaMin: 15,',
    'commaMin: 24,': 'commaMin: 15,',
    'commaMin: 32,': 'commaMin: 15,',
}

for old, new in replacements.items():
    assert old in text, f'anchor not found: {old}'
    text = text.replace(old, new, 1)

path.write_text(text)
