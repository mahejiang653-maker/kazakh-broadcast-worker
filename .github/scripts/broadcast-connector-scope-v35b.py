from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

# Scope V35 connector shaping to the four broadcast presets only. Story keeps
# its prior focus/contrast/result behavior.
text = text.replace(
    'function localMicro(text: string, kind: PunctuationKind) {',
    'function localMicro(\n  text: string,\n  kind: PunctuationKind,\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {',
    1,
)

old_block = '''  // V35: Kazakh connectors carry different discourse intentions. Shape the
  // entire incoming clause slightly so the connector and the words immediately
  // after it sound like one natural presenter movement rather than a detached
  // word-level effect. The adjustments remain deliberately small.
  const normalizedClean = normalize(clean);
  const internalMenCoordination = /\\p{L}+(?:\\s+)(?:мен|бен|пен)(?:\\s+)\\p{L}+/iu.test(normalizedClean);
  if (startsWithCue(clean, FOCUS_CUES)) {
    rateFactor *= 0.99;
    volumeDelta += 0.045;
  } else if (startsWithCue(clean, OPPOSITION_CUES)) {
    // "on the contrary / despite that": slow the entry, lift presence and mark
    // the reversal more strongly than an ordinary contrast.
    rateFactor *= 0.974;
    pitchDelta += 0.034;
    volumeDelta += 0.05;
  } else if (startsWithCue(clean, CONTRAST_CUES)) {
    // "but / however": a controlled slower turn with a modest pitch/energy lift.
    rateFactor *= 0.982;
    pitchDelta += 0.024;
    volumeDelta += 0.036;
  } else if (startsWithCue(clean, CHOICE_CUES)) {
    // "or / alternatively": preserve a slight open/rising option contour.
    rateFactor *= 0.991;
    pitchDelta += 0.018;
    volumeDelta += 0.012;
  } else if (startsWithCue(clean, COORDINATION_CUES)) {
    // "and / also": keep the continuation fluid, only gently lifting forward
    // motion so it does not sound like a new sentence restart.
    rateFactor *= 1.004;
    pitchDelta += 0.006;
    volumeDelta += 0.006;
  } else if (startsWithCue(clean, RESULT_CUES)) {
    rateFactor *= 1.009;
    volumeDelta += 0.022;
  } else if (internalMenCoordination) {
    // мен/бен/пен can mean coordination/with inside a phrase but "Мен" at the
    // beginning can mean "I". Only apply a very mild smoothing when structurally
    // internal, avoiding pronoun false positives.
    rateFactor *= 0.997;
    pitchDelta += 0.004;
  }
'''
new_block = '''  // V35: only the four broadcast presets receive the richer connector cadence.
  // Story keeps the pre-V35 focus/contrast/result shaping unchanged.
  const normalizedClean = normalize(clean);
  const internalMenCoordination = /\\p{L}+(?:\\s+)(?:мен|бен|пен)(?:\\s+)\\p{L}+/iu.test(normalizedClean);
  if (deliveryMode === "broadcast") {
    if (startsWithCue(clean, FOCUS_CUES)) {
      rateFactor *= 0.99;
      volumeDelta += 0.045;
    } else if (startsWithCue(clean, OPPOSITION_CUES)) {
      // "on the contrary / despite that": slower and more marked.
      rateFactor *= 0.974;
      pitchDelta += 0.034;
      volumeDelta += 0.05;
    } else if (startsWithCue(clean, CONTRAST_CUES)) {
      // "but / however": controlled turn with modest pitch/energy lift.
      rateFactor *= 0.982;
      pitchDelta += 0.024;
      volumeDelta += 0.036;
    } else if (startsWithCue(clean, CHOICE_CUES)) {
      // "or / alternatively": slightly open/rising option contour.
      rateFactor *= 0.991;
      pitchDelta += 0.018;
      volumeDelta += 0.012;
    } else if (startsWithCue(clean, COORDINATION_CUES)) {
      // "and / also": forward continuation without a sentence restart.
      rateFactor *= 1.004;
      pitchDelta += 0.006;
      volumeDelta += 0.006;
    } else if (startsWithCue(clean, RESULT_CUES)) {
      rateFactor *= 1.009;
      volumeDelta += 0.022;
    } else if (internalMenCoordination) {
      // мен/бен/пен are treated only when structurally internal so initial Мен
      // ("I") is not falsely interpreted as a conjunction.
      rateFactor *= 0.997;
      pitchDelta += 0.004;
    }
  } else {
    if (startsWithCue(clean, FOCUS_CUES)) {
      rateFactor *= 0.99;
      volumeDelta += 0.045;
    } else if (startsWithCue(clean, CONTRAST_CUES)) {
      rateFactor *= 1.014;
      volumeDelta += 0.028;
      pitchDelta += 0.008;
    } else if (startsWithCue(clean, RESULT_CUES)) {
      rateFactor *= 1.009;
      volumeDelta += 0.022;
    }
  }
'''
assert old_block in text, 'V35 local connector block not found'
text = text.replace(old_block, new_block, 1)

text = text.replace(
    'function buildPhrases(text: string, plan?: EdgeDocumentPlan) {',
    'function buildPhrases(\n  text: string,\n  plan?: EdgeDocumentPlan,\n  deliveryMode: EdgeOmniSettings["deliveryMode"] = "neutral",\n) {',
    1,
)
text = text.replace(
    'const micro = combine(localMicro(token.value, kind), documentMicro(segment, plan));',
    'const micro = combine(localMicro(token.value, kind, deliveryMode), documentMicro(segment, plan));',
    1,
)
text = text.replace(
    'annotateQuoteContinuity(buildPhrases(text, plan)),',
    'annotateQuoteContinuity(buildPhrases(text, plan, settings.deliveryMode)),',
    1,
)

path.write_text(text)
