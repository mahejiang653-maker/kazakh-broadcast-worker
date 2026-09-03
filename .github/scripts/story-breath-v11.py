from pathlib import Path
import re

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
omni = omni_path.read_text()

pattern = re.compile(r'function acousticPunctuation\(phrase: Phrase\) \{[\s\S]*?\n}\n\nfunction semanticBreak\(')
replacement = r'''function acousticPunctuation(
  phrase: Phrase,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  const strength = phrase.boundaryStrength ?? baseBoundaryStrength(phrase.punctuationKind);
  const kind = phrase.punctuationKind;

  // Sentence-mode marks always stay audible. They carry real intonation, not
  // merely layout timing.
  if (["question", "exclamation", "mixed", "ellipsis"].includes(kind)) {
    return phrase.punctuation;
  }

  if (["paragraph", "newline", "none"].includes(kind)) return "";

  // Story V11: punctuation is selective. Strong semantic punctuation is left to
  // the neural voice, while weak punctuation is suppressed and replaced later
  // by a much shorter in-stream breath. This avoids both sentence-by-sentence
  // restarting and the unnatural "whole paragraph in one breath" result.
  if (deliveryMode === "story") {
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
    if (kind === "comma") {
      return strength >= 0.36 && (clean.length >= 34 || words >= 7) ? phrase.punctuation : "";
    }
    if (kind === "period") {
      return strength >= 0.5 ? phrase.punctuation : closingPunctuationSuffix(phrase.punctuation);
    }
    if (kind === "semicolon") return strength >= 0.4 ? phrase.punctuation : "";
    if (kind === "colon") {
      return phrase.reportingLead || strength >= 0.37 ? phrase.punctuation : "";
    }
    if (kind === "dash") return strength >= 0.42 ? phrase.punctuation : "";
  }

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

function semanticBreak('''
omni, count = pattern.subn(replacement, omni, count=1)
assert count == 1, f'acousticPunctuation replacement count={count}'

old = '''  // Story V10: do not add hidden micro-pauses between ordinary semantic phrases.
  // If punctuation is audible, the neural voice handles its timing. If weak
  // punctuation was suppressed, keep the acoustic stream continuous. Only a
  // very strong true paragraph boundary may receive a tiny breath.
  if (deliveryMode === "story") {
    if (punctuationRendered) return 0;
    if (kind === "paragraph") return strength >= 0.82 ? 24 : 0;
    return 0;
  }
'''
new = '''  // Story V11: human breathing sits between the two previous extremes. Keep one
  // acoustic/prosody stream, but allow tiny breaths after completed semantic
  // units. These are intentionally much shorter than sentence pauses. Boundary
  // strength already includes Kazakh dependency protection, so modifier-head,
  // subject-predicate, number-unit and name-title zones remain unbroken.
  if (deliveryMode === "story") {
    if (punctuationRendered) return 0;
    const clean = phrase.text.trim();
    const words = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
    const enoughSpeech = clean.length >= 28 || words >= 6;

    if (kind === "paragraph") {
      return strength >= 0.68 ? Math.round(42 + strength * 34) : 0;
    }
    if (!enoughSpeech) return 0;
    if (kind === "newline" && strength >= 0.3) {
      return Math.round(12 + strength * 28);
    }
    if (kind === "period" && strength >= 0.3) {
      return Math.round(15 + strength * 34);
    }
    if (kind === "comma" && strength >= 0.26 && (clean.length >= 42 || words >= 8)) {
      return Math.round(8 + strength * 24);
    }
    if (["semicolon", "colon", "dash"].includes(kind) && strength >= 0.28) {
      return Math.round(11 + strength * 28);
    }
    return 0;
  }
'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''  // Story V10: long-form story flow is more natural when Edge keeps one acoustic
  // stream. Do not add 16ms syntagma breaks inside punctuation-free story text;
  // word-level emotion analysis still affects the broad delivery vector.
  if (deliveryMode === "story") return renderText(text);
'''
new = '''  // Story V11: keep long acoustic continuity but reintroduce sparse, dependency-
  // safe breathing inside genuinely long punctuation-free clauses. This is not
  // a prosody reset: the short break remains inside the same rendered group.
  if (deliveryMode === "story") {
    const clean = text.trim();
    const wordCount = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
    if (clean.length < 112 || wordCount < 18) return renderText(text);

    SOFT_SYNTAGMA_PATTERN.lastIndex = 0;
    let output = "";
    let cursor = 0;
    let lastBoundary = -1000;
    let inserted = 0;
    const maxBreaths = clean.length >= 270 || wordCount >= 40 ? 2 : 1;
    let match: RegExpExecArray | null;

    while ((match = SOFT_SYNTAGMA_PATTERN.exec(text)) && inserted < maxBreaths) {
      const boundary = match.index;
      const left = text.slice(cursor, boundary).trim();
      const right = text.slice(boundary).trim();
      if (left.length < 54 || right.length < 34 || boundary - lastBoundary < 72) continue;
      const dependency = kazakhDependencyGuard(left, right);
      if (dependency.score >= 0.55) continue;

      output += renderText(text.slice(cursor, boundary));
      output += `<break time="${clean.length >= 220 ? 30 : 24}ms"/>`;
      cursor = boundary;
      lastBoundary = boundary;
      inserted += 1;
    }

    if (!inserted) return renderText(text);
    output += renderText(text.slice(cursor));
    return output;
  }
'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '    const renderedPunctuation = acousticPunctuation(item);'
new = '    const renderedPunctuation = acousticPunctuation(item, settings.deliveryMode);'
assert old in omni
omni = omni.replace(old, new, 1)
omni_path.write_text(omni)

page_path = Path('app/page.tsx')
page = page_path.read_text()
old = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 长句连续 · 真人旁白", rateFactor: 1 },'
new = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 自然呼吸 · 真人旁白", rateFactor: 1 },'
assert old in page
page = page.replace(old, new, 1)
page_path.write_text(page)
