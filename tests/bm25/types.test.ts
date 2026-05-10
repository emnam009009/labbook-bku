/**
 * tests/bm25/types.test.ts
 * Round 145a — Lock exported constants from BM25 types module.
 *
 * Why: TOKENIZER_VERSION bumps trigger re-tokenize across entire corpus
 * (expensive). Lock current value to make any change visible in PR.
 */

import { describe, it, expect } from "vitest";
import {
  TOKENIZER_VERSION,
  DEFAULT_K1,
  DEFAULT_B,
  CORPUS_STATS_DOC,
  CORPUS_STATS_COLLECTION,
} from "../../functions/src/bm25/types";

describe("BM25 types — exported constants", () => {
  it("TOKENIZER_VERSION is locked at 2 (R137a-fix)", () => {
    expect(TOKENIZER_VERSION).toBe(2);
  });

  it("BM25 hyperparameters use canonical defaults", () => {
    expect(DEFAULT_K1).toBe(1.5);
    expect(DEFAULT_B).toBe(0.75);
  });

  it("Firestore paths are locked", () => {
    expect(CORPUS_STATS_DOC).toBe("global");
    expect(CORPUS_STATS_COLLECTION).toBe("aiCorpusStats");
  });
});
