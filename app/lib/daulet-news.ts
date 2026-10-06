import { kazakhIntegerToWords, kazakhOrdinalToWords, normalizeKazakhSpeechText } from "./kazakh-speech-normalizer";
import { prepareNativeKazakhEnglishPronunciation } from "./edge-english-pronunciation";

export const DAULET_NEWS_VERSION = "daulet-v45-raised-pitch-stable";
export type NewsBoundary = "sentence" | "paragraph" | "clause" | "end";
export type NewsChunk = { text: string; boundary: NewsBoundary; rate: number; pitchDelta?: number; volumeDelta?: number; delivery?: "lead" | "data" | "transition" | "settle" | "neutral" };
const MONTHS = ["", "қаңтардың", "ақпанның", "наурыздың", "сәуірдің", "мамырдың", "маусымның", "шілденің", "тамыздың", "қыркүйектің", "қазанның", "қарашаның", "желтоқсанның"];
const MONTH_NAMES = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const NEWS_CUES = "Бірінші|Екінші|Үшінші|Төртінші|Бесінші|Алтыншы|Жетінші|Сегізінші|Тоғызыншы|Оныншы|Он бірінші|Он екінші|Он үшінші";
const CUE = new RegExp(`^(?:${NEWS_CUES})[.:]?$`, "iu");
const ITEM_START = new RegExp(`^(?:${NEWS_CUES})[.:]\\s`, "iu");
const CUE_PAUSE = new RegExp(`(^|[.!?…。！？]\\s+|\\n\\s*\\n)(${NEWS_CUES})[.:](?=\\s+\\S)`, "giu");
const END = /[.!?…。！？][»”’"')\]]*$/u;
const CLAMP = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Hidden spoken copy only. Unicode boundaries deliberately replace ASCII \b. */
export function prepareDauletNewsText(source: string) {
  let text = source.normalize("NFC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/gu, "")
    .replace(/\r\n?/gu, "\n").replace(/[\u00a0\u2007\u202f]/gu, " ")
    .replace(/[\t ]+/gu, " ").replace(/ *\n */gu, "\n").trim();
  // A copied line wrap is not automatically a new sentence, including inside names.
  text = text.replace(/([^\n])\n(?!\n)/gu, (all, previous: string, offset: number) =>
    END.test(text.slice(0, offset + 1)) ? all : `${previous} `);
  text = text.replace(/^(\d{1,2})[.)]\s+(?=\p{L})/gmu, (_all, n: string) => {
    const ordinal = kazakhOrdinalToWords(Number(n));
    return `${ordinal[0].toLocaleUpperCase("kk")}${ordinal.slice(1)}. `;
  });
  text = text.replace(/(?<![\p{L}\p{N}])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)|(?<![\p{L}\p{N}])(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?!\d)/gu,
    (all, y, m, d, dd, mm, yy) => {
      const year = Number(y || yy), month = Number(m || mm), day = Number(d || dd);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (year < 1000 || year > 2999 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return all;
      return `${kazakhOrdinalToWords(year)} жылғы ${MONTHS[month]} ${kazakhOrdinalToWords(day)} күні`;
    });
  text = text.replace(/(?<![\p{L}\p{N}])(\d{4})(?:\s+|-)(жыл(?:ы|ғы|дың|дан|ға|да|мен)?)(?![\p{L}\p{N}])/giu,
    (_all, n, suffix) => `${kazakhOrdinalToWords(Number(n))} ${suffix}`);
  text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,2})\\s+(${MONTH_NAMES.join("|")})(?:да|де|та|те)(?![\\p{L}\\p{N}])`, "giu"),
    (all, n, month: string) => Number(n) >= 1 && Number(n) <= 31 ? `${MONTHS[MONTH_NAMES.indexOf(month.toLowerCase())+1]} ${kazakhOrdinalToWords(Number(n))} күні` : all);
  text = text.replace(/(?<![\p{L}\p{N}])(\d{1,12})-(?:ыншы|інші|шы|ші)(?![\p{L}\p{N}])/giu,
    (_all, n) => kazakhOrdinalToWords(Number(n)));
  text = text.replace(/(?<![\p{L}\p{N}])([01]?\d|2[0-3]):([0-5]\d)-(да|де|та|те)(?![\p{L}\p{N}])/giu,
    (_all, h, m, suffix) => `${kazakhIntegerToWords(Number(h))} ${kazakhIntegerToWords(Number(m))}${suffix}`);
  text = text.replace(/(?<![\p{L}\p{N}])\d{1,3}(?: \d{3})+(?![\p{L}\p{N}])/gu, n => n.replaceAll(" ", ""));
  text = text.replace(/(?<![\p{L}\p{N}])(млрд|млн|трлн)\.?(?![\p{L}\p{N}])/giu,
    (_all, unit: string) => ({млрд: "миллиард", млн: "миллион", трлн: "триллион"})[unit.toLowerCase() as "млрд"]);
  text = text.replace(/(?<![\p{L}\p{N}])NATO(?![\p{L}\p{N}])/gu, "нато")
    .replace(/(?<![\p{L}\p{N}])С-(\d{2,4})(?![\p{L}\p{N}])/gu, (_all, n) => `эс ${kazakhIntegerToWords(Number(n))}`);
  // Never interpret dotted version identifiers or URLs as decimal numbers.
  const protectedForms: string[] = [];
  text = text.replace(/https?:\/\/[^\s]+|(?<!\d)\d+(?:\.\d+){2,}(?!\d)/gu, value => {
    protectedForms.push(value);
    return String.fromCodePoint(0xf0000 + protectedForms.length - 1);
  });
  text = normalizeKazakhSpeechText(prepareNativeKazakhEnglishPronunciation(text));
  text = text.replace(/[\u{f0000}-\u{ffffd}]/gu, ch => protectedForms[ch.codePointAt(0)! - 0xf0000] ?? ch);
  return text.split(/\n\s*\n/u).map(p => {
    const clean = p.trim();
    return !clean || /[.!?…。！？;:][»”’"')\]]*$/u.test(clean) ? clean : `${clean}.`;
  }).filter(Boolean).join("\n\n");
}

export function splitNewsSentences(paragraph: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < paragraph.length; i++) {
    const char = paragraph[i];
    if (!/[.!?…。！？]/u.test(char)) continue;
    if (char === ".") {
      if (/\d/u.test(paragraph[i - 1] ?? "") && /\d/u.test(paragraph[i + 1] ?? "")) continue;
      const prefix = paragraph.slice(start, i + 1);
      if (/(?:^|\s)(?:[\p{Lu}]|т|б|с|ж|ғ)\.$/u.test(prefix) || /(?:т\.б|т\.с\.с)\.$/u.test(prefix)) continue;
      if (/\S/u.test(paragraph[i + 1] ?? "") && !/[»”’"')\].!?]/u.test(paragraph[i + 1])) continue;
    }
    let end = i + 1;
    while (/[.!?…。！？»”’"')\]]/u.test(paragraph[end] ?? "") && end < paragraph.length) end++;
    const sentence = paragraph.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
    i = end - 1;
  }
  const rest = paragraph.slice(start).trim();
  if (rest) out.push(rest);
  // Numbering stays with its following statement, never becomes a solo TTS request.
  return out.reduce<string[]>((items, sentence) => {
    if (items.length && CUE.test(items[items.length - 1])) items[items.length - 1] += ` ${sentence}`;
    else items.push(sentence);
    return items;
  }, []);
}

/** 1–3 intact sentences. Only exceptional long sentences use explicit clauses. */
export function planDauletNewsChunks(prepared: string, speed = 1, continuous = true, focus = true): NewsChunk[] {
  const chunks: NewsChunk[] = [];
  const contexts=prepared.split(/\n\s*\n/u).flatMap(paragraph=>{
    const items:string[]=[];let current:string[]=[];
    for (const sentence of splitNewsSentences(paragraph)) {
      if (ITEM_START.test(sentence) && current.length) {items.push(current.join(" "));current=[];}
      current.push(sentence);
    }
    if (current.length) items.push(current.join(" "));
    return items;
  });
  for (const paragraph of contexts) {
    const sentences=splitNewsSentences(paragraph);
    // A compact numbered item is one presenter thought. Keep its four/five
    // complete sentences together instead of reopening Edge halfway through it.
    const intactItem=ITEM_START.test(paragraph)
      && sentences.length<=5 && paragraph.split(/\s+/u).length<=90
      && paragraph.length<=650
      && !sentences.slice(1).some(s=>ITEM_START.test(s));
    let group: string[] = [], words = 0;
    const flush = (boundary: NewsBoundary) => {
      if (group.length) chunks.push({text: group.join(" "), boundary, rate: speed});
      group = []; words = 0;
    };
    for (const sentence of sentences) {
      const label = sentence.match(/^(.{2,18}?[.:])\s/u)?.[1];
      if (label && CUE.test(label) && group.length) flush("paragraph");
      // Never fall back to an arbitrary character/whitespace split through a name.
      const units = sentence.length > 2400 ? sentence.split(/(?<=[;:；：])\s+/u) : [sentence];
      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (new TextEncoder().encode(unit).length > 18000) throw new Error("daulet:sentence-too-long");
        const count = unit.split(/\s+/u).length;
        if (group.length && !intactItem && (group.length >= 3 || words + count > 115)) flush("sentence");
        group.push(unit); words += count;
        if (i < units.length - 1) flush("clause");
      }
    }
    flush("paragraph");
  }
  // Keep bounded continuations of a numbered item in one native Edge take.
  // New ordinals and paragraph boundaries retain their own context; fewer
  // within-item restarts reduce an avoidable source of timbre discontinuity.
  if (continuous && chunks.length > 1) {
    const packed: NewsChunk[] = [];
    for (const chunk of chunks) {
      const last = packed[packed.length - 1];
      const startsItem = ITEM_START.test(chunk.text);
      const lastStartsItem = last ? ITEM_START.test(last.text) : false;
      const joinedText = last ? last.text + (last.boundary === "paragraph" ? "\n\n" : " ") + chunk.text : "";
      const joinedWords = joinedText ? joinedText.split(/\s+/u).length : 0;
      // Continue the same item after an internal sentence split.
      // A paragraph boundary or a new ordinal must remain a separate context.
      // The old !lastStartsItem check blocked precisely these continuations.
      const intactUnits = joinedText ? splitNewsSentences(joinedText).length : 0;
      if (last && !startsItem && last.boundary === "sentence" && (lastStartsItem || intactUnits <= 6) && joinedText.length <= 2400 && joinedWords <= 115) {
        last.text = joinedText;
        last.boundary = chunk.boundary;
      } else {
        packed.push({...chunk});
      }
    }
    chunks.splice(0, chunks.length, ...packed);
  }

  // Workers Free allows 50 external subrequests. Reserve room for the token and
  // bounded retries. Exceptionally fragmented manuscripts can use >3 sentences
  // in a request, always merging complete adjacent units and retaining paragraphs.
  while (chunks.length > 42) {
    let best = 0;
    for (let i=1;i<chunks.length-1;i++) {
      if (chunks[i].text.length+chunks[i+1].text.length < chunks[best].text.length+chunks[best+1].text.length) best=i;
    }
    const left = chunks[best], right = chunks[best+1];
    chunks.splice(best,2,{text:left.text+(left.boundary==="paragraph"?"\n\n":" ")+right.text,boundary:right.boundary,rate:speed});
  }
  let previous = speed;
  return chunks.map((chunk, index) => {
    // Deterministic presenter direction: semantic cues produce tiny, bounded
    // delivery changes. Nothing is randomized, and each request still uses one
    // prosody span so the Edge voice keeps a stable acoustic identity.
    const wordCount = chunk.text.split(/\s+/u).length;
    const lead = new RegExp(`^(?:${NEWS_CUES})[.:]\\s`, "iu").test(chunk.text);
    const load = /(?:жылғы|пайыз|миллион|миллиард|триллион|сағат|километр|доллар|еуро)/iu.test(chunk.text);
    const transition = /(?:алайда|дегенмен|сонымен қатар|сонімен қатар|бұдан бөлек|осы ретте|соған қарамастан|сонымен бірге|сонімен бірге)/iu.test(chunk.text);
    const settle = /(?:нәтижесінде|осылайша|соңында|аяқталды|қорытындысында|деп хабарлады|деп мәлімдеді|білдірді)/iu.test(chunk.text);

    const density = wordCount > 70 ? 0.992 : wordCount > 45 ? 0.996 : 1;
    let delivery: NonNullable<NewsChunk["delivery"]> = "neutral";
    let roleRate = 1, pitchDelta = 0, volumeDelta = 0;

    if (lead) {
      delivery = "lead";
      roleRate *= 0.997;
      pitchDelta += 0.14;
      volumeDelta += 0.10;
    } else if (settle) {
      delivery = "settle";
      roleRate *= 0.996;
      pitchDelta -= 0.16;
      volumeDelta -= 0.04;
    } else if (transition) {
      delivery = "transition";
      roleRate *= 1.002;
      pitchDelta += 0.08;
      volumeDelta += 0.04;
    } else if (load) {
      delivery = "data";
      roleRate *= 0.995;
      pitchDelta -= 0.05;
      volumeDelta += 0.03;
    }

    const target = speed * (focus ? Math.min(load ? 0.995 : 1, density) * roleRate : 1);
    const rate = continuous ? CLAMP(target, previous - 0.005, previous + 0.005) : target;
    previous = rate;
    return {
      ...chunk,
      rate,
      pitchDelta: 0,
      volumeDelta: focus ? CLAMP(volumeDelta, -0.08, 0.12) : 0,
      delivery,
      boundary: index === chunks.length - 1 ? "end" : chunk.boundary,
    };
  });
}

export type DauletNewsDirection = {
  text: string; intensity: number;
  emotion: "happy" | "angry" | "sad" | "afraid" | "disgusted" | "melancholic" | "surprised" | "calm";
};

export function dauletNewsSsml(chunk: NewsChunk, pitch: number, volume: number, directions: readonly DauletNewsDirection[] = []) {
  const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const percent = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  // Explicit native sentence/paragraph structure, not a new prosody block for
  // every word. Comma/semicolon timing belongs to the voice's native phrasing.
  // The ordinal stays inside its following statement, with its required pause.
  const body=chunk.text.split(/\n\s*\n/u).map(paragraph=>
    `<p>${splitNewsSentences(paragraph).map(sentence=>
      `<s>${escape(sentence).replace(CUE_PAUSE,(_all,before:string,cue:string)=>`${before}${cue}<break time="320ms"/>`)}</s>`
    ).join(" ")}</p>`
  ).join("");
  // A tiny boundary release prevents the final phoneme from feeling hard-cut.
  // DSP seam logic counts this existing silence, so it does not stack pauses.
  const release = chunk.boundary === "clause" ? 55 : chunk.boundary === "sentence" ? 85 : chunk.boundary === "paragraph" ? 100 : 140;
  // User emotion choices shade the whole news item. They must not switch the
  // dedicated news path back to the older phrase/word wrapper renderer.
  const shades:Record<DauletNewsDirection["emotion"],[number,number,number]>={
    happy:[0.003,0.12,0.06], angry:[-0.001,-0.04,0.06], sad:[-0.005,-0.12,-0.05],
    afraid:[-0.003,0.08,-0.04], disgusted:[-0.004,-0.06,-0.03],
    melancholic:[-0.005,-0.10,-0.05], surprised:[0.003,0.14,0.06], calm:[-0.002,-0.04,0],
  };
  const normalized=chunk.text.normalize("NFC").replace(/\s+/gu," ").trim();
  let weight=0,rateShade=0,pitchShade=0,volumeShade=0;
  for (const direction of directions) {
    const text=direction.text.normalize("NFC").replace(/\s+/gu," ").trim();
    if (!text || CUE.test(text) || !normalized.includes(text)) continue;
    const amount=CLAMP(direction.intensity,0,1),length=text.length;
    const [r,p,v]=shades[direction.emotion];
    weight+=length;rateShade+=r*amount*length;pitchShade+=p*amount*length;volumeShade+=v*amount*length;
  }
  if (weight) {const total=Math.max(weight,normalized.length);rateShade/=total;pitchShade/=total;volumeShade/=total;}
  const directedPitch = CLAMP(pitch + (chunk.pitchDelta ?? 0)+pitchShade, -18, 18);
  const directedVolume = CLAMP(volume + (chunk.volumeDelta ?? 0)+volumeShade, -7, 7);
  const directedRate=chunk.rate*(1+rateShade);
  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="kk-KZ"><voice name="kk-KZ-DauletNeural"><prosody rate="${percent((directedRate - 1) * 100)}" pitch="${percent(directedPitch)}" volume="${percent(directedVolume)}">${body}<break time="${release}ms"/></prosody></voice></speak>`;
}
