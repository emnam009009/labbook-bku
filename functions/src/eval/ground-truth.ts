/**
 * Ground truth dataset for RAG evaluation
 * Round 137b-eval+obs
 *
 * SEED VERSION 1.0 — 10 example queries crafted by Claude.
 *
 * 3 papers in current corpus (paperIds from R136 backfill):
 *   PAPER_CV     = "A Practical Beginner's Guide to Cyclic Voltammetry"
 *   PAPER_POM    = "Polyoxometalates in solution speciation"
 *   PAPER_DFT    = "Density Functional Theory" book (Sholl & Steckel)
 *
 * IMPORTANT — nAM should:
 * 1. Replace PAPER_CV/POM/DFT placeholder IDs with actual paperIds
 *    (look them up in Firestore: aiPapers/_shared/{paperId}/title)
 * 2. Expand from 10 → ~50 queries by reading the papers and adding more
 * 3. Bump version when modifying (v1.0 → v1.1 → v2.0 etc.)
 *
 * Mix:
 *   - 5 pure English queries (test default mode)
 *   - 3 mixed Vietnamese + English chemistry term
 *   - 2 pure Vietnamese
 */

import type { GroundTruthDataset } from "./types";

// Placeholder IDs — REPLACE WITH ACTUAL paperIds from Firestore
// To find these: in Firebase Console → RTDB → aiPapers/_shared/, copy doc keys
const PAPER_CV  = "paper-1778253655933-6pn6mb";    // Cyclic Voltammetry
const PAPER_POM = "paper-1778256217553-uriqxn";    // Polyoxometalates
const PAPER_DFT = "paper-1778256644230-ruj3o0";    // DFT book

export const GROUND_TRUTH: GroundTruthDataset = {
  version: "v1.0-seed",
  description: "10 seed queries covering CV, POM, DFT papers in mixed languages",
  queries: [
    // === ENGLISH (5) ===
    {
      id: "q001",
      query: "cyclic voltammetry experimental procedure",
      language: "en",
      expectedPapers: [
        { paperId: PAPER_CV, relevance: "high" },
      ],
      notes: "Direct hit on CV paper. Should NOT match POM or DFT.",
    },
    {
      id: "q002",
      query: "what is the scan rate effect on peak current",
      language: "en",
      expectedPapers: [
        { paperId: PAPER_CV, relevance: "high" },
      ],
      notes: "CV concept (Randles-Sevcik). Tests semantic understanding.",
    },
    {
      id: "q003",
      query: "DFT functional selection for transition metals",
      language: "en",
      expectedPapers: [
        { paperId: PAPER_DFT, relevance: "high" },
        { paperId: PAPER_POM, relevance: "low" },
      ],
      notes: "DFT methodology, POM may discuss as application.",
    },
    {
      id: "q004",
      query: "polyoxometalate cluster speciation in aqueous solution",
      language: "en",
      expectedPapers: [
        { paperId: PAPER_POM, relevance: "high" },
      ],
      notes: "Direct POM topic.",
    },
    {
      id: "q005",
      query: "exchange correlation functional",
      language: "en",
      expectedPapers: [
        { paperId: PAPER_DFT, relevance: "high" },
      ],
      notes: "Core DFT terminology.",
    },

    // === MIXED Vietnamese + English (3) ===
    {
      id: "q006",
      query: "phương pháp đo cyclic voltammetry là gì",
      language: "mixed",
      expectedPapers: [
        { paperId: PAPER_CV, relevance: "high" },
      ],
      notes: "Vietnamese question + English technical term. Tests bilingual retrieval.",
    },
    {
      id: "q007",
      query: "cách tính band gap bằng DFT",
      language: "mixed",
      expectedPapers: [
        { paperId: PAPER_DFT, relevance: "high" },
      ],
      notes: "Vietnamese + DFT term. Tests if 'band gap' tokenizes correctly.",
    },
    {
      id: "q008",
      query: "POM cluster trong dung dịch axit",
      language: "mixed",
      expectedPapers: [
        { paperId: PAPER_POM, relevance: "high" },
      ],
      notes: "Mixed: POM acronym + Vietnamese 'in acidic solution'.",
    },

    // === Vietnamese (2) ===
    {
      id: "q009",
      query: "lý thuyết phiếm hàm mật độ",
      language: "vi",
      expectedPapers: [
        { paperId: PAPER_DFT, relevance: "high" },
      ],
      notes: "Pure Vietnamese for 'Density Functional Theory'. Stress test for vector engine since BM25 won't match English DFT terms.",
    },
    {
      id: "q010",
      query: "đo điện thế bằng phương pháp điện hóa",
      language: "vi",
      expectedPapers: [
        { paperId: PAPER_CV, relevance: "medium" },
      ],
      notes: "Pure Vietnamese 'measuring voltage by electrochemical method'. Marginal match to CV — tests how engines handle paraphrases.",
    },
  ],
};
