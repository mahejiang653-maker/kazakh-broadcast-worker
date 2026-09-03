from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()
old = '''  const renderNaturalText = (value: string) =>
    deliveryMode === "story" ? storyWordSpacingMarkup(value, renderText) : renderNaturalText(value);'''
new = '''  const renderNaturalText = (value: string) =>
    deliveryMode === "story" ? storyWordSpacingMarkup(value, renderText) : renderText(value);'''
assert old in text, 'V24 renderNaturalText recursion anchor not found'
text = text.replace(old, new, 1)
path.write_text(text)
