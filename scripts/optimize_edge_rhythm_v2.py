from pathlib import Path
import re

route = Path('app/api/synthesize/route.ts')
s = route.read_text()

start = s.index('function edgeSoftBreakLongPhrase(text: string) {')
end = s.index('\nfunction buildEdgeSsml(', start)

replacement = r'''function edgeSoftBreakLongPhrase(text: string) {
  const words = text.split(/(\s+)/u);
  let lengthSinceBreak = 0;
  let output = "";

  for (const part of words) {
    if (!part) continue;
    output += escapeXml(part);
    lengthSinceBreak += part.length;

    // A very small breath only when a clause has run on for a long time without punctuation.
    if (/\s+/u.test(part) && lengthSinceBreak >= 88) {
      output += '<break time="45ms"/>';
      lengthSinceBreak = 0;
    }
  }

  return output;
}

type EdgeMicroProsody = {
  rateFactor: number;
  pitchDelta: number;
  volumeDelta: number;
};

function edgePhraseProsody(
  text: string,
  speed: number,
  pitch: number,
  volume: number,
  micro: EdgeMicroProsody,
) {
  const phraseSpeed = clamp(speed * micro.rateFactor, 0.58, 1.35);
  const phrasePitch = clamp(pitch + micro.pitchDelta, -20, 20);
  const phraseVolume = clamp(volume + micro.volumeDelta, -8, 8);

  return `<prosody rate="${speedToRate(phraseSpeed)}" pitch="${signedPercent(phrasePitch)}" volume="${signedPercent(phraseVolume)}">${edgeSoftBreakLongPhrase(text)}</prosody>`;
}

function edgePauseForPunctuation(punctuation: string, phraseLength: number) {
  const lengthBonus = Math.min(45, Math.max(0, Math.round((phraseLength - 24) * 0.55)));

  if (/^\n{2,}$/u.test(punctuation)) return 360;
  if (/^\n$/u.test(punctuation)) return 255;
  if (/^[，,]+$/u.test(punctuation)) return 72 + Math.min(32, lengthBonus);
  if (/^[；;]+$/u.test(punctuation)) return 125 + Math.min(30, lengthBonus);
  if (/^[：:]+$/u.test(punctuation)) return 105 + Math.min(25, lengthBonus);
  if (/^[—–-]+$/u.test(punctuation)) return 120 + Math.min(28, lengthBonus);
  if (/^…+$/u.test(punctuation)) return 235 + Math.min(35, lengthBonus);
  if (/^[！？!]+$/u.test(punctuation)) return 205 + Math.min(35, lengthBonus);
  if (/^[？?]+$/u.test(punctuation)) return 225 + Math.min(35, lengthBonus);
  if (/^[。.]+$/u.test(punctuation)) return 220 + Math.min(40, lengthBonus);
  return 0;
}

function edgeMicroForPhrase(
  punctuation: string,
  phraseLength: number,
  paragraphStart: boolean,
  afterColon: boolean,
): EdgeMicroProsody {
  let rateFactor = 1;
  let pitchDelta = 0;
  let volumeDelta = 0;

  // Long clauses need a little more room; very short clauses can stay conversational.
  if (phraseLength >= 95) rateFactor *= 0.975;
  else if (phraseLength >= 62) rateFactor *= 0.988;
  else if (phraseLength > 0 && phraseLength <= 18) rateFactor *= 1.008;

  // Paragraph openings are slightly steadier, like taking a breath before a new thought.
  if (paragraphStart) {
    rateFactor *= 0.988;
    volumeDelta += 0.2;
  }

  // The phrase immediately after a colon often carries the key information.
  if (afterColon) {
    rateFactor *= 0.988;
    volumeDelta += 0.55;
    pitchDelta += 0.2;
  }

  // Sentence-final cadence: tiny changes only, so it never sounds like a pitch effect.
  if (/^[。.]+$/u.test(punctuation)) {
    rateFactor *= 0.985;
    pitchDelta -= 0.9;
  } else if (/^[？?]+$/u.test(punctuation)) {
    rateFactor *= 0.985;
    pitchDelta += 1.15;
  } else if (/^[！？!]+$/u.test(punctuation)) {
    rateFactor *= 0.995;
    pitchDelta += 0.65;
    volumeDelta += 0.45;
  } else if (/^…+$/u.test(punctuation)) {
    rateFactor *= 0.975;
    pitchDelta -= 0.45;
  } else if (/^[；;]+$/u.test(punctuation)) {
    rateFactor *= 0.992;
    pitchDelta -= 0.25;
  }

  return { rateFactor, pitchDelta, volumeDelta };
}

function edgeNaturalMarkup(
  text: string,
  baseSpeed: number,
  basePitch: number,
  baseVolume: number,
) {
  const normalized = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\t ]+/gu, " ");

  const pieces = normalized.split(/(\n{2,}|\n|[，,；;：:—–-]+|[。.]+|[！？!]+|[？?]+|…+)/u);
  let output = "";
  let paragraphStart = true;
  let afterColon = false;

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece) continue;

    const isPunctuation = /^(?:\n+|[，,；;：:—–-]+|[。.]+|[！？!]+|[？?]+|…+)$/u.test(piece);
    if (isPunctuation) {
      const pause = edgePauseForPunctuation(piece, 0);
      if (!/^\n+$/u.test(piece)) output += escapeXml(piece);
      if (pause) output += `<break time="${pause}ms"/>`;
      paragraphStart = /^\n{2,}$/u.test(piece) || paragraphStart;
      afterColon = /^[：:]+$/u.test(piece);
      continue;
    }

    const next = pieces[index + 1] ?? "";
    const punctuation = /^(?:\n+|[，,；;：:—–-]+|[。.]+|[！？!]+|[？?]+|…+)$/u.test(next)
      ? next
      : "";
    const cleanLength = piece.trim().length;
    if (!cleanLength) {
      output += escapeXml(piece);
      continue;
    }

    const micro = edgeMicroForPhrase(punctuation, cleanLength, paragraphStart, afterColon);
    output += edgePhraseProsody(piece, baseSpeed, basePitch, baseVolume, micro);

    // Replace the generic punctuation pause with a length-aware pause on the following token.
    if (punctuation) {
      const pause = edgePauseForPunctuation(punctuation, cleanLength);
      if (!/^\n+$/u.test(punctuation)) output += escapeXml(punctuation);
      if (pause) output += `<break time="${pause}ms"/>`;
      index += 1;
      paragraphStart = /^\n{2,}$/u.test(punctuation);
      afterColon = /^[：:]+$/u.test(punctuation);
    } else {
      paragraphStart = false;
      afterColon = false;
    }
  }

  return output;
}

function edgeProsody(
  text: string,
  settings: EdgeVoiceSettings,
  preset: PresetName,
  tag?: string,
) {
  const presetSettings = PRESETS[preset];
  const tagSettings = tag ? EDGE_TAG_STYLES[tag] : undefined;
  const softenedTagRate = 1 + ((tagSettings?.rateFactor ?? 1) - 1) * 0.48;
  const softenedTagPitch = (tagSettings?.pitch ?? 0) * 0.32;
  const softenedTagVolume = (tagSettings?.volume ?? 0) * 0.42;

  const effectiveSpeed = clamp(
    settings.speed * presetSettings.rateFactor * softenedTagRate,
    0.58,
    1.35,
  );
  const effectivePitch = clamp(
    settings.pitch + presetSettings.pitch + softenedTagPitch,
    -18,
    18,
  );
  const effectiveVolume = clamp(
    settings.volume + presetSettings.volume + softenedTagVolume,
    -7,
    7,
  );

  return edgeNaturalMarkup(text, effectiveSpeed, effectivePitch, effectiveVolume);
}
'''

s = s[:start] + replacement + s[end:]
route.write_text(s)
print('updated Edge rhythm/prosody v2')
