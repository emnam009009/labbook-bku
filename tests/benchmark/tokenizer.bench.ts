import { bench, describe } from "vitest";

// Import đúng path trong repo của bạn
// Kiểm tra path thật:
// ls functions/src/bm25/
import { isChemistryToken } from "../../functions/src/bm25/chemistry-patterns";
import { tokenize } from "../../functions/src/bm25/tokenizer";

describe("Chemistry Tokenizer", () => {
  bench("isChemistryToken — 10 tokens", () => {
    ["WO3","LiFePO4","CV","EIS","3.05eV","OH-","180°C","mV/dec","αβγ","K3Fe"]
      .forEach(t => isChemistryToken(t));
  });

  bench("tokenize — chemistry text", () => {
    tokenize(
      "WO₃ hydrothermal at 180°C, pH 2, Eg = 2.8 eV by Tauc plot. CV, EIS in 0.1M KOH.",
      "en"
    );
  });
});
