from pathlib import Path

route_path = Path('app/api/synthesize/route.ts')
route = route_path.read_text()

old = '    const rawText = group.items.map((sentence) => sentence.text).join(" ");'
new = '''    // V12: preserve true source paragraph transitions inside the same acoustic
    // movement. V10 flattened these to spaces, so downstream semantic/emotion
    // analysis could no longer know that one narrative paragraph had finished.
    // Double newlines remain inside one prosody stream: they create a breath,
    // not a new voice take.
    const rawText = group.items
      .map((sentence, index) => {
        if (index === 0) return sentence.text;
        const previous = group.items[index - 1];
        return `${previous.paragraphIndex !== sentence.paragraphIndex ? "\\n\\n" : " "}${sentence.text}`;
      })
      .join("");'''
assert old in route, 'rawText join anchor not found'
route = route.replace(old, new, 1)
route_path.write_text(route)

omni_path = Path('app/lib/edge-omnivoice-inspired.ts')
omni = omni_path.read_text()

old = '''  // Question marks retain question intonation regardless of this score. The
  // score controls boundary/pause strength only, not the interrogative contour.
  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);
  if (kind === "mixed") strength = Math.max(strength, 0.6);

  return clamp(strength, 0.04, 0.96);'''
new = '''  // Story V12: a real source paragraph is a discourse event, not just layout.
  // Preserve a stronger boundary when the document moves into a new role,
  // transition, climax, ending or explicitly contrastive/resultative paragraph.
  // Same-segment paragraphs still receive a smaller but audible breath.
  if (deliveryMode === "story" && kind === "paragraph") {
    const majorParagraphShift =
      roleChanged ||
      startsWithCue(next.text, STRONG_BOUNDARY_STARTERS) ||
      ["climax", "ending"].includes(current.segment?.role ?? "") ||
      ["lead", "transition", "climax", "ending"].includes(next.segment?.role ?? "");
    strength = Math.max(
      strength,
      majorParagraphShift ? 0.84 : sameSegment ? 0.7 : 0.77,
    );
  }

  // Question marks retain question intonation regardless of this score. The
  // score controls boundary/pause strength only, not the interrogative contour.
  if (kind === "question") strength = Math.max(strength, sameDirectQuote ? 0.42 : 0.5);
  if (kind === "mixed") strength = Math.max(strength, 0.6);

  return clamp(strength, 0.04, 0.96);'''
assert old in omni, 'semantic boundary anchor not found'
omni = omni.replace(old, new, 1)

old = '''    if (kind === "paragraph") {
      return strength >= 0.68 ? Math.round(42 + strength * 34) : 0;
    }'''
new = '''    if (kind === "paragraph") {
      if (strength < 0.64) return 0;
      // Keep the same speaker/prosody state while allowing the listener to feel
      // that one completed narrative unit has ended before the next begins.
      // Ordinary paragraph: roughly 120-145 ms. Major semantic/emotional shift:
      // roughly 165-205 ms.
      return strength >= 0.84
        ? Math.round(108 + strength * 92)
        : Math.round(82 + strength * 72);
    }'''
assert old in omni, 'story paragraph break anchor not found'
omni = omni.replace(old, new, 1)
omni_path.write_text(omni)

page_path = Path('app/page.tsx')
page = page_path.read_text()
old = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 自然呼吸 · 真人旁白", rateFactor: 1 },'
new = '{ id: "story", label: "故事版", note: "逐词情绪分析 · 段落感知 · 自然呼吸", rateFactor: 1 },'
assert old in page, 'story preset note anchor not found'
page = page.replace(old, new, 1)
page_path.write_text(page)
