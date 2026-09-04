from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old_floor = '''  // Question marks retain question intonation regardless of this score. The\n  // score controls boundary/pause strength only, not the interrogative contour.\n  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);\n  if (kind === "mixed") strength = Math.max(strength, 0.6);\n\n  return clamp(strength, 0.04, 0.96);'''
new_floor = '''  // V34: every genuine written period is a hard sentence boundary even when it\n  // appears inside the same source paragraph, semantic segment or quotation.\n  // Semantic/dependency analysis may tune the release, but cannot erase the\n  // sentence boundary. A following line/paragraph break can still raise it higher.\n  if (\n    (deliveryMode === "story" || deliveryMode === "broadcast") &&\n    current.punctuationKind === "period"\n  ) {\n    strength = Math.max(strength, current.layoutBoundary === "paragraph" ? 0.78 : 0.62);\n  }\n\n  // Question marks retain question intonation regardless of this score. The\n  // score controls boundary/pause strength only, not the interrogative contour.\n  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);\n  if (kind === "mixed") strength = Math.max(strength, 0.6);\n\n  return clamp(strength, 0.04, 0.96);'''
assert old_floor in text, 'semantic boundary final anchor not found'
text = text.replace(old_floor, new_floor, 1)

old_broadcast_period = '''  // V17: news presenters also need a real sentence-final contour. Keep genuine\n  // periods audible unless the Kazakh dependency guard has identified a likely\n  // formatting mistake inside a syntactically bound phrase.\n  if (deliveryMode === "broadcast" && kind === "period") {\n    return strength <= 0.18\n      ? closingPunctuationSuffix(phrase.punctuation)\n      : phrase.punctuation;\n  }'''
new_broadcast_period = '''  // V34: every genuine presenter period stays acoustically present, including\n  // periods inside one paragraph. Dependency/semantic analysis may shape the\n  // following pause, but must not strip the sentence-final contour itself.\n  if (deliveryMode === "broadcast" && kind === "period") {\n    return phrase.punctuation;\n  }'''
assert old_broadcast_period in text, 'broadcast acoustic period block not found'
text = text.replace(old_broadcast_period, new_broadcast_period, 1)

path.write_text(text)
