# LabBook BKU

> AI-powered lab management for materials science & electrochemistry research.
> *Quản lý phòng thí nghiệm khoa học vật liệu có tích hợp AI.*

[![Status](https://img.shields.io/badge/status-active-brightgreen)]()
[![Phase](https://img.shields.io/badge/phase-B.3%20done-blue)]()
[![Lighthouse](https://img.shields.io/badge/lighthouse-93%2F95%2F100%2F100-success)]()

LabBook is a lab management platform built for materials science and electrochemistry research groups. It combines structured experiment tracking (synthesis, electrode prep, electrochemistry) with an AI assistant that performs RAG over the lab's paper library and supports researcher workflows.

Originally built for the Materials Lab at HCMC University of Technology (~50 users), now evolving toward a commercial SaaS for research labs.

---

## Features

### Lab management
- **Experiments**: hydrothermal synthesis, electrode preparation, electrochemistry (CV, LSV, EIS, Tafel)
- **Chemicals & inks**: stock tracking, CAS lookup, low-stock alerts, formula search
- **Equipment**: status, locations, maintenance, group management
- **Bookings**: equipment reservation with calendar view, drag-drop scheduling
- **Members & roles**: superadmin / admin / member / viewer with database-level rules
- **Realtime**: all changes sync instantly via Firebase listeners (no save buttons, no refresh)

### AI assistant
- **Chat sidetab** with markdown, KaTeX math, syntax-highlighted code, voice input/output
- **10+ tools**: search lab data (chemicals, equipment, experiments, bookings, members), create drafts (experiments, bookings, stock updates), search papers
- **RAG over papers**: upload research papers (PDF), automatic OCR (Chandra), chunking, hybrid retrieval (vector + BM25 + reranker)
- **NotebookLM-style citations**: AI cites `[1]` `[2]` as clickable chips → popover shows paper title, section, full chunk text
- **Multi-LLM**: Gemini Flash (Tier 1, default), Claude Sonnet 4.6 / Opus 4.7 (Tier 2/3, infrastructure ready)
- **Confirmation cards**: AI write actions (create experiment, update stock, book equipment) require user confirm before committing

### Integrations
- **Origin Lab**: one-click "Open in Origin" generates `.ogs` LabTalk script, launches Origin via custom URL protocol
- **Excel**: export any table via SheetJS
- **Voice**: speech-to-text (Vietnamese, Chirp 2) + text-to-speech (browser native)

### Engineering
- **TypeScript ESM**, no UI framework — vanilla DOM + event delegation
- **Strict CSP** with global delegation (Mozilla Observatory 125/100, Grade A+)
- **Realtime-first** Firebase RTDB + Firestore (vector search, BM25)
- **11 Cloud Functions** deployed to `asia-southeast1` for AI proxy, tool execution, paper pipeline, search, eval

---

## Quick start

### Requirements
- **Node.js** ≥ 20 LTS
- **npm** ≥ 9
- **Firebase project** with Realtime Database, Authentication, Firestore, Hosting, Functions enabled
- **API keys** (for AI features): Gemini, Anthropic, Voyage AI, Chandra (OCR)

### Frontend setup

```bash
git clone <repo-url>
cd labbook
npm install

# Create .env with Firebase config (see template below)
cp .env.example .env
# Fill values from Firebase Console → Project Settings → Web app

npm run dev          # Dev server: http://localhost:5173
npm run build        # Production build → dist/
npm run preview      # Preview production build locally
```

### Cloud Functions setup

```bash
cd functions
npm install

# Set secrets (one-time)
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set VOYAGE_API_KEY
firebase functions:secrets:set CHANDRA_API_KEY

npm run build        # TypeScript compile
firebase deploy --only functions
```

### Deploy

```bash
# Deploy all (hosting + functions + database rules)
firebase deploy

# Or selectively:
firebase deploy --only hosting
firebase deploy --only functions:geminiProxy,functions:claudeProxy
firebase deploy --only database
```

### Environment variables (`.env`)

```dotenv
# Firebase Web SDK config (from Firebase Console)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

⚠️ Never commit `.env` to git. It's already in `.gitignore`.

---

## Tech stack

**Frontend**
- TypeScript ESM (no UI framework — vanilla DOM)
- Vite 8 (build), Tailwind CSS 3 + CSS variables (theming)
- Chart.js 4 (plots), SheetJS (Excel), OGL (WebGL animations)
- KaTeX (math), highlight.js (code), DOMPurify (sanitize), marked (markdown)

**Backend**
- Firebase Realtime Database (primary data, realtime sync)
- Firebase Firestore (vector search, BM25 index, paper chunks, traces)
- Firebase Authentication, Storage, Hosting
- Firebase Cloud Functions v2 (Node 24, asia-southeast1, Pub/Sub event chains)

**AI / RAG stack**
- LLM: Gemini 2.5 Flash (Tier 1), Claude Sonnet 4.6 / Opus 4.7 (Tier 2/3, infra ready)
- Embeddings: Voyage `voyage-3-large` (1024-dim)
- Reranker: Voyage `rerank-2.5`
- OCR: Chandra (datalab.to) — page-level layout-aware text extraction
- Search: hybrid (vector + BM25 + RRF) → reranker → top-K

---

## Project structure

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for full details. Brief overview:

```
labbook/
├── index.html                    # SPA shell
├── src/
│   ├── ts/                       # Frontend TypeScript
│   │   ├── main.ts               # Entry point
│   │   ├── firebase.ts           # Firebase init + helpers
│   │   ├── auth.ts               # Authentication
│   │   ├── pages/                # Page renderers
│   │   ├── services/             # Business logic
│   │   ├── ui/                   # UI primitives (modal, toast, ...)
│   │   ├── utils/                # Pure utilities
│   │   └── ai/                   # AI module (chat, RAG, tools, citations)
│   │       ├── llm/              # Gemini/Claude clients, tier router
│   │       ├── papers/           # Paper upload, search UI
│   │       ├── tools/            # Tool client (frontend → toolExecutor)
│   │       ├── ui/               # Chat sidetab, message bubble, citation popover
│   │       ├── memory/           # Conversation store
│   │       └── voice/            # STT/TTS
│   └── css/                      # Tailwind + custom CSS
├── functions/                    # Cloud Functions (TypeScript)
│   ├── src/
│   │   ├── handlers/             # HTTP entry points (proxies, search, eval)
│   │   ├── tools/                # Tool implementations + registry
│   │   ├── search/               # SearchEngine, BM25, reranker, config
│   │   ├── observability/        # Tracer, cost calculator
│   │   ├── eval/                 # RAG eval framework
│   │   └── index.ts              # Cloud Functions exports
│   └── package.json
├── docs/                         # Internal documentation
│   ├── ai/                       # AI architecture deep dives
│   ├── design/                   # Design tokens, mockups
│   └── commercial-roadmap.md     # Commercial fork planning
├── extras/                       # External integrations (Origin Lab)
├── database.rules.json           # RTDB security rules
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Firestore composite indexes
├── firebase.json                 # Firebase project config
├── vite.config.js                # Vite build config
└── tsconfig.json                 # TypeScript config
```

---

## Roles & permissions

| Role | Permissions |
|---|---|
| `superadmin` | Full access including admin user management + AI write tools |
| `admin` | Full app access |
| `member` | Read/write lab data, no user management |
| `viewer` | Read-only |
| `pending` | Awaiting admin approval (after self-registration) |
| `rejected` | Registration denied |

Three enforcement layers: UI hide/show → function-level checks → Firebase security rules. The DB layer is the only attack-resistant layer; UI/function layers are UX only.

---

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture, data flow, conventions
- [`AI_ARCHITECTURE.md`](./AI_ARCHITECTURE.md) — AI module deep-dive (LLM tiering, RAG, tools, citations)
- [`ROADMAP.md`](./ROADMAP.md) — phased plan and active priorities
- [`CHANGELOG.md`](./CHANGELOG.md) — version history per round
- [`AUDIT_LOG.md`](./AUDIT_LOG.md) — bug audit + regression checklists
- [`WORKFLOW.md`](./WORKFLOW.md) — git workflow, patches-driven development
- [`DESIGN.md`](./DESIGN.md) — design tokens, UI patterns
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — commit conventions, PR workflow
- [`docs/commercial-roadmap.md`](./docs/commercial-roadmap.md) — commercial fork planning
- [`CLAUDE.md`](./CLAUDE.md) — entry point for AI coding agents

---

## Status

**Current phase**: B.3 done (Tier 1 RAG with NotebookLM-style citations)

**Done**:
- Phase A — AI foundation (R105-R115): chat, tools, voice, confirmation cards
- Phase B.1 — Paper RAG pipeline (R130-R136): upload → OCR → chunk → embed → search
- Phase B.2 — Hybrid retrieval + eval (R137a-c2): BM25, reranker, evaluation framework, observability
- Phase B.3 — Citations (R138): claudeProxy, searchPapers tool, citation chips with popover

**Active priorities**:
- Phase B.5 — Research Schema Foundation: unified Sample/Material/Experiment/DataAsset entities (planned)
- Documentation refresh (R138c-f, in progress)

**Future**:
- Phase B.4 — Knowledge graph (citation network, entity extraction)
- Phase C — Domain analyzers (XRD, Raman, EIS modules)
- Phase D — DFT integration, materials database
- Commercial fork — multi-tenancy, billing, branding (separate repo `labbook-saas`)

See [`ROADMAP.md`](./ROADMAP.md) for full phased plan.

---

## License

Proprietary, internal/research use. Commercial licensing in planning.
*Sản phẩm độc quyền, sử dụng nội bộ và nghiên cứu. Đang trong quá trình lập kế hoạch cấp phép thương mại.*

---

## Contact

**Materials Lab — Faculty of Chemical Engineering, HCMC University of Technology**

For research collaboration or commercial inquiries, contact the project maintainer (nAM).

---

*LabBook BKU evolved from a closed lab tool into a research platform. Built with vanilla TypeScript, Firebase, and AI agents.*
