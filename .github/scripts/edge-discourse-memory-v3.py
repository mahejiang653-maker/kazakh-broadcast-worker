from pathlib import Path

files = {
    'app/lib/edge-director.ts': Path('app/lib/edge-director.ts'),
    'app/lib/edge-omnivoice-inspired.ts': Path('app/lib/edge-omnivoice-inspired.ts'),
}

director = files['app/lib/edge-director.ts'].read_text(encoding='utf-8')
omni = files['app/lib/edge-omnivoice-inspired.ts'].read_text(encoding='utf-8')
director_original = director
omni_original = omni

# 1) Persist conservative discourse-new / discourse-given signals in the document plan.
old_type = '''export type EdgePlannedSegment = {
  index: number;
  paragraphIndex: number;
  normalized: string;
  role: EdgeDocumentRole;
  progress: number;
  importance: number;
  numericScore: number;
  impactScore: number;
};'''
new_type = '''export type EdgePlannedSegment = {
  index: number;
  paragraphIndex: number;
  normalized: string;
  role: EdgeDocumentRole;
  progress: number;
  importance: number;
  numericScore: number;
  impactScore: number;
  noveltyScore: number;
  repetitionScore: number;
};'''
if old_type in director:
    director = director.replace(old_type, new_type, 1)
elif 'noveltyScore: number;' not in director:
    raise SystemExit('EdgePlannedSegment type anchor not found')

if 'function discourseSignals(units: AnalyzedUnit[])' not in director:
    anchor = 'function isLikelyTitle(unit: AnalyzedUnit, totalUnits: number) {'
    block = r'''const DISCOURSE_STOPWORDS = new Set([
  "және", "мен", "пен", "бен", "да", "де", "та", "те", "бұл", "сол", "осы",
  "бір", "екі", "үшін", "туралы", "бойынша", "кейін", "дейін", "тағы", "ғана",
  "ретінде", "болды", "болып", "бар", "жоқ", "деп", "деді", "екен", "оның",
  "олар", "ол", "ал", "әрі", "сондай", "сондай-ақ", "the", "and", "that", "with",
  "from", "this", "have", "has", "was", "were", "for", "but", "not", "only",
]);

function discourseContentKeys(text: string) {
  const normalized = normalizeForAnalysis(text);
  const keys = new Set<string>();
  for (const match of normalized.matchAll(/[\p{L}]{4,}/gu)) {
    const value = match[0];
    if (!DISCOURSE_STOPWORDS.has(value)) keys.add(value);
  }
  for (const match of text.matchAll(/[\u3400-\u9fff]{2,8}/gu)) keys.add(match[0]);
  return keys;
}

function discourseEntityKeys(text: string) {
  const keys = new Set<string>();
  const multiName = /(?:^|\s)([A-ZА-ЯӘҒҚҢӨҰҮҺІ][\p{L}'’.-]{2,}(?:\s+[A-ZА-ЯӘҒҚҢӨҰҮҺІ][\p{L}'’.-]{2,})+)(?=\s|[,，.:;!?]|$)/gu;
  const acronym = /(?:^|\s)([A-ZА-ЯӘҒҚҢӨҰҮҺІ]{2,8})(?=\s|[,，.:;!?]|$)/gu;
  for (const match of text.matchAll(multiName)) keys.add(normalizeForAnalysis(match[1]));
  for (const match of text.matchAll(acronym)) keys.add(match[1].toLowerCase());
  for (const match of text.matchAll(/[\u3400-\u9fff]{2,8}/gu)) keys.add(match[0]);
  return keys;
}

function setOverlapRatio(current: Set<string>, recent: Set<string>) {
  if (!current.size || !recent.size) return 0;
  let overlap = 0;
  for (const key of current) if (recent.has(key)) overlap += 1;
  return overlap / Math.max(1, current.size);
}

function discourseSignals(units: AnalyzedUnit[]) {
  const seenEntities = new Set<string>();
  const recentBuckets: Set<string>[] = [];

  return units.map((unit) => {
    const keys = discourseContentKeys(unit.text);
    const entities = discourseEntityKeys(unit.text);
    const recent = new Set<string>();
    for (const bucket of recentBuckets) for (const key of bucket) recent.add(key);

    const overlap = setOverlapRatio(keys, recent);
    let unseenEntities = 0;
    for (const entity of entities) if (!seenEntities.has(entity)) unseenEntities += 1;
    const entityNovelty = entities.size ? unseenEntities / entities.size : 0;
    const topicShift = keys.size >= 4 ? 1 - overlap : 0;
    const hasKeyNumber = numericScore(unit.text) >= 0.9;

    // Newness is intentionally conservative. A first entity/topic shift is a
    // small prominence hint, never a license to accent every unseen word.
    const noveltyScore = clamp(
      entityNovelty * 0.55 +
        (topicShift >= 0.72 ? 0.2 : topicShift * 0.1) +
        (hasKeyNumber ? 0.08 : 0),
      0,
      1,
    );

    // Repetition only becomes strong when lexical overlap is high. Background
    // cues make it more likely that the sentence is genuinely recap material.
    const backgroundBoost = containsCue(unit.text, BACKGROUND_CUES) ? 1.12 : 0.72;
    const repetitionScore = clamp(overlap * backgroundBoost, 0, 1);

    for (const entity of entities) seenEntities.add(entity);
    recentBuckets.push(keys);
    if (recentBuckets.length > 2) recentBuckets.shift();

    return { noveltyScore, repetitionScore };
  });
}

'''
    if anchor not in director:
        raise SystemExit('isLikelyTitle anchor not found')
    director = director.replace(anchor, block + anchor, 1)

old_segments_start = '''  const segments = units.map((unit) => {
    const progress = units.length <= 1 ? 0.5 : unit.index / (units.length - 1);'''
new_segments_start = '''  const discourse = discourseSignals(units);
  const segments = units.map((unit) => {
    const progress = units.length <= 1 ? 0.5 : unit.index / (units.length - 1);'''
if old_segments_start in director:
    director = director.replace(old_segments_start, new_segments_start, 1)
elif 'const discourse = discourseSignals(units);' not in director:
    raise SystemExit('segments start anchor not found')

old_segment_tail = '''      importance: roleImportance(role, numeric, impact),
      numericScore: numeric,
      impactScore: impact,
    };'''
new_segment_tail = '''      importance: roleImportance(role, numeric, impact),
      numericScore: numeric,
      impactScore: impact,
      noveltyScore: discourse[unit.index]?.noveltyScore ?? 0,
      repetitionScore: discourse[unit.index]?.repetitionScore ?? 0,
    };'''
if old_segment_tail in director:
    director = director.replace(old_segment_tail, new_segment_tail, 1)
elif 'noveltyScore: discourse[unit.index]?.noveltyScore ?? 0' not in director:
    raise SystemExit('segment return anchor not found')

# 2) Use discourse memory as a tiny modifier inside the live logical-focus layer.
old_focus_tail = '''  score += negationFocusStrength(phrase);
  if (EXCLUSIVE_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.34;
  if (CORRECTION_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.46;
  if (role !== "background" && hasEntityActionAnchor(phrase.text)) score += role === "lead" ? 0.28 : 0.2;

  if (startsWithCue(phrase.text, FOCUS_CUES)) score += 0.62;'''
new_focus_tail = '''  score += negationFocusStrength(phrase);
  if (EXCLUSIVE_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.34;
  if (CORRECTION_FOCUS_PATTERN.test(normalize(phrase.text))) score += 0.46;
  if (role !== "background" && hasEntityActionAnchor(phrase.text)) score += role === "lead" ? 0.28 : 0.2;

  const novelty = phrase.segment?.noveltyScore ?? 0;
  const repetition = phrase.segment?.repetitionScore ?? 0;
  if (role !== "background" && novelty >= 0.55) score += 0.12 * novelty;
  if (role === "background" && repetition >= 0.55) score -= 0.1 * repetition;

  if (startsWithCue(phrase.text, FOCUS_CUES)) score += 0.62;'''
if old_focus_tail in omni:
    omni = omni.replace(old_focus_tail, new_focus_tail, 1)
elif 'const novelty = phrase.segment?.noveltyScore ?? 0;' not in omni:
    raise SystemExit('logical focus discourse anchor not found')

old_micro_start = '''    let rateFactor = phrase.micro.rateFactor;
    let pitchDelta = phrase.micro.pitchDelta;
    let volumeDelta = phrase.micro.volumeDelta;

    // Kazakh logical prominence is phrase-based.'''
new_micro_start = '''    let rateFactor = phrase.micro.rateFactor;
    let pitchDelta = phrase.micro.pitchDelta;
    let volumeDelta = phrase.micro.volumeDelta;
    const novelty = phrase.segment?.noveltyScore ?? 0;
    const repetition = phrase.segment?.repetitionScore ?? 0;

    // Discourse memory is much weaker than explicit focus. It gently lifts new
    // material and relaxes highly repeated recap material without assuming that
    // every repeated mention must be deaccented.
    if (phrase.segment?.role !== "background" && novelty >= 0.55) {
      rateFactor *= 1 - 0.0028 * novelty;
      volumeDelta += 0.008 * novelty;
    }
    if (phrase.segment?.role === "background" && repetition >= 0.55) {
      rateFactor *= 1 + 0.0022 * repetition;
      volumeDelta -= 0.006 * repetition;
    }

    // Kazakh logical prominence is phrase-based.'''
if old_micro_start in omni:
    omni = omni.replace(old_micro_start, new_micro_start, 1)
elif 'Discourse memory is much weaker than explicit focus.' not in omni:
    raise SystemExit('micro discourse anchor not found')

if director == director_original:
    raise SystemExit('No edge-director changes were made')
if omni == omni_original:
    raise SystemExit('No edge-omnivoice changes were made')

files['app/lib/edge-director.ts'].write_text(director, encoding='utf-8')
files['app/lib/edge-omnivoice-inspired.ts'].write_text(omni, encoding='utf-8')
