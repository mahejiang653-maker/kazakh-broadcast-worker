from pathlib import Path

path = Path('app/api/synthesize/route.ts')
s = path.read_text()

old = '''function edgeNativeProsody(text: string, settings: EdgeVoiceSettings) {
  const effectiveSpeed = clamp(settings.speed, 0.58, 1.35);
  const effectivePitch = clamp(settings.pitch, -18, 18);
  const effectiveVolume = clamp(settings.volume, -7, 7);
  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;
}'''

new = '''function edgeNativeProsody(text: string, settings: EdgeVoiceSettings, voice: string) {
  // Daulet's natural register can become slightly creaky in the low end.
  // A tiny register lift reduces vocal-fry perception without changing his identity.
  const isDaulet = voice === "kk-KZ-DauletNeural";
  const antiCreakRate = isDaulet ? 1.004 : 1;
  const antiCreakPitch = isDaulet ? 1.4 : 0;

  const effectiveSpeed = clamp(settings.speed * antiCreakRate, 0.58, 1.35);
  const effectivePitch = clamp(settings.pitch + antiCreakPitch, -18, 18);
  const effectiveVolume = clamp(settings.volume, -7, 7);
  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;
}'''

if old not in s:
    raise SystemExit('edgeNativeProsody marker not found')
s = s.replace(old, new, 1)

old_call = '      edgeNativeProsody(text, settings),'
new_call = '      edgeNativeProsody(text, settings, voice),'
if old_call not in s:
    raise SystemExit('edgeNativeProsody call marker not found')
s = s.replace(old_call, new_call, 1)

path.write_text(s)
print('applied Daulet anti-creak compensation')
