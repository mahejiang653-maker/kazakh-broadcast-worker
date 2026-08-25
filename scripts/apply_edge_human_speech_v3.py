from pathlib import Path
import re

route_path = Path('app/api/synthesize/route.ts')
omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
page_path = Path('app/page.tsx')

route = route_path.read_text()
omni = omni_path.read_text()
page = page_path.read_text()

# 1) Wire in the conservative speech-text frontend.
import_anchor = '''import { analyzeEdgeDocument, type EdgeDocumentPlan } from "../../lib/edge-director";\n'''
if 'edge-humanizer' not in route:
    assert import_anchor in route, 'route import anchor not found'
    route = route.replace(
        import_anchor,
        import_anchor + 'import { prepareEdgeHumanText } from "../../lib/edge-humanizer";\n',
        1,
    )

# 2) Keep far more text in one native Microsoft synthesis request. This is the
# biggest continuity win: fewer acoustic cold starts and fewer MP3 seams.
assert 'const EDGE_MAX_CHUNK_SIZE = 1600;' in route, 'EDGE_MAX_CHUNK_SIZE old value not found'
route = route.replace('const EDGE_MAX_CHUNK_SIZE = 1600;', 'const EDGE_MAX_CHUNK_SIZE = 4800;', 1)

# 3) Use Microsoft's higher quality supported MP3 output.
assert '"X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",' in route, 'Edge output format not found'
route = route.replace(
    '"X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",',
    '"X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3",',
    1,
)

# Edge long requests may legitimately take longer than the old 30s timeout.
old_timeout = '''      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual),\n    },\n    30000,\n  );'''
new_timeout = '''      body: buildEdgeSsml(text, voice, preset, settings, documentPlan, useMultilingual),\n    },\n    120000,\n  );'''
assert old_timeout in route, 'Edge timeout block not found'
route = route.replace(old_timeout, new_timeout, 1)

# 4) Replace the old short-chunk parallel path with a long-context primary path
# and a safe smaller fallback. Fallback only happens when the service rejects a
# long request, so normal generation keeps maximal native context.
pattern = re.compile(
    r'''async function synthesizeWithEdge\(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n\) \{.*?\n\}\n\nasync function synthesizeWithEleven''',
    re.S,
)
replacement = '''async function synthesizeWithEdge(\n  text: string,\n  voice: string,\n  preset: PresetName,\n  settings: EdgeVoiceSettings,\n) {\n  const endpoint = await getEndpoint();\n  const preparedText = prepareEdgeHumanText(text);\n  if (!preparedText) return [];\n\n  // Preserve one coherent article context for as long as the service allows.\n  // Unlike the older 1600-character path, a typical news article now needs\n  // only one request (or two for very long copy), which greatly reduces the\n  // audible prosody reset at MP3 boundaries.\n  const documentPlan = analyzeEdgeDocument(preparedText);\n  const effectiveSpeed = settings.speed * PRESETS[preset].rateFactor;\n  const chunks = splitEdgeTextByDuration(\n    preparedText,\n    effectiveSpeed,\n    EDGE_MAX_CHUNK_SIZE,\n    210,\n    480,\n  );\n  const useMultilingual = hasHanCharacters(preparedText);\n  const audioChunks: ArrayBuffer[] = [];\n\n  for (const chunk of chunks) {\n    try {\n      audioChunks.push(\n        await synthesizeEdgeChunk(\n          chunk,\n          voice,\n          preset,\n          settings,\n          endpoint,\n          documentPlan,\n          useMultilingual,\n        ),\n      );\n      continue;\n    } catch (error) {\n      // Be aggressive about context, conservative about reliability: if this\n      // internal Edge endpoint ever rejects a long request, retry it at a much\n      // smaller sentence-aware size instead of failing the user's whole稿件.\n      if (chunk.length < 2300) throw error;\n      const fallbackChunks = splitEdgeTextByDuration(\n        chunk,\n        effectiveSpeed,\n        2100,\n        78,\n        145,\n      );\n      if (fallbackChunks.length <= 1) throw error;\n      for (const fallback of fallbackChunks) {\n        audioChunks.push(\n          await synthesizeEdgeChunk(\n            fallback,\n            voice,\n            preset,\n            settings,\n            endpoint,\n            documentPlan,\n            useMultilingual,\n          ),\n        );\n      }\n    }\n  }\n\n  return audioChunks;\n}\n\nasync function synthesizeWithEleven'''
route, n = pattern.subn(replacement, route, count=1)
assert n == 1, 'synthesizeWithEdge function not replaced'

# 5) Improve duration estimation for occasional Chinese runs in mixed news.
old_weight = '''    if (/\\p{N}/u.test(char)) {\n      weight += 2.8;\n    } else if (/\\s/u.test(char)) {'''
new_weight = '''    if (/\\p{N}/u.test(char)) {\n      weight += 2.8;\n    } else if (/\\p{Script=Han}/u.test(char)) {\n      // A Han character generally expands to a full spoken syllable; assign a\n      // larger budget so mixed-language articles are not packed too tightly.\n      weight += 2.15;\n    } else if (/\\s/u.test(char)) {'''
assert old_weight in omni, 'speechWeight numeric block not found'
omni = omni.replace(old_weight, new_weight, 1)

# Emotion tags were removed earlier; remove the stale sentenceFragments comment/code
# that attempted to keep them attached to sentence endings.
omni = re.sub(
    r'''\n    // Keep a sentence-end \[情绪\] tag attached to the sentence it controls\.\n    let cursor = end;\n    while \(/\\s/u\.test\(text\[cursor\] \?\? ""\)\) cursor \+= 1;\n    const tail = text\.slice\(cursor, cursor \+ 48\);\n    const tag = tail\.match\(/\^\[\\\[【\]\[\^\\\]】\\r\\n\]\{1,30\}\[\\\]】\]/u\);\n    if \(tag\) end = cursor \+ tag\[0\]\.length;\n''',
    '\n',
    omni,
    count=1,
)

# 6) User-visible copy. Do not claim a different model; describe what we really do.
page = page.replace(
    'Edge TTS · 免费增强模式',
    'Edge TTS · 免费真人化模式',
    1,
)
page = page.replace(
    '支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格。',
    '支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格；新增长上下文合成与哈萨克语真人化文本前端，尽量减少长稿分段后的语气重置。',
    1,
)

route_path.write_text(route)
omni_path.write_text(omni)
page_path.write_text(page)
print('applied Edge human speech v3: long context, text frontend, high-bitrate output, safe fallback')
