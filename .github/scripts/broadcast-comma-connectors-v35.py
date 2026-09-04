from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

# 1) Add explicit Kazakh connector classes. Keep ambiguous мен/бен/пен out of
# sentence-start matching because "Мен" can also mean "I"; handle those only as
# internal structural coordinators below.
old_cues = '''const CONTRAST_CUES = ["бірақ", "алайда", "дегенмен", "соған қарамастан", "керісінше"];
const RESULT_CUES = ["сондықтан", "сол себепті", "нәтижесінде", "осылайша", "демек"];'''
new_cues = '''const CONTRAST_CUES = ["бірақ", "алайда", "дегенмен", "соған қарамастан", "керісінше"];
const COORDINATION_CUES = [
  "және", "әрі", "сондай-ақ", "сонымен бірге", "оған қоса", "бұған қоса",
];
const CHOICE_CUES = ["немесе", "я болмаса", "болмаса", "яки"];
const OPPOSITION_CUES = ["керісінше", "ал керісінше", "соған қарамастан"];
const RESULT_CUES = ["сондықтан", "сол себепті", "нәтижесінде", "осылайша", "демек"];'''
assert old_cues in text, 'connector cue anchor not found'
text = text.replace(old_cues, new_cues, 1)

# 2) Differentiate broadcast-like clause entry cadence by connector meaning.
old_local = '''  if (startsWithCue(clean, FOCUS_CUES)) {
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
'''
new_local = '''  // V35: Kazakh connectors carry different discourse intentions. Shape the
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
assert old_local in text, 'localMicro connector block not found'
text = text.replace(old_local, new_local, 1)

# 3) Choice connectors should participate in continuation semantics without
# forcing a hard pause; contrast/opposition remain in the strong-boundary set.
old_cont = '''const CONTINUATION_STARTERS = [
  "және", "әрі", "сондай-ақ", "сонымен бірге", "оған қоса", "бұған қоса",
  "осы ретте", "бұл ретте", "осы кезде", "бұл кезде", "сонымен", "тағы да",'''
new_cont = '''const CONTINUATION_STARTERS = [
  "және", "әрі", "сондай-ақ", "сонымен бірге", "оған қоса", "бұған қоса",
  "немесе", "я болмаса", "болмаса", "яки",
  "осы ретте", "бұл ретте", "осы кезде", "бұл кезде", "сонымен", "тағы да",'''
assert old_cont in text, 'continuation starter anchor not found'
text = text.replace(old_cont, new_cont, 1)

# 4) User requested exactly 2x the current explicit comma pause for the four
# broadcast presets: 45-60 ms -> 90-120 ms. Story stays 45-60 ms.
old_comma = '''    if (kind === "comma") {
      // Every written presenter comma keeps a 45 ms floor, but the exact release
      // grows with semantic boundary strength. This replaces the old universal
      // 45-75 ms profile with the requested 45-60 ms natural clause band.
      const commaBreath = 45 + adjustedStrength * 15;
      return Math.round(clamp(commaBreath, 45, 60));
    }'''
new_comma = '''    if (kind === "comma") {
      // V35: user requested 2x the four presenter comma release. Preserve the
      // semantic-strength curve, but scale the explicit band from 45-60 ms to
      // 90-120 ms. Story mode intentionally remains at 45-60 ms.
      const commaBreath = 90 + adjustedStrength * 30;
      return Math.round(clamp(commaBreath, 90, 120));
    }'''
assert old_comma in text, 'broadcast comma block not found'
text = text.replace(old_comma, new_comma, 1)

path.write_text(text)
