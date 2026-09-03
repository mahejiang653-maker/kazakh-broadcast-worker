from pathlib import Path

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
omni = omni_path.read_text()

old = '''  // Story V14: three breathing levels inside one continuous acoustic state:
  // clause breath 30-40 ms < completed-sentence breath 70-120 ms <
  // paragraph/discourse breath 170-300 ms.'''
new = '''  // Story V15: three breathing levels inside one continuous acoustic state:
  // clause breath 45-60 ms < completed-sentence breath 80-130 ms <
  // paragraph/discourse breath 200-350 ms.'''
assert old in omni, 'V14 cadence comment anchor not found'
omni = omni.replace(old, new, 1)

old = '''      // V14 paragraph cadence: make a true paragraph ending clearly audible
      // while preserving the same voice/prosody state. Ordinary paragraph
      // transitions land around 170-220 ms; major semantic/emotional shifts
      // land around 250-300 ms.
      return strength >= 0.84
        ? Math.round(clamp(120 + strength * 180, 250, 300))
        : Math.round(clamp(105 + strength * 105, 170, 220));'''
new = '''      // V15 paragraph cadence: a real paragraph ending must feel settled before
      // the next one begins. Ordinary paragraph transitions sit around 200-260 ms;
      // major semantic/emotional shifts expand toward 280-350 ms. The acoustic
      // state remains continuous, so this is a pause, not a new take.
      return strength >= 0.84
        ? Math.round(clamp(145 + strength * 210, 280, 350))
        : Math.round(clamp(125 + strength * 150, 200, 260));'''
assert old in omni, 'paragraph cadence anchor not found'
omni = omni.replace(old, new, 1)

old = '''      // V14 completed-sentence breath: keep all declarative sentence endings
      // within the user-requested 70-120 ms range. Semantic boundary strength
      // and sentence length still decide where inside that range the breath lands.
      const lengthBonus = Math.min(14, Math.max(0, (words - 6) * 1.2));
      const sentenceBreath = 68 + strength * 50 + lengthBonus;
      return Math.round(clamp(sentenceBreath, 70, 120));'''
new = '''      // V15 completed-sentence breath: keep declarative sentence endings within
      // 80-130 ms so one sentence has time to land before the next begins. Semantic
      // boundary strength and sentence length still choose the exact duration.
      const lengthBonus = Math.min(16, Math.max(0, (words - 6) * 1.25));
      const sentenceBreath = 78 + strength * 52 + lengthBonus;
      return Math.round(clamp(sentenceBreath, 80, 130));'''
assert old in omni, 'sentence cadence anchor not found'
omni = omni.replace(old, new, 1)

old = '      output += `<break time="${clean.length >= 220 ? 40 : 30}ms"/>`;'
new = '      output += `<break time="${Math.round(clamp(45 + Math.max(0, clean.length - 112) * 0.08, 45, 60))}ms"/>`;'
assert old in omni, 'long-clause cadence anchor not found'
omni = omni.replace(old, new, 1)
omni_path.write_text(omni)

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()
old = '  story: { rateFactor: 1, pitch: 0.03, volume: -0.02 },'
new = '''  // V15: story speech itself runs at 0.95x. This is one continuous base-rate
  // adjustment, not a per-sentence prosody wrapper, so sentences do not pile into
  // each other and the voice does not restart at every boundary.
  story: { rateFactor: 0.95, pitch: 0.03, volume: -0.02 },'''
assert old in route, 'story preset rate anchor not found'
route = route.replace(old, new, 1)
route_path.write_text(route)
