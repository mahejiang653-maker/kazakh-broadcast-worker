from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old = '''    if (kind === "comma") {
      // V20: 15 ms is the absolute floor after semantic/dependency analysis.
      // Strong syntactic binding may still suppress the normal presenter comma
      // profile, but it never collapses a written comma to a zero-gap handoff.
      if (strength <= 0.12) return 15;
      const normalizedStrength = clamp((strength - 0.12) / 0.38, 0, 1);'''
new = '''    if (kind === "comma") {
      // V21: 24 ms is the absolute floor after semantic/dependency analysis.
      // Strong syntactic binding may still suppress the normal presenter comma
      // profile, but every written comma keeps at least a 24 ms presenter gap.
      if (strength <= 0.12) return 24;
      const normalizedStrength = clamp((strength - 0.12) / 0.38, 0, 1);'''
assert old in text, 'V20 comma floor anchor not found'
text = text.replace(old, new, 1)

path.write_text(text)
