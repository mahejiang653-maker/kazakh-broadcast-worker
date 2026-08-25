from pathlib import Path

route = Path('app/api/synthesize/route.ts')
s = route.read_text()

old_import = 'import { analyzeEdgeDocument, renderEdgeDirectorMarkup, type EdgeDocumentPlan } from "../../lib/edge-director";'
new_import = '''import { analyzeEdgeDocument, type EdgeDocumentPlan } from "../../lib/edge-director";
import {
  renderEdgeOmniInspiredMarkup,
  splitEdgeTextByDuration,
} from "../../lib/edge-omnivoice-inspired";'''
if old_import in s:
    s = s.replace(old_import, new_import, 1)
elif new_import not in s:
    raise SystemExit('edge director import marker not found')

old_render_name = 'return renderEdgeDirectorMarkup('
new_render_name = 'return renderEdgeOmniInspiredMarkup('
if old_render_name in s:
    s = s.replace(old_render_name, new_render_name, 1)
elif new_render_name not in s:
    raise SystemExit('renderer marker not found')

old_tag = '''  const softenedTagRate = 1 + ((tagSettings?.rateFactor ?? 1) - 1) * 0.48;
  const softenedTagPitch = (tagSettings?.pitch ?? 0) * 0.32;
  const softenedTagVolume = (tagSettings?.volume ?? 0) * 0.42;'''
new_tag = '''  // OmniVoice-style control should alter delivery without sounding like a pitch shifter.
  const softenedTagRate = 1 + ((tagSettings?.rateFactor ?? 1) - 1) * 0.38;
  const softenedTagPitch = (tagSettings?.pitch ?? 0) * 0.18;
  const softenedTagVolume = (tagSettings?.volume ?? 0) * 0.30;'''
if old_tag in s:
    s = s.replace(old_tag, new_tag, 1)
elif new_tag not in s:
    raise SystemExit('tag softening marker not found')

old_chunks = '  const chunks = splitEdgeText(text, EDGE_MAX_CHUNK_SIZE);'
new_chunks = '''  // Like OmniVoice, split by estimated speaking duration instead of raw text length.
  // Use longer Edge chunks to preserve Microsoft's native contextual cadence.
  const chunks = splitEdgeTextByDuration(
    text,
    settings.speed * PRESETS[preset].rateFactor,
    EDGE_MAX_CHUNK_SIZE,
  );'''
if old_chunks in s:
    s = s.replace(old_chunks, new_chunks, 1)
elif new_chunks not in s:
    raise SystemExit('duration chunk marker not found')

route.write_text(s)
print('wired OmniVoice-inspired Edge prosody engine')
