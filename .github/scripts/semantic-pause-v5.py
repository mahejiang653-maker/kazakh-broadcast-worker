from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text(encoding='utf-8')
original = text

# 1) Store document-aware boundary strength on each rendered phrase.
old = '''  reportingLead?: boolean;\n};'''
new = '''  reportingLead?: boolean;\n  boundaryStrength?: number;\n};'''
if old in text and 'boundaryStrength?: number;' not in text:
    text = text.replace(old, new, 1)

# 2) Punctuation is no longer allowed to impose comma/period contour by itself.
old = '''  // Native-first: punctuation remains the neural voice's primary cue.\n  // Kazakh experimental phonetics commonly finds a level/rising contour at\n  // non-final comma syntagms, while semicolon/colon boundaries settle more.\n  // These hints are deliberately tiny and add no extra audible pause.\n  if (kind === "comma") pitchDelta += 0.008;\n  else if (kind === "semicolon") {\n    rateFactor *= 0.997;\n    pitchDelta -= 0.006;\n  } else if (kind === "colon") {\n    rateFactor *= 0.996;\n    pitchDelta -= 0.008;\n  } else if (kind === "dash") {\n    pitchDelta += 0.005;\n  } else if (kind === "question") pitchDelta += 0.065;\n  else if (kind === "exclamation") {\n    pitchDelta += 0.038;\n    volumeDelta += 0.025;\n  } else if (kind === "mixed") {\n    pitchDelta += 0.072;\n    volumeDelta += 0.022;\n  } else if (kind === "ellipsis") {\n    rateFactor *= 0.995;\n    pitchDelta -= 0.018;\n  }'''
new = '''  // Semantic-first: commas and periods do not impose a contour merely because\n  // they exist on the page. Their acoustic force is decided later from the\n  // surrounding document context. Interrogative/exclamatory marks remain true\n  // intonation instructions because they carry sentence-mode information.\n  if (kind === "question") pitchDelta += 0.065;\n  else if (kind === "exclamation") {\n    pitchDelta += 0.038;\n    volumeDelta += 0.025;\n  } else if (kind === "mixed") {\n    pitchDelta += 0.072;\n    volumeDelta += 0.022;\n  } else if (kind === "ellipsis") {\n    rateFactor *= 0.995;\n    pitchDelta -= 0.018;\n  }'''
if old not in text:
    raise SystemExit('localMicro punctuation anchor not found')
text = text.replace(old, new, 1)

# 3) Replace fixed punctuation breaks with document-aware boundary scoring.
old = '''function subtleBreak(kind: PunctuationKind, _text: string) {\n  // Native-first: let punctuation drive Microsoft's learned cadence.\n  // Explicit breaks are reserved for layout boundaries and true hesitation only.\n  switch (kind) {\n    case "paragraph":\n      return 132;\n    case "newline":\n      return 48;\n    case "dash":\n      return 4;\n    case "ellipsis":\n      return 34;\n    default:\n      return 0;\n  }\n}\n'''
new = r'''const CONTINUATION_STARTERS = [
  "және", "әрі", "сондай-ақ", "сонымен бірге", "оған қоса", "бұған қоса",
  "осы ретте", "бұл ретте", "осы кезде", "бұл кезде", "сонымен", "тағы да",
  "此外", "同时", "另外", "与此同时", "其中", "对此", "因此",
  "and", "also", "meanwhile", "additionally", "furthermore", "therefore",
];

const STRONG_BOUNDARY_STARTERS = [
  ...CONTRAST_CUES,
  ...RESULT_CUES,
  ...FOCUS_CUES,
  "ал енді", "енді", "ақырында", "қорытындылай келе", "қорыта айтқанда",
  "不过", "但是", "然而", "因此", "所以", "最终", "总之", "最重要的是",
  "however", "but", "therefore", "finally", "in conclusion", "most importantly",
];

function baseBoundaryStrength(kind: PunctuationKind) {
  switch (kind) {
    case "paragraph": return 0.88;
    case "newline": return 0.42;
    case "period": return 0.56;
    case "question": return 0.58;
    case "exclamation": return 0.68;
    case "mixed": return 0.72;
    case "semicolon": return 0.42;
    case "colon": return 0.32;
    case "dash": return 0.24;
    case "ellipsis": return 0.48;
    case "comma": return 0.18;
    default: return 0;
  }
}

function semanticBoundaryStrength(current: Phrase, next?: Phrase) {
  const kind = current.punctuationKind;
  let strength = baseBoundaryStrength(kind);

  // The end of the whole synthesis span is a real discourse boundary even when
  // the writer used weak punctuation.
  if (!next) {
    if (["period", "paragraph", "exclamation", "mixed"].includes(kind)) {
      return clamp(Math.max(strength, 0.78), 0, 1);
    }
    if (kind === "question") return clamp(Math.max(strength, 0.66), 0, 1);
    return clamp(strength, 0, 1);
  }

  const sameSegment = Boolean(
    current.segment && next.segment && current.segment.index === next.segment.index,
  );
  const sameRole = Boolean(
    current.segment && next.segment && current.segment.role === next.segment.role,
  );
  const roleChanged = Boolean(
    current.segment && next.segment && current.segment.role !== next.segment.role,
  );
  const sameDirectQuote = Boolean(current.directQuote && next.directQuote);
  const reportingBridge = Boolean(
    current.reportingLead && next.directQuote && next.quoteStart,
  );

  // Whole-document continuity: phrases mapped to the same planned information
  // unit are usually one thought, even if the source writer inserted a period.
  if (sameSegment) strength -= kind === "period" ? 0.19 : 0.12;
  if (sameRole) strength -= 0.045;

  if (sameDirectQuote && !["question", "exclamation", "mixed"].includes(kind)) {
    strength -= kind === "period" ? 0.13 : 0.07;
  }

  // "X said: ..." is one reporting movement, not a speaker/acoustic restart.
  if (reportingBridge) strength = Math.min(strength, 0.17);

  if (startsWithCue(next.text, CONTINUATION_STARTERS)) {
    strength -= kind === "period" ? 0.16 : 0.1;
  }

  // Contrast, result, conclusion and focus are semantic boundaries even when the
  // punctuation mark itself is light.
  if (startsWithCue(next.text, STRONG_BOUNDARY_STARTERS)) strength += 0.17;

  if (roleChanged) {
    strength +=
      isEmphasisRole(current.segment?.role) || isEmphasisRole(next.segment?.role)
        ? 0.14
        : 0.075;
  }

  const currentImportance = current.segment?.importance ?? 0.5;
  const nextImportance = next.segment?.importance ?? 0.5;
  if (nextImportance - currentImportance >= 0.22) strength += 0.075;

  if (current.segment?.role === "ending") strength += 0.12;
  else if (current.segment?.role === "climax") strength += 0.075;

  // Short list-like fragments separated by commas should normally stay fluid.
  if (kind === "comma" && normalize(current.text).length <= 28 && sameSegment) {
    strength -= 0.065;
  }

  // Question marks retain question intonation regardless of this score. The
  // score controls boundary/pause strength only, not the interrogative contour.
  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);
  if (kind === "mixed") strength = Math.max(strength, 0.6);

  return clamp(strength, 0.04, 0.96);
}

function annotateSemanticBoundaries(phrases: Phrase[]) {
  return phrases.map((phrase, index) => ({
    ...phrase,
    boundaryStrength: semanticBoundaryStrength(phrase, phrases[index + 1]),
  }));
}

function closingPunctuationSuffix(value: string) {
  return value.match(/[»”"'’」』）\])}]+$/u)?.[0] ?? "";
}

function acousticPunctuation(phrase: Phrase) {
  const strength = phrase.boundaryStrength ?? baseBoundaryStrength(phrase.punctuationKind);
  const kind = phrase.punctuationKind;

  // Sentence-mode marks are never suppressed: a question must sound like a
  // question even when it is semantically connected to what follows.
  if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) {
    return phrase.punctuation;
  }

  if (["paragraph", "newline", "none"].includes(kind)) return "";

  if (kind === "comma") return strength >= 0.43 ? phrase.punctuation : "";
  if (kind === "period") {
    return strength >= 0.57 ? phrase.punctuation : closingPunctuationSuffix(phrase.punctuation);
  }
  if (kind === "semicolon") return strength >= 0.48 ? phrase.punctuation : "";
  if (kind === "colon") {
    return phrase.reportingLead || strength >= 0.4 ? phrase.punctuation : "";
  }
  if (kind === "dash") return strength >= 0.4 ? phrase.punctuation : "";

  return phrase.punctuation;
}

function semanticBreak(phrase: Phrase, punctuationRendered: boolean) {
  const strength = phrase.boundaryStrength ?? baseBoundaryStrength(phrase.punctuationKind);
  const kind = phrase.punctuationKind;

  // If native punctuation is rendered, let the neural voice realize its own
  // micro-timing. Explicit breaks are mainly for semantic/layout boundaries or
  // for punctuation that was intentionally acoustically suppressed.
  if (kind === "paragraph") return Math.round(62 + strength * 78);
  if (kind === "newline") return strength < 0.26 ? 0 : Math.round(8 + strength * 42);
  if (kind === "ellipsis") return punctuationRendered ? 0 : Math.round(18 + strength * 32);
  if (punctuationRendered) return 0;

  if (kind === "period" && strength >= 0.27) return Math.round(8 + strength * 38);
  if (kind === "comma" && strength >= 0.28) return Math.round(5 + strength * 24);
  if (["semicolon", "colon", "dash"].includes(kind) && strength >= 0.3) {
    return Math.round(6 + strength * 28);
  }
  return 0;
}
'''
if old not in text:
    raise SystemExit('subtleBreak anchor not found')
text = text.replace(old, new, 1)

# 4) Render punctuation through the semantic gate and derive explicit break from the same score.
old = '''  for (const item of group) {\n    body += naturalTextMarkup(item.text, renderText);\n    if (!/^\\n+$/u.test(item.punctuation)) body += escapeXml(item.punctuation);\n    const pause = subtleBreak(item.punctuationKind, item.text);\n    if (pause) body += `<break time="${pause}ms"/>`;\n  }'''
new = '''  for (const item of group) {\n    body += naturalTextMarkup(item.text, renderText);\n    const renderedPunctuation = acousticPunctuation(item);\n    if (renderedPunctuation) body += escapeXml(renderedPunctuation);\n    const pause = semanticBreak(item, Boolean(renderedPunctuation));\n    if (pause) body += `<break time="${pause}ms"/>`;\n  }'''
if old not in text:
    raise SystemExit('renderGroup punctuation anchor not found')
text = text.replace(old, new, 1)

# 5) Add semantic boundary annotation to the live full-document pipeline.
old = '''  const phrases = applyDirectQuoteContinuity(\n    applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),\n  );'''
new = '''  const phrases = annotateSemanticBoundaries(\n    applyDirectQuoteContinuity(\n      applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),\n    ),\n  );'''
if old not in text:
    raise SystemExit('render pipeline anchor not found')
text = text.replace(old, new, 1)

# 6) Grouping/reset decisions also use semantic strength rather than terminal punctuation alone.
old = '''    const hardBoundary =\n      ["paragraph", "newline"].includes(previous.punctuationKind) && !sameDirectQuote;'''
new = '''    const previousBoundaryStrength =\n      previous.boundaryStrength ?? baseBoundaryStrength(previous.punctuationKind);\n    const hardBoundary =\n      ["paragraph", "newline"].includes(previous.punctuationKind) &&\n      previousBoundaryStrength >= 0.58 &&\n      !sameDirectQuote;'''
if old not in text:
    raise SystemExit('hardBoundary anchor not found')
text = text.replace(old, new, 1)

old = '''    const sentenceBoundary = ["period", "question", "exclamation", "mixed"].includes(\n      previous.punctuationKind,\n    );'''
new = '''    const sentenceBoundary =\n      ["period", "question", "exclamation", "mixed"].includes(previous.punctuationKind) &&\n      previousBoundaryStrength >= 0.57;'''
if old not in text:
    raise SystemExit('sentenceBoundary anchor not found')
text = text.replace(old, new, 1)

old = '''    const tooLong = current.length >= (sameDirectQuote ? 9 : 6);'''
new = '''    const tooLong =\n      current.length >= (sameDirectQuote ? 10 : 8) && previousBoundaryStrength >= 0.36;'''
if old not in text:
    raise SystemExit('tooLong anchor not found')
text = text.replace(old, new, 1)

if text == original:
    raise SystemExit('No semantic pause V5 changes made')

path.write_text(text, encoding='utf-8')
