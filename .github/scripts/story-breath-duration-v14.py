from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

old = '''      // Ordinary paragraph: roughly 120-145 ms. Major semantic/emotional shift:
      // roughly 165-205 ms. Same voice/prosody state is preserved throughout.
      return strength >= 0.84
        ? Math.round(108 + strength * 92)
        : Math.round(82 + strength * 72);'''
new = '''      // V14 paragraph cadence: make a true paragraph ending clearly audible
      // while preserving the same voice/prosody state. Ordinary paragraph
      // transitions land around 170-220 ms; major semantic/emotional shifts
      // land around 250-300 ms.
      return strength >= 0.84
        ? Math.round(clamp(120 + strength * 180, 250, 300))
        : Math.round(clamp(105 + strength * 105, 170, 220));'''
assert old in text, 'paragraph duration anchor not found'
text = text.replace(old, new, 1)

old = '''      const lengthBonus = Math.min(18, Math.max(0, (words - 7) * 1.6));
      if (clean.length < 20 && words < 4) {
        return Math.round(28 + strength * 40);
      }
      // Very tightly connected sentences get a small catch of breath; ordinary
      // completed thoughts land around 60-90 ms, enough to sound human without
      // producing the old sentence-by-sentence take-reset effect.
      if (strength < 0.28) {
        return Math.round(28 + strength * 55 + lengthBonus * 0.45);
      }
      return Math.round(46 + strength * 62 + lengthBonus);'''
new = '''      // V14 completed-sentence breath: keep all declarative sentence endings
      // within the user-requested 70-120 ms range. Semantic boundary strength
      // and sentence length still decide where inside that range the breath lands.
      const lengthBonus = Math.min(14, Math.max(0, (words - 6) * 1.2));
      const sentenceBreath = 68 + strength * 50 + lengthBonus;
      return Math.round(clamp(sentenceBreath, 70, 120));'''
assert old in text, 'sentence duration anchor not found'
text = text.replace(old, new, 1)

old = '      output += `<break time="${clean.length >= 220 ? 30 : 24}ms"/>`;'
new = '      output += `<break time="${clean.length >= 220 ? 40 : 30}ms"/>`;'
assert old in text, 'long-clause breath anchor not found'
text = text.replace(old, new, 1)

old = '''  // Story V13: three breathing levels inside one continuous acoustic state:
  // clause breath < completed-sentence breath < paragraph/discourse breath.'''
new = '''  // Story V14: three breathing levels inside one continuous acoustic state:
  // clause breath 30-40 ms < completed-sentence breath 70-120 ms <
  // paragraph/discourse breath 170-300 ms.'''
assert old in text, 'V13 comment anchor not found'
text = text.replace(old, new, 1)

path.write_text(text)

page_path = Path('app/page.tsx')
page = page_path.read_text()
old = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 句间呼吸 · 段落感知", rateFactor: 1 },'
new = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 自然句间呼吸 · 段落停留", rateFactor: 1 },'
if old in page:
    page = page.replace(old, new, 1)
page_path.write_text(page)
