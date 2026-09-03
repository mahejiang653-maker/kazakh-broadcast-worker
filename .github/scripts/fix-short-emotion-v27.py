from pathlib import Path

path = Path('app/lib/edge-story-emotion-trajectory.ts')
text = path.read_text()

old = '''function candidateBoundaries(text: string, tokens: Token[]) {
  const boundaries = new Set<number>([0, text.length]);
  let lastPunctuationBoundary = 0;

  // V25: scan punctuation in one linear pass. The old implementation rebuilt
  // and sorted the entire boundary set at every comma, which became expensive
  // on 9k-15k character long-form scripts with many commas.
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[。.!?！？；;：:—–…]/u.test(char)) {
      const boundary = index + 1;
      boundaries.add(boundary);
      lastPunctuationBoundary = boundary;
    } else if (/[，,]/u.test(char) && index - lastPunctuationBoundary >= 28) {
      const boundary = index + 1;
      boundaries.add(boundary);
      lastPunctuationBoundary = boundary;
    }
  }

  for (const token of tokens) {
    if (TURN_WORDS.has(token.normalized) && token.start >= 18 && text.length - token.start >= 20) {
      boundaries.add(token.start);
    }
  }
  return [...boundaries].sort((a, b) => a - b);
}'''

new = '''function candidateBoundaries(text: string, tokens: Token[]) {
  const boundaries = new Set<number>([0, text.length]);

  // V27: restore the proven pre-V25 emotion-span behavior. Ordinary commas are
  // intentionally not promoted to word-emotion span boundaries here. Comma
  // breathing is handled separately by the semantic/dependency pause planner.
  // Keeping emotion spans coarse prevents comma-heavy 3k-6k scripts from
  // exploding into hundreds of ranges and exhausting Worker CPU.
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/[。.!?！？；;：:—–…]/u.test(char)) boundaries.add(index + 1);
  }

  for (const token of tokens) {
    if (TURN_WORDS.has(token.normalized) && token.start >= 18 && text.length - token.start >= 20) {
      boundaries.add(token.start);
    }
  }
  return [...boundaries].sort((a, b) => a - b);
}'''

assert old in text, 'V25 candidateBoundaries block not found'
text = text.replace(old, new, 1)
path.write_text(text)
