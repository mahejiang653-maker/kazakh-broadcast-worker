from pathlib import Path

natural_path = Path('app/lib/edge-natural-structure.ts')
omni_path = Path('app/lib/edge-omnivoice-inspired.ts')

natural = natural_path.read_text(encoding='utf-8')
omni = omni_path.read_text(encoding='utf-8')
natural_original = natural
omni_original = omni

# 1) Keep direct speech + following reporting clause in one structured sentence.
if 'function isReportingContinuation(text: string, index: number)' not in natural:
    anchor = '''function splitSentences(paragraph: string, paragraphIndex: number) {'''
    block = r'''const REPORTING_CONTINUATION_PATTERN =
  /^(?:[,，]?\s*[—–-]\s*)?(?:деді|дейді|деп|айтты|мәлімдеді|хабарлады|жазды|ескертті|түсіндірді|растады|қосты|атап өтті|表示|称|说|指出|宣布|写道|强调|透露|回应|said|says|stated|reported|announced|wrote|noted|added)\b/iu;

function isReportingContinuation(text: string, index: number) {
  const rest = text
    .slice(index + 1, index + 180)
    .replace(/^[»”"'’」』）\])}]+\s*/u, "")
    .trimStart();
  return REPORTING_CONTINUATION_PATTERN.test(rest);
}

'''
    if anchor not in natural:
        raise SystemExit('Natural structure splitSentences anchor not found')
    natural = natural.replace(anchor, block + anchor, 1)

old_flush = '''    while (/[»”\\"'’）\\])}]/u.test(paragraph[index + 1] ?? "")) {
      index += 1;
      buffer += paragraph[index];
    }
    flush();'''
new_flush = '''    while (/[»”\\"'’）\\])}]/u.test(paragraph[index + 1] ?? "")) {
      index += 1;
      buffer += paragraph[index];
    }
    // In Kazakh direct speech, terminal punctuation can be followed by a dash
    // and the author's reporting clause. Keep both sides in one acoustic unit.
    if (isReportingContinuation(paragraph, index)) continue;
    flush();'''
if old_flush in natural:
    natural = natural.replace(old_flush, new_flush, 1)
elif 'if (isReportingContinuation(paragraph, index)) continue;' not in natural:
    raise SystemExit('Natural structure reporting continuation insertion anchor not found')

# 2) Quote metadata in Phrase.
old_phrase = '''type Phrase = {
  text: string;
  punctuation: string;
  punctuationKind: PunctuationKind;
  segment: EdgePlannedSegment | null;
  micro: MicroProsody;
};'''
new_phrase = '''type Phrase = {
  text: string;
  punctuation: string;
  punctuationKind: PunctuationKind;
  segment: EdgePlannedSegment | null;
  micro: MicroProsody;
  quoted?: boolean;
  quoteStart?: boolean;
  quoteEnd?: boolean;
  directQuote?: boolean;
  reportingLead?: boolean;
};'''
if old_phrase in omni:
    omni = omni.replace(old_phrase, new_phrase, 1)
elif 'directQuote?: boolean;' not in omni:
    raise SystemExit('Phrase type anchor not found')

# 3) Add quote/reporting helpers before duration chunking so both chunking and prosody can share them.
if 'function scanQuoteState(value: string, initialActive = false)' not in omni:
    anchor = '''function clamp(value: number, min: number, max: number) {'''
    block = r'''const REPORTING_VERB_PATTERN =
  /(?:деді|дейді|деп|айтты|мәлімдеді|хабарлады|жазды|ескертті|түсіндірді|растады|қосты|атап өтті|表示|称|说|指出|宣布|写道|强调|透露|回应|said|says|stated|reported|announced|wrote|noted|added)/iu;
const OPEN_QUOTE_CHARS = new Set(["«", "“", "„", "「", "『"]);
const CLOSE_QUOTE_CHARS = new Set(["»", "”", "」", "』"]);
const SENTENCE_TERMINAL_KINDS = new Set<PunctuationKind>([
  "period",
  "question",
  "exclamation",
  "mixed",
]);

function scanQuoteState(value: string, initialActive = false) {
  let active = initialActive;
  let opened = false;
  let closed = false;
  let touched = initialActive;

  for (const char of value) {
    if (OPEN_QUOTE_CHARS.has(char)) {
      if (!active) opened = true;
      active = true;
      touched = true;
      continue;
    }
    if (CLOSE_QUOTE_CHARS.has(char)) {
      if (active) closed = true;
      active = false;
      touched = true;
      continue;
    }
    if (char === '"') {
      touched = true;
      if (active) {
        active = false;
        closed = true;
      } else {
        active = true;
        opened = true;
      }
    }
  }

  return { active, opened, closed, touched };
}

function isReportingText(text: string) {
  return REPORTING_VERB_PATTERN.test(normalize(text));
}

function hasOpenQuoteAtEnd(text: string) {
  return scanQuoteState(text, false).active;
}

'''
    if anchor not in omni:
        raise SystemExit('Quote helper insertion anchor not found')
    omni = omni.replace(anchor, block + anchor, 1)

# 4) Do not voluntarily cut an open long quotation at target-duration or paragraph boundaries.
old_safe = '''    const safeParagraphCut =
      paragraphBreak &&
      current.length >= Math.min(1800, maxChars * 0.28) &&
      current.length + 2 + incomingParagraphChars > maxChars;'''
new_safe = '''    const currentInsideQuote = current ? hasOpenQuoteAtEnd(current) : false;
    const safeParagraphCut =
      paragraphBreak &&
      !currentInsideQuote &&
      current.length >= Math.min(1800, maxChars * 0.28) &&
      current.length + 2 + incomingParagraphChars > maxChars;'''
if old_safe in omni:
    omni = omni.replace(old_safe, new_safe, 1)
elif 'const currentInsideQuote = current ? hasOpenQuoteAtEnd(current) : false;' not in omni:
    raise SystemExit('Quote-aware paragraph cut anchor not found')

old_split_if = '''      (safeParagraphCut || wouldOverflowChars || (goodCurrentSize && wouldOvershoot))'''
new_split_if = '''      (safeParagraphCut ||
        wouldOverflowChars ||
        (goodCurrentSize && wouldOvershoot && !currentInsideQuote))'''
if old_split_if in omni:
    omni = omni.replace(old_split_if, new_split_if, 1)
elif '(goodCurrentSize && wouldOvershoot && !currentInsideQuote)' not in omni:
    raise SystemExit('Quote-aware duration split anchor not found')

# 5) Consume closing quote/bracket marks with terminal punctuation so they cannot become empty prosody phrases.
old_token_punct = '''      if (/[.!?！？…—–]/u.test(char)) {
        while (text[end] === char || (/[!?！？]/u.test(char) && /[!?！？]/u.test(text[end] ?? ""))) {
          end += 1;
        }
      }
      tokens.push({ kind: "punct", value: text.slice(index, end) });'''
new_token_punct = '''      if (/[.!?！？…—–]/u.test(char)) {
        while (text[end] === char || (/[!?！？]/u.test(char) && /[!?！？]/u.test(text[end] ?? ""))) {
          end += 1;
        }
      }
      // Closing quotes belong to the punctuation boundary acoustically. If they
      // become their own text token, Edge can create a tiny silent prosody span.
      while (/[»”"'’」』）\\])}]/u.test(text[end] ?? "")) end += 1;
      tokens.push({ kind: "punct", value: text.slice(index, end) });'''
if old_token_punct in omni:
    omni = omni.replace(old_token_punct, new_token_punct, 1)
elif 'Closing quotes belong to the punctuation boundary acoustically.' not in omni:
    raise SystemExit('Tokenizer closing quote anchor not found')

# 6) Classify punctuation after stripping trailing closing quote/bracket marks.
old_punct_kind = '''function punctuationKind(value: string): PunctuationKind {
  if (!value) return "none";
  if (/^\\n{2,}$/u.test(value)) return "paragraph";
  if (/^\\n$/u.test(value)) return "newline";
  if (/^[，,]+$/u.test(value)) return "comma";
  if (/^[；;]+$/u.test(value)) return "semicolon";
  if (/^[：:]+$/u.test(value)) return "colon";
  if (/^[—–]+$/u.test(value)) return "dash";
  if (/^(?:…+|\\.{2,})$/u.test(value)) return "ellipsis";
  const question = /[?？]/u.test(value);
  const exclamation = /[!！]/u.test(value);
  if (question && exclamation) return "mixed";
  if (question) return "question";
  if (exclamation) return "exclamation";
  if (/^(?:。|\\.)+$/u.test(value)) return "period";
  return "none";
}'''
new_punct_kind = '''function punctuationKind(value: string): PunctuationKind {
  if (!value) return "none";
  const structural = value.replace(/[»”"'’」』）\\])}]+$/gu, "");
  if (/^\\n{2,}$/u.test(structural)) return "paragraph";
  if (/^\\n$/u.test(structural)) return "newline";
  if (/^[，,]+$/u.test(structural)) return "comma";
  if (/^[；;]+$/u.test(structural)) return "semicolon";
  if (/^[：:]+$/u.test(structural)) return "colon";
  if (/^[—–]+$/u.test(structural)) return "dash";
  if (/^(?:…+|\\.{2,})$/u.test(structural)) return "ellipsis";
  const question = /[?？]/u.test(structural);
  const exclamation = /[!！]/u.test(structural);
  if (question && exclamation) return "mixed";
  if (question) return "question";
  if (exclamation) return "exclamation";
  if (/^(?:。|\\.)+$/u.test(structural)) return "period";
  return "none";
}'''
if old_punct_kind in omni:
    omni = omni.replace(old_punct_kind, new_punct_kind, 1)
elif 'const structural = value.replace' not in omni:
    raise SystemExit('punctuationKind anchor not found')

# 7) Annotate explicit and colon/dash direct-speech spans.
if 'function annotateQuoteContinuity(phrases: Phrase[])' not in omni:
    anchor = '''function blendMicros(items: Array<{ micro: MicroProsody; weight: number }>) {'''
    block = r'''function annotateQuoteContinuity(phrases: Phrase[]) {
  const annotated = phrases.map((phrase) => ({ ...phrase }));
  let active = false;
  let spanStart = -1;

  for (let index = 0; index < annotated.length; index += 1) {
    const phrase = annotated[index];
    phrase.reportingLead = phrase.punctuationKind === "colon" && isReportingText(phrase.text);

    const before = active;
    const state = scanQuoteState(`${phrase.text}${phrase.punctuation}`, active);
    active = state.active;
    phrase.quoted = before || state.opened || state.touched;
    phrase.quoteStart = state.opened;
    phrase.quoteEnd = state.closed;

    if (state.opened && spanStart < 0) spanStart = index;
    if (spanStart >= 0 && (state.closed || index === annotated.length - 1)) {
      const end = index;
      const previous = annotated[spanStart - 1];
      const following = annotated[end + 1];
      const wordCount = annotated
        .slice(spanStart, end + 1)
        .reduce((sum, item) => sum + normalize(item.text).split(" ").filter(Boolean).length, 0);
      const likelyDirectSpeech =
        Boolean(previous?.reportingLead) ||
        Boolean(following && isReportingText(following.text)) ||
        end > spanStart ||
        wordCount >= 5;

      if (likelyDirectSpeech) {
        for (let cursor = spanStart; cursor <= end; cursor += 1) {
          annotated[cursor].directQuote = true;
        }
      }
      spanStart = -1;
    }
  }

  // Kazakh also allows author words + colon + dash without quotation marks.
  // Treat the following paragraph as one quoted/reported voice turn, but keep
  // the same speaker identity and only adjust continuity, never change voice.
  for (let index = 1; index < annotated.length; index += 1) {
    if (!annotated[index - 1].reportingLead || annotated[index].directQuote) continue;
    let end = index;
    for (let cursor = index; cursor < annotated.length; cursor += 1) {
      if (cursor > index && isReportingText(annotated[cursor].text)) break;
      annotated[cursor].directQuote = true;
      if (cursor === index) annotated[cursor].quoteStart = true;
      end = cursor;
      if (["paragraph", "newline"].includes(annotated[cursor].punctuationKind)) break;
      if (cursor - index >= 7) break;
    }
    annotated[end].quoteEnd = true;
    index = end;
  }

  return annotated;
}

function applyDirectQuoteContinuity(phrases: Phrase[]) {
  return phrases.map((phrase) => {
    if (!phrase.directQuote) return phrase;
    let rateFactor = phrase.micro.rateFactor;
    let pitchDelta = phrase.micro.pitchDelta;
    let volumeDelta = phrase.micro.volumeDelta;

    if (phrase.quoteStart) {
      rateFactor *= 0.999;
      volumeDelta += 0.004;
    }

    // Internal quote sentences should sound like a continued turn rather than
    // a fresh broadcast sentence. Keep punctuation audible, but reduce finality.
    if (SENTENCE_TERMINAL_KINDS.has(phrase.punctuationKind) && !phrase.quoteEnd) {
      rateFactor = 1 + (rateFactor - 1) * 0.94;
      pitchDelta *= 0.72;
      volumeDelta *= 0.97;
    }

    return {
      ...phrase,
      micro: {
        rateFactor: clamp(rateFactor, 0.95, 1.03),
        pitchDelta: clamp(pitchDelta, -0.18, 0.18),
        volumeDelta: clamp(volumeDelta, -0.12, 0.2),
      },
    };
  });
}

'''
    if anchor not in omni:
        raise SystemExit('Quote annotation insertion anchor not found')
    omni = omni.replace(anchor, block + anchor, 1)

# 8) Put quote annotation + continuity into the live render pipeline.
old_pipeline = '''  const phrases = applyLogicalFocusContrast(bidirectionalSmooth(buildPhrases(text, plan)));'''
new_pipeline = '''  const phrases = applyDirectQuoteContinuity(
    applyLogicalFocusContrast(bidirectionalSmooth(annotateQuoteContinuity(buildPhrases(text, plan)))),
  );'''
if old_pipeline in omni:
    omni = omni.replace(old_pipeline, new_pipeline, 1)
elif 'applyDirectQuoteContinuity(' not in omni:
    raise SystemExit('Live quote pipeline anchor not found')

# 9) Avoid ordinary sentence-reset grouping while staying inside the same direct quote.
old_group = '''    const roleChanged = previous.segment?.role !== phrase.segment?.role;
    const strongRoleBoundary = roleChanged &&
      (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));
    const previousFocus = logicalFocusScore(previous);
    const incomingFocus = logicalFocusScore(phrase);
    // Keep strong focus sparse but audible: isolate only high-confidence focus
    // targets instead of averaging them into a long neutral prosody span.
    const strongFocusBoundary =
      (incomingFocus >= 0.72 && previousFocus < 0.55) ||
      (previousFocus >= 0.72 && incomingFocus < 0.55);
    const hardBoundary = ["paragraph", "newline"].includes(previous.punctuationKind);
    const tooDifferent = microDistance(currentAverage, phrase.micro) > 2.35;
    const sentenceBoundary = ["period", "question", "exclamation", "mixed"].includes(
      previous.punctuationKind,
    );
    const tempoBoundary =
      sentenceBoundary && Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;
    const tooLong = current.length >= 6;'''
new_group = '''    const sameDirectQuote = Boolean(previous.directQuote && phrase.directQuote);
    const reportingBridge = Boolean(
      previous.reportingLead && phrase.directQuote && phrase.quoteStart,
    );
    const roleChanged = previous.segment?.role !== phrase.segment?.role;
    const strongRoleBoundary =
      !sameDirectQuote &&
      !reportingBridge &&
      roleChanged &&
      (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));
    const previousFocus = logicalFocusScore(previous);
    const incomingFocus = logicalFocusScore(phrase);
    // Keep strong focus sparse but audible. A reporting-colon bridge is not a
    // speaker reset, so do not isolate the opening quote merely for newness.
    const strongFocusBoundary =
      !reportingBridge &&
      ((incomingFocus >= 0.72 && previousFocus < 0.55) ||
        (previousFocus >= 0.72 && incomingFocus < 0.55));
    const hardBoundary = ["paragraph", "newline"].includes(previous.punctuationKind);
    const tooDifferent =
      microDistance(currentAverage, phrase.micro) > (sameDirectQuote || reportingBridge ? 2.8 : 2.35);
    const sentenceBoundary = ["period", "question", "exclamation", "mixed"].includes(
      previous.punctuationKind,
    );
    const tempoBoundary =
      sentenceBoundary &&
      !sameDirectQuote &&
      !reportingBridge &&
      Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;
    const tooLong = current.length >= (sameDirectQuote ? 9 : 6);'''
if old_group in omni:
    omni = omni.replace(old_group, new_group, 1)
elif 'const sameDirectQuote = Boolean(previous.directQuote && phrase.directQuote);' not in omni:
    raise SystemExit('Quote grouping anchor not found')

if natural == natural_original:
    raise SystemExit('No edge-natural-structure changes made')
if omni == omni_original:
    raise SystemExit('No edge-omnivoice-inspired changes made')

natural_path.write_text(natural, encoding='utf-8')
omni_path.write_text(omni, encoding='utf-8')
