from pathlib import Path

route = Path('app/api/synthesize/route.ts')
s = route.read_text()

import_line = 'import { renderEdgeDirectorMarkup } from "../../lib/edge-director";\n\n'
if 'renderEdgeDirectorMarkup' not in s:
    s = import_line + s

old = '  return edgeNaturalMarkup(text, effectiveSpeed, effectivePitch, effectiveVolume);'
new = '''  return renderEdgeDirectorMarkup(text, {
    speed: effectiveSpeed,
    pitch: effectivePitch,
    volume: effectiveVolume,
  });'''

if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('edgeProsody return marker not found')

route.write_text(s)
print('wired context-aware Edge director')
