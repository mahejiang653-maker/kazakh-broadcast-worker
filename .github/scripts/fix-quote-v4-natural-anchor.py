from pathlib import Path

path = Path('app/lib/edge-natural-structure.ts')
text = path.read_text(encoding='utf-8')
original = text

if 'function isReportingContinuation(text: string, index: number)' not in text:
    anchor = 'function splitSentences(paragraph: string, paragraphIndex: number) {'
    block = r'''const REPORTING_CONTINUATION_PATTERN =
  /^(?:[,，]?\s*[—–-]\s*)?(?:деді|дейді|деп|айтты|мәлімдеді|хабарлады|жазды|ескертті|түсіндірді|растады|қосты|атап өтті|表示|称|说|指出|宣布|写道|强调|透露|回应|said|says|stated|reported|announced|wrote|noted|added)\b/iu;

function isReportingContinuation(text: string, index: number) {
  const rest = text
    .slice(index + 1, index + 180)
    .replace(/^[»”"'’」』）\])}]+\s*/u, "")
    .trimStart();
  return REPORTING_CONTINUATION_PATTERN.test(rest);
}

'''
    if anchor not in text:
        raise SystemExit('splitSentences anchor not found')
    text = text.replace(anchor, block + anchor, 1)

if 'if (isReportingContinuation(paragraph, index)) continue;' not in text:
    target = '''    while (/[»”"'’）\\])}]/u.test(paragraph[index + 1] ?? "")) {
      index += 1;
      buffer += paragraph[index];
    }
    flush();'''
    replacement = '''    while (/[»”"'’）\\])}]/u.test(paragraph[index + 1] ?? "")) {
      index += 1;
      buffer += paragraph[index];
    }
    // In Kazakh direct speech, terminal punctuation can be followed by a dash
    // and the author's reporting clause. Keep both sides in one acoustic unit.
    if (isReportingContinuation(paragraph, index)) continue;
    flush();'''
    if target not in text:
        # Safer structural fallback: this exact flush is the sentence-loop flush.
        marker = '''    }
    flush();
  }

  flush();
  return sentences;'''
        replacement_marker = '''    }
    // In Kazakh direct speech, terminal punctuation can be followed by a dash
    // and the author's reporting clause. Keep both sides in one acoustic unit.
    if (isReportingContinuation(paragraph, index)) continue;
    flush();
  }

  flush();
  return sentences;'''
        if marker not in text:
            raise SystemExit('sentence flush structural marker not found')
        text = text.replace(marker, replacement_marker, 1)
    else:
        text = text.replace(target, replacement, 1)

if text == original:
    raise SystemExit('Natural structure quote prepatch already applied')
path.write_text(text, encoding='utf-8')
