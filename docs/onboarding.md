# Onboarding — LabBook BKU

**Audience**: AI assistants (Claude, Cursor, Copilot) bắt đầu session mới, hoặc developer mới join project.

**Read this FIRST**, before touching any code.

---

## 1. What is LabBook BKU?

Web app quản lý phòng thí nghiệm vật liệu cho **Materials Lab @ HCMUT** (Đại học Bách Khoa TP.HCM), đang chuyển hướng commercial SaaS cho research labs.

**Current state** (May 11, 2026):
- ~50 user nội bộ active
- Phase A done (chat AI + 10 tools)
- Phase B done (RAG pipeline với Voyage + Chandra + Firestore vector search)
- Phase B.5 done (Materials/Samples/Experiments/DataAssets unified schema)
- **Phase C-1 next** (Optical & Structural Analyzers — R157+)

**Live**: https://lab-manager-268a6.web.app

---

## 2. Critical rules (NEVER violate)

1. **CSS `:has()` selector BROKEN** trong project — không dùng. Dùng JS DOM check.
2. **No inline event handlers** (`onclick=...`) — CSP strict. Dùng global delegation pattern (`data-action`).
3. **No localStorage trong artifacts** (nếu Claude làm artifact). Dùng React state hoặc in-memory.
4. **DOMPurify strips HTML comments** — dùng span+data-attr placeholders cho marker pattern.
5. **TypeScript strict partial preserved** — không bật `strict: true` toàn cục (~70% code có `@ts-nocheck`, bùng sẽ tạo 100+ lỗi).
6. **Reuse existing services** — KHÔNG tạo lại logic trong `src/ts/services/parsers/` hoặc `src/ts/services/plot/`.
7. **Verify trước push**: `npm run typecheck && npm test && npm run build` phải pass.
8. **Communication tiếng Việt** với owner (nAM). English cho code, comments, commit messages.

---

## 3. Read in order

Đọc theo thứ tự sau, không skip:

| # | File | Mục đích |
|---|---|---|
| 1 | `docs/onboarding.md` (this file) | Entry point, critical rules |
| 2 | `WORKFLOW.md` | **v3.0** — GitHub Flow, branch model, commit convention, CI/CD |
| 3 | `CLAUDE.md` | Stack overview, current state, quick navigation |
| 4 | `ARCHITECTURE.md` | System architecture (⚠️ outdated v2 — sẽ refresh R157+) |
| 5 | `AI_ARCHITECTURE.md` | AI module deep dive (Tier 1/2/3, RAG, agentic) |
| 6 | `ROADMAP.md` | Phase plan + active priorities |
| 7 | `CHANGELOG.md` | Round history (R55+ với detail) |
| 8 | `AUDIT_LOG.md` | 14 bugs từ Pre-Commercial Audit (regression reference) |
| 9 | `DESIGN.md` | UI design tokens, anti-card doctrine |
| 10 | `docs/long-term-roadmap.md` | Strategic vision 5-10 năm |
| 11 | `docs/research-schema.md` | Phase B.5 schema design (Materials/Samples/etc.) |
| 12 | `.claude/memory/{global,patterns,mistakes}.md` | Detail patterns + lessons learned |

**Sau khi đọc xong**, MỚI đề xuất round tiếp theo hoặc bắt đầu code.

---

## 4. Tech stack — quick

```
Frontend:    TypeScript ESM + Vite 8 + Tailwind 3
             src/ts/{pages, services, ui, utils, ai}
             KHÔNG dùng React/Vue — vanilla DOM + global delegation

Backend:     Firebase RTDB (primary data, realtime)
             + Firestore (vector search, BM25, paper chunks)
             + Cloud Functions v2 (Node 24, asia-southeast1, 11 functions)
             + Firebase Storage + Auth + Hosting

AI:          Tier 1 Gemini 2.5 Flash (active)
             Tier 2 Claude Sonnet 4.6 (claudeProxy ready, không wire)
             Tier 3 Claude Opus 4.7 (claudeProxy ready, không wire)
             Voyage embed-3-large + rerank-2.5
             Chandra OCR (datalab.to)

Charts:      Chart.js 4 + OffscreenCanvas
Excel:       SheetJS (xlsx)
Math:        KaTeX
Markdown:    marked + DOMPurify + highlight.js

Deploy:      Firebase Hosting (lab-manager-268a6.web.app)
             Manual deploy hiện tại, CI/CD auto-deploy khi commercial
```

---

## 5. Folder structure

```
labbook/
├── index.html                       # SPA shell
├── src/
│   ├── ts/                          # ⭐ Frontend TypeScript (KHÔNG src/js/)
│   │   ├── main.ts                  # Entry
│   │   ├── firebase.ts              # Firebase init + helpers
│   │   ├── auth.ts
│   │   ├── pages/                   # 1 file = 1 page
│   │   ├── services/                # Business logic
│   │   │   ├── parsers/             # ⚠️ REUSE — không tạo lại
│   │   │   ├── plot/                # ⚠️ REUSE
│   │   │   └── ...
│   │   ├── ui/                      # Modal, toast, navigation primitives
│   │   ├── utils/                   # Pure functions
│   │   └── ai/                      # AI module
│   │       ├── llm/                 # Gemini client, system prompt
│   │       ├── tools/               # Tool definitions
│   │       ├── papers/              # RAG paper search UI
│   │       ├── ui/                  # Chat sidetab, citation popover
│   │       ├── voice/               # STT/TTS
│   │       └── memory/              # Conversation store
│   └── css/                         # Tailwind + custom CSS
│
├── functions/                       # Cloud Functions (TypeScript)
│   └── src/
│       ├── handlers/                # HTTP entry points
│       ├── tools/                   # Tool implementations
│       ├── search/                  # SearchEngine, BM25, reranker
│       ├── bm25/                    # Tokenizer, stemmer, corpus stats
│       ├── observability/           # Tracer, cost calculator
│       └── eval/                    # RAG eval framework
│
├── docs/
│   ├── onboarding.md                # ⭐ This file
│   ├── ai/*                         # AI module detail docs (9 files)
│   ├── design/*                     # Design token detail docs
│   ├── research-schema.md           # Phase B.5 schema
│   ├── long-term-roadmap.md         # Strategic 5-10 years
│   └── commercial-roadmap.md        # Commercial fork plan
│
├── .github/workflows/ci.yml         # ⭐ CI pipeline
├── .claude/                         # AI agent memory + skills (tracked)
│   ├── memory/{global,patterns,mistakes}.md
│   └── skills/{coding,labbook}/
│
├── tests/                           # Vitest tests (219+ tests)
│
├── CLAUDE.md                        # AI agent quick reference
├── WORKFLOW.md                      # ⭐ v3 — read after this file
├── ARCHITECTURE.md                  # System architecture
├── AI_ARCHITECTURE.md
├── DESIGN.md
├── ROADMAP.md
├── CHANGELOG.md
├── AUDIT_LOG.md
└── package.json
```

---

## 6. Common tasks — quick reference

### 6.1 Start a new round

```bash
# Sync main
cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook
git checkout main
git pull origin main

# Branch theo phase
git checkout -b phase-c1/R157a-pdf-export

# Code, commit, push
git add <files>
git commit -m "feat(R157a): scaffold PDF export module"
git push -u origin phase-c1/R157a-pdf-export

# Tạo PR trên GitHub UI
```

Chi tiết: `WORKFLOW.md` Section 3.

### 6.2 Verify before push

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest run (219+ tests must pass)
npm run build        # Vite production build
```

CI sẽ rerun, nhưng catch local trước save thời gian.

### 6.3 Deploy production

```bash
# Sau khi PR merge vào main
git checkout main
git pull origin main
npm run build
firebase deploy --only hosting
# Hoặc full:
firebase deploy --only hosting,functions,database
```

### 6.4 Common debug

| Symptom | Check |
|---|---|
| TS errors after pull | `npm install` (deps có thể update) |
| Tests fail trên CI but pass local | Check `package.json` root vs `functions/package.json` (dep duplicate?) |
| Build fails missing env | Add `VITE_FIREBASE_*` to `.env` (xem `.env.example`) |
| Firebase deploy permission denied | `firebase login` lại |
| CSP block resource | Check `firebase.json` headers — add origin vào `style-src`/`connect-src` |
| Bell empty (notifications) | R122 nested schema — check `notifications/{uid}/*` path |
| Booking duplicate | R119-R120 — check `booking_locks/*` populated |

Chi tiết regression: `AUDIT_LOG.md` Section "Future regression checklist".

### 6.5 Common ENV reference

```bash
# Vietnam timezone
TZ=Asia/Ho_Chi_Minh  # GMT+7

# WSL paths
~/LAB-MANAGER/labbook-vite-tailwind/labbook  # repo
/mnt/c/Users/LEGION/Downloads/                # Edge downloads
/mnt/d/labbook-patches/                       # legacy patch archive
/mnt/d/labbook-snapshots/                     # tar snapshots mỗi phase

# Firebase
Project ID:       lab-manager-268a6
Region:           asia-southeast1
RTDB URL:         https://lab-manager-268a6-default-rtdb.asia-southeast1.firebasedatabase.app
Hosting URL:      https://lab-manager-268a6.web.app
Functions URL:    https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/
```

---

## 7. AI assistant behavior

### 7.1 Tone & style

- **Vietnamese** với nAM
- **Concise** — không preamble, không trade-off analysis dài
- **Direct** — không hedge, đưa recommendation rõ
- **Owner final say** — đề xuất chứ không quyết
- **English** cho code, comments, commit messages, error logs

### 7.2 Code quality

- TypeScript strict partial — respect existing config
- Reuse > rewrite
- Single source of truth (parsers/plot trong `src/ts/services/`)
- Don't assume — grep file thực tế trước khi patch
- `cat -A` check whitespace nếu cần boundary match (legacy concern, ít gặp với v3 workflow)

### 7.3 Communication anti-patterns

❌ "I'll help you with that! Let me think about..."
❌ "Great question! There are several approaches..."
❌ "I hope this helps! Let me know if you need anything else."
❌ Excessive bullet/header formatting trong conversation thường

✅ "Đây là cách làm: [code]. Test bằng: [cmd]."
✅ "Có 2 cách — A nhanh nhưng B chuẩn. Chọn B vì SaaS scale."
✅ "Done. CI sẽ chạy ~30s, đợi xanh rồi merge."

---

## 8. Where to ask

| Câu hỏi về | Đọc file |
|---|---|
| Workflow, branch, PR, commit | `WORKFLOW.md` |
| Stack tổng quát, deploy | `README.md` + `CLAUDE.md` |
| Cấu trúc system, data flow | `ARCHITECTURE.md` |
| AI module (tools, RAG, citations) | `AI_ARCHITECTURE.md` + `docs/ai/*` |
| Lịch sử bugs, regression | `AUDIT_LOG.md` |
| UI design tokens, anti-card | `DESIGN.md` |
| Phase plan, round numbering | `ROADMAP.md` |
| Strategic vision 5-10 năm | `docs/long-term-roadmap.md` |
| Phase B.5 entities chi tiết | `docs/research-schema.md` |
| AI agent quick start | `CLAUDE.md` |
| Specific patterns (do/don't) | `.claude/memory/patterns.md` + `mistakes.md` |

Nếu không tìm được trong docs: hỏi nAM trực tiếp.

---

## 9. New AI session — first 3 actions

Khi bắt đầu session mới (Claude/Cursor/Copilot):

1. **Read `docs/onboarding.md` (this file)** — 5 min
2. **Read `WORKFLOW.md`** — 5 min
3. **Skim `CLAUDE.md` + `CHANGELOG.md` last 20 entries** — 5 min để hiểu state hiện tại

**Tổng**: ~15 phút onboarding. Sau đó hỏi nAM context cho task cụ thể, KHÔNG nhảy vào code ngay.

---

## 10. Glossary (quick)

| Term | Meaning |
|---|---|
| **Round** | 1 đơn vị thay đổi code = 1 branch + 1 PR |
| **Sub-round** | Iteration trong round (R157a-fix1, R157a-v2, ...) |
| **Phase** | Nhóm rounds (A-E + audit + commercial) |
| **Tier** | AI agent classification (1=Lab Mgr, 2=Analyst, 3=Research) |
| **RAG** | Retrieval-Augmented Generation |
| **CSP** | Content-Security-Policy (strict trong project này) |
| **DOMPurify** | HTML sanitizer dùng trong markdown render |
| **Global delegation** | 1 event listener trên document.body, dispatch theo data-action |
| **CRAG** | Confidence-grading RAG (Layer 4 anti-hallucination) |
| **OOD** | Out-of-Distribution detection (Layer 7 anti-hallucination) |
| **Provenance chain** | Audit log đầy đủ cho mỗi AI answer |
| **Materials informatics** | pymatgen, ASE, MatSciBERT, lmfit, impedance.py ecosystem |

---

*Tài liệu này là entry point chính cho AI assistants + developers. Cập nhật qua PR (`docs/RXXX-update-onboarding`).*
