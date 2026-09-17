from pathlib import Path

path = Path('app/lib/edge-omnivoice-inspired.ts')
text = path.read_text()

text = text.replace('import { structureEdgeText } from "./edge-natural-structure";\n', '', 1)

start = text.index('type DurationFragment = {')
end = text.index('function tokenize(source: string) {')

replacement = r'''export type EdgeChunkBoundaryKind =
  | "paragraph"
  | "line"
  | "sentence"
  | "whitespace"
  | "hard"
  | "end";

export type EdgeChunkPlan = {
  text: string;
  start: number;
  end: number;
  boundary: EdgeChunkBoundaryKind;
  estimatedSeconds: number;
};

type NaturalBoundaryKind = Exclude<EdgeChunkBoundaryKind, "hard" | "end">;
type NaturalBoundary = { index: number; kind: NaturalBoundaryKind };

const EDGE_BOUNDARY_QUALITY: Record<NaturalBoundaryKind, number> = {
  paragraph: 1.15,
  line: 0.95,
  sentence: 0.85,
  whitespace: 0.15,
};

function collectEdgeNaturalBoundaries(source: string): NaturalBoundary[] {
  const definitions: Array<{ kind: NaturalBoundaryKind; regex: RegExp }> = [
    { kind: "paragraph", regex: /\n(?:[\t ]*\n)+/g },
    { kind: "line", regex: /\n/g },
    {
      kind: "sentence",
      regex: /[.!?。！？;；…]+["'”’»›》」』】）)\]]*(?=\s|$)/gu,
    },
    { kind: "whitespace", regex: /[^\S\r\n]+/gu },
  ];

  const byIndex = new Map<number, NaturalBoundaryKind>();
  for (const definition of definitions) {
    definition.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = definition.regex.exec(source)) !== null) {
      const index = match.index + match[0].length;
      if (index <= 0 || index >= source.length) continue;
      const previous = byIndex.get(index);
      if (!previous || EDGE_BOUNDARY_QUALITY[definition.kind] > EDGE_BOUNDARY_QUALITY[previous]) {
        byIndex.set(index, definition.kind);
      }
    }
  }

  return [...byIndex.entries()]
    .map(([index, kind]) => ({ index, kind }))
    .sort((a, b) => a.index - b.index);
}

function safeUtf16Cut(source: string, start: number, proposed: number) {
  let cut = Math.min(source.length, Math.max(start + 1, proposed));
  if (cut >= source.length || cut <= start) return cut;
  const previous = source.charCodeAt(cut - 1);
  const next = source.charCodeAt(cut);
  const highSurrogate = previous >= 0xd800 && previous <= 0xdbff;
  const lowSurrogate = next >= 0xdc00 && next <= 0xdfff;
  if (highSurrogate && lowSurrogate && cut - 1 > start) cut -= 1;
  return cut;
}

function durationLimitedEnd(
  source: string,
  start: number,
  hardEnd: number,
  speed: number,
  seconds: number,
) {
  if (seconds <= 0 || hardEnd <= start + 1) return hardEnd;
  if (estimateEdgeSpeechSeconds(source.slice(start, hardEnd), speed) <= seconds) {
    return hardEnd;
  }

  let low = start + 1;
  let high = hardEnd;
  let best = start + 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const duration = estimateEdgeSpeechSeconds(source.slice(start, mid), speed);
    if (duration <= seconds) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return safeUtf16Cut(source, start, best);
}

function dependencyScoreAtBoundary(source: string, start: number, boundary: number) {
  const left = source.slice(Math.max(start, boundary - 180), boundary).trim();
  const right = source.slice(boundary, Math.min(source.length, boundary + 180)).trim();
  if (!left || !right) return 0;
  return kazakhDependencyGuard(left, right).score;
}

function chooseEdgeNaturalBoundary(
  source: string,
  boundaries: NaturalBoundary[],
  start: number,
  end: number,
) {
  const span = Math.max(1, end - start);
  const minIndex = start + Math.max(32, Math.floor(span * 0.52));
  let best: { boundary: NaturalBoundary; score: number } | null = null;

  for (const boundary of boundaries) {
    if (boundary.index <= minIndex) continue;
    if (boundary.index > end) break;

    const fill = (boundary.index - start) / span;
    const dependency = boundary.kind === "whitespace"
      ? dependencyScoreAtBoundary(source, start, boundary.index)
      : 0;
    const quotePenalty = hasOpenQuoteAtEnd(source.slice(start, boundary.index)) ? 0.9 : 0;
    const dependencyPenalty = boundary.kind === "whitespace" ? dependency * 1.35 : dependency * 0.3;
    const score = fill * 2.35 + EDGE_BOUNDARY_QUALITY[boundary.kind] - quotePenalty - dependencyPenalty;

    if (!best || score > best.score) best = { boundary, score };
  }

  return best?.boundary ?? null;
}

/**
 * V36: lossless Edge chunk planning inspired by modern Edge-TTS segmenters.
 * It never reconstructs the article from parsed sentences. Instead it slices the
 * prepared source directly so punctuation, quotes and layout survive exactly.
 * Natural seam priority is paragraph/line/sentence, then a dependency-safe word
 * boundary; a Unicode-safe hard split is used only as the final fallback.
 *
 * The returned metadata is intentionally kept separate from synthesis so a future
 * Read-Aloud/SentenceBoundary transport can reconcile observed boundaries without
 * rewriting the document/emotion/prosody layers.
 */
export function planEdgeTextChunks(
  source: string,
  speed: number,
  maxChars = 1600,
  targetSeconds = 34,
  thresholdSeconds = 52,
): EdgeChunkPlan[] {
  const normalized = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
  if (!normalized) return [];

  if (
    normalized.length <= maxChars &&
    estimateEdgeSpeechSeconds(normalized, speed) <= thresholdSeconds
  ) {
    return [{
      text: normalized,
      start: 0,
      end: normalized.length,
      boundary: "end",
      estimatedSeconds: estimateEdgeSpeechSeconds(normalized, speed),
    }];
  }

  const boundaries = collectEdgeNaturalBoundaries(normalized);
  const chunks: EdgeChunkPlan[] = [];
  let start = 0;

  while (start < normalized.length) {
    const rawHardEnd = Math.min(normalized.length, start + maxChars);
    const hardEnd = safeUtf16Cut(normalized, start, rawHardEnd);
    const allowedEnd = durationLimitedEnd(
      normalized,
      start,
      hardEnd,
      speed,
      thresholdSeconds,
    );

    if (allowedEnd >= normalized.length) {
      const value = normalized.slice(start);
      chunks.push({
        text: value,
        start,
        end: normalized.length,
        boundary: "end",
        estimatedSeconds: estimateEdgeSpeechSeconds(value, speed),
      });
      break;
    }

    const preferredSeconds = Math.min(thresholdSeconds, targetSeconds * 1.18);
    const preferredEnd = durationLimitedEnd(
      normalized,
      start,
      allowedEnd,
      speed,
      preferredSeconds,
    );

    let natural = chooseEdgeNaturalBoundary(normalized, boundaries, start, preferredEnd);
    if (!natural && preferredEnd < allowedEnd) {
      natural = chooseEdgeNaturalBoundary(normalized, boundaries, start, allowedEnd);
    }

    let end = natural?.index ?? safeUtf16Cut(normalized, start, allowedEnd);
    let boundary: EdgeChunkBoundaryKind = natural?.kind ?? "hard";

    // If the preferred window produced an unusually small chunk but there is
    // still plenty of safe room, retry across the full allowed window. This keeps
    // acoustic context long and avoids creating extra MP3 seams merely because a
    // paragraph boundary happened very early in the window.
    if (end - start < Math.min(900, Math.floor((allowedEnd - start) * 0.42))) {
      const wider = chooseEdgeNaturalBoundary(normalized, boundaries, start, allowedEnd);
      if (wider && wider.index > end) {
        end = wider.index;
        boundary = wider.kind;
      }
    }

    if (end <= start) {
      end = safeUtf16Cut(normalized, start, Math.min(normalized.length, start + maxChars));
      boundary = "hard";
    }

    const value = normalized.slice(start, end);
    chunks.push({
      text: value,
      start,
      end,
      boundary,
      estimatedSeconds: estimateEdgeSpeechSeconds(value, speed),
    });
    start = end;
  }

  // Do not leave a tiny trailing request. Merge it losslessly back into the
  // previous contiguous chunk when both character and duration budgets allow it.
  if (chunks.length >= 2) {
    const tail = chunks[chunks.length - 1];
    const previous = chunks[chunks.length - 2];
    const combinedText = `${previous.text}${tail.text}`;
    const combinedSeconds = estimateEdgeSpeechSeconds(combinedText, speed);
    if (
      tail.estimatedSeconds < 9 &&
      combinedText.length <= maxChars &&
      combinedSeconds <= thresholdSeconds
    ) {
      chunks.splice(chunks.length - 2, 2, {
        text: combinedText,
        start: previous.start,
        end: tail.end,
        boundary: tail.boundary,
        estimatedSeconds: combinedSeconds,
      });
    }
  }

  return chunks;
}

export function splitEdgeTextByDuration(
  source: string,
  speed: number,
  maxChars = 1600,
  targetSeconds = 34,
  thresholdSeconds = 52,
) {
  return planEdgeTextChunks(
    source,
    speed,
    maxChars,
    targetSeconds,
    thresholdSeconds,
  ).map((chunk) => chunk.text);
}

'''

text = text[:start] + replacement + text[end:]
path.write_text(text)
