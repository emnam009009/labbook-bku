# CLAUDE.md

> **Entry point cho AI agents** (Claude, Cursor, Copilot). Đọc file này TRƯỚC, sau đó dive vào AGENTS.md cho chi tiết.

## TL;DR — 30 seconds

LabBook BKU là **web app quản lý phòng thí nghiệm hoá**. Stack:
- **Vite 8 + Tailwind 3 + Firebase RTDB + TypeScript ESM**
- Deploy: **Firebase Hosting (Spark plan)** → `https://lab-manager-268a6.web.app`
- Working dir (WSL Ubuntu): `~/LAB-MANAGER/labbook-vite-tailwind/labbook`
- Repo: `github.com/emnam009009/labbook-bku`

**Owner**: bạn Nam — communication 100% **tiếng Việt**.

## Critical rules (NEVER violate)

1. **CSS `:has()` selector BROKEN** trong project — không dùng. Dùng JS DOM check thay thế.
2. **Patches**: Luôn dùng atomic Python script trong `/mnt/user-data/outputs/labbook-patches/` với backup `.bakNN`.
3. **Verify before deploy**: `npm run typecheck && npm run build && npm test` (62/62 must pass).
4. **AGENTS.md tracked in repo** — `git pull` đầu session, KHÔNG `rm -f`.
5. **Boundary verify before patch**: grep/read file thực tế trước khi viết patch — KHÔNG assume HTML structure.

## Quick navigation

| Topic | File |
|-------|------|
| Full architecture + folder map | [AGENTS.md](./AGENTS.md) |
| Tech stack details + conventions | [.claude/memory/global.md](./.claude/memory/global.md) |
| Established code patterns | [.claude/memory/patterns.md](./.claude/memory/patterns.md) |
| Lessons learned (DON'Ts) | [.claude/memory/mistakes.md](./.claude/memory/mistakes.md) |
| Debug workflow | [.claude/skills/coding/debug.md](./.claude/skills/coding/debug.md) |
| Optimization workflow | [.claude/skills/coding/optimize.md](./.claude/skills/coding/optimize.md) |
| Origin Lab integration | [.claude/skills/labbook/origin-integration.md](./.claude/skills/labbook/origin-integration.md) |
| Future features | [ROADMAP.md](./ROADMAP.md) |
| Recent changes | [CHANGELOG.md](./CHANGELOG.md) |

## Current state (as of Round 103b)

- ✅ **Tests**: 62/62 pass (Vitest)
- ✅ **Lighthouse Mobile**: Performance 93, Accessibility 95, Best Practices 100, SEO 100
- ✅ **CSP**: Mozilla Observatory 125/100 Grade A+ (Round 55-58e)
- ✅ **Origin Lab integration**: Working end-to-end (Round 95-102)
- ✅ **Bundle optimized**: -600KB initial load (Round 103a-b)
- 🔄 **Next**: TBD per user request

## Round numbering

Round = 1 patch session = 1+ atomic Python scripts = 1+ git commits.

Latest pushed: Round 103b. Numbering không reset, monotonically increasing.

## Communication norms

- **Vietnamese-only** với owner Nam.
- Brief, direct. Không ramble.
- Khi tool fail, paste error + diagnose, không apologize blindly.
- Block lệnh cho user **PHẢI** phân biệt rõ WSL bash vs Windows cmd — không trộn.
- Commit messages: tiếng Anh OK (git convention).

## Tools used

- **WSL Ubuntu**: dev environment, builds, deploys
- **Windows**: end user (browser test), Origin Lab desktop integration
- **Firebase Console**: monitor RTDB, Hosting, Auth
- **Edge browser**: primary user browser (downloads → C:\Users\LEGION\Downloads)


## AI Module (Phase A-E, Round 105+)

LabBook BKU đang xây dựng **AI Research Platform** — Hybrid TypeScript + Python kiến trúc dành cho lab vật liệu 2D/TMDs (WS₂, WO₃, MoS₂...).

### Master Documentation (root)

- **`AI_ARCHITECTURE.md`** — Kiến trúc 3-tier, Agentic RAG, 9-layer anti-hallucination, self-learning, provenance chain, Hybrid TS+Python strategy
- **`DESIGN.md`** — UI design system (anti-card, cyan accent, JetBrains Mono numerical, Lucide icons)
- **`WORKFLOW.md`** — Patch-based development process, AI assistant rules, `/mnt/d/labbook-patches/` directory layout

### Detail Documentation

- **`docs/ai/*`** — 9 detail files (PROMPTS, TOOLS, RAG_PIPELINE, ANTI_HALLUCINATION, PROVENANCE, EVAL, INTEGRATIONS, HYBRID_ARCHITECTURE, MATERIALS_LIBRARIES)
- **`docs/design/*`** — 4 detail files (TOKENS, COMPONENTS, PATTERNS, MIGRATION)

### Code Structure

```
src/ts/ai/                          ← AI orchestration (TypeScript strict partial)
├── core/                           — provider abstraction
├── agent/                          — orchestrator, planner, reflector
├── tools/                          — Tier 1 RTDB tools
├── analyzers/                      — 6 nhóm × 24 subfolders
│   ├── structural/{xrd,saxs}/      — XRD, SAXS via pymatgen
│   ├── optical/{uvvis,pl,raman,ftir,ple,trpl}/
│   ├── electrochemistry/{cv,lsv,eis,gcd,ocp}/
│   ├── photoelectrochemistry/{pec-lsv,pec-ca,mott-schottky,ipce}/
│   ├── surface/{xps,eds,bet,tga}/
│   └── microscopy/{sem,tem,afm}/
├── rag/{ingestion,retrieval}/
├── memory/                         — Lab Memory (episodic)
├── voice/                          — Web Speech API → VibeVoice
├── scientist/                      — Materials AI Writer
├── provenance/                     — Audit chain
├── types/                          — Shared TypeScript types
└── python-bridge/                  — Client cho Python compute service

python-service/                     ← Python compute (Cloud Run, FastAPI)
└── (skeleton, implement Round 107+)
    Libraries: pymatgen, ASE, MatSciBERT, lmfit, impedance.py, scipy
```

### Reuse Strategy (REUSE existing services)

AI module **KHÔNG** tạo lại parsers/plot. Reuse:
- `src/ts/services/parsers/{corrware,jcamp-jasco,detect}.ts`
- `src/ts/services/plot/{tauc,bandgap-fit}.ts`

Wrap qua `src/ts/ai/tools/spectrum-tools.ts`. Single source of truth cho khoa học.

### Key Decisions

- **LLM**: Gemini 2.5 Flash (Tier 1) + Claude Sonnet 4.6 (Tier 2) + Claude Opus 4.7 (Tier 3)
- **Embedding**: Voyage-3 + voyage-rerank-2.5 (default) / MatSciBERT (chuyên ngành)
- **Vector DB**: Firestore Vector Search (native Firebase)
- **OCR**: Chandra (datalab.to) for PDF/handwriting
- **Voice**: Web Speech API Phase 1 → VibeVoice self-host Phase 2
- **Compute**: TypeScript (preview) + Python Cloud Run (deep analysis)
- **Role**: Chỉ superadmin truy cập trong Phase A
- **Plan**: Firebase Blaze + Cloud Run (~$5-15/month single user)

### Roadmap Summary

- **Phase A** (Round 105-115): Foundation, chat shell, Tier 1 tools, Web Speech
- **Phase B** (Round 116-128): RAG infrastructure (paper ingestion, embedding)
- **Phase C-1** (Round 129-145): Optical & Structural analyzers
- **Phase C-2** (Round 146-160): Electrochemistry analyzers
- **Phase C-3** (Round 161-175): Photoelectrochemistry analyzers
- **Phase D** (Round 176-190): Agentic loop + self-learning + provenance
- **Phase E** (Round 191+): Materials DB, Structure Viewer, DFT, AI Writer, Lab Mode

Chi tiết roadmap: `ROADMAP.md`.
