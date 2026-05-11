# CLAUDE.md

> **Entry point cho AI agents** (Claude, Cursor, Copilot). Đọc file này TRƯỚC, sau đó dive vào AGENTS.md cho chi tiết.

## TL;DR — 30 seconds

LabBook BKU là **web app quản lý phòng thí nghiệm hoá**. Stack:
- **Vite 8 + Tailwind 3 + Firebase RTDB + TypeScript ESM**
- Deploy: **Firebase Hosting + Cloud Functions (Blaze plan)** → `https://lab-manager-268a6.web.app`
- Working dir (WSL Ubuntu): `~/LAB-MANAGER/labbook-vite-tailwind/labbook`
- Repo: `github.com/emnam009009/labbook-bku` (workflow v3: `phase-XX/RXXX-slug` branches → PR → main)

**Owner**: bạn Nam — communication 100% **tiếng Việt**.

## Critical rules (NEVER violate)

1. **CSS `:has()` selector BROKEN** trong project — không dùng. Dùng JS DOM check thay thế.
2. **Patches**: Luôn dùng atomic Python script trong `/mnt/d/labbook-patches/round-{N}{suffix}/` với backup `.bakNN`.
3. **Verify before deploy**: `npm run typecheck && npm run build && npm test` (62/62 must pass).
4. **AGENTS.md tracked in repo** — `git pull` đầu session, KHÔNG `rm -f`.
5. **Boundary verify before patch**: grep/read file thực tế trước khi viết patch — KHÔNG assume HTML/whitespace structure. Dùng `cat -A` để check exact whitespace + blank lines.
6. **DOMPurify strips HTML comments**: dùng span+data-attr placeholders nếu cần inject HTML qua sanitize pipeline.

## Quick navigation

| Topic | File |
|-------|------|
| Full architecture + folder map | [AGENTS.md](./AGENTS.md) |
| AI module deep dive | [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md) |
| **Pre-commercial audit log (R116-R126)** | [AUDIT_LOG.md](./AUDIT_LOG.md) |
| Tech stack details + conventions | [.claude/memory/global.md](./.claude/memory/global.md) |
| Established code patterns | [.claude/memory/patterns.md](./.claude/memory/patterns.md) |
| Lessons learned (DON'Ts) | [.claude/memory/mistakes.md](./.claude/memory/mistakes.md) |
| Debug workflow | [.claude/skills/coding/debug.md](./.claude/skills/coding/debug.md) |
| Optimization workflow | [.claude/skills/coding/optimize.md](./.claude/skills/coding/optimize.md) |
| Origin Lab integration | [.claude/skills/labbook/origin-integration.md](./.claude/skills/labbook/origin-integration.md) |
| Future features | [ROADMAP.md](./ROADMAP.md) |
| **Long-term roadmap (5-10 yr)** | [docs/long-term-roadmap.md](./docs/long-term-roadmap.md) |
| Phase B.5 Research Schema design | [docs/research-schema.md](./docs/research-schema.md) |
| Recent changes | [CHANGELOG.md](./CHANGELOG.md) |

## Current state (as of Round 157b, May 11 2026)

### Strategic target
**Platform** (không phải full Research OS) — per `Labbook_Bku_Long_Term_Platform_Roadmap_Report.pdf` (May 10 2026).
Multi-lab Platform với unified schema + AI copilot. Skip plugin runtime ecosystem (P5) và public REST API (P4).

### Done
- ✅ **Pre-AI (R1-R104)**: Tests 62/62, Lighthouse 93/95/100/100, CSP A+ (R55-58e), Origin integration (R95-102), bundle -600KB
- ✅ **Phase A AI Foundation (R105-R115 + R129)**: Chat sidetab, Gemini Flash, 10 tools (6 read + 4 action), voice STT/TTS
- ✅ **Pre-Commercial Audit (R116-R126)**: 14 bugs + 3 features fixed
- ✅ **Phase B RAG (R130-R142)**: Chandra OCR → Voyage embed → Firestore vector + BM25 → hybrid retrieval → rerank-2.5 → searchPapers tool → NotebookLM citation chips
- ✅ **Phase B.5 Research Schema (R143-R156g)**: Materials/Samples/Experiments/DataAssets Firestore, multi-tenant rules, lineage graphs (D3), Chart.js + Tauc bandgap fit, JCAMP-DX classifier
- ✅ **R157 Workflow v3 migration**: GitHub Flow, CI/CD, branch protection, docs/onboarding.md
- ✅ **R157a**: AI Workbench sidebar entry + empty page shell
- ✅ **R157b**: Docs alignment với target Platform

### Next: R158 Carbon Foundation series (pre-Phase C-1)
- **R158a**: Domain restructure `src/ts/{pages,services,utils}/` → `src/ts/domains/{materials,samples,experiments,analyzers,inventory,ai,lineage}/`
- **R158b**: Adopt `@carbon/styles` tokens (replace custom CSS vars)
- **R158c**: Carbon UI Shell pattern — sidebar restructure (left primary + right side panel)
- **R158d**: Install `@carbon/web-components` v2 + migrate Button/Tag/Modal

### Then: Phase C-1 Optical & Structural Analyzers (R159-R171)
XRD parser + pymatgen analyze, Raman + lmfit Voigt, UV-Vis (reuse jcamp-jasco + tauc), PL + trion fitting, FTIR + functional groups, LSV/HER + Tafel, Microscopy via Claude Vision.

### Then: Phase C-2 Electrochemistry (R172-R186)
CV, EIS impedance, GCD, OCP. Python service expand với impedance.py.

### Long-term: Phase C-3 → D → E
Photoelectrochem (PEC, Mott-Schottky, XPS, EDS, BET) → Materials DB + DFT + AI Writer → Lab Mode + Knowledge Graph + Next.js migration.
## Round numbering

Round = 1 patch session = 1+ atomic Python scripts hoặc git apply patches = 1+ git commits.

Latest commit: `feat(R126): resizable AI sidetab via left-edge drag handle`. Numbering không reset, monotonically increasing.

**Note R116-R126 không phải patch script atomic** — dùng git diff patches (workflow đã shift). Future round có thể tiếp tục dùng git diff patches: tạo trong `/mnt/d/labbook-patches/` với tên `labbook-bku-bugfix-rXXX.patch`, apply bằng `git apply`.

## Communication norms

- **Vietnamese-only** với owner Nam.
- Brief, direct. Không ramble.
- Khi tool fail, paste error + diagnose, không apologize blindly.
- Block lệnh cho user **PHẢI** phân biệt rõ WSL bash vs Windows cmd — không trộn.
- Commit messages: tiếng Anh OK (git convention).

## Tools used

- **WSL Ubuntu**: dev environment, builds, deploys
- **Windows**: end user (browser test), Origin Lab desktop integration
- **Firebase Console**: monitor RTDB, Hosting, Auth, Cloud Functions logs
- **Google Cloud Console**: Speech API, IAM, Secret Manager
- **Edge browser**: primary user browser (downloads → C:\Users\LEGION\Downloads)


## AI Module (Phase A done, Phase B next)

LabBook BKU đang xây dựng **AI Research Platform** — Hybrid TypeScript + Python kiến trúc dành cho lab vật liệu 2D/TMDs (WS₂, WO₃, MoS₂...).

### Master Documentation (root)

- **`AI_ARCHITECTURE.md`** — Kiến trúc 3-tier, Agentic RAG, 9-layer anti-hallucination, self-learning, provenance chain, Hybrid TS+Python strategy
- **`DESIGN.md`** — UI design system (anti-card, cyan accent, JetBrains Mono numerical, Lucide icons)
- **`WORKFLOW.md`** — Patch-based development process, AI assistant rules, `/mnt/d/labbook-patches/` directory layout

### Detail Documentation

- **`docs/ai/*`** — 9 detail files (PROMPTS, TOOLS, RAG_PIPELINE, ANTI_HALLUCINATION, PROVENANCE, EVAL, INTEGRATIONS, HYBRID_ARCHITECTURE, MATERIALS_LIBRARIES)
- **`docs/design/*`** — 4 detail files (TOKENS, COMPONENTS, PATTERNS, MIGRATION)

### Code Structure (current)

```
src/ts/ai/                          ← AI orchestration (TypeScript)
├── llm/                            ← gemini-client, system-prompt, types
├── tools/                          ← tool-client, tool-definitions
├── ui/                             ← chat-sidetab, message-bubble, message-handler,
│                                      markdown-render, title-generator,
│                                      confirmation-card (R115b)
├── voice/                          ← types, speech-recorder, text-to-speech (R114b)
├── memory/                         ← conversation-store
├── core/, agent/, analyzers/,      ← Skeleton folders (Phase B+ implement)
│   rag/, scientist/, provenance/,
│   types/, python-bridge/

functions/src/                      ← Cloud Functions (TypeScript)
├── handlers/
│   ├── gemini-proxy.ts             ← SSE streaming, tool injection (R111)
│   ├── tool-executor.ts            ← Dispatch 9 tools, role check (R112+R115a)
│   ├── speech-proxy.ts             ← Cloud Speech v2 (R114a)
│   └── confirm-action.ts           ← Commit drafts + audit (R115a)
├── tools/
│   ├── registry.ts                 ← TOOLS object + executeTool dispatcher
│   ├── chemicals.ts, equipment.ts,
│   ├── experiments.ts, bookings.ts,
│   ├── members.ts, utils.ts        ← 6 read tools (R112)
│   └── actions.ts                  ← 3 draft generators + commitDraft (R115a)
└── utils/
    ├── auth.ts                     ← verifyAuth với role hierarchy
    └── logger.ts

python-service/                     ← Python compute (Phase C+)
└── (skeleton, implement Round 130+)
```

### Reuse Strategy (REUSE existing services)

AI module **KHÔNG** tạo lại parsers/plot. Reuse:
- `src/ts/services/parsers/{corrware,jcamp-jasco,detect}.ts`
- `src/ts/services/plot/{tauc,bandgap-fit}.ts`

Wrap qua `src/ts/ai/tools/spectrum-tools.ts` (Phase C). Single source of truth cho khoa học.

### Key Decisions

- **LLM Tier 1** (active): Gemini 2.5 Flash — used for all chat
- **LLM Tier 2-3** (Phase D): Claude Sonnet 4.6, Claude Opus 4.7
- **Embedding** (Phase B): Voyage-3 + voyage-rerank-2.5 / MatSciBERT
- **Vector DB**: Firestore Vector Search
- **OCR** (Phase B): Chandra (datalab.to)
- **Voice STT** (active): Cloud Speech v2 Chirp 2 vi-VN
- **Voice TTS** (active): Browser native, Phase 2 may upgrade Cloud TTS Wavenet
- **Compute**: TypeScript (preview) + Python Cloud Run (Phase C)
- **Roles**: read tools = admin/superadmin, **action tools = superadmin only**
- **Plan**: Firebase Blaze + Cloud Run (~$5-15/month single user)

### Action Tools Pattern (R115a-d)

Tool returns DRAFT (NOT write DB):
```
User: "tạo thí nghiệm hydro MoS2 200°C 24h"
  ↓
Gemini: createExperimentDraft({category, material, temp, ...})
  ↓
Backend: build payload + preview, return ActionDraft (no DB write)
  ↓
Frontend: gemini-client embeds <!--AI_DRAFT:base64--> trong stream
  ↓
markdown-render: extract markers → span placeholder → DOMPurify sanitize → re-inject card HTML
  ↓
User clicks "Xác nhận":
  → POST /confirmAction → verify superadmin → push to RTDB → audit log
  → Update card UI: "✅ Đã tạo HT-xxx"
```

Audit log path: `/actionAudit/{ts}` với uid, action, targetPath, resultKey.

### Roadmap Summary

- **Phase A** ✅ Done (Round 105-115)
- **Pre-Commercial Audit** ✅ Done (Round 116-126) — security/correctness/UX hardening before commercial launch
- **Phase B** ⏳ Next (Round 127+): Compliance KB + RAG infrastructure (or commercial-readiness work first)
- **Phase C-1** (Round ~140-156): Optical & Structural analyzers
- **Phase C-2** (Round ~157-171): Electrochemistry analyzers
- **Phase C-3** (Round ~172-186): Photoelectrochemistry analyzers
- **Phase D** (Round ~187-201): Agentic loop + self-learning + provenance
- **Phase E** (Round ~202+): Materials DB, Structure Viewer, DFT, AI Writer, Lab Mode

Round numbers shifted +11 vs ROADMAP.md original numbers because R116-R126 was unplanned audit work. Update ROADMAP.md ranges when resuming Phase B.

Chi tiết roadmap: `ROADMAP.md`. Audit log: `AUDIT_LOG.md`.
