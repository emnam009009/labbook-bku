# ROADMAP

Pending features và improvements đã thảo luận. Owner Nam quyết định priority.

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

### Phase B — Compliance KB + RAG Infrastructure (Round 130+)

⚠️ Round numbers shifted +14 vs original plan because of Pre-Commercial Audit (R116-R126) + docs refresh (R127-R128) + Phase A2 add-on (R129).
Round 127-129 used: R127-R128 = docs refresh, R129a-c = recordExperimentResultDraft (4th action tool, see CHANGELOG).

| Round | Status | Task |
|---|---|---|
| 127 | ⏳ Next | Compliance KB (Nghị định 24/2026 4 phụ lục as JSON, search tool) |
| 128 | 📋 | Paper upload UI + queue + dedup |
| 129 | 📋 | Chandra OCR integration (Cloud Function proxy) |
| 130 | 📋 | PDF extraction pipeline (text + figures + metadata) |
| 131 | 📋 | Smart chunking (section-aware, overlap) |
| 132 | 📋 | Contextual pre-prep (Anthropic technique) |
| 133 | 📋 | Voyage-3 embedding pipeline |
| 134 | 📋 | Firestore Vector Search index + queries |
| 135 | 📋 | BM25 keyword index (Lunr.js) |
| 136 | 📋 | Hybrid retrieval (RRF fusion) |
| 137 | 📋 | Voyage rerank-2.5 integration |
| 138 | 📋 | Citation tracking + UI display |
| 139 | 📋 | Paper Library page (browse, search, filter) + Zotero/Drive sync |

### Phase C-1 — Optical & Structural Analyzers (Round 140-156)

⚠️ Numbers shifted from original 129-145.

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
