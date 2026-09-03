from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text(encoding='utf-8')
original = text

old_pattern = '''const REPORTING_VERB_PATTERN =
  /(?:деді|дейді|деп|айтты|мәлімдеді|хабарлады|жазды|ескертті|түсіндірді|растады|қосты|атап өтті|表示|称|说|指出|宣布|写道|强调|透露|回应|said|says|stated|reported|announced|wrote|noted|added)/iu;'''
new_pattern = '''const REPORTING_VERB_PATTERN =
  /(?<![\\p{L}\\p{N}_])(?:деді|дейді|деп|айтты|мәлімдеді|хабарлады|жазды|ескертті|түсіндірді|растады|қосты|атап өтті|said|says|stated|reported|announced|wrote|noted|added)(?![\\p{L}\\p{N}_])|(?:表示|称|说|指出|宣布|写道|强调|透露|回应)/iu;'''
if old_pattern in text:
    text = text.replace(old_pattern, new_pattern, 1)
elif '(?<![\\p{L}\\p{N}_])(?:деді|дейді|деп|' not in text:
    raise SystemExit('Reporting verb boundary anchor not found')

old_hard = '''    const hardBoundary = ["paragraph", "newline"].includes(previous.punctuationKind);'''
new_hard = '''    // A paragraph inside the same open quotation still gets its punctuation
    // pause in renderGroup, but it should not create a new prosody state.
    const hardBoundary =
      ["paragraph", "newline"].includes(previous.punctuationKind) && !sameDirectQuote;'''
if old_hard in text:
    text = text.replace(old_hard, new_hard, 1)
elif '&& !sameDirectQuote;' not in text:
    raise SystemExit('Direct-quote hard boundary anchor not found')

if text == original:
    raise SystemExit('Quote V4 refinements already applied')
path.write_text(text, encoding='utf-8')
