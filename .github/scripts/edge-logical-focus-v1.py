from pathlib import Path

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
route_path = Path('app/api/synthesize/route.ts')
omni = omni_path.read_text(encoding='utf-8')
route = route_path.read_text(encoding='utf-8')
omni_original = omni
route_original = route

# 1) Let the Omni renderer preserve multilingual <lang> spans supplied by route.ts.
if 'type EdgeMarkupRenderer = (text: string) => string;' not in omni:
    anchor = '''type Phrase = {
  text: string;
  punctuation: string;
  punctuationKind: PunctuationKind;
  segment: EdgePlannedSegment | null;
  micro: MicroProsody;
};'''
    replacement = anchor + '\n\ntype EdgeMarkupRenderer = (text: string) => string;'
    if anchor not in omni:
        raise SystemExit('Phrase type anchor not found.')
    omni = omni.replace(anchor, replacement, 1)

# 2) Add conservative logical-focus contrast after bidirectional smoothing.
if 'function applyLogicalFocusContrast(' not in omni:
    anchor = 'function subtleBreak(kind: PunctuationKind, _text: string) {'
    block = '''function logicalFocusScore(phrase: Phrase) {
  const role = phrase.segment?.role;
  let score = 0;

  if (role === "key_number") score += 0.95;
  else if (role === "climax") score += 0.9;
  else if (role === "title") score += 0.35;

  if (startsWithCue(phrase.text, FOCUS_CUES)) score += 0.62;
  if (startsWithCue(phrase.text, RESULT_CUES)) score += 0.24;
  if ((phrase.segment?.importance ?? 0) >= 0.78) score += 0.22;

  return clamp(score, 0, 1);
}

function applyLogicalFocusContrast(phrases: Phrase[]) {
  const sentenceTerminal = new Set<PunctuationKind>([
    "period",
    "question",
    "exclamation",
    "mixed",
    "paragraph",
    "newline",
  ]);

  return phrases.map((phrase, index) => {
    const score = logicalFocusScore(phrase);
    const next = phrases[index + 1];
    const nextScore = next ? logicalFocusScore(next) : 0;
    let rateFactor = phrase.micro.rateFactor;
    let pitchDelta = phrase.micro.pitchDelta;
    let volumeDelta = phrase.micro.volumeDelta;

    // Kazakh logical prominence is phrase-based. At sentence-final focus we rely
    // on duration + dynamics; non-final focus may receive only a tiny pitch cue.
    if (score >= 0.45) {
      rateFactor *= 1 - 0.006 * score;
      volumeDelta += 0.018 * score;
      if (!sentenceTerminal.has(phrase.punctuationKind)) pitchDelta += 0.006 * score;
    }

    // Human emphasis is relative: slightly release the setup phrase before a
    // strong focus target instead of making the target unnaturally loud.
    if (nextScore >= 0.65 && !sentenceTerminal.has(phrase.punctuationKind)) {
      rateFactor *= 1 + 0.003 * nextScore;
      volumeDelta -= 0.006 * nextScore;
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
        raise SystemExit('subtleBreak anchor not found.')
    omni = omni.replace(anchor, block + anchor, 1)

old_markup = '''function naturalTextMarkup(text: string) {
  // Short and normally punctuated phrases are best left entirely to the neural
  // voice. Only unusually long, punctuation-free spans receive soft syntagma
  // breathing, and only at strong semantic connectors.
  const clean = text.trim();
  const wordCount = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
  if (clean.length < 96 || wordCount < 15) return escapeXml(text);

  SOFT_SYNTAGMA_PATTERN.lastIndex = 0;
  let output = "";
  let cursor = 0;
  let lastBoundary = -1000;
  let inserted = 0;
  let match: RegExpExecArray | null;

  while ((match = SOFT_SYNTAGMA_PATTERN.exec(text)) && inserted < 2) {
    const boundary = match.index;
    const left = text.slice(cursor, boundary).trim();
    const right = text.slice(boundary).trim();

    // Avoid tiny fragments and avoid placing two artificial breaths close
    // together. This preserves modifier-head, name-title and number-unit groups.
    if (left.length < 42 || right.length < 30 || boundary - lastBoundary < 58) continue;

    output += escapeXml(text.slice(cursor, boundary));
    output += '<break time="16ms"/>';
    cursor = boundary;
    lastBoundary = boundary;
    inserted += 1;
  }

  if (!inserted) return escapeXml(text);
  output += escapeXml(text.slice(cursor));
  return output;
}'''
new_markup = '''function naturalTextMarkup(text: string, renderText: EdgeMarkupRenderer = escapeXml) {
  // Short and normally punctuated phrases are best left entirely to the neural
  // voice. Only unusually long, punctuation-free spans receive soft syntagma
  // breathing, and only at strong semantic connectors.
  const clean = text.trim();
  const wordCount = clean ? clean.split(/\\s+/u).filter(Boolean).length : 0;
  if (clean.length < 96 || wordCount < 15) return renderText(text);

  SOFT_SYNTAGMA_PATTERN.lastIndex = 0;
  let output = "";
  let cursor = 0;
  let lastBoundary = -1000;
  let inserted = 0;
  let match: RegExpExecArray | null;

  while ((match = SOFT_SYNTAGMA_PATTERN.exec(text)) && inserted < 2) {
    const boundary = match.index;
    const left = text.slice(cursor, boundary).trim();
    const right = text.slice(boundary).trim();

    // Avoid tiny fragments and avoid placing two artificial breaths close
    // together. This preserves modifier-head, name-title and number-unit groups.
    if (left.length < 42 || right.length < 30 || boundary - lastBoundary < 58) continue;

    output += renderText(text.slice(cursor, boundary));
    output += '<break time="16ms"/>';
    cursor = boundary;
    lastBoundary = boundary;
    inserted += 1;
  }

  if (!inserted) return renderText(text);
  output += renderText(text.slice(cursor));
  return output;
}'''
if old_markup in omni:
    omni = omni.replace(old_markup, new_markup, 1)
elif 'function naturalTextMarkup(text: string, renderText: EdgeMarkupRenderer = escapeXml)' not in omni:
    raise SystemExit('naturalTextMarkup anchor not found.')

old_group_sig = 'function renderGroup(group: Phrase[], settings: EdgeOmniSettings) {'
new_group_sig = '''function renderGroup(
  group: Phrase[],
  settings: EdgeOmniSettings,
  renderText: EdgeMarkupRenderer,
) {'''
if old_group_sig in omni:
    omni = omni.replace(old_group_sig, new_group_sig, 1)

if 'body += naturalTextMarkup(item.text, renderText);' not in omni:
    if 'body += naturalTextMarkup(item.text);' not in omni:
        raise SystemExit('naturalTextMarkup call anchor not found.')
    omni = omni.replace(
        '    body += naturalTextMarkup(item.text);',
        '    body += naturalTextMarkup(item.text, renderText);',
        1,
    )

old_export_sig = '''export function renderEdgeOmniInspiredMarkup(
  text: string,
  settings: EdgeOmniSettings,
  plan?: EdgeDocumentPlan,
) {
  const phrases = bidirectionalSmooth(buildPhrases(text, plan));
  if (!phrases.length) return escapeXml(text);'''
new_export_sig = '''export function renderEdgeOmniInspiredMarkup(
  text: string,
  settings: EdgeOmniSettings,
  plan?: EdgeDocumentPlan,
  renderText: EdgeMarkupRenderer = escapeXml,
) {
  const phrases = applyLogicalFocusContrast(bidirectionalSmooth(buildPhrases(text, plan)));
  if (!phrases.length) return renderText(text);'''
if old_export_sig in omni:
    omni = omni.replace(old_export_sig, new_export_sig, 1)
elif 'const phrases = applyLogicalFocusContrast(bidirectionalSmooth(buildPhrases(text, plan)));' not in omni:
    raise SystemExit('Omni export signature anchor not found.')

if 'renderGroup(group, settings, renderText)' not in omni:
    if 'renderGroup(group, settings)' not in omni:
        raise SystemExit('renderGroup map anchor not found.')
    omni = omni.replace(
        '  return groups.map((group) => renderGroup(group, settings)).join("");',
        '  return groups.map((group) => renderGroup(group, settings, renderText)).join("");',
        1,
    )

# 3) Route the live emotion path through the Omni phrase/syntagma layer.
old_emotion_sig = '''function renderEmotionDirectedBody(
  text: string,
  settings: EdgeVoiceSettings,
  profileVoice: string,
  preset: PresetName,
  emotionPlan: EdgeEmotionPlan,
  useMultilingual: boolean,
) {'''
new_emotion_sig = '''function renderEmotionDirectedBody(
  text: string,
  settings: EdgeVoiceSettings,
  profileVoice: string,
  preset: PresetName,
  emotionPlan: EdgeEmotionPlan,
  documentPlan: EdgeDocumentPlan | undefined,
  useMultilingual: boolean,
) {'''
if old_emotion_sig in route:
    route = route.replace(old_emotion_sig, new_emotion_sig, 1)
elif 'documentPlan: EdgeDocumentPlan | undefined,' not in route:
    raise SystemExit('renderEmotionDirectedBody signature anchor not found.')

old_limits = '''    const storyGroupLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 6
          : storyDirection?.beat === "dialogue"
            ? 1
            : 2
        : 3;
    const storyCharLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 520
          : 260
        : 300;'''
new_limits = '''    const storyGroupLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 6
          : storyDirection?.beat === "dialogue"
            ? 1
            : 2
        : preset === "calm"
          ? 6
          : preset === "news"
            ? 5
            : 4;
    const storyCharLimit =
      preset === "story"
        ? storyDirection?.beat === "narrator"
          ? 520
          : 260
        : preset === "calm"
          ? 650
          : preset === "news"
            ? 540
            : preset === "bulletin"
              ? 430
              : 420;'''
if old_limits in route:
    route = route.replace(old_limits, new_limits, 1)
elif ': preset === "calm"\n          ? 6' not in route:
    raise SystemExit('delivery group limit anchor not found.')

old_render = '''    const hasLocalDirection =
      Math.abs(weighted.rate) >= 0.35 ||
      Math.abs(weighted.pitch) >= 0.02 ||
      Math.abs(weighted.volume) >= 0.02;

    if (hasLocalDirection) {
      body += `<prosody rate="${signedPercent(weighted.rate)}" pitch="${signedPercent(weighted.pitch)}" volume="${signedPercent(weighted.volume)}">${content}</prosody> `;
    } else {
      body += `${content} `;
    }'''
new_render = '''    const hasLocalDirection =
      Math.abs(weighted.rate) >= 0.35 ||
      Math.abs(weighted.pitch) >= 0.02 ||
      Math.abs(weighted.volume) >= 0.02;

    if (documentPlan) {
      const renderLanguageAwareText = useMultilingual
        ? (value: string) =>
            splitEdgeLanguageRuns(value)
              .map(
                (run) =>
                  `<lang xml:lang="${edgeLanguageCode(run.language)}">${escapeXml(run.text)}</lang>`,
              )
              .join("")
        : undefined;
      body += `${renderEdgeOmniInspiredMarkup(
        rawText,
        {
          speed: clamp(1 + weighted.rate / 100, 0.94, 1.06),
          pitch: weighted.pitch,
          volume: weighted.volume,
        },
        documentPlan,
        renderLanguageAwareText,
      )} `;
    } else if (hasLocalDirection) {
      body += `<prosody rate="${signedPercent(weighted.rate)}" pitch="${signedPercent(weighted.pitch)}" volume="${signedPercent(weighted.volume)}">${content}</prosody> `;
    } else {
      body += `${content} `;
    }'''
if old_render in route:
    route = route.replace(old_render, new_render, 1)
elif 'renderEdgeOmniInspiredMarkup(' not in route[route.find('function renderEmotionDirectedBody'):]:
    raise SystemExit('live render branch anchor not found.')

if '  _documentPlan?: EdgeDocumentPlan,' in route:
    route = route.replace('  _documentPlan?: EdgeDocumentPlan,', '  documentPlan?: EdgeDocumentPlan,', 1)

old_call_native = '      ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, false)'
new_call_native = '      ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, documentPlan, false)'
if old_call_native in route:
    route = route.replace(old_call_native, new_call_native, 1)

old_call_multi = '    ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, true)'
new_call_multi = '    ? renderEmotionDirectedBody(text, settings, voice, preset, emotionPlan, documentPlan, true)'
if old_call_multi in route:
    route = route.replace(old_call_multi, new_call_multi, 1)

if omni == omni_original:
    raise SystemExit('No Omni logical-focus changes were made.')
if route == route_original:
    raise SystemExit('No live route changes were made.')

omni_path.write_text(omni, encoding='utf-8')
route_path.write_text(route, encoding='utf-8')
