from pathlib import Path

path = Path('app/api/synthesize/route.ts')
s = path.read_text()

marker = '''function buildEdgeSsml(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n  _documentPlan?: EdgeDocumentPlan,\n) {\n'''
if marker not in s:
    raise SystemExit('buildEdgeSsml marker not found')

native = '''function edgeNativeProsody(\n  text: string,\n  settings: EdgeVoiceSettings,\n  voice: string,\n  preset: PresetName,\n) {\n  const presetSettings = PRESETS[preset];\n  const isDaulet = voice === "kk-KZ-DauletNeural";\n  const antiCreakRate = isDaulet ? 1.002 : 1;\n  const antiCreakPitch = isDaulet ? 1.8 : 0;\n\n  const effectiveSpeed = clamp(\n    settings.speed * presetSettings.rateFactor * antiCreakRate,\n    0.58,\n    1.35,\n  );\n  const effectivePitch = clamp(\n    settings.pitch + presetSettings.pitch + antiCreakPitch,\n    -18,\n    18,\n  );\n  const effectiveVolume = clamp(\n    settings.volume + presetSettings.volume,\n    -7,\n    7,\n  );\n\n  return `<prosody rate="${speedToRate(effectiveSpeed)}" pitch="${signedPercent(effectivePitch)}" volume="${signedPercent(effectiveVolume)}">${escapeXml(text)}</prosody>`;\n}\n\n'''

if 'function edgeNativeProsody(' not in s:
    s = s.replace(marker, native + marker, 1)

path.write_text(s)
print('restored native Edge prosody after emotion tag removal')
