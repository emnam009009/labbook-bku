# CLAUDE.md

> **Entry point cho AI agents** (Claude, Cursor, Copilot). Đọc file này TRƯỚC, sau đó dive vào AGENTS.md cho chi tiết.

## TL;DR — 30 seconds

LabBook BKU là **web app quản lý phòng thí nghiệm hoá**. Stack:
- **Vite 8 + Tailwind 3 + Firebase RTDB + TypeScript ESM**
- Deploy: **Firebase Hosting + Cloud Functions (Blaze plan)** → `https://lab-manager-268a6.web.app`
- Working dir (WSL Ubuntu): `~/LAB-MANAGER/labbook-vite-tailwind/labbook`
- Repo: `github.com/emnam009/labbook-bku` (branch `ai-assistant`)

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

## Current state (as of Round 142, May 10 2026)

### Pre-AI (Round 1-104)
- ✅ **Tests**: 62/62 pass (Vitest)
- ✅ **Lighthouse Mobile**: Performance 93, Accessibility 95, Best Practices 100, SEO 100
- ✅ **CSP**: Mozilla Observatory 125/100 Grade A+ (Round 55-58e)
- ✅ **Origin Lab integration**: Working end-to-end (Round 95-102)
- ✅ **Bundle optimized**: -600KB initial load (Round 103a-b)

### AI Module Phase A done (Round 105-115)
- ✅ **Chat sidetab UI** với streaming, markdown, KaTeX, highlight.js (R108-110)
- ✅ **Real Gemini Flash** via geminiProxy Cloud Function (R111)
- ✅ **6 read tools** (chemicals, equipment, experiments, bookings, members, date) (R112)
- ✅ **UI polish**: Stop, Regenerate, Auto-rename, error toasts (R113)
- ✅ **Voice STT/TTS**: Cloud Speech v2 Chirp 2 vi-VN + browser TTS (R114)
- ✅ **3 action tools** với confirm UI: createExperiment (hydro+electrochem), updateChemicalStock, createBooking (R115)

### Pre-Commercial Audit (Round 116-126) ✅ DONE — May 8 2026
**14 bugs + 3 features** fixed across security/correctness/UX before commercialization. Phase B paused.

- ✅ **R116-R120**: Security & race conditions (listener leak, presence stuck, XSS, orphan storage, stock race, image bloat, booking race x2 — saveBooking + drag/resize)
- ✅ **R121-R122**: UI/UX + notification security overhaul (search stuck, bulk select, member card, **bell empty FIXED via nested schema migration with one-shot script**, lock cleanup)
- ✅ **R123-R126**: Polish (members KPI scroll, admin-only import/export, file picker, VN diacritics, console cleanup, **resizable AI sidetab**)

**See `AUDIT_LOG.md` for full bug list + root causes.**

### Cloud Functions deployed (asia-southeast1)
- `geminiProxy` — SSE streaming Gemini 2.5 Flash với tool calling
- `toolExecutor` — dispatch 9 tools (6 read + 3 action)
- `speechProxy` — Cloud Speech v2 Chirp 2 STT
- `confirmAction` — commit action drafts to RTDB + audit log

### Notification schema (R122 — nested per-user)
- Path: `notifications/{uid}/{notifId}` (was flat `notifications/{notifId}` before R122)
- Broadcast admin: fan-out write per recipient (1 entry/admin) hoặc fallback `notifications/_admin/{notifId}`
- Listener: per-user listen of `notifications/{myUid}` + admin-only listen on `_admin` bucket
- Migration script: `scripts/migrate-notifications-r122.mjs` (firebase-admin SDK, idempotent, with backup)

### Booking lock schema (R119-R120, R122 cleanup)
- Path: `booking_locks/{equipmentKey}_{date}` với `slots: [{start, end, bookingKey, status}]`
- Atomic via `runTransaction` — `tryReserveSlot` (new) / `tryReserveSlotForUpdate` (drag/resize, with self-exclusion)
- Stale cleanup: `cleanupStaleLocks` admin-only, throttle 5min, drops `tmp_*` >60s và slots cho bookings không còn

### AI Module Phase B done (Round 130-142, May 9-10 2026)
- ✅ **B.1** (R130-R136): Paper pipeline (upload → Chandra OCR → chunk → embed Voyage 3-large → Firestore vector)
- ✅ **B.2** (R137a-c2): Hybrid retrieval (vector + BM25 + RRF), Voyage rerank-2.5, eval framework
- ✅ **B.3** (R138 a/b1/b2): Claude proxy infrastructure, searchPapers tool, NotebookLM-style citation chips
- ✅ **B.4** (R140-R142): Stress-test A2 doc, Chandra trim newline fix, BM25 indexPaper implementation
- 11 Cloud Functions deployed, 10 tools (6 read + 4 action) + searchPapers RAG tool
- Stress-test verified: 20 papers, ~3575 chunks, ~$0.20 cost, 3 search modes working

### Next
- 📋 **Phase B closure** (R143-R149): docs sync (this round), test BM25 module, eval expansion, Chandra resilience
- 📋 **Phase B.5** (R150-R155): Unified Research Schema — see `docs/research-schema.md`
- 📋 Hoặc commercial roadmap (parallel): multi-tenant, rate limiting, email verify, billing

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
