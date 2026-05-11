# ROADMAP

Pending features và improvements đã thảo luận. Owner Nam quyết định priority.

> **Long-term strategic context**: see `docs/long-term-roadmap.md` (R143, May 10 2026) — maps strategic vision report to rounds, 3-phase 5-10 year vision (Scientific SaaS → Research OS → Scientific Platform).

## Deferred bugs (don't fix unless asked)

### ~~Bug #11: Notifications schema flat vs rule-nested~~ ✅ RESOLVED in R122
- **Resolution**: R122 refactored to nested per-user schema với migration script. See AUDIT_LOG.md.

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
- `style-src` includes `cdn.jsdelivr.net` for KaTeX (R113a3)
- `connect-src` includes `*.cloudfunctions.net` for Cloud Functions (R111b)
- Mozilla Observatory 125/100 Grade A+

### Memory + plot system (Round 89-94)
- OffscreenCanvas + Web Worker cho PNG export (no main thread block)
- High-res PNG match preview exactly (Round 92-94)
- Worker file: `src/ts/services/plot/highres-png.worker.ts`

### Origin Lab integration (Round 95-102)
- Web → Browser → Protocol handler → Wrapper batch → Origin auto-execute
- See [.claude/skills/labbook/origin-integration.md](./.claude/skills/labbook/origin-integration.md)

### AI Module (Round 105-115)
- Frontend chat sidetab với streaming + markdown + KaTeX
- Backend: 4 Cloud Functions deployed (geminiProxy, toolExecutor, speechProxy, confirmAction)
- 9 tools: 6 read + 3 action (action requires superadmin)
- Voice STT (vi-VN Chirp 2) + TTS (browser native)
- Confirmation card pattern cho write operations

### AI Module Phase B.1-B.3 (Round 130-138) ✅ DONE
- **B.1** (R130-R136): Paper pipeline (upload → Chandra OCR → chunk → embed Voyage 3-large → Firestore vector)
- **B.2** (R137a-R137c2): Hybrid retrieval (vector + BM25 + RRF), Voyage rerank-2.5, eval framework, observability traces
- **B.3** (R138 a/b1/b2): Claude proxy infrastructure, searchPapers tool, NotebookLM-style citation chips
- Tier 1 RAG (Gemini Flash + searchPapers + chips) live in AI Chat
- 11 Cloud Functions deployed: geminiProxy, claudeProxy, toolExecutor, speechProxy, confirmAction, chunkPaper, paperPipelineRouter, searchPapers, backfillBM25, runEval, chandraProxy
- 10 tools: 6 read (chemicals, equipment, experiments, bookings, members, date) + 4 action (createExperiment, updateChemicalStock, createBooking, recordExperimentResult) + 1 RAG (searchPapers)


---

## AI Module Roadmap (Phase A-E, Round 105-220+)

> Foundation docs: `AI_ARCHITECTURE.md`, `DESIGN.md`, `WORKFLOW.md` (root)
>
> Detailed phase plan: see `AI_ARCHITECTURE.md` Section 14.

### Phase A — Foundation (Round 105-115 + R129 add-on) ✅ DONE

**Tools ecosystem post-Phase A**: 10 tools dispatched qua Cloud Function `toolExecutor`
- 6 read tools (chemicals, equipment, experiments, bookings, members, date)
- 4 action tools với confirmation card pattern:
  - createExperimentDraft (R115a — hydro + electrochem)
  - updateChemicalStockDraft (R115a — search by name/CAS/formula)
  - createBookingDraft (R115a — equipment + time slots)
  - recordExperimentResultDraft (R129 — partial update với diff visualization)

**Phase A Original (R105-R115)**

| Round | Status | Task |
|---|---|---|
| 105 | ✅ Done | TypeScript skeleton: 24 analyzer subfolders + docs + .env + .gitignore |
| 106 | ✅ Done | Firebase Blaze upgrade + Cloud Functions skeleton |
| 107 | 📋 Deferred | Python service skeleton (FastAPI + Cloud Run) — needed Phase C |
| 108-108b | ✅ Done | AI Chat sidetab UI shell + draggable FAB |
| 109 | ✅ Done | Conversation schema RTDB + load/save/list |
| 110 | ✅ Done | Markdown + KaTeX + highlight.js rendering |
| 111-111b | ✅ Done | Real Gemini Flash streaming via geminiProxy |
| 112-112c | ✅ Done | Backend tool calling: 6 read tools (chemicals, equipment, experiments, bookings, members, date) |
| 113a-b3 | ✅ Done | UI polish: Stop/Regenerate/Auto-rename/Error toasts + race condition fixes |
| 114a-b3 | ✅ Done | Voice STT/TTS (Cloud Speech v2 Chirp 2 vi-VN + browser TTS) |
| 115a-d | ✅ Done | Action tools với confirm UI (3 write tools, draft pattern, audit log) |

### Pre-Commercial Audit (Round 116-126) ✅ DONE — May 8 2026

Unplanned audit work trước khi commercialize. Phase B paused, resume từ Round 127+.

| Round | Status | Task | Bugs |
|---|---|---|---|
| 116 | ✅ Done | Auth listener leak + presence stuck + XSS edit | 3 |
| 117 | ✅ Done | Orphan storage cleanup + recall rule + escapeJs XSS | 3 |
| 118 | ✅ Done | Atomic stock updates (runTransaction) + image upload size limit | 3 |
| 119 | ✅ Done | Atomic booking slot reservation (saveBooking) | 1 |
| 120 | ✅ Done | Atomic drag/drop reschedule + resize (Bug 3 continued) | 1 |
| 121 | ✅ Done | Search stuck, bulk select missing, member card, bell empty | 4 |
| 122 | ✅ Done | Notifications nested schema + migration script + lock cleanup | 2 |
| 123 | ✅ Done | Members KPI card scroll | 1 feature |
| 124 | ✅ Done | Admin-only import/export, file picker, VN diacritics | 3 |
| 125 | ✅ Done | Console cleanup (PWA meta, dev SW, password form) | 3 cosmetic |
| 126 | ✅ Done | Resizable AI sidetab (left-edge drag handle) | 1 feature |

**Total**: 14 bugs + 3 features. Coverage: race conditions, XSS, data loss, security rules, listener leaks, UX. **See `AUDIT_LOG.md` for full root-cause analysis.**

### Phase B — RAG Infrastructure (Round 130-137c2) ✅ MOSTLY DONE

⚠️ Round numbers shifted +14 vs original plan due to Pre-Commercial Audit (R116-R126) + docs refresh (R127-R128) + Phase A2 add-on (R129).

#### Phase B.1 — RAG pipeline foundation (R130-R136) ✅ DONE

| Round | Status | Task |
|---|---|---|
| 130 | ✅ Done | Sidebar item AI Tools (superadmin only) |
| 131a-v3 + b-fix | ✅ Done | AI Tools sidetab UI shell + 5 sub-tabs (Library/Search/Chat/Eval/Settings) |
| 132a + b + b-fix | ✅ Done | Paper Library upload + dedup (SHA-256, 100MB limit) |
| 133a + b + b-fix | ✅ Done | Chandra OCR integration (Cloud Function proxy + auto-trigger) |
| 134a + b + b-fix | ✅ Done | Section-aware chunking + Pub/Sub event chain (paper-pipeline topic) |
| 135 + fix | ✅ Done | Voyage embeddings (voyage-3-large) via Pub/Sub chain |
| 136a + b + c-fix | ✅ Done | RAG vector search backend (`searchPapers`) + frontend UI |

#### Phase B.2 — Hybrid retrieval + eval + observability + rerank (R137a-R137c2) ✅ DONE

| Round | Status | Task |
|---|---|---|
| 137a + a-fix | ✅ Done | BM25 inverted index foundation (tokenizer + corpus stats + backfill) |
| 137b + b-fix | ✅ Done | Hybrid search engine (Vector + BM25 + RRF) |
| 137b-eval+obs | ✅ Done | RAG eval framework (MRR/P@K/NDCG@K) + LLM observability (tracing + cost) |
| 137c1 + c1-fix | ✅ Done | Voyage rerank-2.5 backend integration |
| 137c2 | ✅ Done | Frontend confidence badges + latency display |

**Architecture**: Commercial-ready interfaces (`SearchEngine`, `Reranker`, `TraceSink`) for SaaS fork. Multi-tenant schema-ready (`tenantId` field). See `docs/commercial-roadmap.md` for full plan.

**Baseline metrics** (10 seed queries, 678 chunks):
- Hybrid + rerank: MRR=1.0, P@10=0.95, NDCG=0.99
- Latency: 524ms warm (no rerank), ~920ms warm (with rerank), 3-4s cold

#### Phase B.3 — Claude proxy + Tier 1 RAG (R138 a/b1/b2) ✅ DONE

| Round | Status | Task |
|---|---|---|
| 138a | ✅ Done | Claude proxy infrastructure (claude-sonnet-4-6, opus-4-7, haiku-4-5) |
| 138b1 | ✅ Done | searchPapers tool (direct call, 1-indexed positions for citations) |
| 138b2a | ✅ Done | Tier 1 RAG verified end-to-end (Gemini + searchPapers) |
| 138b2b | ✅ Done | NotebookLM-style citation chips (popover, dark mode aware) |

#### Phase B.4 — Closure + production hardening (R140-R142) ✅ DONE

⚠️ Phase B AI work continued past R138 — R139 was research-schema design doc (deferred to Phase B.5 R150+).

| Round | Status | Task |
|---|---|---|
| 139 | ✅ Done | Research Schema design doc (`docs/research-schema.md` — Phase B.5 plan) |
| 140 | ✅ Done | Stress-test A2 doc filled (13 papers indexed, Chandra incident logged) |
| 141 | ✅ Done | Chandra API key trim newline fix (was causing 401 mid-test) |
| 142 + b + c | ✅ Done | BM25 indexPaper stage implemented (closes "not implemented yet" gap) |

**Phase B verdict**: RAG pipeline production-ready. Extract → Chunk → Embed → **Index** → Search (vector/bm25/hybrid) → Rerank. ~3575 chunks indexed, 20 papers, ~$0.20 cost.

#### Phase B.5 — Unified Research Schema (R150-R156g) ✅ DONE (May 11, 2026)

Sub-rounds completed:
- R150a-d: Material entity (types, service, Firestore rules + indexes, UI page)
- R151a-d: Sample entity (lineage chain, composite handling)
- R152a-c: Experiment entity (12 type union, conditions schema)
- R152c-2: Form modal create with type-specific fields
- R152d-1: Bulk migration Cloud Function (legacy RTDB → Firestore)
- R152d-2: Migration UI card in Settings (superadmin only)
- R153a: DataAsset foundation (types, service, Firestore rules, Storage rules,
  indexes)
- R153b: DataAsset UI panel in experiment detail (upload + list + download +
  delete)
- R153c: DataAssets gallery page (sidebar item, filter chips, card grid,
  preview modal)
- R153d: Content-aware classifier (JCAMP-DX parser + filename heuristics +
  value range matching for XRD/Raman/FTIR/UV-Vis/electrochem)
- R154-1: Per-experiment lineage modal (D3 force, click-to-navigate)
- R154-2a: Cross-experiment lineage page (4 parallel queries, render all
  entities)
- R154-3: Filter chips + search bar for lineage page
- R155: Audit + deprecate legacy pages (sidebar hide, banner, DEPRECATED
  comments)

Side rounds (tech debt + UI polish):
- R156a: services/experiments.ts @ts-nocheck removed
- R156b-1: global-delegation.ts ev→e bug fix
- R156d: Tag 50 files with categorized @ts-nocheck reasons
- R156e: Inline Chart.js plot preview in DataAsset modal
- R156e-fix1: Sidebar 'Phổ DL' item (silent anchor fail in R153c)
- R156e-fix2: Firestore index tenantId+uploadedAt DESC
- R156f: Phổ DL icon (4 rects → spectrum zigzag) + remove legacy overview sidebar
- R156g: Tauc plot toggle for UV-Vis types in preview modal
- R156g-fix1: Delete DataAsset button — read experimentId from button directly

#### Phase B.5 — Unified Research Schema (R150-R155) ✅ ARCHIVED LISTING

> See `docs/research-schema.md` for full design + `docs/long-term-roadmap.md` for strategic context.
>
> Renumbered từ R140-R145 cũ vì Phase B.4 đã chiếm R140-R142.

| Round | Task | Effort |
|---|---|---|
| R150 | Materials ontology + Firestore setup + Materials browser page | 3-5 days |
| R151 | Samples collection + CRUD + Sample picker | 7-10 days |
| R152 | Experiments unified collection + adapter layer | 7-10 days |
| R153 | DataAssets collection + upload flow rewrite | 5-7 days |
| R154 | Lineage UI (visual graph) | 5-7 days |
| R155 | Backward compat audit + bulk migration | 3-5 days |

**Total**: 30-44 days realistic, spread 8-12 weeks.

**Pre-requisite**: Resolve 7 open design questions in `docs/research-schema.md` Section 12 before starting R150.

#### Phase B.6+ — Future work (TBD)

##### R157a — PDF export integration (NEXT, 1 round est. 200 LOC)
Adapt existing `services/pdf-report.ts` (R30+ era, 743 LOC) for new
experiments + DataAssets:
- Button "Xuất PDF" in experiment detail modal (R152c-1)
- Reuse generatePdfReport(); adapt input from legacy RTDB shape to
  Firestore experiment + DataAssets list
- Include: experiment metadata + conditions + DataAssets thumbnails (image)
  + bandgap result if uv-vis-drs has Tauc data
- Out of scope: plot inline trong PDF (defer R157b), lineage graph image

##### R157b+ — Lightweight JS analysis quick-wins (defer)
- Peak detection overlay (XRD/Raman) — local maxima finder
- Plot inline trong PDF (canvas snapshot)
- Export plot PNG/SVG button trong DataAsset modal

##### R200+ — Python Cloud Run analysis service (Phase B.6 major)
Defer until lab volume justifies infrastructure cost:
- Docker container Python (pymatgen, numpy, scipy, pybaselines)
- Cloud Run service deploy (asia-southeast1)
- IAM service-to-service auth (Firebase Auth token verify)
- HTTP API contract: TS client → Cloud Run → JSON result
- Initial analyzers:
  * XRD: pymatgen JCPDS card matching, Scherrer, lattice refinement
  * Raman: peak deconvolution, baseline (asymmetric LS)
  * Electrochem: Tafel slope, Mott-Schottky linear fit
  * XPS: peak fitting CasaXPS-like
- Existing skeleton: `src/ts/ai/analyzers/structural/xrd/index.ts` etc.
  (Round 105 stubs, TODO Round 131-133)
- Estimate: 15-20 sub-rounds (infra + per-analyzer)

##### Phase E — Next.js + Carbon Design rewrite (long-term, 6-12+ months)
- Migrate pages/UI to React + IBM Carbon Design System
- Keep services + types layer (port 1:1)
- Drop legacy attachments code entirely (deferred from R153f-aggressive)
- Drop @ts-nocheck files for pages (auto-removed via rewrite)
- Bundle reorganization, possible Plotly.js for charts

##### Tech debt remaining (post-Phase-B.5)
Tagged in R156d but not yet fixed (defer to Phase E unless blocking):
- services/global-delegation.ts: 41 type errors (DOM event handlers)
- main.ts: 183 errors mostly unused imports
- 50 @ts-nocheck files documented with reasons
- modal-material-detail same bug as R153b-fix2 (inline display:none
  + wrong wrapper) — fix in audit round when touched


| Phase | Scope | Source |
|---|---|---|
| Phase B.6+ | Event-driven architecture expansion (queue, workers, retry) | Report Priority 3 |
| Phase B.7+ | Internal REST APIs (`GET /samples`, `POST /experiments`) | Report Priority 4 |

---

## Test Strategy — Phase-end

**Decision (May 10 2026)**: Test debt được giải quyết **cuối mỗi phase**, không inline trong feature work.

**Hiện trạng**:
- Vitest 4.1.5 setup, 62/62 tests pass trong `tests/utils/` (auth-helpers, format, async)
- Pattern: `globalThis.window` mock, `vi.spyOn`, `beforeEach/afterEach`
- Coverage: <1% (chỉ utility modules)

**Plan**:
- Cuối Phase B (R143-R149): test BM25 module (tokenizer, stemmer, chemistry-patterns, corpus-stats), pipeline core, search engines
- Cuối Phase B.5 (sau R155): test schema migration, lineage logic, adapter pattern
- Cuối mỗi Phase C-1/C-2/C-3: test analyzer parsers + Python compute responses

**Critical rule**: Mỗi commit đụng `bm25/`, `search/`, hay handler chính → `npm test` (62/62 phải pass) để confirm utils không regression.

**Compliance KB** (Nghị định 24/2026) deferred — was previously planned at R127, will revisit when commercialization timing demands it.

### Phase C-1 — Optical & Structural Analyzers (Round 156-171)

⚠️ Numbers shifted further from R140-R156 vì:
- R140-R142 = Phase B.4 closure (BM25 indexPaper, Chandra fix, A2 docs) — DONE
- R143-R149 = Phase B closure work (test backfill, eval expansion, etc.)
- R150-R155 = Phase B.5 Unified Research Schema
- → Phase C-1 starts at R156

Original plan was R129-R145; this is the second renumber.

| Round | Task |
|---|---|
| 140 | Workbench page shell + Spectrum Analyzer tab |
| 141 | File upload UI + spectrum-tools.ts wrapper + types |
| 142-143 | XRD parser (generic .xy/.txt) + Python /xrd/analyze (pymatgen) |
| 144 | XRD Scherrer + lattice refinement + JCPDS via Materials Project |
| 145-146 | Raman parser (generic .txt) + Python /raman/deconvolve (lmfit Voigt) |
| 147 | Raman MoS₂/WS₂ layer counting (E¹₂g - A₁g) + D/G ratio |
| 148-149 | UV-Vis (reuse jcamp-jasco + tauc) + Urbach + Kubelka-Munk |
| 150-151 | PL parser + Python /pl/multi-gauss (trion A⁻/A⁰/B for TMDs) |
| 152-153 | FTIR (reuse jcamp-jasco) + functional group KB (Mo-S, W-O...) |
| 154-155 | LSV/HER (reuse corrware) + Tafel + overpotential @ 10 mA/cm² |
| 156 | Microscopy vision-based (SEM/TEM via Claude Vision) |

### Phase C-2 — Electrochemistry Analyzers (Round 157-171)

⚠️ Numbers shifted from original 146-160.

| Round | Task |
|---|---|
| 157 | Tier 3 orchestrator with Opus 4.7 (Plan-Execute-Reflect) |
| 158 | CV analyzer (extend corrware): redox peaks, ECSA via Cdl |
| 159 | EIS Nyquist plot via python-service (impedance.py) |
| 160 | EIS equivalent circuit fitting (Rs, Rct, CPE) |
| 161 | Reflection loop (self-critique) + CRAG grader |
| 162 | GCD specific capacitance + energy density |
| 163 | OCP transient + OOD detection |
| 164 | Lab Memory schema + write API |
| 165 | Auto-extract facts from experiments |
| 166 | Feedback loop (thumbs aggregation) |
| 167 | Reformulation pattern learning |
| 168 | Provenance chain UI display |
| 169 | Verify-and-promote-to-memory flow |
| 170 | Eval pipeline (Ragas weekly) |
| 171 | Eval dashboard for admin |

### Phase C-3 — Photoelectrochemistry Analyzers (Round 172-186)

⚠️ Numbers shifted from original 161-175.

| Round | Task |
|---|---|
| 172 | PEC dispatcher + chopped-light data structure |
| 173-174 | PEC LSV under chopped light: photocurrent, ABPE |
| 175 | PEC chronoamperometry chopped: photoresponse stability |
| 176-177 | Mott-Schottky data parsing (multi-frequency) |
| 178 | Mott-Schottky linear fit → flat-band potential, Nd |
| 179-180 | IPCE/EQE parsing + APCE calculation (with UV-Vis) |
| 181 | Surface analyzers dispatcher |
| 182-184 | XPS via Python /xps/peak-fit (lmfit Voigt + Shirley) |
| 185 | EDS atomic % quantification |
| 186 | BET surface area + BJH pore distribution |

### Phase D — Materials DB + Structure (Round 187-201)

⚠️ Numbers shifted from original 176-190.

| Round | Task |
|---|---|
| 187 | TGA/DSC analyzer |
| 188-189 | Materials Database tab (CAS + JCPDS card library) |
| 190-191 | Structure Viewer (3Dmol.js + CIF parsing via pymatgen) |
| 192-194 | DFT Launcher input gen (QE/CASTEP/VASP via ASE) |
| 195-197 | DFT output parser (band structure, DOS, formation energy) |
| 198-201 | Materials AI Writer (templates + LaTeX/Word export) |

### Phase E — Advanced Features (Round 202+)

⚠️ Numbers shifted from original 191+.

| Round | Task |
|---|---|
| 202-206 | Lab Mode (F key) + voice-first workflow |
| 207-211 | Knowledge Graph viz |
| 212-216 | Spectrum Compare (drag overlay) |
| 217-221 | What-if Simulator (predict before experiment) |
| 222-231 | UI redesign per DESIGN.md (interleaved with above) |

### Commercialization Track (parallel với Phase B+, no fixed round numbers)

Owner Nam đang định hướng commercialize sau Pre-Commercial Audit. Roadmap song song:

| Priority | Task | Notes |
|---|---|---|
| P1 | Multi-tenant rules namespace | `users/{tenantId}/{uid}` thay flat `users/{uid}`. Đụng tất cả paths có user data. |
| P1 | Email verification flow | Currently auto-pending sau register. Public release cần Firebase Auth `sendEmailVerification`. |
| P1 | Rate limiting | RTDB không built-in rate limit. Cần Cloud Function gateway hoặc App Check để chống abuse. |
| P2 | Stripe billing integration | Subscription tiers, webhook handlers, cancel/refund flow |
| P2 | Domain whitelisting per tenant | Tenant admin tự manage list email domain allow register |
| P2 | Audit log expansion | Currently chỉ `actionAudit/` cho AI write tools. Cần audit cho mọi RTDB write (cho compliance). |
| P3 | GDPR/PDPA tooling | Export user data, delete-on-request flow |
| P3 | Backup automation | Currently manual. Cần Cloud Scheduler + Functions để daily snapshot. |

### Branch Strategy

- `main` — stable, production-ready
- **`ai-assistant`** — main AI module branch (current work)
- Sub-branches per phase if needed: `ai-assistant/phase-c1`, etc.

See `WORKFLOW.md` for git workflow details.
