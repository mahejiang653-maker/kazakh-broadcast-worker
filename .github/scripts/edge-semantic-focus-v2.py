from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text(encoding='utf-8')
original = text

old = '''function hasNumericFocusAnchor(text: string) {
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

new = '''function hasNumericFocusAnchor(text: string) {
  const value = normalize(text);
  return /(?:\\d|пайыз|процент|мың|миллион|миллиард|триллион|теңге|доллар|еуро|юань|адам|километр|метр|тонна|килограмм|гектар|градус|мегаватт|гигаватт|киловатт|гигабайт|терабайт|герц)/u.test(value);
}

const NEGATIVE_WORD_PATTERN =
  /(?:^|\\s)(?:емес|жоқ|мүмкін емес|орын алған жоқ|расталған жоқ|анықталған жоқ)(?:\\s|$)|(?:不是|并非|没有|不会|不能|尚未|未曾)|(?:^|\\s)(?:not|never|no longer)(?:\\s|$)/iu;
const NEGATIVE_SUFFIX_PATTERN =
  /[\\p{L}]{2,}(?:майды|мейді|байды|бейді|пайды|пейді|мады|меді|бады|беді|пады|педі|маған|меген|баған|беген|паған|пеген|мас|мес|бас|бес|пас|пес)(?![\\p{L}\\p{N}])/iu;
const EXCLUSIVE_FOCUS_PATTERN =
  /(?:^|\\s)(?:тек қана|тек|небәрі|бар болғаны|ғана|қана)(?:\\s|$)|(?:仅|仅仅|只|只有)|(?:^|\\s)only(?:\\s|$)/iu;
const CORRECTION_FOCUS_PATTERN =
  /(?:^|\\s)(?:керісінше|шын мәнінде|дұрысы|қайта)(?:\\s|$)|(?:而是|相反|实际上|反而)|(?:^|\\s)(?:rather|instead)(?:\\s|$)/iu;
const ENTITY_ROLE_PATTERN =
  /(?:министрлігі|үкіметі|комитеті|мекемесі|агенттігі|әкімдігі|парламенті|президенті|төрағасы|армиясы|соты|полициясы|компаниясы|министр|президент|төраға|政府|公司|集团|委员会|法院|军方|总统|主席|部长)/iu;
const ENTITY_NAME_PATTERN =
  /(?:^|\\s)(?:[A-ZА-ЯӘҒҚҢӨҰҮҺІ][\\p{L}'’.-]{2,})(?:\\s+[A-ZА-ЯӘҒҚҢӨҰҮҺІ][\\p{L}'’.-]{2,})+(?=\\s|[,，]|$)/u;
const ACTION_FOCUS_CUES = [
  "мәлімдеді", "хабарлады", "растады", "жариялады", "бекітті", "қабылдады",
  "қол қойды", "іске қосты", "бастады", "тоқтатты", "жіберді", "аттандырды",
  "жетті", "қаза тапты", "жараланды", "宣布", "表示", "证实", "公布", "批准",
  "通过", "签署", "启动", "开始", "停止", "发射", "抵达", "袭击", "击中", "死亡",
  "受伤", "announced", "confirmed", "signed", "approved", "launched", "started", "stopped",
];

function negationFocusStrength(phrase: Phrase) {
  const value = normalize(phrase.text);
  let strength = NEGATIVE_WORD_PATTERN.test(value)
    ? 0.56
    : NEGATIVE_SUFFIX_PATTERN.test(value)
      ? 0.42
      : 0;
  // Confirmation questions such as "емес пе?" should not sound like a denial.
  if (phrase.punctuationKind === "question") strength *= 0.55;
  return strength;
}

function hasEntityActionAnchor(text: string) {
  const normalized = normalize(text);
  const hasEntity = ENTITY_ROLE_PATTERN.test(text) || ENTITY_NAME_PATTERN.test(text);
  const hasAction = ACTION_FOCUS_CUES.some((cue) => normalized.includes(cue));
  return hasEntity && hasAction;
}

function logicalFocusScore(phrase: Phrase) {
  const role = phrase.segment?.role;
  let score = 0;

  // A sentence can be classified as key_number because of one figure. Only the
  // phrase that actually carries a numeric/unit anchor gets strong prominence.
  if (role === "key_number") score += hasNumericFocusAnchor(phrase.text) ? 0.95 : 0.18;
  else if (role === "climax") score += 0.62;
  else if (role === "title") score += 0.3;

  score += negationFocusStrength(phrase);
  if (EXCLUSIVE_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.34;
  if (CORRECTION_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.46;
  if (role !== "background" && hasEntityActionAnchor(phrase.text)) score += role === "lead" ? 0.28 : 0.2;

  if (startsWithCue(phrase.text, FOCUS_CUES)) score += 0.62;
  if (startsWithCue(phrase.text, RESULT_CUES)) score += 0.24;
  if ((phrase.segment?.importance ?? 0) >= 0.78) score += 0.18;

  return clamp(score, 0, 1);
}'''

if old not in text:
    if 'function negationFocusStrength(phrase: Phrase)' not in text:
        raise SystemExit('Semantic focus helper anchor not found.')
else:
    text = text.replace(old, new, 1)

old_loop = '''  for (const phrase of phrases) {
    if (!current.length) {
      current.push(phrase);
      continue;
    }

    const previous = current[current.length - 1];
    const currentAverage = blendMicros(current.map((item) => ({ micro: item.micro, weight: 1 })));
    const roleChanged = previous.segment?.role !== phrase.segment?.role;
    const strongRoleBoundary = roleChanged &&
      (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));
    const hardBoundary = ["paragraph", "newline"].includes(previous.punctuationKind);
    const tooDifferent = microDistance(currentAverage, phrase.micro) > 2.35;
    const sentenceBoundary = ["period", "question", "exclamation", "mixed"].includes(
      previous.punctuationKind,
    );
    const tempoBoundary =
      sentenceBoundary && Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;
    const tooLong = current.length >= 6;

    if (hardBoundary || strongRoleBoundary || tempoBoundary || tooDifferent || tooLong) flush();
    current.push(phrase);
  }'''

new_loop = '''  for (const phrase of phrases) {
    if (!current.length) {
      current.push(phrase);
      continue;
    }

    const previous = current[current.length - 1];
    const currentAverage = blendMicros(current.map((item) => ({ micro: item.micro, weight: 1 })));
    const roleChanged = previous.segment?.role !== phrase.segment?.role;
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
    const tooLong = current.length >= 6;

    if (
      hardBoundary ||
      strongRoleBoundary ||
      strongFocusBoundary ||
      tempoBoundary ||
      tooDifferent ||
      tooLong
    ) flush();
    current.push(phrase);
  }'''

if old_loop not in text:
    if 'const strongFocusBoundary =' not in text:
        raise SystemExit('Focus grouping loop anchor not found.')
else:
    text = text.replace(old_loop, new_loop, 1)

if text == original:
    raise SystemExit('Semantic focus V2 already applied or no changes made.')
path.write_text(text, encoding='utf-8')
