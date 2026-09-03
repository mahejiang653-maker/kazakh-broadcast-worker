from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

replacements = {
    'commaMin: 30,': 'commaMin: 35,',
    'commaMin: 24,': 'commaMin: 35,',
    'commaMin: 32,': 'commaMin: 35,',
    'if (strength <= 0.12) return 24;': 'if (strength <= 0.12) return 35;',
}

for old, new in replacements.items():
    assert old in text, f'anchor not found: {old}'
    text = text.replace(old, new, 1)

text = text.replace(
    '// V21: 24 ms is the absolute floor after semantic/dependency analysis.\n'
    '      // Strong syntactic binding may still suppress the normal presenter comma\n'
    '      // profile, but every written comma keeps at least a 24 ms presenter gap.',
    '// V22: 35 ms is the absolute floor after semantic/dependency analysis.\n'
    '      // Strong syntactic binding may still suppress the normal presenter comma\n'
    '      // profile, but every written comma keeps at least a 35 ms presenter gap.',
    1,
)

path.write_text(text)
