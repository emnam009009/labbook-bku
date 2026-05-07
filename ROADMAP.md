# ROADMAP

Pending features và improvements đã thảo luận. Owner Nam quyết định priority.

## Deferred bugs (don't fix unless asked)

### Bug #11: Notifications schema flat vs rule-nested
- **Status**: Reviewed, intentionally deferred (Round 73-ish)
- **Reason**: App runs correctly despite inconsistency. Refactor cost not justified for ~50-user internal lab app.
- **Action**: Don't bring up unless owner explicitly asks to revisit.

## Discussed but deferred features

### Notification system improvements
- Real push notifications (Web Push API) — currently in-app toasts only
- Email digest cho overdue equipment maintenance
- Webhook integration cho lab leadership alerts

### Origin integration enhancements
- Auto-cleanup `.ogs` files in UFF after Origin loads them (currently accumulates)
- Support more file types: `.opj`, `.opju` direct open
- Multi-file batch open (select multiple attachments → 1 Origin session)

### Bundle optimization (rejected/deferred)
- **lightningcss CSS minifier**: Tested Round 103b, NO gain (Tailwind purge already optimal). Don't retry.
- **SVG sprite extraction**: 69 inline SVGs total only 16KB raw, sprite saves ~5KB after gzip. Not worth refactoring.
- **HTML minification**: 132KB HTML gzips to 22KB already. Optimal.
- **Replace pdfmake**: 975KB lib for monthly reports. Possible alternatives: jsPDF + custom layout (~200KB) — but loses Vietnamese font support.

### Performance migration ideas
- **Replace Chart.js (203KB)** with uPlot (40KB) — rejected Round 89 in favor of OffscreenCanvas. May reconsider if mobile perf becomes critical.
- **EIS-specific parser**: Currently parsers/index.ts covers CV/LSV/GCD only. EIS impedance spectroscopy needs separate logic.

## Active in production (don't break)

### CSP architecture (Round 55-58e)
- Strict CSP với `'unsafe-inline'` chỉ cho `style-src` (437 inline styles in index.html)
- Future phase to extract inline styles → external CSS classes (separate refactor effort)
- Mozilla Observatory 125/100 Grade A+

### Memory + plot system (Round 89-94)
- OffscreenCanvas + Web Worker cho PNG export (no main thread block)
- High-res PNG match preview exactly (Round 92-94)
- Worker file: `src/ts/services/plot/highres-png.worker.ts`

### Origin Lab integration (Round 95-102)
- Web → Browser → Protocol handler → Wrapper batch → Origin auto-execute
- See [.claude/skills/labbook/origin-integration.md](./.claude/skills/labbook/origin-integration.md)


---

## AI Module Roadmap (Phase A-E, Round 105-220+)

> Foundation docs: `AI_ARCHITECTURE.md`, `DESIGN.md`, `WORKFLOW.md` (root)
>
> Detailed phase plan: see `AI_ARCHITECTURE.md` Section 14.

### Phase A — Foundation (Round 105-115)

| Round | Status | Task |
|---|---|---|
| 105 | ✅ Done | TypeScript skeleton: 24 analyzer subfolders + docs + .env + .gitignore |
| 106 | ⏳ Next | Firebase Blaze upgrade + Cloud Functions skeleton + tsconfig validation |
| 107 | 📋 | Python service skeleton (FastAPI + Docker + Cloud Run setup) |
| 108 | 📋 | AI Chat sidetab UI shell (slide-out, ⌘J toggle) |
| 109 | 📋 | Conversation schema RTDB + load/save/list |
| 110 | 📋 | Markdown + KaTeX + image rendering in chat |
| 111 | 📋 | Tier 1 routing + Gemini Flash integration + tools schema types |
| 112 | 📋 | Tier 1 tools: chemicals, equipment, bookings query |
| 113 | 📋 | Tier 1 tools: history, members, inventory predictor |
| 114 | 📋 | Compliance KB (Nghị định 24/2026 4 phụ lục as JSON) |
| 115 | 📋 | Web Speech API integration (ASR + TTS basic, vi-VN) |

### Phase B — RAG Infrastructure (Round 116-128)

| Round | Task |
|---|---|
| 116 | Paper upload UI + queue + dedup |
| 117 | Chandra OCR integration (Cloud Function proxy) |
| 118 | PDF extraction pipeline (text + figures + metadata) |
| 119 | Smart chunking (section-aware, overlap) |
| 120 | Contextual pre-prep (Anthropic technique) |
| 121 | Voyage-3 embedding pipeline |
| 122 | Firestore Vector Search index + queries |
| 123 | BM25 keyword index (Lunr.js) |
| 124 | Hybrid retrieval (RRF fusion) |
| 125 | Voyage rerank-2.5 integration |
| 126 | Citation tracking + UI display |
| 127 | Paper Library page (browse, search, filter) |
| 128 | Zotero + Drive sync sources + MatSciBERT alt embedding |

### Phase C-1 — Optical & Structural Analyzers (Round 129-145)

| Round | Task |
|---|---|
| 129 | Workbench page shell + Spectrum Analyzer tab |
| 130 | File upload UI + spectrum-tools.ts wrapper + types |
| 131-132 | XRD parser (generic .xy/.txt) + Python /xrd/analyze (pymatgen) |
| 133 | XRD Scherrer + lattice refinement + JCPDS via Materials Project |
| 134-135 | Raman parser (generic .txt) + Python /raman/deconvolve (lmfit Voigt) |
| 136 | Raman MoS₂/WS₂ layer counting (E¹₂g - A₁g) + D/G ratio |
| 137-138 | UV-Vis (reuse jcamp-jasco + tauc) + Urbach + Kubelka-Munk |
| 139-140 | PL parser + Python /pl/multi-gauss (trion A⁻/A⁰/B for TMDs) |
| 141-142 | FTIR (reuse jcamp-jasco) + functional group KB (Mo-S, W-O...) |
| 143-144 | LSV/HER (reuse corrware) + Tafel + overpotential @ 10 mA/cm² |
| 145 | Microscopy vision-based (SEM/TEM via Claude Vision) |

### Phase C-2 — Electrochemistry Analyzers (Round 146-160)

| Round | Task |
|---|---|
| 146 | Tier 3 orchestrator with Opus 4.7 (Plan-Execute-Reflect) |
| 147 | CV analyzer (extend corrware): redox peaks, ECSA via Cdl |
| 148 | EIS Nyquist plot via python-service (impedance.py) |
| 149 | EIS equivalent circuit fitting (Rs, Rct, CPE) |
| 150 | Reflection loop (self-critique) + CRAG grader |
| 151 | GCD specific capacitance + energy density |
| 152 | OCP transient + OOD detection |
| 153 | Lab Memory schema + write API |
| 154 | Auto-extract facts from experiments |
| 155 | Feedback loop (thumbs aggregation) |
| 156 | Reformulation pattern learning |
| 157 | Provenance chain UI display |
| 158 | Verify-and-promote-to-memory flow |
| 159 | Eval pipeline (Ragas weekly) |
| 160 | Eval dashboard for admin |

### Phase C-3 — Photoelectrochemistry Analyzers (Round 161-175)

| Round | Task |
|---|---|
| 161 | PEC dispatcher + chopped-light data structure |
| 162-163 | PEC LSV under chopped light: photocurrent, ABPE |
| 164 | PEC chronoamperometry chopped: photoresponse stability |
| 165-166 | Mott-Schottky data parsing (multi-frequency) |
| 167 | Mott-Schottky linear fit → flat-band potential, Nd |
| 168-169 | IPCE/EQE parsing + APCE calculation (with UV-Vis) |
| 170 | Surface analyzers dispatcher |
| 171-173 | XPS via Python /xps/peak-fit (lmfit Voigt + Shirley) |
| 174 | EDS atomic % quantification |
| 175 | BET surface area + BJH pore distribution |

### Phase D — Materials DB + Structure (Round 176-190)

| Round | Task |
|---|---|
| 176 | TGA/DSC analyzer |
| 177-178 | Materials Database tab (CAS + JCPDS card library) |
| 179-180 | Structure Viewer (3Dmol.js + CIF parsing via pymatgen) |
| 181-183 | DFT Launcher input gen (QE/CASTEP/VASP via ASE) |
| 184-186 | DFT output parser (band structure, DOS, formation energy) |
| 187-190 | Materials AI Writer (templates + LaTeX/Word export) |

### Phase E — Advanced Features (Round 191+)

| Round | Task |
|---|---|
| 191-195 | Lab Mode (F key) + voice-first workflow |
| 196-200 | Knowledge Graph viz |
| 201-205 | Spectrum Compare (drag overlay) |
| 206-210 | What-if Simulator (predict before experiment) |
| 211-220 | UI redesign per DESIGN.md (interleaved with above) |

### Branch Strategy

- `main` — stable, production-ready
- **`ai-assistant`** — main AI module branch (current work)
- Sub-branches per phase if needed: `ai-assistant/phase-c1`, etc.

See `WORKFLOW.md` for git workflow details.
