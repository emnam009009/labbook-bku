/**
 * tests/bm25/stemmer.test.ts
 * Round 145a — Stem token logic with chemistry bypass + language switching.
 *
 * Why: stemmer is the bottleneck for English query/doc match. If Porter
 * fails to load (CJS interop broken), EN tests below will fail with
 * "expected 'run' got 'running'". That's intentional signal.
 *
 * Source under test: functions/src/bm25/stemmer.ts (R137a)
 */

import { describe, it, expect } from "vitest";
import { stemToken } from "../../functions/src/bm25/stemmer";

describe("stemToken — chemistry bypass (no stem regardless of language)", () => {
  it("preserves chemistry formulas unchanged in EN", () => {
    expect(stemToken("MoS2", "en")).toBe("MoS2");
    expect(stemToken("LiFePO4", "en")).toBe("LiFePO4");
    expect(stemToken("H2O", "en")).toBe("H2O");
  });

  it("preserves chemistry formulas unchanged in VI", () => {
    expect(stemToken("WO3", "vi")).toBe("WO3");
    expect(stemToken("Cu2+", "vi")).toBe("Cu2+");
  });

  it("preserves acronyms in any language", () => {
    expect(stemToken("XRD", "en")).toBe("XRD");
    expect(stemToken("EIS", "vi")).toBe("EIS");
    expect(stemToken("FTIR", "mixed")).toBe("FTIR");
  });
});

describe("stemToken — English Porter v2 stemming", () => {
  // These tests verify CJS interop with `natural` package is working.
  // If they fail with "expected X, got Y(lowercased)", check vitest.config
  // server.deps.inline includes `natural`.

  it("stems common English -ing forms", () => {
    expect(stemToken("running", "en")).toBe("run");
    expect(stemToken("testing", "en")).toBe("test");
  });

  it("stems -ed forms", () => {
    expect(stemToken("tested", "en")).toBe("test");
    expect(stemToken("reduced", "en")).toBe("reduc");
  });

  it("stems plural -s forms", () => {
    expect(stemToken("samples", "en")).toBe("sampl");
    expect(stemToken("electrons", "en")).toBe("electron");
  });

  it("returns lowercase output for English", () => {
    expect(stemToken("CATALYST", "en")).toBe("catalyst");
  });
});

describe("stemToken — Vietnamese (no stemming, lowercase only)", () => {
  it("lowercases but does not stem Vietnamese tokens", () => {
    expect(stemToken("Hydro", "vi")).toBe("hydro");
    expect(stemToken("Tổng", "vi")).toBe("tổng");
    expect(stemToken("HỢP", "vi")).toBe("hợp");
  });
});

describe("stemToken — edge cases", () => {
  it("returns empty string unchanged", () => {
    expect(stemToken("", "en")).toBe("");
    expect(stemToken("", "vi")).toBe("");
  });

  it("mixed language falls back to lowercase (no stem)", () => {
    expect(stemToken("Testing", "mixed")).toBe("testing");
  });
});
