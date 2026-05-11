/**
 * tests/bm25/stopwords.test.ts
 * Round 145a — Stopword filter + chemistry whitelist + language detection.
 *
 * Source under test: functions/src/bm25/stopwords.ts (R137a)
 *
 * Coverage strategy:
 *   - VI stopwords: hardcoded Set, no CJS dependency, fully testable
 *   - Chemistry whitelist: pure logic, fully testable
 *   - EN stopwords: requires `stopwords-iso` CJS package via server.deps.inline.
 *     If interop fails, fallback minimal Set kicks in (~36 words). Tests
 *     verify both the loaded list AND the fallback behave correctly.
 *   - detectLanguage: pure regex heuristic, fully testable.
 */

import { describe, it, expect } from "vitest";
import { isStopword, detectLanguage } from "../../functions/src/bm25/stopwords";

describe("isStopword — Vietnamese", () => {
  it("identifies common Vietnamese stopwords", () => {
    expect(isStopword("và", "vi")).toBe(true);
    expect(isStopword("của", "vi")).toBe(true);
    expect(isStopword("là", "vi")).toBe(true);
    expect(isStopword("trong", "vi")).toBe(true);
  });

  it("rejects content words as stopwords", () => {
    expect(isStopword("hydro", "vi")).toBe(false);
    expect(isStopword("electron", "vi")).toBe(false);
    expect(isStopword("xúc tác", "vi")).toBe(false);  // multi-word, not in set
  });

  it("is case-insensitive (lowercases input)", () => {
    expect(isStopword("VÀ", "vi")).toBe(true);
    expect(isStopword("Của", "vi")).toBe(true);
  });
});

describe("isStopword — English (requires stopwords-iso CJS interop)", () => {
  it("identifies common English stopwords", () => {
    expect(isStopword("the", "en")).toBe(true);
    expect(isStopword("is", "en")).toBe(true);
    expect(isStopword("and", "en")).toBe(true);
    expect(isStopword("of", "en")).toBe(true);
  });

  it("rejects content words", () => {
    expect(isStopword("catalyst", "en")).toBe(false);
    expect(isStopword("electrochemistry", "en")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isStopword("THE", "en")).toBe(true);
    expect(isStopword("Is", "en")).toBe(true);
  });
});

describe("isStopword — chemistry whitelist (NEVER stopword)", () => {
  // Whitelist: short single-letter unit symbols that look like stopwords
  // but are critical for chemistry/electrochemistry.

  it("preserves single-letter electrical units", () => {
    expect(isStopword("V", "en")).toBe(false);  // volt
    expect(isStopword("A", "en")).toBe(false);  // ampere
    expect(isStopword("v", "en")).toBe(false);
    expect(isStopword("a", "en")).toBe(false);
  });

  it("preserves single-letter physical quantities", () => {
    expect(isStopword("M", "en")).toBe(false);  // molar
    expect(isStopword("T", "en")).toBe(false);  // temperature
    expect(isStopword("K", "en")).toBe(false);  // kelvin
    expect(isStopword("E", "en")).toBe(false);  // potential
  });

  it("preserves common derived units", () => {
    expect(isStopword("eV", "en")).toBe(false);
    expect(isStopword("mV", "en")).toBe(false);
    expect(isStopword("Hz", "en")).toBe(false);
    expect(isStopword("pH", "en")).toBe(false);
  });

  it("whitelist applies regardless of language", () => {
    expect(isStopword("V", "vi")).toBe(false);
    expect(isStopword("eV", "mixed")).toBe(false);
  });
});

describe("isStopword — mixed language", () => {
  it("filters tokens stopword in either VI or EN", () => {
    expect(isStopword("và", "mixed")).toBe(true);   // VI
    expect(isStopword("the", "mixed")).toBe(true);  // EN
  });

  it("preserves content words", () => {
    expect(isStopword("hydro", "mixed")).toBe(false);
    expect(isStopword("catalyst", "mixed")).toBe(false);
  });
});

describe("detectLanguage — heuristic", () => {
  it("returns 'en' for short text (< 10 chars)", () => {
    expect(detectLanguage("Hi")).toBe("en");
    expect(detectLanguage("")).toBe("en");
  });

  it("returns 'vi' for high diacritic density", () => {
    const viText = "Tổng hợp xúc tác quang điện hoá cho phản ứng tách nước";
    expect(detectLanguage(viText)).toBe("vi");
  });

  it("returns 'en' for plain ASCII English", () => {
    const enText = "Synthesis of photocatalysts for water splitting reactions";
    expect(detectLanguage(enText)).toBe("en");
  });

  it("returns 'mixed' when significant English content alongside VI diacritics", () => {
    // VI diacritics > 4% AND English-like words > 15% of chars
    const mixedText =
      "Phương pháp synthesis materials WO3 photocatalyst với tổng hợp electrochemistry";
    expect(detectLanguage(mixedText)).toBe("mixed");
  });

  it("returns 'en' for technical English with chemistry tokens", () => {
    const text = "MoS2 nanosheets prepared by hydrothermal method at 200 degrees Celsius";
    expect(detectLanguage(text)).toBe("en");
  });
});
