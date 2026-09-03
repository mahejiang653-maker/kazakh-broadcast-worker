from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
page_path = Path('app/page.tsx')
route = route_path.read_text(encoding='utf-8')
page = page_path.read_text(encoding='utf-8')

anchor = '''function newsItemPresenterLift(preset: PresetName) {\n  switch (preset) {\n    case "calm":\n      return { rate: -1.05, pitch: 0.1, volume: 0.06 };\n    case "bulletin":\n      return { rate: -0.45, pitch: 0.18, volume: 0.08 };\n    case "expressive":\n      return { rate: -0.7, pitch: 0.24, volume: 0.1 };\n    default:\n      return { rate: -0.8, pitch: 0.14, volume: 0.07 };\n  }\n}\n'''
insert = anchor + '''\nfunction newsItemPresenterClose(preset: PresetName, sentenceModeProtected: boolean) {\n  // A professional item ending is mostly phrase-final settling, not silence.\n  // Questions/exclamations keep their native sentence contour and receive only\n  // a tiny timing release before the next item.\n  if (sentenceModeProtected) {\n    return { rate: -0.22, pitch: 0, volume: -0.01 };\n  }\n  switch (preset) {\n    case "calm":\n      return { rate: -0.78, pitch: -0.16, volume: -0.035 };\n    case "bulletin":\n      return { rate: -0.38, pitch: -0.09, volume: -0.018 };\n    case "expressive":\n      return { rate: -0.5, pitch: -0.12, volume: -0.022 };\n    default:\n      return { rate: -0.58, pitch: -0.12, volume: -0.025 };\n  }\n}\n'''
if anchor not in route:
    raise SystemExit('presenter lift anchor not found')
route = route.replace(anchor, insert, 1)

old = '''  for (const group of groups) {\n    if (openParagraph !== group.paragraphIndex) {'''
new = '''  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {\n    const group = groups[groupIndex];\n    const nextGroup = groups[groupIndex + 1];\n    const newsItemClosing = Boolean(nextGroup?.newsItemOpening);\n    const sameParagraphHandoff = Boolean(\n      newsItemClosing && nextGroup?.paragraphIndex === group.paragraphIndex,\n    );\n    if (openParagraph !== group.paragraphIndex) {'''
if old not in route:
    raise SystemExit('group loop anchor not found')
route = route.replace(old, new, 1)

old = '''    if (group.newsItemOpening) {\n      const presenter = newsItemPresenterLift(preset);\n      weighted.rate += presenter.rate;\n      weighted.pitch += presenter.pitch;\n      weighted.volume += presenter.volume;\n    }\n\n    const rawText = group.sentences.map((sentence) => sentence.text).join(" ");'''
new = '''    if (group.newsItemOpening) {\n      const presenter = newsItemPresenterLift(preset);\n      weighted.rate += presenter.rate;\n      weighted.pitch += presenter.pitch;\n      weighted.volume += presenter.volume;\n    }\n\n    if (newsItemClosing) {\n      const terminalText = group.sentences[group.sentences.length - 1]?.text.trim() ?? "";\n      const sentenceModeProtected = /[?？!！](?:[»”\"'’」』）\\])}]*)?$/u.test(terminalText);\n      const close = newsItemPresenterClose(preset, sentenceModeProtected);\n      weighted.rate += close.rate;\n      weighted.pitch += close.pitch;\n      weighted.volume += close.volume;\n    }\n\n    const rawText = group.sentences.map((sentence) => sentence.text).join(" ");'''
if old not in route:
    raise SystemExit('opening lift anchor not found')
route = route.replace(old, new, 1)

old = '''    } else {\n      body += `${content} `;\n    }\n  }\n\n  if (openParagraph !== null) body += "</p>";'''
new = '''    } else {\n      body += `${content} `;\n    }\n\n    // When two item labels occur inside one source paragraph there is no layout\n    // boundary for the neural voice to use. Add one short presenter hand-off.\n    // Separate paragraphs already carry their own semantic paragraph boundary,\n    // so we deliberately avoid stacking another fixed pause there.\n    if (sameParagraphHandoff) body += '<break time="78ms"/>';\n  }\n\n  if (openParagraph !== null) body += "</p>";'''
if old not in route:
    raise SystemExit('group tail anchor not found')
route = route.replace(old, new, 1)

page = page.replace(
    '{ id: "news", label: "标准新闻", note: "主持人语调 · 条目自然转场", rateFactor: 1.01 },',
    '{ id: "news", label: "标准新闻", note: "主持人语调 · 条目开场与收尾", rateFactor: 1.01 },',
    1,
)
page = page.replace(
    '{ id: "calm", label: "沉稳长稿", note: "沉稳主持 · 长稿连续播报", rateFactor: 0.97 },',
    '{ id: "calm", label: "沉稳长稿", note: "沉稳主持 · 条目自然收束", rateFactor: 0.97 },',
    1,
)
page = page.replace(
    '{ id: "bulletin", label: "简明快讯", note: "快讯主持 · 紧凑清晰", rateFactor: 1.045 },',
    '{ id: "bulletin", label: "简明快讯", note: "快讯主持 · 紧凑条目节奏", rateFactor: 1.045 },',
    1,
)
page = page.replace(
    '{ id: "expressive", label: "生动播报", note: "主持人表现 · 情绪有起伏", rateFactor: 1.01 },',
    '{ id: "expressive", label: "生动播报", note: "主持人表现 · 转场有起伏", rateFactor: 1.01 },',
    1,
)

route_path.write_text(route, encoding='utf-8')
page_path.write_text(page, encoding='utf-8')
