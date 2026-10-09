/** M3-only planning. No text-dependent persona, speaker, model or style changes. */
export const M3_VERSION = "m3-single-request-v15-transport-comparison";
export const M3_INPUT_TOKENS = 8192;
export const M3_OUTPUT_TOKENS = 16384;
export const M3_TEMPERATURE = 0.5;
export const NUMBERED_OPENERS = ["Бірінші", "Екінші", "Үшінші", "Төртінші", "Бесінші", "Алтыншы", "Жетінші", "Сегізінші", "Тоғызыншы", "Оныншы", "Он бірінші", "Он екінші", "Он үшінші"];
const openerPattern = NUMBERED_OPENERS.map(x => x.replaceAll(" ", "[ \\t]+" )).join("|");

export type M3TextMode = "clean" | "verbatim";

/** Manual, one-call A/B presets. Never run these modes automatically. */
export type M3DiagnosticMode = "legacy-05" | "legacy-default" | "interactions-default";
export function normalizeM3DiagnosticMode(value: unknown): M3DiagnosticMode {
  return value === "legacy-05" || value === "interactions-default" ? value : "legacy-default";
}
export function m3Temperature(mode: M3DiagnosticMode): number | null {
  return mode === "legacy-05" ? M3_TEMPERATURE : null;
}


/**
 * M3 input-side A/B control. Neither mode inserts pause tags, rewrites
 * punctuation, substitutes words or adds instructions. The clean mode
 * normalizes only copy/paste whitespace and invisible format characters.
 *
 * "verbatim" preserves the provided interior text exactly (the user-facing
 * form and API handler already trim leading/trailing whitespace).
 */
export function prepareM3Text(input: string, mode: M3TextMode = "clean") {
  if (mode === "verbatim") return input;
  return input
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/gu, "")
    .replace(/[\r\n\t\u00A0\u202F\u3000]+/gu, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function m3Style(speed: number) {
  if (Math.abs(speed - 1) < 0.005) return "";
  return `Speaking rate: ${Math.round(speed * 100)}% of normal.`;
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

export function m3RequestBody(text: string, voice: string, style: string, temperature: number | null = M3_TEMPERATURE) {
  return {
    contents: [{
      role: "user",
      parts: [{
        text,
        ...(style ? { speechMetadata: { style } } : {}),
      }],
    }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      ...(temperature === null ? {} : { temperature }),
      maxOutputTokens: M3_OUTPUT_TOKENS,
      responseFormat: { audio: { mimeType: "AUDIO_L16", sampleRate: 24000 } },
      speechConfig: { voiceConfig: { voice } },
    },
  };
}


/** Official Gemini Interactions TTS schema: single user_input and single voice. */
export function m3InteractionsRequestBody(text: string, voice: string, style: string, model: string) {
  return {
    model,
    input: [{
      type: "user_input",
      content: [{
        type: "text",
        text,
        ...(style ? { annotations: [{ type: "speech_metadata", style }] } : {}),
      }],
    }],
    response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
    generation_config: { speech_config: [{ voice }] },
    stream: true,
  };
}
