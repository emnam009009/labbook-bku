# AI Module Documentation

This folder contains detailed specifications for the LabBook BKU AI module.

## Master document

See `/AI_ARCHITECTURE.md` at repo root for the master AI architecture document.

## Detail files (added in subsequent rounds)

- `PROMPTS.md` — System prompts library (Vietnamese, role-aware)
- `TOOLS.md` — Tool schemas spec (Tier 1/2/3)
- `RAG_PIPELINE.md` — Ingestion + retrieval detailed spec
- `ANTI_HALLUCINATION.md` — 9 layers spec, implementation guide
- `PROVENANCE.md` — Audit chain schema, UI display
- `EVAL.md` — Ragas framework + golden test set
- `INTEGRATIONS.md` — Chandra OCR, VibeVoice, AI-Scientist, Voyage, Anthropic
- `HYBRID_ARCHITECTURE.md` — TypeScript + Python (Cloud Run) integration
- `MATERIALS_LIBRARIES.md` — pymatgen, ASE, MatSciBERT, lmfit, impedance.py usage

## Reading Order for new AI sessions

1. `/AI_ARCHITECTURE.md` (root, master)
2. `/WORKFLOW.md` (root, patch-based development)
3. `/DESIGN.md` (root, UI design system)
4. `INTEGRATIONS.md` (external services)
5. `TOOLS.md` (what AI can do)
6. `PROMPTS.md` (how AI thinks)
7. `RAG_PIPELINE.md` (knowledge retrieval)
8. `ANTI_HALLUCINATION.md` (quality safeguards)
9. `PROVENANCE.md` (audit trail)
10. `EVAL.md` (quality measurement)
11. `HYBRID_ARCHITECTURE.md` (TS + Python)

## Status

Round 105 created skeleton. Detail content will be added in Round 106-108 and beyond.

Last updated: 2026-05-07
