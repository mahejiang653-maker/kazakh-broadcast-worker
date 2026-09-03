from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old_spacing = '''function storyWordSpacingMarkup(\n  text: string,\n  renderText: EdgeMarkupRenderer,\n) {\n  const parts = text.split(/(\\s+)/u);\n  let output = \"\";\n  let emittedWord = false;\n\n  for (const part of parts) {\n    if (!part) continue;\n    if (/^\\s+$/u.test(part)) {\n      output += renderText(part);\n      continue;\n    }\n    if (emittedWord) output += '<break time=\"25ms\"/>';\n    output += renderText(part);\n    emittedWord = true;\n  }\n\n  return output;\n}\n\n'''
assert old_spacing in text, 'storyWordSpacingMarkup block not found'
text = text.replace(old_spacing, '', 1)

old_renderer = '''  const renderNaturalText = (value: string) =>\n    deliveryMode === \"story\" ? storyWordSpacingMarkup(value, renderText) : renderText(value);'''
new_renderer = '''  // V28: do not insert a fixed gap between every word in story mode. Word timing\n  // stays fully native to the neural voice; breathing is controlled only at real\n  // semantic, sentence and paragraph boundaries.\n  const renderNaturalText = (value: string) => renderText(value);'''
assert old_renderer in text, 'renderNaturalText story spacing anchor not found'
text = text.replace(old_renderer, new_renderer, 1)

old_expr = '''    if ([\"question\", \"exclamation\", \"mixed\", \"ellipsis\"].includes(kind)) {\n      const expressiveBreath =\n        kind === \"ellipsis\"\n          ? 92 + strength * 38\n          : 78 + strength * 48;\n      return Math.round(clamp(expressiveBreath, 80, 130));\n    }'''
new_expr = '''    if ([\"question\", \"exclamation\", \"mixed\", \"ellipsis\"].includes(kind)) {\n      // V28: expressive endings need enough release time for the contour to land\n      // before the next sentence starts. Ellipsis is deliberately roomier.\n      const roleBonus =\n        phrase.segment?.role === \"ending\" ? 18 :\n        phrase.segment?.role === \"climax\" ? 12 :\n        phrase.segment?.role === \"transition\" ? 6 : 0;\n      const expressiveBreath =\n        kind === \"ellipsis\"\n          ? 112 + strength * 48 + roleBonus\n          : 96 + strength * 54 + roleBonus;\n      return Math.round(clamp(expressiveBreath, kind === \"ellipsis\" ? 115 : 100, kind === \"ellipsis\" ? 175 : 160));\n    }'''
assert old_expr in text, 'expressive story breath block not found'
text = text.replace(old_expr, new_expr, 1)

old_para = '''    if (kind === \"paragraph\") {\n      if (strength < 0.64) return 0;\n      // V15 paragraph cadence: a real paragraph ending must feel settled before\n      // the next one begins. Ordinary paragraph transitions sit around 200-260 ms;\n      // major semantic/emotional shifts expand toward 280-350 ms. The acoustic\n      // state remains continuous, so this is a pause, not a new take.\n      return strength >= 0.84\n        ? Math.round(clamp(145 + strength * 210, 280, 350))\n        : Math.round(clamp(125 + strength * 150, 200, 260));\n    }'''
new_para = '''    if (kind === \"paragraph\") {\n      if (strength < 0.64) return 0;\n      // V28 paragraph cadence: keep a clearly larger discourse breath than a\n      // sentence ending, while remaining inside the same acoustic stream. Normal\n      // paragraph transitions settle around 240-320 ms; major role/emotion shifts\n      // expand toward 320-400 ms so the next paragraph never crowds the previous one.\n      return strength >= 0.84\n        ? Math.round(clamp(150 + strength * 280, 320, 400))\n        : Math.round(clamp(135 + strength * 210, 240, 320));\n    }'''
assert old_para in text, 'story paragraph block not found'
text = text.replace(old_para, new_para, 1)

old_period = '''    if (kind === \"period\") {\n      // Hard syntactic dependencies can push the boundary to 0.18 or below;\n      // never breathe there even when the source writer inserted a period.\n      if (strength <= 0.18) return 0;\n      // V15 completed-sentence breath: keep declarative sentence endings within\n      // 80-130 ms so one sentence has time to land before the next begins. Semantic\n      // boundary strength and sentence length still choose the exact duration.\n      const lengthBonus = Math.min(16, Math.max(0, (words - 6) * 1.25));\n      const sentenceBreath = 78 + strength * 52 + lengthBonus;\n      return Math.round(clamp(sentenceBreath, 80, 130));\n    }'''
new_period = '''    if (kind === \"period\") {\n      // Hard syntactic dependencies can push the boundary to 0.18 or below;\n      // never breathe there even when the source writer inserted a period.\n      if (strength <= 0.18) return 0;\n      // V28 completed-sentence breath: combine semantic strength, sentence length\n      // and document role. The real period still carries the neural sentence-final\n      // contour; this supplemental breath lets that contour finish before the next\n      // sentence enters, without forcing a new TTS request or prosody reset.\n      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.45));\n      const roleBonus =\n        phrase.segment?.role === \"ending\" ? 18 :\n        phrase.segment?.role === \"climax\" ? 12 :\n        phrase.segment?.role === \"transition\" ? 6 : 0;\n      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -6 : 0;\n      const sentenceBreath = 94 + strength * 62 + lengthBonus + roleBonus + quoteAdjustment;\n      return Math.round(clamp(sentenceBreath, 100, 165));\n    }'''
assert old_period in text, 'story period block not found'
text = text.replace(old_period, new_period, 1)

old_minor = '''    if (kind === \"newline\" && strength >= 0.3) {\n      return Math.round(12 + strength * 28);\n    }\n    if ([\"semicolon\", \"colon\", \"dash\"].includes(kind) && strength >= 0.28) {\n      return Math.round(11 + strength * 28);\n    }'''
new_minor = '''    if (kind === \"newline\" && strength >= 0.3) {\n      return Math.round(clamp(38 + strength * 48, 50, 82));\n    }\n    if ([\"semicolon\", \"colon\", \"dash\"].includes(kind) && strength >= 0.28) {\n      return Math.round(clamp(28 + strength * 50, 40, 72));\n    }'''
assert old_minor in text, 'story minor boundary block not found'
text = text.replace(old_minor, new_minor, 1)

# Update stale story cadence comment so source accurately documents the new behavior.
old_comment = '''  // Story V15: three breathing levels inside one continuous acoustic state:\n  // clause breath 45-60 ms < completed-sentence breath 80-130 ms <\n  // paragraph/discourse breath 200-350 ms.\n  // Declarative periods use a controlled in-stream breath instead of native\n  // punctuation timing, which makes the pause audible without re-starting pitch\n  // and delivery on every sentence. Dependency guards already lower strength in\n  // modifier-head, subject-predicate, number-unit and name-title no-pause zones.'''
new_comment = '''  // Story V28: natural word timing + layered breathing inside one continuous\n  // acoustic state. There is no fixed word-to-word gap. Clause commas remain\n  // 45-60 ms, completed sentences settle around 100-165 ms, and real paragraph\n  // transitions sit around 240-400 ms depending on semantic/emotional strength.\n  // Dependency guards still protect syntactically bound phrases.'''
assert old_comment in text, 'story cadence comment not found'
text = text.replace(old_comment, new_comment, 1)

path.write_text(text)
