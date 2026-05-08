/**
 * BM25 — Main tokenizer
 * Round 137a
 *
 * Pipeline:
 *   raw text
 *   → unicode normalize (NFC)
 *   → split on whitespace + punctuation (preserving chemistry brackets)
 *   → for each raw token:
 *       - skip if pure number (noise)
 *       - if chemistry pattern → keep as-is
 *       - else → strip punctuation, lowercase, stem (English only)
 *       - skip if length < 2 unless in unit whitelist
 *       - skip if stopword
 *   → unique tokens + frequency map + total length
 *
 * Output is deterministic given (text, language).
 */

import type { TokenizeResult, Language } from "./types";
import { isChemistryToken, isPureNumber, isShortUnitToken } from "./chemistry-patterns";
import { stemToken } from "./stemmer";
import { isStopword, detectLanguage } from "./stopwords";

/**
 * Split text into raw tokens while preserving chemistry-specific syntax.
 *
 * Splits on: whitespace, most punctuation
 * Keeps: parentheses + digits + +/- inside chemistry tokens
 *
 * Strategy: split on whitespace first, then peel trailing/leading punctuation.
 */
function rawSplit(text: string): string[] {
  const normalized = text.normalize("NFC");
  // Replace fancy quotes / dashes
  const cleaned = normalized
    .replace(/["""'']/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/\|/g, " ")
    .replace(/[\t\n\r\f\v]+/g, " ");
  // Split on whitespace
  const parts = cleaned.split(/\s+/);
  const tokens: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    // Peel leading/trailing punctuation that isn't part of chemistry syntax
    // Keep: parens, +, -, digits inside
    // Strip: . , ; : ! ? " ' [ ] { } at edges
    // R137a-fix: include `|` in edge-strip set as defense-in-depth
    const trimmed = part.replace(/^[.,;:!?"\'\[\]{}<>|]+/, "")
                        .replace(/[.,;:!?"\'\[\]{}<>|]+$/, "");
    if (trimmed) tokens.push(trimmed);
  }
  return tokens;
}

/**
 * Process a single raw token → final indexed form (or null to skip).
 */
function processToken(rawToken: string, language: Language): string | null {
  if (!rawToken) return null;

  // Skip pure numbers (too noisy)
  if (isPureNumber(rawToken)) return null;

  // Chemistry tokens preserved as-is
  if (isChemistryToken(rawToken)) return rawToken;

  // Strip remaining inner punctuation we don't want
  // (chemistry already passed, so this is regular text)
  let token = rawToken.replace(/[^\p{L}\p{N}_\-]/gu, "");
  if (!token) return null;

  // R137a-fix: reject tokens that are entirely dashes/underscores after strip
  // (markdown separator rows like '---------' or '___' produce these)
  if (/^[\-_]+$/.test(token)) return null;

  // R137a-fix: re-check pure-number after inner strip
  // (e.g. raw '|33|' → strip leading/trailing '|' → '33' which is pure number)
  if (isPureNumber(token)) return null;

  // R137a-fix: reject tokens with no letter at all
  // (catches numeric ranges like '2-3', '10-15', '0.5-1.0' from tables)
  if (!/\p{L}/u.test(token)) return null;

  // Length filter — but keep short unit-like tokens
  if (token.length < 2 && !isShortUnitToken(token)) return null;

  // Stopword filter (case-insensitive inside isStopword)
  if (isStopword(token, language)) return null;

  // Stem (no-op for chemistry; lowercase for vi/mixed)
  const stemmed = stemToken(token, language);
  if (!stemmed || stemmed.length < 2) return null;

  // Final stopword check on stemmed form (English stems may collapse stopwords)
  if (language === "en" && isStopword(stemmed, language)) return null;

  return stemmed;
}

/**
 * Tokenize a text chunk.
 * Returns unique tokens + frequency map + total doc length.
 */
export function tokenize(text: string, languageOverride?: Language): TokenizeResult {
  const language = languageOverride || detectLanguage(text);
  const rawTokens = rawSplit(text);

  const freq: Record<string, number> = {};
  let docLength = 0;

  for (const raw of rawTokens) {
    const processed = processToken(raw, language);
    if (!processed) continue;
    freq[processed] = (freq[processed] || 0) + 1;
    docLength += 1;
  }

  return {
    tokens: Object.keys(freq),
    tokenFreq: freq,
    docLength,
    language,
  };
}

// Re-export for convenience
export { detectLanguage } from "./stopwords";
