/**
 * BM25 — Stemmer wrapper
 * Round 137a
 *
 * - English: Snowball Porter v2 stemmer (from `natural` npm package)
 * - Vietnamese: NO stemming (no robust open-source stemmer)
 * - Chemistry tokens: BYPASS stemmer entirely
 *
 * Returns the stemmed form OR the original token unchanged.
 */

import type { Language } from "./types";
import { isChemistryToken } from "./chemistry-patterns";

let porterStemmer: { stem: (word: string) => string } | null = null;

function getPorterStemmer(): { stem: (word: string) => string } | null {
  if (porterStemmer) return porterStemmer;
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const natural = require("natural");
    /* eslint-enable @typescript-eslint/no-var-requires */
    // Porter v2 (Snowball) — more accurate than Porter v1
    porterStemmer = natural.PorterStemmer;
  } catch {
    porterStemmer = null;
  }
  return porterStemmer;
}

/**
 * Stem a single token.
 * - Chemistry tokens → unchanged (preserve LiFePO4, CV, H2O)
 * - English → Porter v2 stem (lowercase output)
 * - Vietnamese → unchanged (lowercase output)
 * - Other → lowercase
 */
export function stemToken(token: string, language: Language): string {
  if (!token) return token;
  if (isChemistryToken(token)) return token;

  const lower = token.toLowerCase();
  if (language === "en") {
    const stemmer = getPorterStemmer();
    if (stemmer) return stemmer.stem(lower);
  }
  // vi / mixed / fallback → just lowercase
  return lower;
}
