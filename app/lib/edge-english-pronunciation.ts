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
    .map((letter) => ENGLISH_LETTER_NAMES[letter])
    .filter(Boolean)
    .join(" ");
}

/**
 * Rewrite only high-confidence English tokens for non-multilingual Kazakh
 * voices. All-uppercase acronyms (2-8 letters) are spelled with English letter
 * names. A small dictionary handles globally common brands/word-like acronyms.
 * Unknown mixed/lowercase words are left untouched rather than guessed.
 */
export function prepareNativeKazakhEnglishPronunciation(source: string) {
  if (!/[A-Za-z]/u.test(source)) return source;

  return source.replace(/\b[A-Za-z][A-Za-z0-9-]{1,30}\b/gu, (token) => {
    const dictionary = WHOLE_TOKEN_PRONUNCIATION[token];
    if (dictionary) return dictionary;

    if (/^[A-Z]{2,8}$/u.test(token)) {
      return spellEnglishLetters(token);
    }

    // Common mixed acronym suffixes such as GPT-5: spell the acronym but keep
    // the numeric/model suffix for the existing Kazakh number frontend.
    const model = token.match(/^([A-Z]{2,8})-(\d{1,4})$/u);
    if (model) return `${spellEnglishLetters(model[1])} ${model[2]}`;

    return token;
  });
}
