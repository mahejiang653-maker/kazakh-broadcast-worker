from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
s = path.read_text()

replacements = [
    (
'''    title: { rateFactor: 0.994, pitchDelta: -0.015, volumeDelta: 0.11 },
    lead: { rateFactor: 0.998, pitchDelta: 0.008, volumeDelta: 0.035 },
    body: NEUTRAL,
    background: { rateFactor: 0.997, pitchDelta: -0.015, volumeDelta: -0.035 },
    transition: { rateFactor: 0.999, pitchDelta: 0.018, volumeDelta: 0.025 },
    key_number: { rateFactor: 0.991, pitchDelta: -0.008, volumeDelta: 0.07 },
    climax: { rateFactor: 0.993, pitchDelta: 0.028, volumeDelta: 0.11 },
    ending: { rateFactor: 0.994, pitchDelta: -0.045, volumeDelta: -0.018 },''',
'''    title: { rateFactor: 0.986, pitchDelta: -0.015, volumeDelta: 0.11 },
    lead: { rateFactor: 1.012, pitchDelta: 0.008, volumeDelta: 0.035 },
    body: { rateFactor: 1.002, pitchDelta: 0, volumeDelta: 0 },
    background: { rateFactor: 0.987, pitchDelta: -0.015, volumeDelta: -0.035 },
    transition: { rateFactor: 1.016, pitchDelta: 0.018, volumeDelta: 0.025 },
    key_number: { rateFactor: 0.976, pitchDelta: -0.008, volumeDelta: 0.07 },
    climax: { rateFactor: 1.009, pitchDelta: 0.028, volumeDelta: 0.11 },
    ending: { rateFactor: 0.981, pitchDelta: -0.045, volumeDelta: -0.018 },'''
    ),
    (
'''  const distance = Math.abs(segment.progress - plan.climaxProgress);
  const climaxLift = Math.max(0, 1 - distance / 0.28);
  const endingSettle = segment.progress > 0.84 ? (segment.progress - 0.84) / 0.16 : 0;
  const importance = 0.45 + segment.importance * 0.55;

  return {
    rateFactor: clamp(
      1 + (role.rateFactor - 1) * importance - climaxLift * 0.001 - endingSettle * 0.003,
      0.982,
      1.008,
    ),''',
'''  const distance = Math.abs(segment.progress - plan.climaxProgress);
  const climaxLift = Math.max(0, 1 - distance / 0.28);
  const beforeClimax = segment.progress <= plan.climaxProgress;
  const approachDistance = beforeClimax ? plan.climaxProgress - segment.progress : 1;
  const approachPush = beforeClimax ? Math.max(0, 1 - approachDistance / 0.24) : 0;
  const postClimaxDistance = segment.progress > plan.climaxProgress
    ? segment.progress - plan.climaxProgress
    : 1;
  const postClimaxSettle = segment.progress > plan.climaxProgress
    ? Math.max(0, 1 - postClimaxDistance / 0.2)
    : 0;
  const endingSettle = segment.progress > 0.84 ? (segment.progress - 0.84) / 0.16 : 0;
  const importance = 0.45 + segment.importance * 0.55;

  return {
    rateFactor: clamp(
      1 +
        (role.rateFactor - 1) * importance +
        approachPush * 0.008 -
        postClimaxSettle * 0.006 -
        endingSettle * 0.012,
      0.968,
      1.025,
    ),'''
    ),
    (
'''  if (startsWithCue(clean, FOCUS_CUES)) {
    rateFactor *= 0.996;
    volumeDelta += 0.045;
  } else if (startsWithCue(clean, CONTRAST_CUES)) {
    volumeDelta += 0.028;
    pitchDelta += 0.008;
  } else if (startsWithCue(clean, RESULT_CUES)) {
    volumeDelta += 0.022;
  }
''',
'''  // Human readers vary tempo by information structure, not only by punctuation.
  // Keep these changes small enough to feel like phrasing rather than a speed effect.
  const digitCount = (clean.match(/\\d/gu) ?? []).length;
  if (digitCount >= 3) rateFactor *= 0.982;
  else if (digitCount >= 1) rateFactor *= 0.992;

  if (clean.length >= 105) rateFactor *= 0.986;
  else if (clean.length <= 24 && digitCount === 0) rateFactor *= 1.012;

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
'''
    ),
    (
'''    rateFactor: clamp(rateFactor, 0.965, 1.01),''',
'''    rateFactor: clamp(rateFactor, 0.95, 1.025),'''
    ),
    (
'''    rateFactor: clamp(a.rateFactor * b.rateFactor, 0.96, 1.015),''',
'''    rateFactor: clamp(a.rateFactor * b.rateFactor, 0.945, 1.03),'''
    ),
    (
'''    const items: Array<{ micro: MicroProsody; weight: number }> = [
      { micro: phrase.micro, weight: hardBefore || hardAfter ? 0.8 : 0.52 },
    ];
    if (previous && !hardBefore) items.push({ micro: previous.micro, weight: 0.24 });
    if (next && !hardAfter) items.push({ micro: next.micro, weight: 0.24 });
    return { ...phrase, micro: blendMicros(items) };''',
'''    const items: Array<{ micro: MicroProsody; weight: number }> = [
      { micro: phrase.micro, weight: hardBefore || hardAfter ? 0.8 : 0.52 },
    ];
    if (previous && !hardBefore) items.push({ micro: previous.micro, weight: 0.24 });
    if (next && !hardAfter) items.push({ micro: next.micro, weight: 0.24 });
    const blended = blendMicros(items);
    // Preserve most local tempo contrast while smoothing pitch/volume more strongly.
    // This avoids the previous "one flat speed for the whole paragraph" effect.
    const localRateWeight = hardBefore || hardAfter ? 0.88 : 0.72;
    const rateFactor =
      1 +
      (phrase.micro.rateFactor - 1) * localRateWeight +
      (blended.rateFactor - 1) * (1 - localRateWeight);
    return {
      ...phrase,
      micro: {
        rateFactor: clamp(rateFactor, 0.95, 1.03),
        pitchDelta: blended.pitchDelta,
        volumeDelta: blended.volumeDelta,
      },
    };'''
    ),
    (
'''    const tooDifferent = microDistance(currentAverage, phrase.micro) > 2.35;
    const tooLong = current.length >= 8;

    if (hardBoundary || strongRoleBoundary || tooDifferent || tooLong) flush();''',
'''    const tooDifferent = microDistance(currentAverage, phrase.micro) > 2.35;
    const sentenceBoundary = ["period", "question", "exclamation", "mixed"].includes(
      previous.punctuationKind,
    );
    const tempoBoundary =
      sentenceBoundary && Math.abs(currentAverage.rateFactor - phrase.micro.rateFactor) >= 0.006;
    const tooLong = current.length >= 6;

    if (hardBoundary || strongRoleBoundary || tempoBoundary || tooDifferent || tooLong) flush();'''
    ),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit('tempo contour marker not found:\n' + old[:220])
    s = s.replace(old, new, 1)

path.write_text(s)
print('applied Edge tempo contour')
