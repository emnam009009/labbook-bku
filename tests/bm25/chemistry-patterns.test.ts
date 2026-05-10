/**
 * tests/bm25/chemistry-patterns.test.ts
 * Round 144 — Pure logic tests for BM25 chemistry-aware tokenization.
 *
 * Source under test: functions/src/bm25/chemistry-patterns.ts (R137a)
 *
 * Why these tests matter:
 *   Chemistry tokens (MoS2, WO3, LiFePO4, Cu2+, 25°C) MUST be preserved
 *   as-is through tokenize → stem → stopword filter pipeline. If
 *   isChemistryToken regresses, BM25 search will silently rank chemistry
 *   queries wrong (search "MoS2" returns papers about "mos" generic).
 *   This is silent failure — no exception, no alert, just bad results.
 */

import { describe, it, expect } from "vitest";
import {
  isChemistryToken,
  isPureNumber,
  isShortUnitToken,
} from "../../functions/src/bm25/chemistry-patterns";

describe("isChemistryToken — empirical formulas", () => {
  it("recognizes simple binary compounds with digits", () => {
    expect(isChemistryToken("H2O")).toBe(true);
    expect(isChemistryToken("CO2")).toBe(true);
    expect(isChemistryToken("Fe2O3")).toBe(true);
  });

  it("does NOT recognize formulas without digits/parens (conservative by design)", () => {
    // NaCl, KCl, etc. fail the empirical regex /^[A-Z][a-zA-Z0-9()]*[0-9()]/
    // because they have no digit or parenthesis. Comment in source:
    // "Patterns are intentionally conservative to avoid over-matching."
    // Documenting current behavior — change source if requirement shifts.
    expect(isChemistryToken("NaCl")).toBe(false);
  });

  it("recognizes 2D material formulas (lab core domain)", () => {
    expect(isChemistryToken("MoS2")).toBe(true);
    expect(isChemistryToken("WS2")).toBe(true);
    expect(isChemistryToken("WO3")).toBe(true);
  });

  it("recognizes complex formulas with parentheses", () => {
    expect(isChemistryToken("LiFePO4")).toBe(true);
    expect(isChemistryToken("K3Fe(CN)6")).toBe(true);
    expect(isChemistryToken("Ni(OH)2")).toBe(true);
  });

  it("rejects plain English words", () => {
    expect(isChemistryToken("hello")).toBe(false);
    expect(isChemistryToken("research")).toBe(false);
    expect(isChemistryToken("paper")).toBe(false);
  });

  it("rejects pure numbers", () => {
    expect(isChemistryToken("123")).toBe(false);
    expect(isChemistryToken("3.14")).toBe(false);
  });
});

describe("isChemistryToken — acronyms (techniques)", () => {
  it("recognizes 2-6 char all-caps acronyms used in materials science", () => {
    expect(isChemistryToken("CV")).toBe(true);     // cyclic voltammetry
    expect(isChemistryToken("EIS")).toBe(true);    // impedance spectroscopy
    expect(isChemistryToken("XRD")).toBe(true);    // X-ray diffraction
    expect(isChemistryToken("FTIR")).toBe(true);
    expect(isChemistryToken("HPLC")).toBe(true);
  });

  it("rejects mixed-case acronyms (no longer pure all-caps)", () => {
    expect(isChemistryToken("Xrd")).toBe(false);
    expect(isChemistryToken("CvScan")).toBe(false);
  });

  it("rejects single capital letter (too generic)", () => {
    expect(isChemistryToken("A")).toBe(false);
    expect(isChemistryToken("X")).toBe(false);
  });

  it("rejects acronyms longer than 6 chars (likely not standard)", () => {
    expect(isChemistryToken("ABCDEFG")).toBe(false);
  });
});

describe("isChemistryToken — units & measurements", () => {
  it("recognizes voltage/current/temperature with units", () => {
    expect(isChemistryToken("0.5V")).toBe(true);
    expect(isChemistryToken("25°C")).toBe(true);
    expect(isChemistryToken("100mA")).toBe(true);
    expect(isChemistryToken("1.5mol/L")).toBe(true);
  });

  it("rejects unit alone without numeric prefix", () => {
    // "V" alone is single capital — falls under acronym check (rejected: 1 char)
    expect(isChemistryToken("V")).toBe(false);
  });
});

describe("isChemistryToken — ionic species", () => {
  it("recognizes positive ions", () => {
    expect(isChemistryToken("Cu2+")).toBe(true);
    expect(isChemistryToken("Fe3+")).toBe(true);
  });

  it("recognizes negative ions", () => {
    expect(isChemistryToken("OH-")).toBe(true);
  });
});

describe("isChemistryToken — Greek letters", () => {
  it("recognizes lowercase Greek letters used in physics/chem", () => {
    expect(isChemistryToken("α")).toBe(true);
    expect(isChemistryToken("β")).toBe(true);
    expect(isChemistryToken("λ")).toBe(true);
    expect(isChemistryToken("μ")).toBe(true);
  });

  it("recognizes specific uppercase Greek symbols", () => {
    expect(isChemistryToken("Ω")).toBe(true);   // ohm
    expect(isChemistryToken("Δ")).toBe(true);   // delta
  });
});

describe("isChemistryToken — DOI patterns", () => {
  it("recognizes DOI prefix", () => {
    expect(isChemistryToken("10.1021/jacs.0c01234")).toBe(true);
    expect(isChemistryToken("10.1038/nature12345")).toBe(true);
  });

  it("rejects malformed DOIs", () => {
    expect(isChemistryToken("10.123")).toBe(false);   // too few digits + no slash
    expect(isChemistryToken("doi:10.1234/abc")).toBe(false); // has prefix
  });
});

describe("isChemistryToken — edge cases", () => {
  it("handles empty / null-like inputs safely", () => {
    expect(isChemistryToken("")).toBe(false);
    expect(isChemistryToken(" ")).toBe(false);
  });

  it("digit-prefix tokens are caught by number+unit pattern (documents quirk)", () => {
    // "123abc" matches /^[0-9]+(\.[0-9]+)?[a-zA-Zµ°/Ω]+$/ — the
    // "number with unit" pattern. So even nonsense like "123abc" is
    // classified as chemistry. This is a known false-positive of the
    // permissive unit regex. Documented here so any future tightening
    // of the regex won't surprise us.
    expect(isChemistryToken("123abc")).toBe(true);
  });

  it("recognizes digit-prefixed forms with uppercase letter", () => {
    expect(isChemistryToken("2H")).toBe(true);
    expect(isChemistryToken("4Fe")).toBe(true);
  });
});

describe("isPureNumber", () => {
  it("recognizes integers", () => {
    expect(isPureNumber("42")).toBe(true);
    expect(isPureNumber("0")).toBe(true);
  });

  it("recognizes negatives & decimals", () => {
    expect(isPureNumber("-7")).toBe(true);
    expect(isPureNumber("3.14")).toBe(true);
    expect(isPureNumber("-0.5")).toBe(true);
  });

  it("rejects numbers with units or letters", () => {
    expect(isPureNumber("25°C")).toBe(false);
    expect(isPureNumber("100mA")).toBe(false);
    expect(isPureNumber("1e10")).toBe(false);  // scientific notation not supported
  });

  it("rejects empty / non-numeric", () => {
    expect(isPureNumber("")).toBe(false);
    expect(isPureNumber("abc")).toBe(false);
  });
});

describe("isShortUnitToken", () => {
  it("recognizes electrical units", () => {
    expect(isShortUnitToken("V")).toBe(true);
    expect(isShortUnitToken("A")).toBe(true);
    expect(isShortUnitToken("mV")).toBe(true);
    expect(isShortUnitToken("mA")).toBe(true);
  });

  it("recognizes temperature units", () => {
    expect(isShortUnitToken("°C")).toBe(true);
    expect(isShortUnitToken("°F")).toBe(true);
  });

  it("recognizes length units", () => {
    expect(isShortUnitToken("nm")).toBe(true);
    expect(isShortUnitToken("μm")).toBe(true);
    expect(isShortUnitToken("mm")).toBe(true);
  });

  it("recognizes time units", () => {
    expect(isShortUnitToken("min")).toBe(true);
    expect(isShortUnitToken("sec")).toBe(true);
    expect(isShortUnitToken("hr")).toBe(true);
  });

  it("recognizes pH and eV", () => {
    expect(isShortUnitToken("pH")).toBe(true);
    expect(isShortUnitToken("eV")).toBe(true);
  });

  it("rejects non-unit short tokens", () => {
    expect(isShortUnitToken("xx")).toBe(false);
    expect(isShortUnitToken("ab")).toBe(false);
  });

  it("is case-insensitive (per regex /i flag)", () => {
    expect(isShortUnitToken("v")).toBe(true);
    expect(isShortUnitToken("nm")).toBe(true);
  });
});
