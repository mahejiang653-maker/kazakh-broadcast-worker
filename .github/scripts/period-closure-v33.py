from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old_story = '''    if (kind === "period") {
      // Hard syntactic dependencies can push the boundary to 0.18 or below;
      // never breathe there even when the source writer inserted a period.
      if (strength <= 0.18) return 0;
      // V28 completed-sentence breath: combine semantic strength, sentence length
      // and document role. The real period still carries the neural sentence-final
      // contour; this supplemental breath lets that contour finish before the next
      // sentence enters, without forcing a new TTS request or prosody reset.
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.45));
      const roleBonus =
        phrase.segment?.role === "ending" ? 18 :
        phrase.segment?.role === "climax" ? 12 :
        phrase.segment?.role === "transition" ? 6 : 0;
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -6 : 0;
      const sentenceBreath = 94 + strength * 62 + lengthBonus + roleBonus + quoteAdjustment;
      return Math.round(clamp(sentenceBreath, 100, 165));
    }'''

new_story = '''    if (kind === "period") {
      // V33: a genuine written period is a hard sentence-closure cue. Semantic
      // and dependency analysis may shape how long the release is, but must never
      // erase the pause entirely; otherwise the next sentence crowds the ending.
      const effectiveStrength = clamp(strength, 0.34, 0.96);
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.25));
      const roleBonus =
        phrase.segment?.role === "ending" ? 14 :
        phrase.segment?.role === "climax" ? 10 :
        phrase.segment?.role === "transition" ? 5 : 0;
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -4 : 0;
      const sentenceBreath =
        164 + effectiveStrength * 48 + lengthBonus + roleBonus + quoteAdjustment;
      return Math.round(clamp(sentenceBreath, 180, 235));
    }'''
assert old_story in text, 'story period block not found'
text = text.replace(old_story, new_story, 1)

old_broadcast = '''    if (kind === "period") {
      // A period suppressed by a very strong dependency guard is treated as bad
      // source formatting rather than a completed sentence. Genuine completed
      // sentences use semantic strength + length + document role within 100-165 ms.
      if (strength <= 0.18) return 0;
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.45));
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -6 : 0;
      const sentenceBreath =
        94 + adjustedStrength * 62 + lengthBonus + roleBonus + quoteAdjustment;
      return Math.round(clamp(sentenceBreath, 100, 165));
    }'''

new_broadcast = '''    if (kind === "period") {
      // V33: presenters also treat every genuine written period as a completed
      // sentence. The document model can lengthen or shorten the release, but it
      // cannot collapse the pause to zero. Keep it clearly below paragraph timing.
      const effectiveStrength = clamp(adjustedStrength, 0.34, 0.96);
      const lengthBonus = Math.min(20, Math.max(0, (words - 6) * 1.25));
      const quoteAdjustment = phrase.directQuote && !phrase.quoteEnd ? -4 : 0;
      const presetSentenceBias =
        broadcastPreset === "calm" ? 7 :
        broadcastPreset === "bulletin" ? -5 :
        broadcastPreset === "expressive" ? 4 : 0;
      const sentenceBreath =
        162 + effectiveStrength * 50 + lengthBonus + roleBonus + quoteAdjustment + presetSentenceBias;
      return Math.round(clamp(sentenceBreath, 178, 235));
    }'''
assert old_broadcast in text, 'broadcast period block not found'
text = text.replace(old_broadcast, new_broadcast, 1)

text = text.replace(
    '  // V32: "Бірінші.", "Екінші." and similar standalone ordinal labels need a',
    '  // V32: "Бірінші.", "Екінші." and similar standalone ordinal labels need a',
    1,
)

path.write_text(text)
