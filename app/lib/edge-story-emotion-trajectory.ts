export type StoryEmotionKind =
  | "neutral"
  | "joy"
  | "sadness"
  | "fear"
  | "anger"
  | "surprise"
  | "tender"
  | "suspense"
  | "relief"
  | "determination"
  | "humor"
  | "shame";

export type StoryEmotionSpan = {
  text: string;
  start: number;
  end: number;
  emotion: StoryEmotionKind;
  intensity: number;
  evidenceCount: number;
  rateFactor: number;
  pitchDelta: number;
  volumeDelta: number;
};

export type StoryEmotionTrajectory = {
  tokenCount: number;
  evidenceCount: number;
  dominantEmotion: StoryEmotionKind;
  volatility: number;
  spans: StoryEmotionSpan[];
};

type Token = {
  value: string;
  normalized: string;
  start: number;
  end: number;
};

type EmotionScore = {
  emotion: StoryEmotionKind;
  weight: number;
};

const EMOTION_ROOTS: Record<Exclude<StoryEmotionKind, "neutral">, string[]> = {
  joy: [
    "қуаныш", "қуант", "күл", "жыми", "шат", "бақыт", "сүйін", "мәз", "риза", "жеңіс",
    "сәтті", "керемет", "тамаша", "сүйсін", "мақтан", "үміт", "арман",
  ],
  sadness: [
    "қайғы", "мұң", "жыла", "еңір", "өкініш", "жалғыз", "қимай", "аяныш", "қаза", "өлім",
    "қайтыс", "айырыл", "жоғалт", "ренжі", "жара", "сор", "көзжас", "күйзел",
  ],
  fear: [
    "қорық", "үрей", "шош", "сескен", "қобалж", "діріл", "зәре", "қауіп", "қорқыныш",
    "абыржы", "жалтақ", "тығыл", "қаш", "шошын",
  ],
  anger: [
    "ашу", "ашулан", "ыза", "ызалан", "қаһар", "долдан", "кек", "өш", "ұрыс", "айғай",
    "айқай", "ақыр", "жеккөр", "тістен", "қатулан", "нараз",
  ],
  surprise: [
    "таңғал", "таңқал", "күтпеген", "кенет", "ғажап", "аңтаң", "сенб", "апыр", "мәссаған",
    "сөйтсе", "ойламаған",
  ],
  tender: [
    "мейір", "жылы", "нәзік", "ақырын", "жұмсақ", "құшақ", "аяла", "еркелет", "сүйіспен",
    "жанашыр", "маңдай", "еркел", "қамқор",
  ],
  suspense: [
    "үнсіз", "сыбыр", "қараңғы", "құпия", "аңды", "түн", "күдік", "сезікт", "тыңда", "күт",
    "белгісіз", "жасыр", "біркезде", "солсәт", "дәлсол",
  ],
  relief: [
    "жеңілде", "аман", "құтыл", "тыныш", "сабыр", "шүкір", "қауіпсіз", "жайлан", "демал",
  ],
  determination: [
    "батыл", "берік", "шеш", "міндет", "тиіс", "керек", "ант", "қайсар", "тәуекел", "нақты",
    "міндетті", "күрес", "талпын",
  ],
  humor: [
    "әзіл", "қалжың", "күлкі", "мысқыл", "келемеж", "қу", "әжуа", "жымың", "мазақ",
  ],
  shame: [
    "ұял", "қысыл", "масқара", "ұят", "сас", "ыңғайсыз", "кінә", "өкін",
  ],
};

const INTENSIFIERS = new Set([
  "өте", "тым", "аса", "қатты", "мүлде", "тіпті", "әбден", "ерекше", "соншалық", "сонша",
]);
const SOFTENERS = new Set(["сәл", "аздап", "біршама", "жай", "әрең", "ақырын"]);
const TURN_WORDS = new Set([
  "бірақ", "алайда", "дегенмен", "керісінше", "кенет", "сөйтсе", "ақыры", "сөйтіп", "сонда",
  "осылайша", "біркезде", "енді",
]);
const NEGATION_WORDS = new Set(["емес", "жоқ", "еш", "ешқашан"]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeWord(value: string) {
  return value.toLowerCase().replace(/[’']/gu, "").trim();
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    tokens.push({
      value: match[0],
      normalized: normalizeWord(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

function isMorphologicallyNegated(word: string) {
  return /(?:мады|меді|бады|беді|пады|педі|майды|мейді|байды|бейді|пайды|пейді|маған|меген|баған|беген|паған|пеген|мас|мес|бас|бес|пас|пес)$/u.test(word);
}

function wordEmotion(word: string): EmotionScore | null {
  let best: EmotionScore | null = null;
  for (const [emotion, roots] of Object.entries(EMOTION_ROOTS) as Array<[
    Exclude<StoryEmotionKind, "neutral">,
    string[],
  ]>) {
    for (const root of roots) {
      if (word === root || word.startsWith(root) || (root.length >= 5 && word.includes(root))) {
        const specificity = clamp(root.length / Math.max(5, word.length), 0.62, 1);
        const score = { emotion, weight: 0.72 + specificity * 0.38 };
        if (!best || score.weight > best.weight) best = score;
      }
    }
  }
  return best;
}

function baseProsody(emotion: StoryEmotionKind) {
  switch (emotion) {
    case "joy": return { rateFactor: 1.024, pitchDelta: 0.8, volumeDelta: 0.42 };
    case "sadness": return { rateFactor: 0.958, pitchDelta: -1.15, volumeDelta: -0.7 };
    case "fear": return { rateFactor: 0.972, pitchDelta: 0.48, volumeDelta: -0.38 };
    case "anger": return { rateFactor: 1.034, pitchDelta: 1.05, volumeDelta: 0.78 };
    case "surprise": return { rateFactor: 0.987, pitchDelta: 1.18, volumeDelta: 0.36 };
    case "tender": return { rateFactor: 0.976, pitchDelta: 0.46, volumeDelta: -0.48 };
    case "suspense": return { rateFactor: 0.966, pitchDelta: -0.58, volumeDelta: -0.5 };
    case "relief": return { rateFactor: 0.986, pitchDelta: -0.18, volumeDelta: -0.12 };
    case "determination": return { rateFactor: 1.012, pitchDelta: 0.28, volumeDelta: 0.38 };
    case "humor": return { rateFactor: 1.02, pitchDelta: 0.72, volumeDelta: 0.32 };
    case "shame": return { rateFactor: 0.968, pitchDelta: -0.52, volumeDelta: -0.46 };
    default: return { rateFactor: 1.006, pitchDelta: 0.14, volumeDelta: 0.05 };
  }
}

function emotionForRange(
  text: string,
  start: number,
  end: number,
  tokens: Token[],
): { emotion: StoryEmotionKind; intensity: number; evidenceCount: number } {
  const scores = new Map<StoryEmotionKind, number>();
  let evidenceCount = 0;
  let modifier = 1;
  let previousNegation = false;

  for (const token of tokens) {
    if (token.start < start || token.end > end) continue;
    const word = token.normalized;

    if (INTENSIFIERS.has(word)) {
      modifier = Math.max(modifier, 1.28);
      continue;
    }
    if (SOFTENERS.has(word)) {
      modifier = Math.min(modifier, 0.76);
      continue;
    }
    if (NEGATION_WORDS.has(word)) {
      previousNegation = true;
      continue;
    }

    const evidence = wordEmotion(word);
    if (!evidence) {
      modifier += (1 - modifier) * 0.55;
      previousNegation = false;
      continue;
    }

    let weight = evidence.weight * modifier;
    if (previousNegation || isMorphologicallyNegated(word)) weight *= 0.34;
    scores.set(evidence.emotion, (scores.get(evidence.emotion) ?? 0) + weight);
    evidenceCount += 1;
    modifier = 1;
    previousNegation = false;
  }

  const slice = text.slice(start, end);
  if (/[!！]/u.test(slice)) {
    for (const [emotion, score] of scores) scores.set(emotion, score * 1.12);
  }
  if (/…|\.\.\./u.test(slice)) {
    scores.set("suspense", (scores.get("suspense") ?? 0) + 0.7);
    evidenceCount += 1;
  }
  if (/[?？]/u.test(slice) && scores.size === 0) {
    scores.set("suspense", 0.42);
  }

  let emotion: StoryEmotionKind = "neutral";
  let bestScore = 0;
  let totalScore = 0;
  for (const [candidate, score] of scores) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      emotion = candidate;
    }
  }

  if (bestScore <= 0) return { emotion: "neutral", intensity: 0.18, evidenceCount: 0 };
  const dominance = bestScore / Math.max(bestScore, totalScore);
  const density = bestScore / Math.max(1, Math.min(5, tokens.filter((token) => token.start >= start && token.end <= end).length));
  const intensity = clamp(0.34 + dominance * 0.28 + density * 0.28, 0.3, 1);
  return { emotion, intensity, evidenceCount };
}

function candidateBoundaries(text: string, tokens: Token[]) {
  const boundaries = new Set<number>([0, text.length]);

  // V27: restore the proven pre-V25 emotion-span behavior. Ordinary commas are
  // intentionally not promoted to word-emotion span boundaries here. Comma
  // breathing is handled separately by the semantic/dependency pause planner.
  // Keeping emotion spans coarse prevents comma-heavy 3k-6k scripts from
  // exploding into hundreds of ranges and exhausting Worker CPU.
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[。.!?！？；;：:—–…]/u.test(char)) boundaries.add(index + 1);
  }

  for (const token of tokens) {
    if (TURN_WORDS.has(token.normalized) && token.start >= 18 && text.length - token.start >= 20) {
      boundaries.add(token.start);
    }
  }
  return [...boundaries].sort((a, b) => a - b);
}

function mergeTinyRanges(ranges: Array<{ start: number; end: number }>) {
  const output: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    if (!output.length) {
      output.push({ ...range });
      continue;
    }
    const previous = output[output.length - 1];
    if (range.end - range.start < 18 || previous.end - previous.start < 14) previous.end = range.end;
    else output.push({ ...range });
  }
  return output;
}

function makeSpan(
  text: string,
  start: number,
  end: number,
  tokens: Token[],
): StoryEmotionSpan {
  const reading = emotionForRange(text, start, end, tokens);
  const base = baseProsody(reading.emotion);
  const strength = reading.emotion === "neutral" ? 0.35 : reading.intensity;
  return {
    text: text.slice(start, end),
    start,
    end,
    emotion: reading.emotion,
    intensity: reading.intensity,
    evidenceCount: reading.evidenceCount,
    rateFactor: 1 + (base.rateFactor - 1) * strength,
    pitchDelta: base.pitchDelta * strength,
    volumeDelta: base.volumeDelta * strength,
  };
}

function mergeCompatibleSpans(spans: StoryEmotionSpan[], text: string, tokens: Token[]) {
  const output: StoryEmotionSpan[] = [];
  for (const span of spans) {
    const previous = output[output.length - 1];
    const compatible = previous && (
      previous.emotion === span.emotion ||
      (previous.emotion === "neutral" && span.intensity < 0.58) ||
      (span.emotion === "neutral" && previous.intensity < 0.58)
    );
    if (compatible) {
      output[output.length - 1] = makeSpan(text, previous.start, span.end, tokens);
    } else {
      output.push(span);
    }
  }

  while (output.length > 4) {
    let smallestIndex = 0;
    let smallestLength = Number.POSITIVE_INFINITY;
    for (let index = 0; index < output.length; index += 1) {
      const length = output[index].end - output[index].start;
      if (length < smallestLength) {
        smallestLength = length;
        smallestIndex = index;
      }
    }
    const target = smallestIndex === 0 ? 1 : smallestIndex - 1;
    const left = Math.min(output[target].start, output[smallestIndex].start);
    const right = Math.max(output[target].end, output[smallestIndex].end);
    const removeFirst = Math.min(target, smallestIndex);
    output.splice(removeFirst, 2, makeSpan(text, left, right, tokens));
  }
  return output;
}

export function analyzeStoryEmotionTrajectory(text: string): StoryEmotionTrajectory {
  const tokens = tokenize(text);
  if (!text.trim()) {
    return { tokenCount: 0, evidenceCount: 0, dominantEmotion: "neutral", volatility: 0, spans: [] };
  }

  const boundaries = candidateBoundaries(text, tokens);
  const ranges = mergeTinyRanges(
    boundaries.slice(0, -1).map((start, index) => ({ start, end: boundaries[index + 1] })),
  );
  const spans = mergeCompatibleSpans(
    ranges.map((range) => makeSpan(text, range.start, range.end, tokens)),
    text,
    tokens,
  );

  const scores = new Map<StoryEmotionKind, number>();
  let evidenceCount = 0;
  for (const span of spans) {
    scores.set(span.emotion, (scores.get(span.emotion) ?? 0) + span.intensity * Math.max(1, span.evidenceCount));
    evidenceCount += span.evidenceCount;
  }
  let dominantEmotion: StoryEmotionKind = "neutral";
  let dominantScore = 0;
  for (const [emotion, score] of scores) {
    if (emotion !== "neutral" && score > dominantScore) {
      dominantEmotion = emotion;
      dominantScore = score;
    }
  }

  let changes = 0;
  let distance = 0;
  for (let index = 1; index < spans.length; index += 1) {
    if (spans[index - 1].emotion !== spans[index].emotion) changes += 1;
    distance += Math.abs(spans[index - 1].intensity - spans[index].intensity);
  }
  const volatility = spans.length <= 1 ? 0 : clamp((changes + distance) / (spans.length * 1.6), 0, 1);

  return { tokenCount: tokens.length, evidenceCount, dominantEmotion, volatility, spans };
}
