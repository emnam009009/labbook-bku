/**
 * BM25 — Stopwords loader
 * Round 137a
 *
 * - English: from stopwords-iso npm package (179 words)
 * - Vietnamese: hardcoded list (~50 most common, conservative)
 * - Custom whitelist: chemistry symbols/units NEVER filtered
 *
 * Stopwords lazily loaded once per Cloud Function instance.
 */

import type { Language } from "./types";

// Vietnamese stopwords — conservative list, avoid over-filtering
// Source: vn-stopwords + manual curation for technical writing
const VI_STOPWORDS = new Set([
  "và", "của", "là", "có", "trong", "với", "cho", "được", "không", "này",
  "các", "những", "một", "khi", "đã", "để", "từ", "như", "ở", "thì",
  "tại", "về", "vào", "ra", "đến", "lại", "rằng", "cũng", "nên", "phải",
  "đó", "đây", "nhưng", "hay", "hoặc", "nếu", "vì", "do", "bởi", "qua",
  "trên", "dưới", "sau", "trước", "giữa", "đang", "sẽ", "vẫn", "chỉ", "mới",
  "rất", "lắm", "quá", "thế", "nào", "gì", "ai", "đâu", "sao",
]);

// Custom whitelist — these tokens are NEVER filtered even if they look like stopwords
// Critical for chemistry: "V" (volt) "M" (molar) "I" (current) "T" (temp) "A" (amp)
const CHEMISTRY_WHITELIST = new Set([
  "v", "V",       // volt (case-sensitive matching at lookup time)
  "m", "M",       // molar / meter
  "a", "A",       // ampere / angstrom
  "i", "I",       // current
  "t", "T",       // temperature
  "k", "K",       // kelvin / equilibrium constant
  "n", "N",       // newton / mole number
  "ph", "pH",     // pH
  "e", "E",       // potential
  "g", "G",       // gibbs free energy
  "ev", "eV",     // electron volt
  "mv", "mV",     // millivolt
  "ma", "mA",     // milliamp
  "mw", "mW",     // milliwatt
  "hz", "Hz",     // hertz
  "khz", "kHz",
  "mhz", "MHz",
  "ohm", "Ω",
]);

let englishStopwords: Set<string> | null = null;

/**
 * Lazy load English stopwords from stopwords-iso.
 * Cached for instance lifetime.
 */
function getEnglishStopwords(): Set<string> {
  if (englishStopwords) return englishStopwords;
  try {
    // Dynamic require to avoid ESM/CJS issues in Cloud Functions
    /* eslint-disable @typescript-eslint/no-var-requires */
    const stopwordsIso = require("stopwords-iso");
    /* eslint-enable @typescript-eslint/no-var-requires */
    const list: string[] = stopwordsIso.en || [];
    englishStopwords = new Set(list.map((w) => w.toLowerCase()));
  } catch (e) {
    // Fallback minimal list if package missing
    englishStopwords = new Set([
      "the", "is", "at", "which", "on", "and", "a", "an", "as", "are",
      "be", "by", "for", "from", "has", "have", "in", "it", "of", "or",
      "that", "to", "was", "were", "will", "with", "this", "but", "not",
      "we", "you", "they", "he", "she", "his", "her", "their", "our",
    ]);
  }
  return englishStopwords;
}

/**
 * Check if token is a stopword for the given language.
 * Whitelist tokens are NEVER stopwords.
 */
export function isStopword(token: string, language: Language): boolean {
  // Whitelist check (case-sensitive original first, then lowercased)
  if (CHEMISTRY_WHITELIST.has(token)) return false;
  const lower = token.toLowerCase();
  if (CHEMISTRY_WHITELIST.has(lower)) return false;

  if (language === "vi") return VI_STOPWORDS.has(lower);
  if (language === "en") return getEnglishStopwords().has(lower);
  // mixed: filter if in either set
  return VI_STOPWORDS.has(lower) || getEnglishStopwords().has(lower);
}

/**
 * Detect language from text using simple heuristic.
 * - High Vietnamese diacritic density → "vi"
 * - High ASCII letter ratio with no diacritics → "en"
 * - Mixed → "mixed"
 */
export function detectLanguage(text: string): Language {
  if (!text || text.length < 10) return "en";
  // Vietnamese diacritic chars (subset)
  const viDiacritics = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi;
  const viMatches = text.match(viDiacritics);
  const viRatio = viMatches ? viMatches.length / text.length : 0;
  // High vi diacritic density → vi
  if (viRatio > 0.04) {
    // Check if also significant English content (mixed)
    const englishWords = text.match(/\b[a-zA-Z]{4,}\b/g);
    const englishRatio = englishWords ? (englishWords.join("").length / text.length) : 0;
    if (englishRatio > 0.15) return "mixed";
    return "vi";
  }
  return "en";
}
