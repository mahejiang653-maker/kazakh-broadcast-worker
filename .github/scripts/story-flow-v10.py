from pathlib import Path
import re

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

pattern = re.compile(r'function renderContinuousStoryBody\([\s\S]*?\n}\n\nfunction renderEmotionDirectedBody\(')
replacement = r'''function renderContinuousStoryBody(
  sentences: EdgeEmotionPlan["sentences"],
  baseSpeed: number,
  basePitch: number,
  baseVolume: number,
  useMultilingual: boolean,
  documentPlan?: EdgeDocumentPlan,
) {
  // V10 continuity rule: analyze emotion finely, but synthesize in long acoustic
  // movements. Narration may cross source paragraph boundaries when the speaker
  // identity is unchanged; dialogue is grouped by speaker turn. This avoids the
  // audible "new take" effect caused by many small prosody/render blocks.
  type StoryContinuityGroup = {
    mode: "narration" | "dialogue";
    speakerTurn: number;
    items: typeof sentences;
  };

  const isStrongStoryAct = (
    act: EdgeEmotionPlan["sentences"][number]["speechAct"],
  ) => ["whisper", "shout", "command", "lament"].includes(act);

  const groups: StoryContinuityGroup[] = [];
  for (const sentence of sentences) {
    const mode: StoryContinuityGroup["mode"] =
      sentence.speakerTurn > 0 || !["narration", "reported"].includes(sentence.speechAct)
        ? "dialogue"
        : "narration";
    const speakerTurn = mode === "dialogue" ? sentence.speakerTurn : 0;
    const previous = groups[groups.length - 1];
    const previousItem = previous?.items[previous.items.length - 1];
    const previousChars = previous
      ? previous.items.reduce((sum, item) => sum + item.text.length, 0)
      : 0;
    const sameSpeaker = Boolean(
      previous &&
      previous.mode === mode &&
      (mode === "narration" ||
        (previous.speakerTurn > 0 && speakerTurn > 0
          ? previous.speakerTurn === speakerTurn
          : previousItem?.paragraphIndex === sentence.paragraphIndex)),
    );
    const strongActChanged = Boolean(
      previousItem &&
      (isStrongStoryAct(previousItem.speechAct) || isStrongStoryAct(sentence.speechAct)) &&
      previousItem.speechAct !== sentence.speechAct,
    );
    const crossedEnding = previousItem?.role === "ending" || sentence.role === "ending";
    const maxItems = mode === "narration" ? 14 : 5;
    const maxChars = mode === "narration" ? 1450 : 760;
    const canJoin =
      sameSpeaker &&
      !strongActChanged &&
      !crossedEnding &&
      previous.items.length < maxItems &&
      previousChars + sentence.text.length <= maxChars;

    if (canJoin) previous.items.push(sentence);
    else groups.push({ mode, speakerTurn, items: [sentence] });
  }

  let body = "";

  for (const group of groups) {
    const totalChars = Math.max(
      1,
      group.items.reduce((sum, sentence) => sum + sentence.text.length, 0),
    );
    const direction = group.items.reduce(
      (acc, sentence) => {
        const local = storyDirectionForSentence(
          sentence.text,
          sentence.mood,
          sentence.role,
          sentence.speechAct,
        );
        const weight = sentence.text.length / totalChars;
        acc.rate += local.ratePercent * weight;
        acc.pitch += local.pitchDelta * weight;
        acc.volume += local.volumeDelta * weight;
        return acc;
      },
      { rate: 0, pitch: 0, volume: 0 },
    );

    const rawText = group.items.map((sentence) => sentence.text).join(" ");
    const trajectory = analyzeStoryEmotionTrajectory(rawText);
    const spans = trajectory.spans.length
      ? trajectory.spans
      : [{
          text: rawText,
          emotion: "neutral" as const,
          intensity: 0,
          evidenceCount: 0,
          rateFactor: 1,
          pitchDelta: 0,
          volumeDelta: 0,
        }];

    // Collapse word-level evidence into one continuous acoustic vector. The
    // analyzer remains word-aware, but Edge receives one long rendering call.
    // This is intentionally "fine analysis, coarse synthesis" for human flow.
    let trajectoryWeight = 0;
    let trajectoryRate = 0;
    let trajectoryPitch = 0;
    let trajectoryVolume = 0;
    for (const span of spans) {
      const evidenceWeight = span.evidenceCount > 0
        ? 0.72 + Math.min(0.28, span.intensity * 0.28)
        : 0.22;
      const weight = Math.max(1, span.text.length) * evidenceWeight;
      trajectoryWeight += weight;
      trajectoryRate += (span.rateFactor - 1) * weight;
      trajectoryPitch += span.pitchDelta * weight;
      trajectoryVolume += span.volumeDelta * weight;
    }
    trajectoryWeight = Math.max(1, trajectoryWeight);
    trajectoryRate /= trajectoryWeight;
    trajectoryPitch /= trajectoryWeight;
    trajectoryVolume /= trajectoryWeight;

    const baseStrength = group.mode === "dialogue" ? 0.78 : 0.58;
    const directionRate = clamp(direction.rate * baseStrength, -4.8, 4.8);
    const directionPitch = clamp(direction.pitch * baseStrength, -1.2, 1.2);
    const directionVolume = clamp(direction.volume * baseStrength, -1.05, 1.05);
    const trajectoryStrength = clamp(
      (group.mode === "dialogue" ? 0.56 : 0.42) + trajectory.volatility * 0.12,
      group.mode === "dialogue" ? 0.56 : 0.42,
      group.mode === "dialogue" ? 0.72 : 0.56,
    );

    const localSpeed = clamp(
      (1 + directionRate / 100) * (1 + trajectoryRate * trajectoryStrength),
      group.mode === "dialogue" ? 0.94 : 0.955,
      group.mode === "dialogue" ? 1.07 : 1.055,
    );
    const localPitch = clamp(
      directionPitch + trajectoryPitch * trajectoryStrength,
      group.mode === "dialogue" ? -1.55 : -1.1,
      group.mode === "dialogue" ? 1.55 : 1.1,
    );
    const localVolume = clamp(
      directionVolume + trajectoryVolume * trajectoryStrength,
      group.mode === "dialogue" ? -1.35 : -0.9,
      group.mode === "dialogue" ? 1.35 : 0.9,
    );
    const renderLanguageAwareText = useMultilingual
      ? (value: string) => renderStoryTextSegment(value, true)
      : undefined;

    const content = renderEdgeOmniInspiredMarkup(
      rawText,
      {
        speed: localSpeed,
        pitch: localPitch,
        volume: localVolume,
        deliveryMode: "story",
      },
      documentPlan,
      renderLanguageAwareText,
    );

    // Do not wrap source paragraphs in <p>. Their terminal punctuation already
    // supplies cadence; an extra paragraph boundary was a major source of the
    // audible stop/start feeling in long stories.
    body += `${content} `;
  }

  return `<prosody rate="${speedToRate(baseSpeed)}" pitch="${signedPercent(basePitch)}" volume="${signedPercent(baseVolume)}">${body.trim()}</prosody>`;
}

function renderEmotionDirectedBody('''
route, count = pattern.subn(replacement, route, count=1)
assert count == 1, f'renderContinuousStoryBody replacement count={count}'

old = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 真人旁白 · 角色融入", rateFactor: 1 },'
new = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 长句连续 · 真人旁白", rateFactor: 1 },'
page_path = Path('app/page.tsx')
page = page_path.read_text()
assert old in page
page = page.replace(old, new, 1)
page_path.write_text(page)
route_path.write_text(route)

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
omni = omni_path.read_text()

pattern = re.compile(r'function semanticBreak\(phrase: Phrase, punctuationRendered: boolean\) \{[\s\S]*?\n}\n\nfunction naturalTextMarkup\(')
replacement = r'''function semanticBreak(
  phrase: Phrase,
  punctuationRendered: boolean,
  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",
) {
  const strength = phrase.boundaryStrength ?? baseBoundaryStrength(phrase.punctuationKind);
  const kind = phrase.punctuationKind;

  // Story V10: do not add hidden micro-pauses between ordinary semantic phrases.
  // If punctuation is audible, the neural voice handles its timing. If weak
  // punctuation was suppressed, keep the acoustic stream continuous. Only a
  // very strong true paragraph boundary may receive a tiny breath.
  if (deliveryMode === "story") {
    if (punctuationRendered) return 0;
    if (kind === "paragraph") return strength >= 0.82 ? 24 : 0;
    return 0;
  }

  // If native punctuation is rendered, let the neural voice realize its own
  // micro-timing. Explicit breaks are mainly for semantic/layout boundaries or
  // for punctuation that was intentionally acoustically suppressed.
  // Hard dependency zones can suppress even layout boundaries from bad source
  // formatting; sentence-mode punctuation is protected elsewhere.
  if (strength <= 0.16 && !["question", "exclamation", "mixed", "ellipsis"].includes(kind)) return 0;
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

function naturalTextMarkup('''
omni, count = pattern.subn(replacement, omni, count=1)
assert count == 1, f'semanticBreak replacement count={count}'

anchor = '''  // Short and normally punctuated phrases are best left entirely to the neural
  // voice. Only unusually long, punctuation-free spans receive soft syntagma
  // breathing, and only at strong semantic connectors.
'''
insert = '''  // Story V10: long-form story flow is more natural when Edge keeps one acoustic
  // stream. Do not add 16ms syntagma breaks inside punctuation-free story text;
  // word-level emotion analysis still affects the broad delivery vector.
  if (deliveryMode === "story") return renderText(text);

'''
assert anchor in omni
omni = omni.replace(anchor, insert + anchor, 1)

old = '    const pause = semanticBreak(item, Boolean(renderedPunctuation));'
new = '    const pause = semanticBreak(item, Boolean(renderedPunctuation), settings.deliveryMode);'
assert old in omni
omni = omni.replace(old, new, 1)

old = '''    const strongRoleBoundary =
      !sameDirectQuote &&
      !reportingBridge &&
      roleChanged &&
      (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));'''
new = '''    const storyMode = settings.deliveryMode === "story";
    const strongRoleBoundary =
      storyMode
        ? !sameDirectQuote &&
          !reportingBridge &&
          roleChanged &&
          phrase.segment?.role === "ending"
        : !sameDirectQuote &&
          !reportingBridge &&
          roleChanged &&
          (isEmphasisRole(previous.segment?.role) || isEmphasisRole(phrase.segment?.role));'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''    const strongFocusBoundary =
      !reportingBridge &&
      ((incomingFocus >= 0.72 && previousFocus < 0.55) ||
        (previousFocus >= 0.72 && incomingFocus < 0.55));'''
new = '''    const strongFocusBoundary =
      !storyMode &&
      !reportingBridge &&
      ((incomingFocus >= 0.72 && previousFocus < 0.55) ||
        (previousFocus >= 0.72 && incomingFocus < 0.55));'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '      previousBoundaryStrength >= 0.58 &&'
new = '      previousBoundaryStrength >= (storyMode ? 0.82 : 0.58) &&'
assert old in omni
omni = omni.replace(old, new, 1)

old = '''    const tooDifferent =
      microDistance(currentAverage, phrase.micro) > (sameDirectQuote || reportingBridge ? 2.8 : 2.35);'''
new = '''    const tooDifferent =
      microDistance(currentAverage, phrase.micro) >
      (storyMode ? 3.6 : sameDirectQuote || reportingBridge ? 2.8 : 2.35);'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''    const tempoBoundary =
      sentenceBoundary &&
      !sameDirectQuote &&
      !reportingBridge &&
      Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;'''
new = '''    const tempoBoundary =
      !storyMode &&
      sentenceBoundary &&
      !sameDirectQuote &&
      !reportingBridge &&
      Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;'''
assert old in omni
omni = omni.replace(old, new, 1)

old = '''    const tooLong =
      current.length >= (sameDirectQuote ? 10 : 8) && previousBoundaryStrength >= 0.36;'''
new = '''    const tooLong =
      current.length >=
        (storyMode ? (sameDirectQuote ? 18 : 15) : (sameDirectQuote ? 10 : 8)) &&
      previousBoundaryStrength >= (storyMode ? 0.62 : 0.36);'''
assert old in omni
omni = omni.replace(old, new, 1)

omni_path.write_text(omni)
