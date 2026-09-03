from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

# 1) Add an explicit 25 ms story word-to-word micro-gap renderer. It stays inside
# the same prosody/acoustic stream, so this is not per-word synthesis or a voice reset.
anchor = '''function naturalTextMarkup(\n  text: string,\n  renderText: EdgeMarkupRenderer = escapeXml,\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {'''
helper = '''function storyWordSpacingMarkup(\n  text: string,\n  renderText: EdgeMarkupRenderer,\n) {\n  const parts = text.split(/(\\s+)/u);\n  let output = "";\n  let emittedWord = false;\n\n  for (const part of parts) {\n    if (!part) continue;\n    if (/^\\s+$/u.test(part)) {\n      output += renderText(part);\n      continue;\n    }\n    if (emittedWord) output += '<break time="25ms"/>';\n    output += renderText(part);\n    emittedWord = true;\n  }\n\n  return output;\n}\n\nfunction naturalTextMarkup(\n  text: string,\n  renderText: EdgeMarkupRenderer = escapeXml,\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {'''
assert anchor in text, 'naturalTextMarkup anchor not found'
text = text.replace(anchor, helper, 1)

# 2) Use the story word-gap renderer throughout naturalTextMarkup while leaving
# broadcast/neutral behavior unchanged through the delivery-mode conditional.
start = text.index('function naturalTextMarkup(')
end = text.index('\nfunction microDistance(', start)
block = text[start:end]
block_anchor = '''  // A presenter may write "Бірінші жаңалық бүгін..." without punctuation after\n'''
assert block_anchor in block, 'naturalTextMarkup body anchor not found'
block = block.replace(
    block_anchor,
    '''  const renderNaturalText = (value: string) =>\n    deliveryMode === "story" ? storyWordSpacingMarkup(value, renderText) : renderText(value);\n\n''' + block_anchor,
    1,
)
block = block.replace('renderText(', 'renderNaturalText(')
# Restore the wrapper definition itself; the replacement above intentionally touched it.
block = block.replace(
    'deliveryMode === "story" ? storyWordSpacingMarkup(value, renderNaturalText) : renderNaturalText(value);',
    'deliveryMode === "story" ? storyWordSpacingMarkup(value, renderText) : renderText(value);',
    1,
)
text = text[:start] + block + text[end:]

# 3) Story commas always receive an explicit semantic pause of at least 45 ms,
# even when the native comma punctuation is rendered by Edge.
period_anchor = '''    if (kind === "period") {\n      // Hard syntactic dependencies can push the boundary to 0.18 or below;'''
comma_block = '''    if (kind === "comma") {\n      // V24: every written story comma keeps at least 45 ms after semantic/\n      // dependency analysis. Stronger clause boundaries can expand toward 60 ms.\n      const commaBreath = 45 + strength * 15;\n      return Math.round(clamp(commaBreath, 45, 60));\n    }\n\n    if (kind === "period") {\n      // Hard syntactic dependencies can push the boundary to 0.18 or below;'''
assert period_anchor in text, 'story period anchor not found'
text = text.replace(period_anchor, comma_block, 1)

# Remove the old conditional comma branch later in the story block; the new branch
# above now handles every written comma, not only long clauses.
old_story_comma = '''    if (kind === "comma" && strength >= 0.26 && (clean.length >= 42 || words >= 8)) {\n      return Math.round(8 + strength * 24);\n    }\n'''
assert old_story_comma in text, 'old story comma branch not found'
text = text.replace(old_story_comma, '', 1)

path.write_text(text)
