from pathlib import Path

route = Path('app/api/synthesize/route.ts')
s = route.read_text()

old_presets = '''const PRESETS = {
  news: { rateFactor: 1, pitch: -1, volume: 1 },
  calm: { rateFactor: 0.92, pitch: -2, volume: -1 },
  bulletin: { rateFactor: 1.08, pitch: 0, volume: 2 },
  expressive: { rateFactor: 1.02, pitch: 3, volume: 2 },
} as const;'''
new_presets = '''const PRESETS = {
  news: { rateFactor: 0.96, pitch: -0.5, volume: 0 },
  calm: { rateFactor: 0.9, pitch: -1.5, volume: -0.5 },
  bulletin: { rateFactor: 1.03, pitch: -0.5, volume: 0.5 },
  expressive: { rateFactor: 0.98, pitch: 1, volume: 0.5 },
} as const;'''
if old_presets not in s:
    raise SystemExit('PRESETS marker not found')
s = s.replace(old_presets, new_presets)

old_edge = '''function edgeProsody(
  text: string,
  settings: EdgeVoiceSettings,
  preset: PresetName,
  tag?: string,
) {
  const presetSettings = PRESETS[preset];
  const tagSettings = tag ? EDGE_TAG_STYLES[tag] : undefined;
  const effectiveSpeed = clamp(
    settings.speed * presetSettings.rateFactor * (tagSettings?.rateFactor ?? 1),
    0.5,
    1.5,
  );
  const effectivePitch = clamp(
    settings.pitch + presetSettings.pitch + (tagSettings?.pitch ?? 0),
    -35,
    35,
  );
  const effectiveVolume = clamp(
    settings.volume + presetSettings.volume + (tagSettings?.volume ?? 0),
    -12,
    12,
  );

  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;
}'''
new_edge = '''function edgeSoftBreakLongPhrase(text: string) {
  const words = text.split(/(\\s+)/u);
  let lengthSinceBreak = 0;
  let output = "";

  for (const part of words) {
    if (!part) continue;
    output += escapeXml(part);
    lengthSinceBreak += part.length;

    if (/\\s+/u.test(part) && lengthSinceBreak >= 76) {
      output += '<break time="55ms"/>';
      lengthSinceBreak = 0;
    }
  }

  return output;
}

function edgeNaturalMarkup(text: string) {
  const normalized = text
    .replaceAll("\\r\\n", "\\n")
    .replaceAll("\\r", "\\n")
    .replace(/[\\t ]+/gu, " ");
  const pieces = normalized.split(/(\\n+|[，,；;：:。.!！？?…]+)/u);
  let output = "";

  for (const piece of pieces) {
    if (!piece) continue;

    if (/^\\n+$/u.test(piece)) {
      output += '<break time="240ms"/>';
      continue;
    }

    if (/^[，,]+$/u.test(piece)) {
      output += `${escapeXml(piece)}<break time="75ms"/>`;
      continue;
    }

    if (/^[；;]+$/u.test(piece)) {
      output += `${escapeXml(piece)}<break time="110ms"/>`;
      continue;
    }

    if (/^[：:]+$/u.test(piece)) {
      output += `${escapeXml(piece)}<break time="90ms"/>`;
      continue;
    }

    if (/^[。.!]+$/u.test(piece)) {
      output += `${escapeXml(piece)}<break time="190ms"/>`;
      continue;
    }

    if (/^[！？?]+$/u.test(piece)) {
      output += `${escapeXml(piece)}<break time="165ms"/>`;
      continue;
    }

    if (/^…+$/u.test(piece)) {
      output += `${escapeXml(piece)}<break time="175ms"/>`;
      continue;
    }

    output += edgeSoftBreakLongPhrase(piece);
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
  const softenedTagRate = 1 + ((tagSettings?.rateFactor ?? 1) - 1) * 0.62;
  const softenedTagPitch = (tagSettings?.pitch ?? 0) * 0.45;
  const softenedTagVolume = (tagSettings?.volume ?? 0) * 0.55;

  const effectiveSpeed = clamp(
    settings.speed * presetSettings.rateFactor * softenedTagRate,
    0.58,
    1.35,
  );
  const effectivePitch = clamp(
    settings.pitch + presetSettings.pitch + softenedTagPitch,
    -20,
    20,
  );
  const effectiveVolume = clamp(
    settings.volume + presetSettings.volume + softenedTagVolume,
    -8,
    8,
  );

  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${edgeNaturalMarkup(text)}</prosody>`;
}'''
if old_edge not in s:
    raise SystemExit('edgeProsody marker not found')
s = s.replace(old_edge, new_edge)

s = s.replace('"X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",', '"X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",')

route.write_text(s)
print('Edge naturalness optimization applied')
