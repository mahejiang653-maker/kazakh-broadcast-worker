from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text(encoding='utf-8')

old = '''function logicalFocusScore(phrase: Phrase) {
  const role = phrase.segment?.role;
  let score = 0;

  if (role === "key_number") score += 0.95;
  else if (role === "climax") score += 0.9;
  else if (role === "title") score += 0.35;

  if (startsWithCue(phrase.text, FOCUS_CUES)) score += 0.62;
  if (startsWithCue(phrase.text, RESULT_CUES)) score += 0.24;
  if ((phrase.segment?.importance ?? 0) >= 0.78) score += 0.22;

  return clamp(score, 0, 1);
}'''

new = '''function hasNumericFocusAnchor(text: string) {
  const value = normalize(text);
  return /(?:\\d|пайыз|процент|мың|миллион|миллиард|триллион|теңге|доллар|еуро|юань|адам|километр|метр|тонна|килограмм|гектар|градус|мегаватт|гигаватт|киловатт|гигабайт|терабайт|герц)/u.test(value);
}

function logicalFocusScore(phrase: Phrase) {
  const role = phrase.segment?.role;
  let score = 0;

  // A sentence can be classified as key_number because of one figure. Only the
  // phrase that actually carries a numeric/unit anchor gets strong prominence.
  if (role === "key_number") score += hasNumericFocusAnchor(phrase.text) ? 0.95 : 0.18;
  else if (role === "climax") score += 0.62;
  else if (role === "title") score += 0.3;

  if (startsWithCue(phrase.text, FOCUS_CUES)) score += 0.62;
  if (startsWithCue(phrase.text, RESULT_CUES)) score += 0.24;
  if ((phrase.segment?.importance ?? 0) >= 0.78) score += 0.18;

  return clamp(score, 0, 1);
}'''

if old not in text:
    if 'function hasNumericFocusAnchor(text: string)' in text:
        raise SystemExit('Logical focus refinement already applied.')
    raise SystemExit('Logical focus refinement anchor not found.')

path.write_text(text.replace(old, new, 1), encoding='utf-8')
