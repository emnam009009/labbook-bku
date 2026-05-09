# LabBook BKU — Long-term Roadmap

> **Purpose**: Strategic vision 5-10 năm + mapping giữa long-term report và rounds thực tế.
>
> **Sources of truth**:
> - Strategic vision: `Labbook_Bku_Long_Term_Platform_Roadmap_Report.pdf` (received May 10 2026)
> - Detailed schema design: `docs/research-schema.md` (Phase B.5)
> - Round-level roadmap: `ROADMAP.md`
> - Architecture: `AGENTS.md`, `AI_ARCHITECTURE.md`
>
> **Audience**: AI agents (Claude, Cursor, Copilot) and Owner Nam.

---

## TL;DR

LabBook BKU đang trên hành trình từ **scientific web app → research operating system → scientific platform**, theo lộ trình 3 phases dài hạn:

| Phase | Năm | Goal | Status |
|---|---|---|---|
| **Phase 1 — Scientific SaaS ổn định** | 0-2 | UX, reliability, instrument parsing, export | ✅ ~85% (Phase A + Pre-Commercial Audit + Phase B AI) |
| **Phase 2 — Research OS** | 2-5 | Unified research graph, lineage, plugin ecosystem, AI-assisted | 🔄 Đang vào (Phase B AI done; Phase B.5 Research Schema next) |
| **Phase 3 — Scientific Platform** | 5-10 | Multi-lab, shared datasets, ontology layer, AI copilot | 📋 Chưa start |

**Điểm then chốt** (theo report): chuyển từ "feature app" sang "research operating system" — dữ liệu + lineage là moat lớn nhất.

---

## 1. Strategic context — từ report long-term

### 1.1 Đánh giá hiện trạng

LabBook BKU đã có:
- ✅ **Domain khoa học thật**: electrochemistry, spectroscopy, parser, fitting, experiment management
- ✅ **Production mindset**: auth, RBAC, audit log, cloud deployment, multi-module workflow
- ✅ **AI integration direction**: 11 Cloud Functions, 10 tools, RAG pipeline production-ready (Phase B done R130-R142)

### 1.2 Giới hạn sẽ xuất hiện khi scale

Report identify 4 limits:

1. **Feature-centric architecture** — page-driven (xrdPage, reportPage, bookingPage). OK cho rapid dev, khó orchestration khi scale.
2. **Thiếu unified research graph** — data scattered across collections/modules/pages. ⚠️ **ƯU TIÊN SỐ 1**.
3. **Chưa event-driven** — workflow synchronous, page-triggered. Cần queue/workers/orchestration cho AI processing, fitting, batch analysis.
4. **Firebase sẽ thành bottleneck** — tốt cho MVP, nhưng scientific platform dài hạn cần relational queries, lineage queries, graph traversal. Long-term: hybrid với PostgreSQL.

### 1.3 Priority 1-5 từ report

| Priority | Item | LabBook plan |
|---|---|---|
| **P1** | **Unified Research Schema** — Sample, Experiment, DataAsset, Instrument, Material entities | **Phase B.5 (R150-R155)** — `docs/research-schema.md` |
| **P2** | **Experiment Lineage** — Synthesis → Annealing → XRD → Raman → EIS → HER chain | **Phase B.5 R154** Lineage UI |
| **P3** | **Event-driven Architecture** — Event bus, async workers, queue (Pub/Sub đã có, mở rộng) | Phase B.6+ (planned) |
| **P4** | **Internal REST APIs** — `GET /samples`, `POST /experiments`, etc. | Phase B.7+ (planned) |
| **P5** | **Plugin Architecture** — Parser/Analysis/Export/Instrument plugins | Phase C+ |

---

## 2. Three-phase roadmap (5-10 năm)

### 2.1 Phase 1 — Scientific SaaS ổn định (0-2 năm) — ~85% done

**Goal**: 5-20 labs dùng thật, workflow ổn định, retention tốt.

**Đã hoàn thành:**
- Pre-AI core (Round 1-104): UX, parsers (CV/LSV/GCD via corrware), Tauc plot, bandgap fit, Origin Lab integration, OffscreenCanvas plotting
- Pre-Commercial Audit (R116-R126): 14 bugs + 3 features, security/correctness/UX hardened
- AI Phase A (R105-R115 + R129): 10 tools (6 read + 4 action), Gemini Flash + voice STT/TTS
- AI Phase B (R130-R142): RAG pipeline production-ready (extract → chunk → embed → index → search), hybrid retrieval (vector + BM25 + RRF) + Voyage rerank-2.5

**Còn lại Phase 1:**
- Commercialization track (parallel, no fixed rounds): multi-tenant rules, email verification, rate limiting, billing, GDPR/PDPA tooling
- Test coverage expansion (currently 62 tests in `tests/utils/`, target: BM25 module + critical handlers + auth flows)

### 2.2 Phase 2 — Research OS (2-5 năm) — đang vào

**Goal**: Unified research graph, lineage system, plugin ecosystem, AI-assisted workflow.

**Components:**
- **Phase B.5 (R150-R155)** — Unified Research Schema (Materials, Samples, Experiments, DataAssets, Instruments + Lineage UI). See `docs/research-schema.md`.
- **Phase B.6+ (TBD)** — Event-driven workflows: expand Pub/Sub usage, async workers cho fitting/AI/report-gen, retry system.
- **Phase B.7+ (TBD)** — Internal REST APIs: `GET /samples`, `POST /experiments`, etc. → enables mobile, automation, AI agents.
- **Phase C-1 to C-3 (R156-R186)** — Optical/Structural/Electrochem/Photoelectrochem analyzers (existing ROADMAP.md; renumbered từ R140-R175 cũ do shift).
- **Phase D (R187-R201)** — Materials DB + Structure Viewer + DFT integration + AI Writer.
- **Smart search across experiments** — already có RAG (Phase B); extend với entity-level search (Phase B.5+).
- **Benchmark engine** — compare catalyst trends, suggest experiments (Phase D).

### 2.3 Phase 3 — Scientific Platform (5-10 năm) — chưa start

**Goal**: Multi-lab network, shared datasets, ontology layer, AI-native research workflows.

**Aspirations** (từ report, chưa break down rounds):
- Multi-lab network: tenant isolation, shared catalog, federated search
- Materials knowledge graph: ontology layer cho 2D materials, TMDs (MoS₂, WS₂, WO₃), heterostructures
- Recommendation engine: suggest next synthesis, detect outlier, compare across labs
- Reproducibility engine: provenance-aware AI, version everything (experiments, fitting, AI model versions)
- AI research copilot: provenance-aware reasoning, lineage-following queries, scientific retrieval beyond chat

**Plugin ecosystem** (P5 trong report):
- Parser plugins (CorrWare, Gamry, Metrohm, CHI, Raman exports)
- Analysis plugins (Tauc fitting, peak fitting, impedance fitting, ML prediction)
- Export plugins (publication report, thesis report, ACS format, supplementary data)
- Instrument connectors (auto ingest, scheduled sync, metadata extraction)

---

## 3. Architecture evolution

### 3.1 Frontend

| Hiện tại | Dài hạn |
|---|---|
| Feature/page-oriented (xrdPage, reportPage...) | Component-driven, entity-driven, plugin-ready |
| Inline UI logic | Design system + reusable scientific components, chart abstraction, data table abstraction, plugin UI slots |

### 3.2 Backend

| Hiện tại | Dài hạn |
|---|---|
| Firebase RTDB + Cloud Functions (TS) | Hybrid: PostgreSQL + Object Storage + Redis + Queue + Workers + AI services + Scientific compute services |

**Migration strategy**: KHÔNG rewrite. Refactor dần, domain hóa dần, migration theo layers (theo "sai lầm cần tránh" trong report).

### 3.3 Scientific Compute Layer

Tách rõ:
- Frontend (Vite + Tailwind, current)
- Backend API (Cloud Functions, current — sẽ shift sang REST API gateway Phase B.7+)
- **Scientific compute** (Python services Cloud Run — `pythonBridge` đã có manh nha, expand từ Phase C-1 R156+)
- AI services (Cloud Functions hiện tại — sẽ refactor thành dedicated service Phase D)
- Workers (queue consumers — Phase B.6+)

Compute services dùng: scipy, pandas, numpy, pymatgen, ASE, impedance.py, lmfit.

### 3.4 AI Layer

Không chỉ chatbot. Hướng tới:
- **Scientific Retrieval** (đã có Phase B RAG): tìm experiment tương tự, tìm synthesis condition tốt nhất
- **Provenance-aware AI** (Phase D R164-R169): AI hiểu nguồn dữ liệu, instrument, uncertainty, processing history
- **Experiment Recommendation** (Phase D R170-R171, Phase E R217-R221): suggest next synthesis, detect outlier, compare catalyst trends, what-if simulator

---

## 4. Cross-cutting concerns

Report nhắc 5 thứ "rất quan trọng nhưng thường bị bỏ quên":

| Concern | Hiện trạng | Plan |
|---|---|---|
| **Metadata quality** (units, operators, timestamps, calibration, environment, instrument settings) | Partial — có ở experiments | Standardize trong Phase B.5 schema |
| **Versioning** (experiments, reports, fitting, datasets) | ❌ Chưa có | Phase B.5+ — version field trong Sample/Experiment/DataAsset |
| **Provenance tracking** (data origin, parser version, fitting model, AI model version) | Partial — `actionAudit/` cho AI write | Mở rộng Phase B.5 R155 + Phase D R164-R169 |
| **Observability** (logs, metrics, tracing, error analytics, usage analytics) | Partial — R137b tracer cho search | Mở rộng — gắn vào mọi handler quan trọng |
| **Security & Compliance** (audit logs, access policies, backups, encryption, dataset permissions) | Partial — RBAC + audit log basic | Phase 1 Commercialization track + Phase 3 multi-lab |

---

## 5. Test strategy

**Hiện trạng** (May 10 2026):
- ✅ Vitest 4.1.5 setup, scripts `test`, `test:watch`, `test:coverage`
- ✅ 62 tests pass trong `tests/utils/` (auth-helpers, format, async)
- ❌ No tests cho `functions/` (BM25, search engines, handlers, tools)
- ❌ No tests cho `src/ts/ai/` (RAG retrieval, papers, tools)

**Strategy** (May 10 2026 quyết định): **Phase-end testing.**

Lý do:
- Code Phase B đã verified bằng integration tests thực (stress-test A2 với 13 papers, manual search verification 3 modes)
- Tránh "test debt" lan vào việc đang làm
- Test sau khi feature stable → biết spec rõ → không phải rewrite tests khi spec đổi
- Pattern test đã có sẵn (`tests/utils/*.test.ts`) — dễ replicate khi đến lúc

**Lịch dự kiến:**
- Cuối Phase B (sau ~R145-R149): test BM25 module (tokenizer, stemmer, chemistry-patterns, corpus-stats), pipeline core functions, search engines.
- Cuối Phase B.5 (sau R155): test schema migration, lineage logic, adapter pattern.
- Cuối mỗi Phase C-1/C-2/C-3: test analyzer parsers + Python compute responses.

**Critical rule**: Khi commit có thay đổi `bm25/`, `search/`, hay handler chính → chạy `npm test` (62/62 phải pass) để confirm regression không leak vào utils.

### TypeScript debt — `@ts-nocheck` cleanup

**Status** (May 10 2026 audit):
- **49 files** với `@ts-nocheck` (20% trong 244 TS files)
- **~21,643 LOC** trong files debt = **70.7% TS code** chưa typecheck thực sự
- **0** `@ts-ignore`, **0** `@ts-expect-error` — sạch về inline skip
- Files debt phân bố: pages layer (booking, equipment, chemicals, experiments, dashboard, reports), services core (plot, image-handlers, save-handlers, notifications), AI module (paper-*, voice, tools, memory)
- Pattern: phần lớn là legacy migrated từ JS (R1-R104 era), AI module mới (R108+) ít hơn

**Why it matters**: TS pass-build hiện tại che ~70% codebase. Refactor nặng (Phase B.5 schema overhaul) trên codebase chưa typecheck đầy đủ là rủi ro thầm lặng.

**Strategy — 3-tier cleanup**:

1. **Tier 1 — Boy scout rule (mỗi round)**: PR đụng file `@ts-nocheck` → fix nếu effort <30 phút. Nếu chưa fix được, thêm comment `// TODO(R-XXX): remove @ts-nocheck — <reason>` để track.

2. **Tier 2 — Dedicated cleanup rounds (medium-term, sau Phase B.5)**: 2-3 rounds chuyên fix. Ưu tiên theo churn rate (low churn first → ổn định, không bị invalidate khi feature work):
   - **First**: AI Phase B files (paper-list, paper-search, conversation-store, tool-client) — low churn, well-isolated
   - **Second**: Services core (plot/, image-handlers, save-handlers, notifications) — high impact, medium churn
   - **Last**: Pages layer (booking, dashboard, equipment, etc.) — high churn, fix cuối tránh re-work

3. **Tier 3 — CI guard (long-term)**: ESLint rule hoặc custom script chặn add `@ts-nocheck` mới. Track count theo thời gian; goal là 0 `@ts-nocheck` cuối Phase 2 (Research OS, ~5 năm).

**Tracking**: count cập nhật cuối mỗi phase trong `CHANGELOG.md` "TS debt: N files / X LOC" để xem tiến độ.

---

## 6. Sai lầm cần tránh (từ report)

A. **Feature explosion** — đừng thêm feature liên tục mà không unify architecture. Phase B.5 là chính xác để address điều này.

B. **AI quá sớm** — AI không cứu được architecture yếu. Đã làm AI Phase A-B nhưng KHÔNG bỏ qua schema overhaul (Phase B.5 là next).

C. **Rewrite toàn bộ** — không nên. Refactor dần, domain hóa dần, migration theo layers. Phase B.5 dùng adapter pattern (lazy migration) thay vì cutover.

D. **Generic hóa quá sớm** — không cố thành platform cho mọi ngành. Giữ focus: electrochemistry, materials science, spectroscopy workflow.

---

## 7. Kết luận chiến lược

LabBook BKU hiện có:
- ✅ Scientific depth (TMDs, electrochem, spectroscopy)
- ✅ Software engineering nền tảng (62 tests, CSP A+, Lighthouse 93/95/100/100)
- ✅ Workflow thực tế (lab Vật liệu BKU đang dùng)
- ✅ AI integration mạnh (Phase B RAG production-ready)
- ✅ Tiềm năng platform rất lớn

**Điểm quan trọng nhất từ giờ KHÔNG phải:**
- Thêm feature nhanh.

**Mà là:**
- Chuyển từ **"feature app" sang "research operating system"** = Phase B.5 + Phase 2 work.

Nếu làm đúng:
- Dữ liệu sẽ trở thành moat lớn nhất.
- Lineage sẽ trở thành tài sản lớn nhất.
- AI sẽ mạnh lên tự nhiên theo thời gian.

Khi đó: LabBook BKU không còn chỉ là web app quản lý lab, mà có thể trở thành **nền tảng hạ tầng nghiên cứu cho materials/electrochemistry labs**.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Phase A** | AI Foundation (R105-R115 + R129) — chat, tools, voice |
| **Phase B** | RAG Infrastructure (R130-R142) — paper pipeline, search, citation chips |
| **Phase B.5** | Unified Research Schema (R150-R155, planned) — Materials/Samples/Experiments/DataAssets/Instruments + Lineage |
| **Phase B.6+** | Event-driven architecture expansion (TBD) |
| **Phase B.7+** | Internal REST API layer (TBD) |
| **Phase C-1/2/3** | Analyzers — Optical/Structural (R156-R171), Electrochem (R172-R186), Photoelectrochem (R187-R201) — renumbered từ R140-R175 cũ |
| **Phase D** | Agentic loop + self-learning + provenance (R202-R216) |
| **Phase E** | Advanced features — Materials DB, Structure, DFT, AI Writer, Lab Mode (R217+) |
| **Research OS** | Phase 2 long-term goal — unified graph + lineage + plugins + AI-assisted |
| **Scientific Platform** | Phase 3 long-term goal — multi-lab + ontology + recommendation + reproducibility |

---

## 9. References

- `Labbook_Bku_Long_Term_Platform_Roadmap_Report.pdf` — strategic source (May 10 2026)
- `docs/research-schema.md` — Phase B.5 detailed design
- `ROADMAP.md` — round-level roadmap (Phase A-E)
- `CHANGELOG.md` — completed rounds
- `AGENTS.md` — full architecture
- `AI_ARCHITECTURE.md` — AI module 3-tier deep dive
- `docs/commercial-roadmap.md` — SaaS commercialization plan
- `CLAUDE.md` — entry point cho AI agents
