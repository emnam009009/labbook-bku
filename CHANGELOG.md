# CHANGELOG

Concise version history. For full git log: `git log --oneline`.

## [Round 105] - 2026-05-07

### Added — AI Module Foundation
- **`src/ts/ai/`** skeleton structure (38 folders, 50+ TypeScript stub files)
  - `core/` — provider abstraction layer
  - `agent/` — orchestrator, planner, reflector, grader, OOD detector
  - `tools/` — Tier 1 RTDB tools + spectrum-tools wrapper
  - `analyzers/` — 6 nhóm × 24 subfolders (structural, optical, electrochemistry,
    photoelectrochemistry, surface, microscopy)
  - `rag/` — ingestion + retrieval pipeline
  - `memory/` — Lab Memory (episodic + feedback + reformulation)
  - `voice/` — Web Speech API + VibeVoice integration
  - `scientist/` — Materials AI Writer (inspired by AI-Scientist v2)
  - `provenance/` — Audit chain logging
  - `types/` — Shared TypeScript types
  - `python-bridge/` — Client for Python compute service (Round 107+)
- **`docs/ai/README.md`** — index for 9 detail docs (added in subsequent rounds)
- **`docs/design/README.md`** — index for 4 design detail docs
- **`python-service/README.md`** — placeholder for FastAPI service
- **`src/css/tokens/`** — placeholder folder for design tokens
- **`src/ts/pages/workbench/`** — placeholder for Workbench tabs

### Modified
- **`.env.example`** — added Anthropic, Gemini, Voyage, Chandra API keys + Python service URL + feature flags
- **`.gitignore`** — added patterns for AI files (functions, python-service, vector cache, paper temp, eval results, tsbuildinfo)
- **`CLAUDE.md`** — added AI Module entry point section
- **`ROADMAP.md`** — extended with Phase A-E plan (Round 105-220+)

### Foundation Docs (added in previous step, referenced)
- `AI_ARCHITECTURE.md` (root) — 3-tier, Agentic RAG, Hybrid TS+Python
- `DESIGN.md` (root) — UI design system
- `WORKFLOW.md` (root) — Patch-based development

### Notes
- TypeScript strict partial preserved (tsconfig.json NOT modified)
- All AI files are valid TypeScript (`export {};`) — `npm run typecheck` should pass
- No existing logic modified. App functions exactly as before
- AI features gated behind `VITE_AI_ENABLED=false` flag (default off)
- Existing `src/ts/services/parsers/` and `src/ts/services/plot/` will be REUSED by AI module (single source of truth)
- Round 106 will set up Firebase Blaze + Cloud Functions
- Round 107 will set up Python service skeleton
## Round 103b (Current — May 2026)
**perf**: Vite optimizations
- `target: 'es2022'` aligned với tsconfig
- `manualChunks` vendor-firebase chunk for long-term cache
- Rejected: lightningcss (no gain), SVG sprite (5KB saving not worth)
- **Lighthouse Mobile**: Performance 93, Accessibility 95, Best Practices 100, SEO 100

## Round 103a
**perf**: Lazy load jspdf + qrcode in qr-labels.ts
- Removed static imports, added cached lazy loaders
- Removed unused `html2canvas` from package.json
- **Saving**: -600KB initial load (modulepreload 6 → 2)

## Round 102
**fix**: Origin install.bat using static template + PowerShell fill
- Replaced batch echo+escape hell với PowerShell `.Replace()`
- New file: `extras/origin-integration/wrapper-template.bat`
- All `!FNAME!`, `!OGSNAME!` now properly literal in wrapper

## Round 95-101
**feat**: Origin Lab integration foundation + iterations
- Web "Mở bằng Origin" button generates `.ogs` LabTalk script
- Custom URL protocol `labbook-origin://` registered via install.bat
- Wrapper batch copies script to Origin User Files Folder (UFF)
- Origin executes via `-rs run.section(file.ogs, Main)`
- Iterations 97-101 tackled batch escape issues (final solution: Round 102)

## Round 91-94
**refactor + fix**:
- Round 91: Folder rename `src/js/` → `src/ts/` (semantic correction post-TS migration)
- Round 92-93: closePreview empty state restore + saved PNG matches preview
- Round 94: Tick padding clear of marks + handleFiles state='preview' + CSP frame-src blob

## Round 73-90 (Post-TS migration feature work)
See AGENTS.md section 12 for full details.
- Round 89: OffscreenCanvas + Web Worker for PNG export
- Round 90: Drop replaces preview + upload speedups
- Earlier rounds: Attachment system, charts, dashboard, etc.

## Round 71-72
**refactor**: TypeScript migration complete
- All `.js` → `.ts` (300+ files)
- 24 large files với `@ts-nocheck` (DOM/Chart.js/jsPDF/Worker)
- Strict mode: noImplicitAny + strictNullChecks + noUnusedLocals/Parameters
- AGENTS.md tracked in repo từ Round 72

## Round 55-58e
**security**: CSP hardening
- All ~480 inline events removed (global delegation architecture)
- 2 inline scripts extracted (threads-bg.js, mobile-sidebar.js)
- Strict CSP applied
- Mozilla Observatory: **125/100 Grade A+**
- Style-src kept `'unsafe-inline'` (437 inline styles, separate phase)
