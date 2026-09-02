// Hidden English-pronunciation frontend for native Kazakh Edge voices.
//
// Daulet/Aigul are not multilingual voices. When a Kazakh article contains a
// short English acronym, sending the Latin letters directly to kk-KZ makes the
// voice apply Kazakh grapheme rules. To preserve the original speaker timbre,
// we rewrite high-confidence English tokens to Cyrillic pronunciation hints in
// the hidden spoken form. The user's visible text stays unchanged.

const ENGLISH_LETTER_NAMES: Record<string, string> = {
  A: "эй",
  B: "би",
  C: "си",
  D: "ди",
  E: "и",
  F: "эф",
  G: "джи",
  H: "эйч",
  I: "ай",
  J: "джей",
  K: "кей",
  L: "эл",
  M: "эм",
  N: "эн",
  O: "оу",
  P: "пи",
  Q: "кью",
  R: "ар",
  S: "эс",
  T: "ти",
  U: "ю",
  V: "ви",
  W: "дабл ю",
  X: "экс",
  Y: "уай",
  Z: "зи",
};

const WHOLE_TOKEN_PRONUNCIATION: Record<string, string> = {
  NATO: "нейтоу",
  NASA: "нәсә",
  UNESCO: "юнэскоу",
  UNICEF: "юнисэф",
  COVID: "коувид",
  OpenAI: "оупен эй ай",
  ChatGPT: "чэт джи пи ти",
  Starlink: "старлинк",
  Microsoft: "майкрософт",
  Google: "гугл",
  YouTube: "ютуб",
  iPhone: "айфон",
  Android: "эндроид",
};

function spellEnglishLetters(token: string) {
  return [...token]
    .map((letter) => ENGLISH_LETTER_NAMES[letter.toUpperCase()])
    .filter(Boolean)
    .join(" ");
}

function pronunciationForAlphaPart(part: string) {
  const dictionary = WHOLE_TOKEN_PRONUNCIATION[part];
  if (dictionary) return dictionary;

  if (/^[A-Z]{2,8}$/u.test(part)) return spellEnglishLetters(part);
  if (/^[A-Z]$/u.test(part)) return spellEnglishLetters(part);
  return null;
}

/**
 * Models and weapon/product names are frequently mixed alphanumeric strings:
 * GPT-5, AIM-9X, H1N1, O3, etc. Neural TTS systems are more stable when those
 * ambiguous forms are normalized before synthesis. Spell only high-confidence
 * Latin acronym groups; leave digit groups intact so the Kazakh number
 * normalizer that runs next can pronounce them in Kazakh.
 */
function pronounceAlphaNumericToken(token: string) {
  if (!/\d/u.test(token)) return null;

  const parts = token.match(/[A-Za-z]+|\d+/gu);
  if (!parts?.length) return null;

  const spoken: string[] = [];
  for (const part of parts) {
    if (/^\d+$/u.test(part)) {
      spoken.push(part);
      continue;
    }

    const pronunciation = pronunciationForAlphaPart(part);
    if (!pronunciation) return null;
    spoken.push(pronunciation);
  }

  return spoken.join(" ");
}

/**
 * Rewrite only high-confidence English tokens for non-multilingual Kazakh
 * voices. All-uppercase acronyms are spelled with English letter names. A small
 * dictionary handles globally common brands/word-like acronyms. Mixed model
 * names are decomposed only when every alphabetic part is unambiguous.
 */
export function prepareNativeKazakhEnglishPronunciation(source: string) {
  if (!/[A-Za-z]/u.test(source)) return source;

  return source.replace(/\b[A-Za-z][A-Za-z0-9-]{0,30}\b/gu, (token) => {
    const dictionary = WHOLE_TOKEN_PRONUNCIATION[token];
    if (dictionary) return dictionary;

    if (/^[A-Z]{2,8}$/u.test(token)) {
      return spellEnglishLetters(token);
    }

    const alphaNumeric = pronounceAlphaNumericToken(token);
    if (alphaNumeric) return alphaNumeric;

    return token;
  });
}
