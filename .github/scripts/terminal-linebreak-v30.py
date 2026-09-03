from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old_phrase = '''type Phrase = {\n  text: string;\n  punctuation: string;\n  punctuationKind: PunctuationKind;\n  segment: EdgePlannedSegment | null;'''
new_phrase = '''type Phrase = {\n  text: string;\n  punctuation: string;\n  punctuationKind: PunctuationKind;\n  // V30: preserve a line/paragraph break that follows terminal punctuation.\n  // The terminal mark still controls intonation; this structural boundary controls\n  // the larger breath before the next line/paragraph begins.\n  layoutBoundary?: \"newline\" | \"paragraph\";\n  segment: EdgePlannedSegment | null;'''
assert old_phrase in text, 'Phrase type anchor not found'
text = text.replace(old_phrase, new_phrase, 1)

old_build = '''function buildPhrases(text: string, plan?: EdgeDocumentPlan) {\n  const tokens = tokenize(text);\n  const phrases: Phrase[] = [];\n  for (let index = 0; index < tokens.length; index += 1) {\n    const token = tokens[index];\n    if (token.kind !== \"text\" || !token.value.trim()) continue;\n    const punctuation = tokens[index + 1]?.kind === \"punct\" ? tokens[index + 1].value : \"\";\n    const kind = punctuationKind(punctuation);\n    const segment = segmentForFragment(token.value, plan);\n    const micro = combine(localMicro(token.value, kind), documentMicro(segment, plan));\n    phrases.push({ text: token.value, punctuation, punctuationKind: kind, segment, micro });\n    if (punctuation) index += 1;\n  }\n  return phrases;\n}'''
new_build = '''function buildPhrases(text: string, plan?: EdgeDocumentPlan) {\n  const tokens = tokenize(text);\n  const phrases: Phrase[] = [];\n  for (let index = 0; index < tokens.length; index += 1) {\n    const token = tokens[index];\n    if (token.kind !== \"text\" || !token.value.trim()) continue;\n\n    const punctuationToken = tokens[index + 1];\n    const punctuation = punctuationToken?.kind === \"punct\" ? punctuationToken.value : \"\";\n    const kind = punctuationKind(punctuation);\n    let consumed = punctuation ? 1 : 0;\n    let layoutBoundary: Phrase[\"layoutBoundary\"];\n\n    // V30: punctuation and the following newline are separate tokenizer tokens.\n    // Previously buildPhrases consumed only the punctuation token, so a source like\n    // \"sentence.\\nnext paragraph\" silently lost the line/paragraph boundary. Preserve it as\n    // a structural attribute while leaving the real period/question/exclamation\n    // available to Edge for sentence-final intonation.\n    if (punctuation && ![\"newline\", \"paragraph\"].includes(kind)) {\n      let cursor = index + 2;\n      while (tokens[cursor]?.kind === \"text\" && !tokens[cursor].value.trim()) cursor += 1;\n      const layoutToken = tokens[cursor];\n      if (layoutToken?.kind === \"punct\") {\n        const detectedLayout = punctuationKind(layoutToken.value);\n        if ([\"newline\", \"paragraph\"].includes(detectedLayout)) {\n          const completedSentence = [\"period\", \"question\", \"exclamation\", \"mixed\", \"ellipsis\"].includes(kind);\n          // A completed sentence followed by even one explicit line break starts a\n          // new spoken paragraph. Non-terminal punctuation keeps the lighter source\n          // layout distinction.\n          layoutBoundary = completedSentence\n            ? \"paragraph\"\n            : detectedLayout as \"newline\" | \"paragraph\";\n          consumed = cursor - index;\n        }\n      }\n    }\n\n    const segment = segmentForFragment(token.value, plan);\n    const micro = combine(localMicro(token.value, kind), documentMicro(segment, plan));\n    phrases.push({\n      text: token.value,\n      punctuation,\n      punctuationKind: kind,\n      layoutBoundary,\n      segment,\n      micro,\n    });\n    if (consumed) index += consumed;\n  }\n  return phrases;\n}'''
assert old_build in text, 'buildPhrases block not found'
text = text.replace(old_build, new_build, 1)

old_semantic_start = '''  const kind = current.punctuationKind;\n  let strength = baseBoundaryStrength(kind);'''
new_semantic_start = '''  // V30: when terminal punctuation is followed by a source line break, use the\n  // structural boundary for pause strength while preserving punctuationKind for\n  // native Edge intonation in acousticPunctuation.\n  const kind = current.layoutBoundary ?? current.punctuationKind;\n  let strength = Math.max(\n    baseBoundaryStrength(current.punctuationKind),\n    current.layoutBoundary ? baseBoundaryStrength(current.layoutBoundary) : 0,\n  );'''
assert old_semantic_start in text, 'semanticBoundaryStrength start not found'
text = text.replace(old_semantic_start, new_semantic_start, 1)

old_story_para = '''  if (deliveryMode === \"story\" && kind === \"paragraph\") {'''
new_story_para = '''  if ((deliveryMode === \"story\" || deliveryMode === \"broadcast\") && kind === \"paragraph\") {'''
assert old_story_para in text, 'story paragraph semantic boundary block not found'
text = text.replace(old_story_para, new_story_para, 1)

old_quote_boundary = '''      if ([\"paragraph\", \"newline\"].includes(annotated[cursor].punctuationKind)) break;'''
new_quote_boundary = '''      if ([\"paragraph\", \"newline\"].includes(\n        annotated[cursor].layoutBoundary ?? annotated[cursor].punctuationKind,\n      )) break;'''
assert old_quote_boundary in text, 'quote layout boundary anchor not found'
text = text.replace(old_quote_boundary, new_quote_boundary, 1)

old_break_start = '''  const strength = phrase.boundaryStrength ?? baseBoundaryStrength(phrase.punctuationKind);\n  const kind = phrase.punctuationKind;'''
new_break_start = '''  const strength = phrase.boundaryStrength ?? Math.max(\n    baseBoundaryStrength(phrase.punctuationKind),\n    phrase.layoutBoundary ? baseBoundaryStrength(phrase.layoutBoundary) : 0,\n  );\n  // V30: a terminal mark followed by a line break keeps its punctuation for\n  // intonation, but the larger structural boundary decides the breathing tier.\n  const kind = phrase.layoutBoundary ?? phrase.punctuationKind;'''
# Replace only the semanticBreak occurrence, not acousticPunctuation. Find after function semanticBreak.
sem_index = text.index('function semanticBreak(')
anchor_index = text.index(old_break_start, sem_index)
text = text[:anchor_index] + text[anchor_index:].replace(old_break_start, new_break_start, 1)

old_hard_boundary = '''    const hardBoundary =\n      [\"paragraph\", \"newline\"].includes(previous.punctuationKind) &&'''
new_hard_boundary = '''    const previousStructuralBoundary = previous.layoutBoundary ?? previous.punctuationKind;\n    const hardBoundary =\n      [\"paragraph\", \"newline\"].includes(previousStructuralBoundary) &&'''
assert old_hard_boundary in text, 'render grouping hardBoundary anchor not found'
text = text.replace(old_hard_boundary, new_hard_boundary, 1)

path.write_text(text)
