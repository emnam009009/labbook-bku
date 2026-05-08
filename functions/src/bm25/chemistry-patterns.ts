/**
 * BM25 — Chemistry token patterns
 * Round 137a
 *
 * Tokens matching these patterns are PRESERVED AS-IS:
 * - No lowercasing (capitals matter: Mg vs mg)
 * - No stemming (LiFePO4 must stay LiFePO4)
 * - Not filtered as stopwords
 *
 * Patterns are intentionally conservative to avoid over-matching.
 */

/**
 * Test if a token is a chemistry-pattern token.
 * Tokens are checked in priority order.
 */
export function isChemistryToken(token: string): boolean {
  if (!token || token.length < 1) return false;

  // Empirical formula: Capital-letter element followed by digit
  // e.g. H2O, CO2, NaCl, LiFePO4, K3Fe(CN)6, Ni(OH)2
  // Match: starts with capital + has digit OR has parenthesis
  if (/^[A-Z][a-zA-Z0-9()]*[0-9()]/.test(token)) return true;

  // Reversed empirical: digit-prefixed forms like 2H+ or 4e-
  if (/^[0-9]+[A-Z]/.test(token)) return true;

  // Acronyms (2-6 capital letters, no lowercase mix)
  // e.g. CV, EIS, XRD, SEM, TEM, FTIR, NMR, HPLC
  if (/^[A-Z]{2,6}$/.test(token)) return true;

  // Number with unit: 0.5V, 25°C, 100mA, 1.5mol/L
  if (/^[0-9]+(\.[0-9]+)?[a-zA-Zµ°/Ω]+$/.test(token)) return true;

  // Greek letters used in chem/physics (single-char or symbol)
  if (/^[αβγδεηθλμνπρσφψω]$/i.test(token)) return true;
  if (/^[ΩΔΠΣΦΨ]$/.test(token)) return true;

  // Ionic species: Cu2+, Fe3+, OH-, SO4^2-
  if (/^[A-Z][a-zA-Z0-9]*[+\-]+[0-9]*$/.test(token)) return true;

  // DOI / Identifier patterns
  if (/^10\.[0-9]{4,}\//.test(token)) return true;

  return false;
}

/**
 * Test if token is purely numeric (skip indexing — too noisy).
 */
export function isPureNumber(token: string): boolean {
  return /^-?[0-9]+(\.[0-9]+)?$/.test(token);
}

/**
 * Test if token is a unit-like token worth keeping
 * even when it's short (1-2 chars).
 * (Subset of CHEMISTRY_WHITELIST in stopwords.ts but pattern-based.)
 */
export function isShortUnitToken(token: string): boolean {
  return /^(V|A|M|N|K|T|G|Hz|°C|°F|pH|eV|mV|mA|mW|kHz|MHz|GHz|nm|μm|µm|mm|cm|km|kg|mg|μg|µg|mol|min|sec|hr|day)$/i.test(token);
}
