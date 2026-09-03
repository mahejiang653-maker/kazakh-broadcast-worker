from pathlib import Path

repo = Path('.')
emotion_path = repo / 'app/lib/edge-emotion-director.ts'
omni_path = repo / 'app/lib/edge-omnivoice-inspired.ts'
route_path = repo / 'app/api/synthesize/route.ts'

emotion = emotion_path.read_text(encoding='utf-8')
omni = omni_path.read_text(encoding='utf-8')
route = route_path.read_text(encoding='utf-8')

# ---------------- edge-emotion-director.ts ----------------
old = '''export type EdgeDeliveryMood =\n  | "neutral"\n  | "serious"\n  | "concern"\n  | "urgent"\n  | "sad"\n  | "positive"\n  | "emphasis"\n  | "transition"\n  | "ending";\n'''
new = old + '''\nexport type EdgeSpeechAct =\n  | "narration"\n  | "dialogue"\n  | "reported"\n  | "question"\n  | "command"\n  | "reply"\n  | "whisper"\n  | "shout"\n  | "lament"\n  | "humor";\n'''
if old not in emotion:
    raise SystemExit('delivery mood anchor not found')
emotion = emotion.replace(old, new, 1)

old = '''  normalized: string;\n  role: EdgeDocumentRole | null;\n};'''
new = '''  normalized: string;\n  role: EdgeDocumentRole | null;\n  speechAct: EdgeSpeechAct;\n  speakerTurn: number;\n  dialogueConfidence: number;\n  paragraphMood: EdgeDeliveryMood | null;\n};'''
if old not in emotion:
    raise SystemExit('emotion sentence fields anchor not found')
emotion = emotion.replace(old, new, 1)
emotion = emotion.replace('  version: 2;\n  sourceLength: number;', '  version: 3;\n  sourceLength: number;', 1)

anchor = '''const EMPHASIS = [\n  "ең бастысы", "маңыздысы", "әсіресе", "атап айтқанда", "алғаш рет", "рекорд",\n  "ең жоғары", "ең төмен", "негізгі",\n  "最重要", "重要", "尤其", "特别是", "值得注意", "首次", "第一次", "纪录", "创纪录",\n  "最高", "最低", "关键", "核心", "重点", "必须指出",\n];\n'''
insert = anchor + '''\nconst REPORTING_SPEECH = [\n  "деді", "дейді", "айтты", "айтады", "сұрады", "жауап берді", "жауап қайтарды",\n  "бұйырды", "өтінді", "мәлімдеді", "хабарлады", "жазды", "түсіндірді", "ескертті",\n  "деп айтты", "деп сұрады", "деп жауап берді",\n  "说", "说道", "表示", "问道", "询问", "回答", "回应", "命令", "要求", "写道",\n  "said", "asked", "replied", "answered", "ordered", "told", "wrote",\n];\nconst ASK_SPEECH = ["сұрады", "сауал қойды", "问", "问道", "询问", "asked", "questioned"];\nconst REPLY_SPEECH = ["жауап берді", "жауап қайтарды", "回应", "回答", "replied", "answered"];\nconst COMMAND_SPEECH = ["бұйырды", "әмір етті", "талап етті", "命令", "要求", "ordered", "demanded"];\nconst WHISPER_SPEECH = ["сыбырлады", "сыбырлап", "ақырын айтты", "жай дауыспен", "低声", "轻声", "悄声", "whispered", "softly said"];\nconst SHOUT_SPEECH = ["айқайлады", "айғайлады", "дауыстап айтты", "ақырып", "喊道", "大喊", "怒吼", "shouted", "yelled"];\nconst LAMENT_SPEECH = ["жылап айтты", "еңіреп", "өкінішпен айтты", "哭着说", "哽咽", "悲伤地说", "sobbed", "cried"];\nconst HUMOR_SPEECH = ["күліп айтты", "жымиды", "әзілдеп", "笑着说", "开玩笑", "laughed", "joked"];\n'''
if anchor not in emotion:
    raise SystemExit('emphasis anchor not found')
emotion = emotion.replace(anchor, insert, 1)

anchor = '''function sentenceUnits(source: string) {\n  return structureEdgeText(source).flatMap((paragraph) =>\n    paragraph.sentences.map((sentence) => ({\n      text: sentence.text,\n      paragraphIndex: paragraph.index,\n    })),\n  );\n}\n'''
insert = anchor + r'''

type SpeechInference = {
  speechAct: EdgeSpeechAct;
  speakerTurn: number;
  dialogueConfidence: number;
  inheritedMood: EdgeDeliveryMood | null;
};

function containsCue(value: string, cues: string[]) {
  const normalized = normalize(value);
  return cues.some((cue) => normalized.includes(normalize(cue)));
}

function hasExplicitDialogueMark(text: string) {
  const trimmed = text.trim();
  return (
    /^[—–-]\s*\S/u.test(trimmed) ||
    /[«“„「『][^»”」』]{1,700}[»”」』]/u.test(trimmed) ||
    /"[^"\n]{1,700}"/u.test(trimmed) ||
    /^[\p{Lu}][\p{L}'’.-]{1,30}(?:\s+[\p{Lu}][\p{L}'’.-]{1,30}){0,2}\s*[:：]\s*\S/u.test(trimmed)
  );
}

function hasReportingSpeech(text: string) {
  return containsCue(text, REPORTING_SPEECH);
}

function attributionMood(text: string): EdgeDeliveryMood | null {
  if (containsCue(text, LAMENT_SPEECH) || countHits(normalize(text), SAD) >= 1) return "sad";
  if (containsCue(text, SHOUT_SPEECH) || countHits(normalize(text), ANGER) >= 1) return "urgent";
  if (countHits(normalize(text), FEAR) >= 1) return "concern";
  if (containsCue(text, HUMOR_SPEECH)) return "positive";
  if (containsCue(text, WHISPER_SPEECH)) return "concern";
  return null;
}

function speechActFromAttribution(text: string): EdgeSpeechAct {
  if (containsCue(text, SHOUT_SPEECH)) return "shout";
  if (containsCue(text, WHISPER_SPEECH)) return "whisper";
  if (containsCue(text, LAMENT_SPEECH)) return "lament";
  if (containsCue(text, HUMOR_SPEECH)) return "humor";
  if (containsCue(text, COMMAND_SPEECH)) return "command";
  if (containsCue(text, ASK_SPEECH)) return "question";
  if (containsCue(text, REPLY_SPEECH)) return "reply";
  return "dialogue";
}

function looksLikeImplicitSpeech(text: string) {
  const value = normalize(text);
  if (!value) return false;
  if (/[?？!！]/u.test(text)) return true;
  if (/^(?:мен|біз|сен|сіз|сендер|сіздер|маған|мағанша|менің|біздің|你|你们|我|我们)(?:\s|$)/iu.test(value)) return true;
  if (/(?:ңыз|ңіз|ыңдар|іңдер|шы|ші)(?:\s|[.!?！？。]|$)/iu.test(text)) return true;
  return text.length <= 220;
}

function inferSpeechStructure(units: Array<{ text: string; paragraphIndex: number }>): SpeechInference[] {
  const output: SpeechInference[] = [];
  let turnCounter = 0;
  let pending: { turn: number; act: EdgeSpeechAct; mood: EdgeDeliveryMood | null; paragraphIndex: number; remaining: number } | null = null;
  let activeDialogueTurn = 0;

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const text = unit.text;
    const explicit = hasExplicitDialogueMark(text);
    const reporting = hasReportingSpeech(text);
    const reportingBeforeContent = /(?:деді|дейді|айтты|айтады|сұрады|жауап берді|бұйырды|өтінді|表示|说道|问道|回答|回应|said|asked|replied|ordered)\s*[,，:：—–-]\s*\S/iu.test(text);
    const reportingAfterContent = /[,，]\s*[—–-]?\s*(?:деді|дейді|айтты|сұрады|жауап берді|said|asked|replied)(?![\p{L}\p{N}_])/iu.test(text);
    let speechAct: EdgeSpeechAct = "narration";
    let speakerTurn = 0;
    let dialogueConfidence = 0;
    let inheritedMood: EdgeDeliveryMood | null = null;

    if (pending && !reporting && looksLikeImplicitSpeech(text) && Math.abs(unit.paragraphIndex - pending.paragraphIndex) <= 1) {
      speechAct = pending.act;
      speakerTurn = pending.turn;
      dialogueConfidence = 0.78;
      inheritedMood = pending.mood;
      activeDialogueTurn = pending.turn;
      pending.remaining -= 1;
      if (pending.remaining <= 0 || /(?:деді|айтты|сұрады|жауап берді|мәлімдеді|хабарлады)/iu.test(text)) pending = null;
    }

    if (explicit || reportingBeforeContent || reportingAfterContent) {
      if (!activeDialogueTurn || /^[—–-]/u.test(text.trim()) || /^[\p{Lu}].{0,70}[:：]/u.test(text.trim())) {
        turnCounter += 1;
        activeDialogueTurn = turnCounter;
      }
      speechAct = speechActFromAttribution(text);
      if (speechAct === "dialogue" && /[?？]/u.test(text)) speechAct = "question";
      speakerTurn = activeDialogueTurn;
      dialogueConfidence = explicit ? 0.96 : 0.84;
      inheritedMood = attributionMood(text);
    } else if (reporting) {
      speechAct = "reported";
      dialogueConfidence = 0.58;
      const nextAct = speechActFromAttribution(text);
      const shouldLead = /[:：]\s*$/u.test(text.trim()) || /(?:деді|айтты|сұрады|жауап берді|бұйырды|өтінді|said|asked|replied|ordered)[.!。]?\s*$/iu.test(text.trim());
      if (shouldLead) {
        turnCounter += 1;
        pending = {
          turn: turnCounter,
          act: nextAct,
          mood: attributionMood(text),
          paragraphIndex: unit.paragraphIndex,
          remaining: 3,
        };
        activeDialogueTurn = turnCounter;
      } else {
        activeDialogueTurn = 0;
      }
    } else if (speakerTurn === 0) {
      activeDialogueTurn = 0;
    }

    if (speakerTurn > 0 && speechAct === "dialogue" && /[?？]/u.test(text)) speechAct = "question";
    if (speakerTurn > 0 && speechAct === "dialogue" && /[!！]/u.test(text) && countHits(normalize(text), ANGER) >= 1) speechAct = "shout";

    output.push({ speechAct, speakerTurn, dialogueConfidence, inheritedMood });
  }

  return output;
}
'''
if anchor not in emotion:
    raise SystemExit('sentenceUnits anchor not found')
emotion = emotion.replace(anchor, insert, 1)

# chooseMood signature and speech-context priority
old = '''function chooseMood(\n  text: string,\n  role: EdgeDocumentRole | null,\n  index: number,\n  total: number,\n): { mood: EdgeDeliveryMood; confidence: number } {'''
new = '''function chooseMood(\n  text: string,\n  role: EdgeDocumentRole | null,\n  index: number,\n  total: number,\n  speechAct: EdgeSpeechAct = "narration",\n  inheritedMood: EdgeDeliveryMood | null = null,\n): { mood: EdgeDeliveryMood; confidence: number } {'''
if old not in emotion:
    raise SystemExit('chooseMood signature anchor not found')
emotion = emotion.replace(old, new, 1)

anchor = '''  const strongPunctuation = (text.match(/[!！?？]/gu) ?? []).length;\n\n  if (index === total - 1 || role === "ending") return { mood: "ending", confidence: 0.82 };'''
insert = '''  const strongPunctuation = (text.match(/[!！?？]/gu) ?? []).length;\n\n  if (index === total - 1 || role === "ending") return { mood: "ending", confidence: 0.82 };\n  if (inheritedMood === "sad" || speechAct === "lament") return { mood: "sad", confidence: 0.86 };\n  if (inheritedMood === "urgent" || speechAct === "shout") return { mood: "urgent", confidence: 0.84 };\n  if (speechAct === "command") return { mood: urgent >= 1 || angry >= 1 ? "urgent" : "emphasis", confidence: 0.8 };\n  if (speechAct === "whisper") return { mood: fear >= 1 ? "concern" : inheritedMood ?? "concern", confidence: 0.74 };\n  if (speechAct === "humor" || inheritedMood === "positive") return { mood: "positive", confidence: 0.8 };\n  if (speechAct === "question" && urgent === 0 && sad === 0 && concern === 0) return { mood: "serious", confidence: 0.65 };'''
if anchor not in emotion:
    raise SystemExit('chooseMood body anchor not found')
emotion = emotion.replace(anchor, insert, 1)

# Replace instructionForMood with layered paragraph + speech delivery
old_start = emotion.index('function instructionForMood(')
old_end = emotion.index('\nfunction isProtectedRole', old_start)
new_func = r'''function speechActMicro(speechAct: EdgeSpeechAct) {
  const values: Record<EdgeSpeechAct, { rateFactor: number; pitchDelta: number; volumeDelta: number }> = {
    narration: { rateFactor: 1, pitchDelta: 0, volumeDelta: 0 },
    dialogue: { rateFactor: 1, pitchDelta: 0.005, volumeDelta: 0.004 },
    reported: { rateFactor: 0.996, pitchDelta: -0.008, volumeDelta: 0 },
    question: { rateFactor: 0.996, pitchDelta: 0.035, volumeDelta: 0.005 },
    command: { rateFactor: 1.012, pitchDelta: 0.03, volumeDelta: 0.028 },
    reply: { rateFactor: 0.998, pitchDelta: 0.004, volumeDelta: 0.006 },
    whisper: { rateFactor: 0.982, pitchDelta: -0.025, volumeDelta: -0.04 },
    shout: { rateFactor: 1.014, pitchDelta: 0.045, volumeDelta: 0.04 },
    lament: { rateFactor: 0.975, pitchDelta: -0.04, volumeDelta: -0.03 },
    humor: { rateFactor: 1.006, pitchDelta: 0.025, volumeDelta: 0.018 },
  };
  return values[speechAct];
}

function instructionForMood(sentence: EdgeEmotionSentence, mood: EdgeDeliveryMood, confidence: number) {
  const base = MOOD_BASE[mood];
  const speech = speechActMicro(sentence.speechAct);
  const paragraph = sentence.paragraphMood ? MOOD_BASE[sentence.paragraphMood] : MOOD_BASE.neutral;
  const paragraphWeight =
    sentence.speakerTurn > 0
      ? 0.08
      : confidence < 0.66
        ? 0.32
        : confidence < 0.76
          ? 0.18
          : 0.08;

  return {
    ...sentence,
    mood,
    confidence,
    rateFactor: clamp(
      base.rateFactor *
        speech.rateFactor *
        (1 + (paragraph.rateFactor - 1) * paragraphWeight) *
        lengthAdjustment(sentence.text),
      0.96,
      1.03,
    ),
    pitchDelta: clamp(
      base.pitchDelta + speech.pitchDelta + paragraph.pitchDelta * paragraphWeight,
      -0.11,
      0.11,
    ),
    volumeDelta: clamp(
      base.volumeDelta + speech.volumeDelta + paragraph.volumeDelta * paragraphWeight,
      -0.09,
      0.12,
    ),
  } satisfies EdgeEmotionSentence;
}

function applyParagraphMoodContext(sentences: EdgeEmotionSentence[]) {
  const byParagraph = new Map<number, EdgeEmotionSentence[]>();
  for (const sentence of sentences) {
    const bucket = byParagraph.get(sentence.paragraphIndex) ?? [];
    bucket.push(sentence);
    byParagraph.set(sentence.paragraphIndex, bucket);
  }

  const moodByParagraph = new Map<number, EdgeDeliveryMood | null>();
  for (const [paragraphIndex, items] of byParagraph) {
    const scores = new Map<EdgeDeliveryMood, number>();
    let total = 0;
    for (const item of items) {
      if (["neutral", "transition", "ending"].includes(item.mood)) continue;
      const weight = Math.max(0.2, Math.min(1.4, item.text.length / 90)) * item.confidence;
      scores.set(item.mood, (scores.get(item.mood) ?? 0) + weight);
      total += weight;
    }
    let best: EdgeDeliveryMood | null = null;
    let bestScore = 0;
    for (const [mood, score] of scores) {
      if (score > bestScore) {
        best = mood;
        bestScore = score;
      }
    }
    moodByParagraph.set(paragraphIndex, total > 0 && bestScore / total >= 0.42 ? best : null);
  }

  return sentences.map((sentence) => {
    const paragraphMood = moodByParagraph.get(sentence.paragraphIndex) ?? null;
    const contextual = { ...sentence, paragraphMood };
    return instructionForMood(contextual, sentence.mood, sentence.confidence);
  });
}
'''
emotion = emotion[:old_start] + new_func + emotion[old_end:]

# Smooth turns: keep same role continuous, allow meaningful role turns more freedom.
old = '''    if (!previous || previous.paragraphIndex !== sentence.paragraphIndex) {\n      output.push(sentence);\n      continue;\n    }\n\n    output.push({\n      ...sentence,\n      rateFactor: clamp(sentence.rateFactor, previous.rateFactor - 0.009, previous.rateFactor + 0.009),\n      pitchDelta: clamp(sentence.pitchDelta, previous.pitchDelta - 0.05, previous.pitchDelta + 0.05),\n      volumeDelta: clamp(sentence.volumeDelta, previous.volumeDelta - 0.04, previous.volumeDelta + 0.04),\n    });'''
new = '''    if (!previous || previous.paragraphIndex !== sentence.paragraphIndex) {\n      output.push(sentence);\n      continue;\n    }\n\n    const roleTurnChanged =\n      previous.speakerTurn > 0 &&\n      sentence.speakerTurn > 0 &&\n      previous.speakerTurn !== sentence.speakerTurn;\n    const rateStep = roleTurnChanged ? 0.014 : 0.009;\n    const pitchStep = roleTurnChanged ? 0.075 : 0.05;\n    const volumeStep = roleTurnChanged ? 0.06 : 0.04;\n\n    output.push({\n      ...sentence,\n      rateFactor: clamp(sentence.rateFactor, previous.rateFactor - rateStep, previous.rateFactor + rateStep),\n      pitchDelta: clamp(sentence.pitchDelta, previous.pitchDelta - pitchStep, previous.pitchDelta + pitchStep),\n      volumeDelta: clamp(sentence.volumeDelta, previous.volumeDelta - volumeStep, previous.volumeDelta + volumeStep),\n    });'''
if old not in emotion:
    raise SystemExit('smooth anchor not found')
emotion = emotion.replace(old, new, 1)

# Replace analyze plan construction.
old = '''export function analyzeEdgeEmotionPlan(source: string, documentPlan?: EdgeDocumentPlan): EdgeEmotionPlan {\n  const units = sentenceUnits(source);\n  const raw = units.map((unit, index) => {\n    const normalized = normalize(unit.text);\n    const role = roleForSentence(normalized, documentPlan);\n    const { mood, confidence } = chooseMood(unit.text, role, index, units.length);\n    const base = MOOD_BASE[mood];\n\n    return {\n      index,\n      paragraphIndex: unit.paragraphIndex,\n      text: unit.text,\n      normalized,\n      role,\n      mood,\n      confidence,\n      rateFactor: clamp(base.rateFactor * lengthAdjustment(unit.text), 0.97, 1.02),\n      pitchDelta: base.pitchDelta,\n      volumeDelta: base.volumeDelta,\n    } satisfies EdgeEmotionSentence;\n  });\n\n  return {\n    version: 2,\n    sourceLength: source.length,\n    sentences: smoothInstructions(contextualizeMoods(raw)),\n  };\n}\n'''
new = '''export function analyzeEdgeEmotionPlan(source: string, documentPlan?: EdgeDocumentPlan): EdgeEmotionPlan {\n  const units = sentenceUnits(source);\n  const speechStructure = inferSpeechStructure(units);\n  const raw = units.map((unit, index) => {\n    const normalized = normalize(unit.text);\n    const role = roleForSentence(normalized, documentPlan);\n    const speech = speechStructure[index] ?? {\n      speechAct: "narration" as EdgeSpeechAct,\n      speakerTurn: 0,\n      dialogueConfidence: 0,\n      inheritedMood: null,\n    };\n    const { mood, confidence } = chooseMood(\n      unit.text,\n      role,\n      index,\n      units.length,\n      speech.speechAct,\n      speech.inheritedMood,\n    );\n\n    const draft = {\n      index,\n      paragraphIndex: unit.paragraphIndex,\n      text: unit.text,\n      normalized,\n      role,\n      mood,\n      confidence,\n      speechAct: speech.speechAct,\n      speakerTurn: speech.speakerTurn,\n      dialogueConfidence: speech.dialogueConfidence,\n      paragraphMood: null,\n      rateFactor: 1,\n      pitchDelta: 0,\n      volumeDelta: 0,\n    } satisfies EdgeEmotionSentence;\n    return instructionForMood(draft, mood, confidence);\n  });\n\n  return {\n    version: 3,\n    sourceLength: source.length,\n    sentences: smoothInstructions(contextualizeMoods(applyParagraphMoodContext(raw))),\n  };\n}\n'''
if old not in emotion:
    raise SystemExit('analyze plan anchor not found')
emotion = emotion.replace(old, new, 1)

# Fallback fields.
old = '''        role: null,\n        mood: "neutral",\n        confidence: 0.45,\n        ...fallback,'''
new = '''        role: null,\n        mood: "neutral",\n        confidence: 0.45,\n        speechAct: "narration",\n        speakerTurn: 0,\n        dialogueConfidence: 0,\n        paragraphMood: null,\n        ...fallback,'''
if old not in emotion:
    raise SystemExit('fallback anchor not found')
emotion = emotion.replace(old, new, 1)

# ---------------- edge-omnivoice-inspired.ts ----------------
old = 'import { structureEdgeText } from "./edge-natural-structure";\n'
new = old + 'import { kazakhDependencyGuard } from "./edge-kazakh-dependency";\n'
if old not in omni:
    raise SystemExit('omni import anchor not found')
omni = omni.replace(old, new, 1)

# Dependency hard guard just before question floor.
anchor = '''  // Question marks retain question intonation regardless of this score. The\n  // score controls boundary/pause strength only, not the interrogative contour.\n  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);'''
insert = '''  // Dependency protection outranks ordinary punctuation. A writer may insert a\n  // comma, line break or weak period inside a phrase that must stay syntactically\n  // bound (number+unit, genitive+head, modifier+head, name+title, etc.).\n  const dependency = kazakhDependencyGuard(current.text, next.text);\n  if (!["question", "exclamation", "mixed"].includes(kind)) {\n    if (dependency.score >= 0.9) strength = Math.min(strength, 0.08);\n    else if (dependency.score >= 0.84) strength = Math.min(strength, 0.12);\n    else if (dependency.score >= 0.76) strength = Math.min(strength, 0.18);\n    else if (dependency.score >= 0.55) strength -= dependency.score * 0.2;\n  }\n\n  // Question marks retain question intonation regardless of this score. The\n  // score controls boundary/pause strength only, not the interrogative contour.\n  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);'''
if anchor not in omni:
    raise SystemExit('semantic question anchor not found')
omni = omni.replace(anchor, insert, 1)

anchor = '''  // If native punctuation is rendered, let the neural voice realize its own\n  // micro-timing. Explicit breaks are mainly for semantic/layout boundaries or\n  // for punctuation that was intentionally acoustically suppressed.\n  if (kind === "paragraph") return Math.round(62 + strength * 78);'''
insert = '''  // If native punctuation is rendered, let the neural voice realize its own\n  // micro-timing. Explicit breaks are mainly for semantic/layout boundaries or\n  // for punctuation that was intentionally acoustically suppressed.\n  // Hard dependency zones can suppress even layout boundaries from bad source\n  // formatting; sentence-mode punctuation is protected elsewhere.\n  if (strength <= 0.16 && !["question", "exclamation", "mixed", "ellipsis"].includes(kind)) return 0;\n  if (kind === "paragraph") return Math.round(62 + strength * 78);'''
if anchor not in omni:
    raise SystemExit('semanticBreak anchor not found')
omni = omni.replace(anchor, insert, 1)

# ---------------- route.ts ----------------
old = '''function storyDirectionForSentence(\n  text: string,\n  mood: string,\n  role: string | null,\n): StoryDirection {\n  const dialogue = isStoryDialogue(text);'''
new = '''function storyDirectionForSentence(\n  text: string,\n  mood: string,\n  role: string | null,\n  speechAct: EdgeEmotionPlan["sentences"][number]["speechAct"] = "narration",\n): StoryDirection {\n  const dialogue =\n    isStoryDialogue(text) ||\n    !["narration", "reported"].includes(speechAct);'''
if old not in route:
    raise SystemExit('storyDirection signature anchor not found')
route = route.replace(old, new, 1)

anchor = '''  // Story V3: narration is the anchor. We deliberately do NOT continuously\n  // modulate ordinary narration. Local prosody is reserved for real story beats,\n  // which avoids the "one sentence = one synthetic state" effect.\n  if (role === "ending" || mood === "ending") {'''
insert = '''  // Story V6: dialogue can be inferred without quotation marks from reporting\n  // verbs and speech acts. Manner-of-speaking cues can override generic mood.\n  if (role === "ending" || mood === "ending") {'''
if anchor not in route:
    raise SystemExit('story V3 comment anchor not found')
route = route.replace(anchor, insert, 1)

anchor = '''  if (\n    mood === "sad" ||\n    storyContainsCue(text, STORY_SORROW_CUES) ||'''
insert = '''  if (speechAct === "lament") {\n    return { beat: "sorrow", ratePercent: -5.4, pitchDelta: -1.0, volumeDelta: -1.0 };\n  }\n  if (speechAct === "whisper") {\n    return { beat: "suspense", ratePercent: -4.2, pitchDelta: -0.65, volumeDelta: -0.85 };\n  }\n  if (speechAct === "shout" || speechAct === "command") {\n    return { beat: "action", ratePercent: 4.2, pitchDelta: 0.85, volumeDelta: 0.95 };\n  }\n  if (speechAct === "humor") {\n    return { beat: "humor", ratePercent: 2.0, pitchDelta: 0.65, volumeDelta: 0.45 };\n  }\n  if (\n    mood === "sad" ||\n    storyContainsCue(text, STORY_SORROW_CUES) ||'''
if anchor not in route:
    raise SystemExit('story sorrow anchor not found')
route = route.replace(anchor, insert, 1)

# Replace all 4 calls that currently pass text,mood,role with speechAct.
route = route.replace(
    'storyDirectionForSentence(sentence.text, sentence.mood, sentence.role)',
    'storyDirectionForSentence(sentence.text, sentence.mood, sentence.role, sentence.speechAct)',
)

# Non-story grouping should keep inferred character turns distinct, but continuous within a turn.
old = '''    const zone = storyDirection ? `story:${storyDirection.beat}` : emotionTempoZone(sentence.mood);'''
new = '''    const baseZone = storyDirection ? `story:${storyDirection.beat}` : emotionTempoZone(sentence.mood);\n    const zone = sentence.speakerTurn > 0 ? `${baseZone}:turn:${sentence.speakerTurn}` : baseZone;'''
if old not in route:
    raise SystemExit('zone anchor not found')
route = route.replace(old, new, 1)

emotion_path.write_text(emotion, encoding='utf-8')
omni_path.write_text(omni, encoding='utf-8')
route_path.write_text(route, encoding='utf-8')
