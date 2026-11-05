/**
 * Offline-only evaluation gate. It does not synthesize speech or call any API.
 * Require complete paired takes before reporting an experimental winner.
 */
export function evaluateM3VoiceExperiment(records, expectedTakes = 5) {
  if (!Number.isInteger(expectedTakes) || expectedTakes < 1 || expectedTakes > 5) throw new Error("Expected takes must be 1..5");
  if (!Array.isArray(records)) throw new Error("Measurements must be an array");
  const keys = new Set();
  const groups = { baseline: [], remix: [] };
  for (const r of records) {
    if (!r || !Object.hasOwn(groups, r.arm) || !Number.isInteger(r.take) || r.take < 1 || r.take > expectedTakes) throw new Error("Invalid take");
    const key = r.arm + ":" + r.take;
    if (keys.has(key)) throw new Error("Duplicate take " + key);
    keys.add(key);
    if (r.source !== "recorded-audio" || typeof r.audioSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(r.audioSha256)) throw new Error("Missing real audio provenance");
    for (const k of ["f0DriftCents", "mfccDistance", "loudnessDeltaDb"]) {
      if (typeof r[k] !== "number" || !Number.isFinite(r[k])) throw new Error("Invalid measurement: " + k);
    }
    if (r.mfccDistance < 0) throw new Error("MFCC distance must be nonnegative");
    if (typeof r.transcriptChecked !== "boolean" || typeof r.pronunciationReviewed !== "boolean") throw new Error("Listening checks missing");
    groups[r.arm].push(r);
  }
  const complete = groups.baseline.length === expectedTakes && groups.remix.length === expectedTakes;
  const mean = (rows, field, absolute = true) => rows.reduce((sum, r) => sum + (absolute ? Math.abs(r[field]) : r[field]), 0) / rows.length;
  const summary = Object.fromEntries(Object.entries(groups).map(([arm, rows]) => [arm, rows.length ? {
    takes: rows.length,
    meanAbsoluteF0Cents: mean(rows, "f0DriftCents"),
    meanMfccDistance: mean(rows, "mfccDistance", false),
    meanAbsoluteLoudnessDb: mean(rows, "loudnessDeltaDb"),
    transcriptAndPronunciationReviewed: rows.every(r => r.transcriptChecked && r.pronunciationReviewed)
  } : null]));
  return { complete, expectedTakes, observedTakes: { baseline: groups.baseline.length, remix: groups.remix.length },
    summary, conclusion: complete && summary.baseline.transcriptAndPronunciationReviewed && summary.remix.transcriptAndPronunciationReviewed
      ? "Ready for blinded human comparison; acoustic metrics alone cannot establish superiority."
      : "Insufficient verified paired recordings; do not claim a voice improvement." };
}
