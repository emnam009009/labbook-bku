# CHANGELOG

Concise version history. For full git log: `git log --oneline`.

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
