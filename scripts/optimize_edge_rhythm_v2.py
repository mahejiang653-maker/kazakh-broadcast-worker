from pathlib import Path

route = Path('app/api/synthesize/route.ts')
s = route.read_text()

old_import = 'import { renderEdgeDirectorMarkup } from "../../lib/edge-director";'
new_import = 'import { analyzeEdgeDocument, renderEdgeDirectorMarkup, type EdgeDocumentPlan } from "../../lib/edge-director";'
if old_import in s:
    s = s.replace(old_import, new_import, 1)
elif new_import not in s:
    raise SystemExit('edge director import marker not found')

old_sig = '''function edgeProsody(
  text: string,
  settings: EdgeVoiceSettings,
  preset: PresetName,
  tag?: string,
) {'''
new_sig = '''function edgeProsody(
  text: string,
  settings: EdgeVoiceSettings,
  preset: PresetName,
  tag?: string,
  documentPlan?: EdgeDocumentPlan,
) {'''
if old_sig in s:
    s = s.replace(old_sig, new_sig, 1)
elif new_sig not in s:
    raise SystemExit('edgeProsody signature marker not found')

old_render = '''  return renderEdgeDirectorMarkup(text, {
    speed: effectiveSpeed,
    pitch: effectivePitch,
    volume: effectiveVolume,
  });'''
new_render = '''  return renderEdgeDirectorMarkup(
    text,
    {
      speed: effectiveSpeed,
      pitch: effectivePitch,
      volume: effectiveVolume,
    },
    documentPlan,
  );'''
if old_render in s:
    s = s.replace(old_render, new_render, 1)
elif new_render not in s:
    raise SystemExit('renderEdgeDirectorMarkup marker not found')

old_build_sig = '''function buildEdgeSsml(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
) {'''
new_build_sig = '''function buildEdgeSsml(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
  documentPlan?: EdgeDocumentPlan,
) {'''
if old_build_sig in s:
    s = s.replace(old_build_sig, new_build_sig, 1)
elif new_build_sig not in s:
    raise SystemExit('buildEdgeSsml signature marker not found')

s = s.replace(
    'if (before) body += edgeProsody(before, settings, preset);',
    'if (before) body += edgeProsody(before, settings, preset, undefined, documentPlan);',
    1,
)
s = s.replace(
    'body += edgeProsody(sentence, settings, preset, tag);',
    'body += edgeProsody(sentence, settings, preset, tag, documentPlan);',
    1,
)
s = s.replace(
    'if (tail) body += edgeProsody(tail, settings, preset);',
    'if (tail) body += edgeProsody(tail, settings, preset, undefined, documentPlan);',
    1,
)

old_chunk_sig = '''async function synthesizeEdgeChunk(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
  endpoint: TranslatorEndpoint,
) {'''
new_chunk_sig = '''async function synthesizeEdgeChunk(
  text: string,
  voice: string,
  preset: PresetName,
  settings: EdgeVoiceSettings,
  endpoint: TranslatorEndpoint,
  documentPlan: EdgeDocumentPlan,
) {'''
if old_chunk_sig in s:
    s = s.replace(old_chunk_sig, new_chunk_sig, 1)
elif new_chunk_sig not in s:
    raise SystemExit('synthesizeEdgeChunk signature marker not found')

old_body = 'body: buildEdgeSsml(text, voice, preset, settings),'
new_body = 'body: buildEdgeSsml(text, voice, preset, settings, documentPlan),'
if old_body in s:
    s = s.replace(old_body, new_body, 1)
elif new_body not in s:
    raise SystemExit('buildEdgeSsml call marker not found')

old_with_edge = '''  const endpoint = await getEndpoint();
  const chunks = splitEdgeText(text, EDGE_MAX_CHUNK_SIZE);
  return Promise.all(
    chunks.map((chunk) => synthesizeEdgeChunk(chunk, voice, preset, settings, endpoint)),
  );'''
new_with_edge = '''  const endpoint = await getEndpoint();
  // Analyze the complete article before chunking, then reuse one global plan for every audio chunk.
  // This keeps title/lead/background/climax/ending decisions consistent across long-form news.
  const documentPlan = analyzeEdgeDocument(text);
  const chunks = splitEdgeText(text, EDGE_MAX_CHUNK_SIZE);
  return Promise.all(
    chunks.map((chunk) =>
      synthesizeEdgeChunk(chunk, voice, preset, settings, endpoint, documentPlan),
    ),
  );'''
if old_with_edge in s:
    s = s.replace(old_with_edge, new_with_edge, 1)
elif new_with_edge not in s:
    raise SystemExit('synthesizeWithEdge body marker not found')

route.write_text(s)
print('wired Edge full-document director')
