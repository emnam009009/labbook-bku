/**
 * tests/bm25/tokenizer.test.ts
 * Round 145a — End-to-end tokenization pipeline.
 *
 * Source under test: functions/src/bm25/tokenizer.ts (R137a)
 *
 * Pipeline locked here:
 *   raw text → NFC normalize → split → for each token:
 *     skip pure number → chemistry bypass → strip punct → length≥2 (or unit)
 *     → stopword filter → stem → re-stopword (EN only) → length≥2
 *   → unique tokens + freq map + total length
 *
 * If CJS interop fails (Porter / stopwords-iso), some EN-specific tests
 * may produce slightly different stems but pipeline structure should hold.
 */

import { describe, it, expect } from "vitest";
import { tokenize } from "../../functions/src/bm25/tokenizer";

describe("tokenize — basic structure", () => {
  it("returns TokenizeResult with tokens, freq, length, language", () => {
    const result = tokenize("Hydrogen evolution reaction MoS2");
    expect(result).toHaveProperty("tokens");
    expect(result).toHaveProperty("tokenFreq");
    expect(result).toHaveProperty("docLength");
    expect(result).toHaveProperty("language");
  });

  it("tokens array is unique (no duplicates)", () => {
    const result = tokenize("test test test test", "en");
    const set = new Set(result.tokens);
    expect(result.tokens.length).toBe(set.size);
  });

  it("docLength counts all occurrences (with duplicates)", () => {
    // Use "catalyst" — content word, not in stopwords-iso EN list.
    // Avoid common test/demo words like "test" / "example" / "sample"
    // because stopwords-iso filters those (as documented in source).
    const result = tokenize("catalyst catalyst catalyst", "en");
    // Porter stem "catalyst" → "catalyst" (no change for this lemma)
    expect(result.docLength).toBe(3);
    expect(result.tokenFreq["catalyst"]).toBe(3);
  });

  it("returns empty result for empty input", () => {
    const result = tokenize("");
    expect(result.tokens).toEqual([]);
    expect(result.docLength).toBe(0);
    expect(Object.keys(result.tokenFreq)).toHaveLength(0);
  });
});

describe("tokenize — filtering rules", () => {
  it("skips pure numbers", () => {
    const result = tokenize("temperature 25 100 200 degrees", "en");
    expect(result.tokens).not.toContain("25");
    expect(result.tokens).not.toContain("100");
    expect(result.tokens).not.toContain("200");
  });

  it("skips numeric ranges from tables (no letter content)", () => {
    const result = tokenize("range 2-3 voltage 0.5-1.0", "en");
    expect(result.tokens).not.toContain("2-3");
    expect(result.tokens).not.toContain("0.5-1.0");
  });

  it("skips markdown separator rows", () => {
    const result = tokenize("data ---- ____ value", "en");
    expect(result.tokens).not.toContain("----");
    expect(result.tokens).not.toContain("____");
  });

  it("skips short non-unit tokens", () => {
    const result = tokenize("a b c x y z", "en");
    // Single letters that are NOT in chemistry whitelist filtered
    // (V, A, M, etc. would survive — see whitelist)
    expect(result.tokens).not.toContain("b");
    expect(result.tokens).not.toContain("c");
    expect(result.tokens).not.toContain("x");
    expect(result.tokens).not.toContain("y");
    expect(result.tokens).not.toContain("z");
  });

  it("filters stopwords", () => {
    const result = tokenize("the catalyst is active and the reaction", "en");
    expect(result.tokens).not.toContain("the");
    expect(result.tokens).not.toContain("is");
    expect(result.tokens).not.toContain("and");
  });
});

describe("tokenize — chemistry preservation", () => {
  it("preserves 2D material formulas as-is", () => {
    const result = tokenize("MoS2 WS2 WO3 photocatalysts", "en");
    expect(result.tokens).toContain("MoS2");
    expect(result.tokens).toContain("WS2");
    expect(result.tokens).toContain("WO3");
  });

  it("preserves complex formulas with parens", () => {
    const result = tokenize("LiFePO4 K3Fe(CN)6 catalysts", "en");
    expect(result.tokens).toContain("LiFePO4");
    expect(result.tokens).toContain("K3Fe(CN)6");
  });

  it("preserves technique acronyms", () => {
    const result = tokenize("XRD CV EIS FTIR characterization", "en");
    expect(result.tokens).toContain("XRD");
    expect(result.tokens).toContain("CV");
    expect(result.tokens).toContain("EIS");
    expect(result.tokens).toContain("FTIR");
  });

  it("preserves unit-attached numbers", () => {
    const result = tokenize("0.5V 25°C 100mA characterization", "en");
    expect(result.tokens).toContain("0.5V");
    expect(result.tokens).toContain("25°C");
    expect(result.tokens).toContain("100mA");
  });
});

describe("tokenize — language override", () => {
  it("respects explicit language parameter over auto-detect", () => {
    const enResult = tokenize("running tests", "en");
    const viResult = tokenize("running tests", "vi");

    // English: stem "running" → "run"
    expect(enResult.language).toBe("en");
    // Vietnamese: no stem, lowercase only
    expect(viResult.language).toBe("vi");
    // Different stems → different token sets
    expect(enResult.tokens).not.toEqual(viResult.tokens);
  });

  it("auto-detects when no override given", () => {
    // Heuristic in detectLanguage: vi diacritics > 4% AND EN words > 15%
    // → 'mixed'. The presence of "hydro" (5 ASCII letters) can tip a
    // mostly-VI text over the threshold. We accept either classification
    // because both are reasonable for technical Vietnamese with English
    // chemistry terms.
    const result = tokenize(
      "Tổng hợp xúc tác quang điện hoá cho phản ứng tách nước hydro",
    );
    expect(["vi", "mixed"]).toContain(result.language);
  });
});

describe("tokenize — punctuation handling", () => {
  it("normalizes fancy quotes and dashes", () => {
    const result = tokenize('catalyst "active" – very effective', "en");
    expect(result.tokens.some((t) => t.includes('"'))).toBe(false);
    expect(result.tokens.some((t) => t.includes("–"))).toBe(false);
  });

  it("strips edge punctuation but keeps chemistry brackets", () => {
    const result = tokenize("catalyst, K3Fe(CN)6.", "en");
    expect(result.tokens).toContain("K3Fe(CN)6");
  });

  it("strips pipe characters from table cells", () => {
    const result = tokenize("|catalyst|active|", "en");
    expect(result.tokens.every((t) => !t.includes("|"))).toBe(true);
  });
});

describe("tokenize — integration with realistic chunks", () => {
  it("handles a realistic English materials science abstract", () => {
    // Note: "(HER)" with surrounding parens does NOT survive tokenization
    // because rawSplit() doesn't peel parens at token edges (so chemistry
    // formulas like K3Fe(CN)6 are preserved as one token). "(HER)" enters
    // processToken non-chemistry, gets parens stripped to "HER", stems to
    // "her", which is an English stopword. Documented quirk — to make
    // bare acronyms searchable, write them outside parens (e.g. "HER" not
    // "(HER)") in indexed content.
    const text =
      "MoS2 nanosheets were synthesized via a hydrothermal method at 200°C " +
      "for 24 hours. The catalyst showed excellent hydrogen evolution reaction " +
      "HER activity with overpotential of 150 mV at 10 mA/cm2. XRD and TEM " +
      "characterization confirmed the 2H phase structure.";
    const result = tokenize(text);

    expect(result.language).toBe("en");
    // Chemistry preserved
    expect(result.tokens).toContain("MoS2");
    expect(result.tokens).toContain("HER");
    expect(result.tokens).toContain("XRD");
    expect(result.tokens).toContain("TEM");
    // Stopwords filtered
    expect(result.tokens).not.toContain("the");
    expect(result.tokens).not.toContain("at");
    // Pure numbers skipped
    expect(result.tokens).not.toContain("200");
    expect(result.tokens).not.toContain("24");
    expect(result.tokens).not.toContain("150");
    // Total length non-trivial (real content present)
    expect(result.docLength).toBeGreaterThan(8);
  });

  it("handles a realistic Vietnamese abstract", () => {
    const text =
      "Trong nghiên cứu này, vật liệu MoS2 được tổng hợp bằng phương pháp " +
      "thuỷ nhiệt ở 200°C trong 24 giờ. Xúc tác cho thấy hoạt tính cao " +
      "trong phản ứng tách nước hydro với mật độ dòng 10 mA/cm2.";
    const result = tokenize(text);

    expect(result.language).toBe("vi");
    expect(result.tokens).toContain("MoS2");
    expect(result.tokens).toContain("200°C");
    // VI stopwords filtered
    expect(result.tokens).not.toContain("trong");
    expect(result.tokens).not.toContain("này");
    expect(result.tokens).not.toContain("được");
    // Content words present (VI: lowercase, no stem)
    expect(result.tokens.some((t) => t.includes("tổng") || t.includes("hợp"))).toBe(true);
  });

  it("handles mixed VI+EN technical text", () => {
    const text =
      "Phương pháp synthesis vật liệu MoS2 photocatalyst sử dụng " +
      "hydrothermal method với điều kiện reaction temperature 200°C trong 24 hours.";
    const result = tokenize(text);

    // Mixed should be detected when significant English content
    expect(["mixed", "vi"]).toContain(result.language);
    // Both VI and EN content tokens preserved
    expect(result.tokens).toContain("MoS2");
    expect(result.tokens).toContain("200°C");
    expect(result.docLength).toBeGreaterThan(5);
  });

  it("output is deterministic for same input", () => {
    const text = "MoS2 photocatalyst hydrogen evolution reaction";
    const r1 = tokenize(text, "en");
    const r2 = tokenize(text, "en");
    expect(r1.tokens.sort()).toEqual(r2.tokens.sort());
    expect(r1.tokenFreq).toEqual(r2.tokenFreq);
    expect(r1.docLength).toBe(r2.docLength);
  });

  it("re-export of detectLanguage is wired", async () => {
    const tokMod = await import("../../functions/src/bm25/tokenizer");
    expect(typeof tokMod.detectLanguage).toBe("function");
  });
});
