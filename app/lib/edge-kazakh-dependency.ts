export type KazakhDependencyGuardReason =
  | "number_unit"
  | "genitive_head"
  | "modifier_head"
  | "name_title"
  | "subject_predicate"
  | "compound_predicate"
  | "none";

export type KazakhDependencyGuard = {
  score: number;
  reason: KazakhDependencyGuardReason;
};

const NUMBER_WORDS = new Set([
  "нөл", "бір", "екі", "үш", "төрт", "бес", "алты", "жеті", "сегіз", "тоғыз",
  "он", "жиырма", "отыз", "қырық", "елу", "алпыс", "жетпіс", "сексен", "тоқсан",
  "жүз", "мың", "миллион", "миллиард", "триллион", "жарты", "ширек",
]);

const UNIT_WORDS = new Set([
  "пайыз", "процент", "теңге", "доллар", "еуро", "юань", "адам", "кісі",
  "километр", "метр", "сантиметр", "миллиметр", "гектар", "тонна", "килограмм",
  "грамм", "литр", "миллилитр", "секунд", "секундына", "сағат", "сағатына",
  "күн", "апта", "ай", "жыл", "градус", "вольт", "ватт", "киловатт", "мегаватт",
  "гигаватт", "герц", "килогерц", "мегагерц", "гигагерц", "байт", "килобайт",
  "мегабайт", "гигабайт", "терабайт",
]);

const TITLE_WORDS = new Set([
  "төраға", "төрағасы", "президент", "президенті", "министр", "министрі", "әкім",
  "әкімі", "генерал", "қолбасшы", "басшы", "басшысы", "директор", "директоры",
  "хатшы", "хатшысы", "премьер-министр", "депутат", "судья", "профессор", "доктор",
  "Үкімет", "үкімет", "министрлігі", "комитеті", "мекемесі", "агенттігі", "әкімдігі",
]);

const SUBJECT_PRONOUNS = new Set([
  "ол", "бұл", "осы", "сол", "олар", "бұлар", "біз", "мен", "сен", "сіз",
]);

const KNOWN_PREDICATES = new Set([
  "деді", "дейді", "айтты", "мәлімдеді", "хабарлады", "растады", "жариялады",
  "бекітті", "қабылдады", "бастады", "тоқтатты", "жетті", "келді", "кетті",
  "болды", "қалды", "артты", "өсті", "төмендеді", "азаюда", "жалғасуда",
  "жараланды", "қаза", "атанды", "саналады", "табылады", "көрсетті", "түсіндірді",
]);

const AUXILIARIES = new Set([
  "берді", "алды", "қалды", "қойды", "жатыр", "жүр", "тұр", "отыр", "келді", "кетті",
]);

function clean(value: string) {
  return value
    .replace(/[«»“”"'‘’()[\]{}【】]/gu, " ")
    .replace(/[，,；;：:—–…!?！？。.]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function words(value: string) {
  return clean(value).split(" ").filter(Boolean);
}

function lower(value: string) {
  return value.toLocaleLowerCase("kk-KZ");
}

function lastWord(value: string) {
  const list = words(value);
  return list[list.length - 1] ?? "";
}

function firstWord(value: string) {
  return words(value)[0] ?? "";
}

function looksNumeric(value: string) {
  const token = lower(value).replace(/[+−-]/gu, "");
  return /^\d+(?:[.,]\d+)?$/u.test(token) || NUMBER_WORDS.has(token);
}

function looksUnit(value: string) {
  const token = lower(value);
  return UNIT_WORDS.has(token) || /^(?:км|м|см|мм|кг|г|т|л|мл|га|квт|мвт|гвт|кгц|мгц|ггц)$/iu.test(token);
}

function looksGenitive(value: string) {
  return /[\p{L}]{2,}(?:ның|нің|дың|дің|тың|тің)$/iu.test(lower(value));
}

function looksModifier(value: string) {
  const token = lower(value);
  if (looksNumeric(token)) return true;
  return /[\p{L}]{3,}(?:ғы|гі|қы|кі|лық|лік|дық|дік|тық|тік|ған|ген|қан|кен|атын|етін|йтын|йтін)$/iu.test(token);
}

function looksCapitalizedName(value: string) {
  const list = words(value);
  if (!list.length || list.length > 5) return false;
  const candidates = list.slice(-3);
  return candidates.some((token) => /^[A-ZА-ЯӘҒҚҢӨҰҮҺІ][\p{L}'’.-]{2,}$/u.test(token));
}

function looksTitle(value: string) {
  return TITLE_WORDS.has(value) || TITLE_WORDS.has(lower(value));
}

function looksNominalHead(value: string) {
  const token = firstWord(value);
  if (!token) return false;
  if (/^\d/u.test(token)) return false;
  if (KNOWN_PREDICATES.has(lower(token))) return false;
  return /\p{L}/u.test(token);
}

function looksFinitePredicate(value: string) {
  const list = words(value);
  if (!list.length || list.length > 18) return false;
  const first = lower(list[0]);
  const last = lower(list[list.length - 1]);
  if (KNOWN_PREDICATES.has(first) || KNOWN_PREDICATES.has(last)) return true;
  return /[\p{L}]{3,}(?:ды|ді|ты|ті|йды|йді|ады|еді|уда|уде|ған|ген|қан|кен|мақ|мек|пақ|пек)$/iu.test(last);
}

function looksShortSubject(value: string) {
  const list = words(value);
  if (!list.length || list.length > 6) return false;
  const first = lower(list[0]);
  const last = lower(list[list.length - 1]);
  if (SUBJECT_PRONOUNS.has(first)) return true;
  if (looksCapitalizedName(value)) return true;
  return /(?:үкімет|министрлік|комитет|мекеме|агенттік|компания|сот|әкімдік|армия|полиция)(?:і|ы|сы|сі)?$/iu.test(last);
}

function looksConverb(value: string) {
  return /[\p{L}]{3,}(?:ып|іп|п|а|е|й)$/iu.test(lower(value));
}

export function kazakhDependencyGuard(leftText: string, rightText: string): KazakhDependencyGuard {
  const left = lastWord(leftText);
  const right = firstWord(rightText);
  if (!left || !right) return { score: 0, reason: "none" };

  if (looksNumeric(left) && looksUnit(right)) {
    return { score: 0.98, reason: "number_unit" };
  }

  if (looksGenitive(left) && looksNominalHead(rightText)) {
    return { score: 0.96, reason: "genitive_head" };
  }

  if (looksCapitalizedName(leftText) && looksTitle(right)) {
    return { score: 0.92, reason: "name_title" };
  }

  if (looksTitle(left) && looksCapitalizedName(rightText)) {
    return { score: 0.86, reason: "name_title" };
  }

  if (looksModifier(left) && looksNominalHead(rightText)) {
    return { score: 0.84, reason: "modifier_head" };
  }

  if (looksShortSubject(leftText) && looksFinitePredicate(rightText)) {
    return { score: 0.78, reason: "subject_predicate" };
  }

  if (looksConverb(left) && AUXILIARIES.has(lower(right))) {
    return { score: 0.88, reason: "compound_predicate" };
  }

  return { score: 0, reason: "none" };
}
