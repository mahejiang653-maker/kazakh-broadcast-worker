/** M3-only planning. No text-dependent persona, speaker, model or style changes. */
export const M3_VERSION = "m3-continuous-v5";
export const M3_STRICT_ANCHOR = "One continuous, neutral Kazakh male newsreader. Preserve the selected voice's identity, age impression, resonance, baseline pitch, energy and delivery throughout. Read all names and quotations in the narrator's own voice. No impersonation, dialogue, dramatic acting or topic-dependent emotion. Natural sentence emphasis only.";
export const M3_INPUT_TOKENS = 8192;
export const M3_OUTPUT_TOKENS = 16384;
export const M3_TEMPERATURE = 0.5;
export const NUMBERED_OPENERS = ["Бірінші", "Екінші", "Үшінші", "Төртінші", "Бесінші", "Алтыншы", "Жетінші", "Сегізінші", "Тоғызыншы", "Оныншы", "Он бірінші", "Он екінші", "Он үшінші"];
const openerPattern = NUMBERED_OPENERS.map(x => x.replaceAll(" ", "[ \\t]+" )).join("|");

export function prepareM3Text(input: string) {
  return input.replace(/\r\n?/g, "\n")
    .replaceAll("[短停顿]", "<short pause>").replaceAll("[长停顿]", "<long pause>")
    .replace(/\[(?:叹气|轻笑|清嗓|sad|happy|angry|whispering|excited|laughs|sighs)[^\]]*\]/giu, "")
    // Only pause controls survive in strict news mode. Words/names/quotes remain verbatim.
    .replace(/<(?!short pause>|long pause>)[^>\n]{1,100}>/giu, "")
    .replace(/[|｜]/g, " ")
    .replace(new RegExp(`(^|\\n)([ \\t]*(?:${openerPattern}))[ \\t]*[.。](?:[ \\t]*<short pause>)?[ \\t\\n]*`, "giu"), "$1$2. <short pause>\n")
    .trim();
}

export function m3Style(speed: number) {
  return `${M3_STRICT_ANCHOR} Constant speaking pace: ${Math.round(speed * 100)}% of the selected voice's normal rate.`;
}

export function estimatedM3Seconds(text: string, speed: number) {
  const words = text.replace(/<[^>]+>/g, "").match(/\S+/g)?.length ?? 0;
  // Deliberately conservative; this is planning, never proof of complete recitation.
  return words / (1.8 * speed) + (text.match(/<short pause>/g)?.length ?? 0) * 0.35;
}

export function m3Sections(text: string) {
  const starts = [...text.matchAll(new RegExp(`(?:^|\\n)[ \\t]*(?:${openerPattern})[ \\t]*[.。]`, "giu"))].map(m => m.index!);
  if (!starts.length) return [text];
  const cuts = [...new Set([0, ...starts])];
  const sections = cuts.map((start, i) => text.slice(start, cuts[i + 1] ?? text.length).trim()).filter(Boolean);
  // Separate an existing closing paragraph for the comparison harness only.
  const last = sections.pop()!;
  const end = last.search(/\n[ \t]*Осымен\s/iu);
  sections.push(...(end < 0 ? [last] : [last.slice(0, end).trim(), last.slice(end).trim()]));
  return sections;
}

export function splitM3AtBoundary(text: string): string[] {
  const center = Math.floor(text.length / 2);
  const boundaries = [...text.matchAll(/\n\s*\n|(?<=[.!?。！？])\s+(?!<short pause>)/gu)]
    .map(m => m.index!).filter(i => i > text.length * 0.2 && i < text.length * 0.8);
  const spaces = [...text.matchAll(/\s+/gu)].map(m => m.index!);
  const pool = boundaries.length ? boundaries : spaces;
  const cut = pool.reduce((best, v) => Math.abs(v - center) < Math.abs(best - center) ? v : best, pool[0] ?? center);
  const pieces = [text.slice(0, cut).trim(), text.slice(cut).trim()];
  if (pieces.some(x => !x)) throw new Error("M3_TEXT_CANNOT_SPLIT");
  return pieces;
}

export function largeM3Chunks(text: string) {
  const sections = m3Sections(text);
  const numbered = sections.filter(s => new RegExp(`^(?:${openerPattern})[.。]`, "iu").test(s));
  if (numbered.length === 13) {
    const fifth = sections.indexOf(numbered[4]);
    const tenth = sections.indexOf(numbered[9]);
    return [sections.slice(0, fifth), sections.slice(fifth, tenth), sections.slice(tenth)].map(x => x.join("\n\n"));
  }
  return splitM3AtBoundary(text);
}

export function m3RequestBody(text: string, voice: string, style: string, temperature = M3_TEMPERATURE) {
  return {
    contents: [{ role: "user", parts: [{ text, speechMetadata: { style } }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature,
      maxOutputTokens: M3_OUTPUT_TOKENS,
      responseFormat: { audio: { mimeType: "AUDIO_L16", sampleRate: 24000 } },
      speechConfig: { voiceConfig: { voice } },
    },
  };
}
