# CHANGELOG

## R151a — Sample entity types (2026-05-10)

### Context
First sub-round of R151 (Phase B.5 R2). Parallel R150a strategy: types
only, no runtime code, no service, no UI, no deploy.

### Added
Appended to `src/ts/types/research.ts`:
- `SampleStatus` — lifecycle enum (available, in-use, consumed,
  archived, discarded)
- `SynthesisMethod` — common methods (hydrothermal, sol-gel, CVD, ...)
  with string fallback
- `SampleAmount` — value + unit
- `Sample` interface matching spec §3.2 with lineage (parents,
  rootMaterials denormalized, generation), origin
  (synthesisExperimentRef, synthesisMethod, synthesisDate), lifecycle
  (status, amount, location), annotations (notes, tags), audit.

### Out of scope (deferred to R151b/c/d/e)
- R151b: Firestore service (CRUD) + tests + rules deploy
- R151c: Sample browser UI list
- R151d: Sample CRUD form + lineage display
- R151e: Sample ↔ Material link

### Verify
```bash
npm run typecheck   # expect 0 errors
npm test            # expect 180/180 (no test changes)
```

### Files touched
- src/ts/types/research.ts (appended Sample types)
- CHANGELOG.md (this entry)

## R150c-followup — Role claim migration + auto-sync (2026-05-10)

### Context
R150c set `tenantId` claim but NOT `role` claim. Firestore rules for
materials require `role=admin|superadmin` → all UI writes failing with
PERMISSION_DENIED until role claim is migrated.

### Added
- `scripts/migrate-role-claims-r150c-fu.mjs` (new): bulk migration that
  reads RTDB `users/{uid}/role` and sets as Firebase Auth custom claim.
  Preserves tenantId from R150c. Idempotent. --dry-run / --confirm flags.

- `functions/src/triggers/sync-role-claim.ts` (new): RTDB v2
  `onValueWritten` trigger on `/users/{uid}/role`. Auto-updates role
  claim whenever admin changes role in RTDB. Gen2, Node 24, no GCIP.

- `functions/src/index.ts` (modified): export `syncRoleClaim`.

### Production deploy procedure (3 steps)
```bash
# Step 1: Bulk migrate role claim for existing users
node scripts/migrate-role-claims-r150c-fu.mjs --dry-run
# Review output: ~8 users with their roles
node scripts/migrate-role-claims-r150c-fu.mjs --confirm
# Users must sign out + back in for new claim to take effect

# Step 2: Build + deploy trigger
cd functions && npm run build && cd ..
firebase deploy --only functions:syncRoleClaim

# Step 3: Verify in browser
# - Admin user signs out + back in
# - Open Materials page → click "Thêm vật liệu"
# - Submit valid material → expect SUCCESS (not PERMISSION_DENIED)
```

### Rollback
```bash
# Clear role claim (rerun migration with empty role) — manual edit script needed
# OR re-run R150c migration (which doesn't touch role)
firebase functions:delete syncRoleClaim --region asia-southeast1
```

### Future: commercial fork
When upgrading to GCIP, the v2 `beforeUserCreated` trigger (deferred in
R150c) can also set initial role on signup based on invite code. For now
new signups get role from existing RTDB workflow (admin approval flow).

### Files
- scripts/migrate-role-claims-r150c-fu.mjs (new)
- functions/src/triggers/sync-role-claim.ts (new)
- functions/src/index.ts (modified)
- CHANGELOG.md (this entry)

## R150e — Connect chemicals → materials (one-way) (2026-05-10)

### Added
Materials detail modal now includes "Hóa chất trong kho" section listing
all chemicals (from `window.cache.chemicals`) whose formula matches the
material's formula (case-insensitive). Each entry shows name, vendor,
purity, stock + unit. Click → navigates to chemicals page.

If no matches: shows "Không có chai hóa chất nào trùng công thức..."
message.

### Design notes
- One-way link only (Materials → Chemicals lookup). Chemicals page NOT
  modified — too large, too risky to touch this round.
- Uses formula matching, NOT a stored `materialRef` field on chemicals.
  Trade-off: simple + automatic, but matches all chemicals with same
  formula even if user didn't intend the link. Acceptable since formula
  is canonical identifier.
- Click chemical → just opens chemicals page (no auto-filter to specific
  chemical). Filter can be added in follow-up if needed.

### Files
- src/ts/pages/materials.ts: added `renderLinkedChemicals()` helper,
  invoked inside `openMaterialDetail`.
- CHANGELOG.md (this entry).

### Verify
```bash
npm run typecheck && npm run build
```

Browser test:
- Open Material detail → expect "Hóa chất trong kho" section
- If material formula matches a chemical's formula → see chemical entry
- Click chemical → chemicals page opens

## R150d-2 — Materials CRUD UI + search (2026-05-10)

### Added
- "Thêm vật liệu" button (admin-only) in page header.
- Form modal `#modal-material-form` (create + edit modes).
- Edit button in detail modal footer (admin-only).
- Search input with 250ms debounced filter.
- materials.ts: openMaterialForm, submitMaterialForm,
  searchMaterialsHandler, openMaterialFormFromDetail bridge.
- global-delegation.ts: 4 new click cases + 1 input listener.

### Known limitation
Firestore rules require role admin/superadmin claim, but role claim NOT
migrated yet (R150c only set tenantId). createMaterial/updateMaterial
will fail with PERMISSION_DENIED until role claim migration round.
UI shows error toast with explanation.

### Files
- src/ts/pages/materials.ts (rewritten)
- index.html (page header, detail modal footer, form modal)
- src/ts/services/global-delegation.ts (4 cases + input listener)
- CHANGELOG.md (this entry)

## R150d-1 — Materials browser (list view) (2026-05-10)

### Context
First user-visible page of Phase B.5. Renders materials list grouped by
category, click card to view detail modal. Empty state when no data
(create UI deferred to R150d-2).

### Added
- `src/ts/pages/materials.ts` (new file): renderMaterials() loads from
  service via Firestore listMaterials, groups by category in fixed order
  (TMD → oxide → perovskite → MOF → carbon → alloy → polymer → salt →
  composite → other), renders responsive grid of cards. Card click
  opens detail modal showing formula, name, aliases, knownProperties,
  references count, ID, tenantId.
- `index.html`:
  - Sidebar item "Vật liệu" before "Hóa chất" entry, atom-like SVG icon.
  - Page section `<div id="page-materials">` with content placeholder.
  - Detail modal `#modal-material-detail`.
- `src/ts/main.ts`: `materials` entry in `_pageLoaders` map for lazy
  load. Wires `window.renderMaterials` + `window.openMaterialDetail`.

### Out of scope (R150d-2+)
- Create/edit material form
- Search/filter UI
- Connect to chemicals page (link by formula)
- Edit on cards
- Pagination (current limit 500 in service)
- Delegation handler for `data-action="open-material-detail"` — needs to
  be added to `services/global-delegation.js` to call window.openMaterialDetail.
  **Page works visually but card click won't open modal until R150d-1-fix1
  or R150d-2 wires the delegation.**

### Verify
```bash
npm run typecheck
npm run build
npm run dev
# Open browser, click "Vật liệu" in sidebar, expect:
# - Empty state message ("Chưa có vật liệu nào. CRUD UI sẽ thêm ở R150d-2.")
# - No console errors
```

### Files touched
- src/ts/pages/materials.ts (new)
- index.html (sidebar + section + modal)
- src/ts/main.ts (lazy loader entry)
- CHANGELOG.md (this entry)

## R150c-fix3 — Trigger deferred until GCIP (2026-05-10)

### Issue
`beforeUserCreated` blocking trigger requires Google Cloud Identity Platform
(GCIP), a paid upgrade of Firebase Auth. Project currently uses standard
Firebase Auth → deploy fails with `OPERATION_NOT_ALLOWED: Blocking Functions
may only be configured for GCIP projects`.

v1 `auth.user().onCreate()` (non-blocking, GCIP not required) cannot run on
Node 24 (Gen1 limit) — also fails.

### Fix
Removed trigger export from `functions/src/index.ts`. Trigger source code
moved to `functions/src/triggers/on-auth-create.ts.deferred-until-gcip`
(kept as reference, not compiled).

### New user signup workflow (until GCIP)
Manual: run migration script when new users register.
```bash
node scripts/migrate-tenant-claims-r150c.mjs --dry-run
node scripts/migrate-tenant-claims-r150c.mjs --confirm
```
Lab BKU has ~8 users, signups infrequent → manual is acceptable.

### Restore at Phase E (commercial launch)
1. Upgrade Firebase Auth → GCIP in Firebase Console
2. Rename `.deferred-until-gcip` back to `.ts`
3. Re-add export in `functions/src/index.ts`
4. `firebase deploy --only functions:setTenantOnCreate`

GCIP cost: free 50 MAU, $0.0055/user/month after. Negligible at lab scale.


## R150c-fix2 — DB name + Node 24 trigger fix (2026-05-10)

Issue 1: `firestore.rules` deployed to DB `labbook` (correct per
`firebase.json`). But R150a/b service code used `getFirestore(app)` =
default DB. Mismatch — frontend writes would go to wrong DB.

Fix: `src/ts/firebase.ts` now `getFirestore(app, "labbook")`.

This corrects R150a/b CHANGELOG claim that Phase B shipped against
default DB — wrong, Phase B used named DB `labbook` since R134.

Issue 2: v1 `auth.user().onCreate()` runs Gen1 which doesn't support
Node 24 (project default). Deploy failed.

Fix: switched to v2 `beforeUserCreated` blocking trigger. Sets claim via
return value, runs on Node 24.

### Verify
```bash
npm run typecheck
cd functions && npm run build && cd ..
firebase deploy --only functions:setTenantOnCreate
```

## R150c — Firestore rules + tenant claim migration (2026-05-10)

### Phase 1: Files only (no deploy)
This patch creates files but does NOT deploy. Production deploy is
4-step manual process documented below.

### Added
- `scripts/migrate-tenant-claims-r150c.mjs` — bulk-set
  `tenantId="default"` custom claim for all existing Firebase Auth
  users. Idempotent, supports --dry-run preview.
- `scripts/test-firestore-rules-r150c.mjs` — emulator-based rules
  test covering aiChunks (R134a preserved) + materials (new) for read,
  create, update, delete with tenant isolation.
- `functions/src/triggers/on-auth-create.ts` — Cloud Function trigger
  auto-setting tenantId claim for all future user signups. Region
  asia-southeast1.

### Changed
- `firestore.rules` — added /materials/{id} block:
  - read: authed + matching tenantId
  - create: admin/superadmin claim + matching tenantId + createdBy=auth.uid
  - update: admin/superadmin + immutable fields (tenantId, formula,
    createdBy, createdAt)
  - delete: always denied (mark deprecated instead per design)
  Preserves R134a aiChunks block unchanged.
- `functions/src/index.ts` — exports new `setTenantOnCreate` trigger.

### Production deploy procedure (4 steps, manual)
```bash
# Step 1: Install rules-testing dep (one-time)
npm i -D @firebase/rules-unit-testing

# Step 2: Test rules on emulator
firebase emulators:start --only firestore &
node scripts/test-firestore-rules-r150c.mjs
# Expect: all tests pass. Stop emulator (Ctrl+C).

# Step 3: Bulk migration (production Auth)
node scripts/migrate-tenant-claims-r150c.mjs --dry-run
# Review output: ~50 users will receive tenantId="default"
node scripts/migrate-tenant-claims-r150c.mjs --confirm
# Users must sign out + sign back in for claims to refresh in tokens

# Step 4: Deploy rules + Cloud Function trigger
cd functions && npm run build && cd ..
firebase deploy --only firestore:rules,functions:setTenantOnCreate
# Verify: lab user can still read aiChunks (existing).
# Verify: admin can create test material via Console / app.
```

### Rollback procedure
If rules cause issues:
```bash
git checkout HEAD~1 firestore.rules
firebase deploy --only firestore:rules
```
If migration causes issues:
```bash
# Clear tenantId claims (rerun script with --confirm after editing
# TARGET_TENANT to null, OR write a custom clear script)
```

### Out of scope (deferred)
- R150d: Materials browser UI (next round)
- Role check via custom claim — currently rules check `request.auth.token.role`
  but custom claim only has `tenantId`. Admin role check effectively
  always returns false, meaning create/update on materials is BLOCKED
  until role claims are also migrated. **Important: until R150c-followup
  adds role claims, materials writes work only via admin SDK / Cloud
  Functions.** This is acceptable for Phase B.5 since UI for create
  comes in R150d and can route through Cloud Function if needed.

### Files touched
- firestore.rules (modified)
- scripts/migrate-tenant-claims-r150c.mjs (new)
- scripts/test-firestore-rules-r150c.mjs (new)
- functions/src/triggers/on-auth-create.ts (new)
- functions/src/index.ts (modified — append export)
- CHANGELOG.md (this entry)

## R150b — Firestore client + Materials CRUD service (2026-05-10)

### Context
Second micro-round of R150 (Phase B.5 R1). Bootstraps Firestore client
SDK in the frontend (first time — Phase B used firebase-admin only on
backend). Implements Materials CRUD service per spec §3.1.

### Added
- `src/ts/firebase.ts`: Firestore client init + emulator wiring +
  re-exports of primitives (collection, doc, getDoc, getDocs, setDoc,
  updateDoc, query/where/orderBy/limit, serverTimestamp, Timestamp).
- `src/ts/services/materials.ts` (new file):
  - `getMaterial(id, tenantId)` — single doc read with tenant check
  - `listMaterials({tenantId, category, limit})` — paginated list
  - `searchMaterials(q, {tenantId, limit})` — substring match across
    formula/name/aliases (in-memory filter, acceptable up to ~1000 docs)
  - `createMaterial(input, uid, tenantId)` — admin-only write (rules R150c)
  - `updateMaterial(id, patch, uid)` — partial update with updatedAt refresh
  - `checkFormulaExists(formula, tenantId)` — uniqueness pre-check
  - `deleteMaterial` INTENTIONALLY OMITTED per design (mark deprecated only)
- `tests/services/materials.test.ts` (new file): ~16 test cases across
  getMaterial, listMaterials, searchMaterials, createMaterial,
  updateMaterial, checkFormulaExists.

### Mock strategy
`vi.mock("firebase/firestore")` at module level + `vi.mock("../../src/ts/firebase")`
to short-circuit the wrapper's initializeApp side effects. Both test
file and service resolve `firebase/firestore` from root node_modules
→ same resolution path → mock works (unlike R145b case where
functions/node_modules caused bypass).

In-memory store (`mockDocs[]`) reset in `beforeEach`. Filters from
where/orderBy/limit are attached to query and applied in mocked
getDocs implementation.

### Changed
- `vitest.config.js`: extend `coverage.include` with materials.ts.

### Out of scope (deferred)
- R150c: tenant claim migration + Firestore rules update + production
  deploy (the riskier round)
- R150d: Materials browser UI page
- R150e: Connect chemicals → materials via formula match
- R150f: Documentation sync (research-schema.md `labbook` named DB → default DB)

### Verify
```bash
npm run typecheck   # expect 0 errors
npm test            # expect 175+ pass (161 + ~16 new)
```

### Files touched
- src/ts/firebase.ts (modified — Firestore additions)
- src/ts/services/materials.ts (new)
- tests/services/materials.test.ts (new)
- vitest.config.js (modified — coverage)
- CHANGELOG.md (this entry)

## R150a — Material entity types (2026-05-10)

### Context
First sub-round of R150 (Phase B.5 R1). Phase B.5 implements the unified
research schema (Materials, Samples, Experiments, DataAssets, Instruments)
per `docs/research-schema.md`. R150 is divided into micro-rounds:

  - R150a: Material types ← this round
  - R150b: Firestore client bootstrap + Materials CRUD service
  - R150c: tenant-claim migration + Firestore rules update + deploy
  - R150d: Materials browser UI
  - R150e: Connect chemicals → materials
  - R150f: Documentation sync (reconcile spec with reality)

### Scope (intentionally narrow)
Only TypeScript interface definitions. No runtime code, no service, no
test, no deploy. Risk floor for opening Phase B.5.

### Added
- `src/ts/types/research.ts` (new file):
  - `ResearchTimestamp` — union shim avoiding `firebase/firestore` import
    at the type level. Concrete services pick canonical form in R150b.
  - `Material`, `MaterialCategory`, `MaterialKnownProperties`,
    `MaterialExternalIds` interfaces matching spec §3.1.

### Design decisions locked (assumed from memory; please verify)
1. **Storage**: Firestore default DB, NOT the named DB `labbook`
   mentioned in spec §2. Phase B (R130-R143) shipped against the default
   DB; spec is outdated. R150f will reconcile.
2. **Material formula uniqueness**: per tenant (not global). Spec §12
   listed this as open; memory records resolution as per-tenant.
3. **Permission model**: lab-wide read (any authenticated user with
   matching tenantId) + role-based write (admin/superadmin only).
   Spec §12 listed this as open; memory records this resolution.
4. **Delete policy**: never. Mark deprecated via field or subcategory.

### Out of scope (deferred)
- Sample, Experiment, DataAsset, Instrument types → R151-R154
- Firestore client SDK in `src/ts/firebase.ts` → R150b
- Materials CRUD service + tests → R150b
- Tenant claim migration → R150c (production deploy round)
- Firestore rules update for `/materials/{id}` → R150c
- Materials browser page → R150d
- Chemicals integration → R150e

### Verify
```bash
npm run typecheck   # expect 0 errors
npm test            # expect 161/161 still pass (no test changes)
```

### Files touched
- src/ts/types/research.ts (new)
- CHANGELOG.md (this entry)

## R145a — BM25 backend test coverage + CJS interop (2026-05-10)

### Context
R144 covered pure-logic modules of BM25 (chemistry-patterns, RRF). R145a
extends coverage to the remaining backend BM25 files: stemmer (Porter v2
via `natural` CJS), stopwords (`stopwords-iso` CJS + VI hardcoded list +
chemistry whitelist), tokenizer (the orchestrator), and types (constants).

The BM25 module is now ~80% covered. Remaining gaps: corpus-stats,
bm25-engine, hybrid-engine — all need Firestore mocks (R146+).

### Strategy: Option Y — CJS interop via Vitest server.deps.inline
Two npm packages used by the BM25 backend are CommonJS-only:
  - `natural` (Porter v2 stemmer)
  - `stopwords-iso` (179 English stopwords)

Root project is ESM (`"type": "module"`), so Vitest crashes on transitive
CJS imports without configuration. Three options were considered:
  - X: Mock both packages → fast but tests fake behavior, drift risk
  - Y: Configure CJS interop → tests real behavior, one-time setup cost
  - Z: Skip EN-specific tests → low coverage, deferred debt

Chose Y for long-term value: the same CJS/ESM problem will recur when
testing Firebase Admin SDK (R145b), Firestore SDK (Phase B.5), and any
backend lib added later. Solving it once = template for future rounds.

If interop fails on a given environment, EN-specific tests (Porter stems
"running" → "run") fail with clear errors. Plan B: fall back to Option Z
for affected tests, document follow-up.

### Added
- `tests/bm25/types.test.ts` — 3 cases. Locks TOKENIZER_VERSION=2,
  DEFAULT_K1=1.5, DEFAULT_B=0.75, Firestore path constants.
- `tests/bm25/stemmer.test.ts` — 12 cases. Chemistry bypass, Porter stem
  for EN -ing/-ed/-s, VI no-stem lowercase, mixed/empty edge cases.
- `tests/bm25/stopwords.test.ts` — 25 cases. VI hardcoded list,
  chemistry whitelist (V/A/M/T/K/eV/mV/pH...), EN via stopwords-iso,
  mixed language fallthrough, detectLanguage heuristic (4% diacritic
  threshold + 15% English ratio for mixed).
- `tests/bm25/tokenizer.test.ts` — 25 cases including 5 integration:
  realistic EN materials science abstract, VI abstract, mixed VI+EN,
  determinism check, re-export wiring.

### Changed
- `vitest.config.js`:
  - `coverage.include` extended to track the 4 new BM25 source files.
  - Added `server.deps.inline: [/^natural/, /^stopwords-iso/]` to enable
    CJS interop. This is the canonical Vite/Vitest pattern for letting
    ESM test code import CJS-only packages.

### Known limitations
- `mixed` language test (`tokenize` integration) accepts either "mixed"
  or "vi" because detectLanguage thresholds are sensitive to exact
  character ratios. Not strict because behavior is heuristic, not API.
- If `natural` package version changes Porter stemmer output (rare),
  tests like `running` → `run` may need updating.

### Out of scope (deferred)
- Action tools tests (createExperimentDraft, updateChemicalStock,
  createBooking) — need Firebase Admin SDK mocks → R145b.
- BM25 engines (bm25-engine, hybrid-engine, engine) — need corpus +
  Firestore mocks → R146.
- Frontend `src/ts/ai/rag/retrieval/bm25.ts` — separate code path,
  may have own logic divergent from backend → R147 if needed.

### Verify
```bash
npm test            # expect 168+ tests pass (108 existing + ~60 new)
npm run typecheck   # expect 0 errors
```

### Files touched
- tests/bm25/types.test.ts (new)
- tests/bm25/stemmer.test.ts (new)
- tests/bm25/stopwords.test.ts (new)
- tests/bm25/tokenizer.test.ts (new)
- vitest.config.js (modified — coverage + server.deps.inline)
- CHANGELOG.md (this entry)

## R144 — BM25 pure logic test coverage (2026-05-10)

### Context
Phase B (R105-R143) closed. Phase B.5 (R150-R155) Research Schema overhaul
will touch search/RAG via R152 (Experiments unified collection) and Phase
B.6 AI integration. BM25 + RRF have been production code since R137a/b but
had zero unit test coverage — silent regression risk before schema-touching
rounds. R144 adds targeted tests for the pure-logic modules (no Firebase,
no CJS deps) that are most likely to break invisibly under refactor.

### Added
- `tests/bm25/chemistry-patterns.test.ts` — 15+ test cases covering
  `isChemistryToken`, `isPureNumber`, `isShortUnitToken`. Verifies that
  domain tokens (MoS2, WO3, LiFePO4, Cu2+, 25°C, XRD, EIS, α/Ω, DOIs) are
  preserved as-is and plain English words / pure numbers are rejected.
- `tests/search/rrf.test.ts` — 10+ test cases covering `rrfMerge`. Verifies
  the canonical RRF formula `1 / (k + rank)`, multi-list fusion, k
  sensitivity, topK truncation, ties, edge cases (empty lists, topK=0,
  metadata preservation).

### Changed
- `vitest.config.js` — extended `coverage.include` to track
  `functions/src/bm25/chemistry-patterns.ts` and
  `functions/src/search/rrf.ts`.

### Out of scope (deferred)
- `functions/src/bm25/tokenizer.ts` — transitively imports `natural` (CJS)
  via `stemmer.ts`. Needs Vitest CJS shim or separate `functions/`-scoped
  test runner. Defer to R145+.
- `functions/src/bm25/stopwords.ts` — uses `require("stopwords-iso")`
  inside lazy loader. Same CJS issue. Defer.
- `functions/src/bm25/stemmer.ts` — direct CJS dep on `natural`. Defer.
- BM25 / search engines (`bm25-engine.ts`, `hybrid-engine.ts`,
  `engine.ts`) — need corpus + Firestore mocks. Defer to R146+.
- Action tools (`createExperimentDraft`, `updateChemicalStock`,
  `createBooking`) — need RTDB + auth mocks. Defer to R147+.

### Verify
```bash
npm test            # expect 87+ passing (62 existing + 25 new)
npm run typecheck   # expect 0 errors
```

### Files touched
- tests/bm25/chemistry-patterns.test.ts (new)
- tests/search/rrf.test.ts (new)
- vitest.config.js (modified)
- CHANGELOG.md (this entry)

Concise version history. For full git log: `git log --oneline`.

## [Round 143 — Roadmap sync + long-term reference] - 2026-05-10

### Added
- `docs/long-term-roadmap.md` — strategic vision 5-10 năm map với rounds.
  Sources: `Labbook_Bku_Long_Term_Platform_Roadmap_Report.pdf` (received May 10).
  Maps Priority 1-5 ↔ Phase B.5 / B.6+ / B.7+ / C+; 3-phase timeline (Scientific SaaS → Research OS → Scientific Platform).
- `docs/research-schema.md` Section 17 — long-term context reference.
- `ROADMAP.md` Test Strategy section — phase-end testing decision.

### Modified
- `docs/research-schema.md` — renumber Phase B.5 R140-R145 → R150-R155 (Phase B.4 R140-R142 đã ship).
- `ROADMAP.md` — add Phase B.4 + Phase B.5 + Phase B.6+ sections; reference long-term doc; Phase C-1 renumber note (now R156-R171).
- `CLAUDE.md` — Current state bump R126 → R142; add long-term-roadmap.md + research-schema.md to Quick navigation; Next pointer updated.

## [Round 142 — BM25 indexPaper implementation] - 2026-05-10

### Added — Final stage of RAG pipeline
- `functions/src/handlers/index-paper.ts` — new handler:
  - `indexPaperCore(paperId)` — Pub/Sub triggerable, idempotent, pattern matches `embedChunksCore` (R135).
  - `indexPaper` HTTP wrapper for manual retry / debugging (superadmin only).
- Hook in `paper-pipeline-router.ts` case `'embedded'` → `indexPaperCore` (was logging "not implemented yet").
- Status flow: `embedded` → `indexing` → `indexed` (terminal).

### Modified
- `firestore.indexes.json` — field exemption for `aiCorpusStats.documentFrequency` (R142b: fixes "too many index entries" — Firestore auto-indexes map subfields, vocab >40k tokens hits limit).
- `functions/src/handlers/backfill-bm25.ts` — memory 1GiB → 2GiB, STATS_BATCH_SIZE 500 → 200 (R142c: fixes SIGABRT during corpus stats rebuild on 3575-chunk corpus).
- `functions/src/index.ts` — exported `indexPaper`.

### Verified
- All 3 search modes (vector/bm25/hybrid) return relevant results from 20-paper corpus (~3575 chunks indexed, ~30-50k vocab tokens).
- Stress-test query "WO3 WS2 hybrid HER" surfaces synergistic WO3·2H2O/WS2 paper as top hit consistently.
- Latency: vector 631ms, bm25 1602ms, hybrid 892ms, all + Voyage rerank-2.5.

## [Round 141 — Chandra API key trim newline] - 2026-05-10

### Fixed
- `functions/src/handlers/chandra-proxy.ts` — `chandraKey.value().trim()` strips trailing newline.
- Root cause: Secret Manager values often carry trailing newline when created via `echo "KEY" | gcloud secrets versions add`. Newline was injected into `X-API-Key` header → Datalab returned 401 "Invalid API key".
- Symptom: ~18-min downtime mid-stress-test A2 (2026-05-09 13:14-13:33 UTC), 4 papers required retry after key rotation + redeploy.

## [Round 140 — Stress-test A2 documentation] - 2026-05-10

### Added
- `docs/stress-tests/2026-05-09-A2.md` filled — 13/14 papers indexed end-to-end, Chandra incident logged.
- Aggregate metrics: 3575 chunks, 1.1M embed tokens, ~$0.20 Voyage cost, ~9 min effective wall time.
- Outlier paper documented: surface-chemistry (8MB → 499 pages → 1138 chunks → 9 Voyage batches, max 128/batch respected).
- Action items: paper #10 (27MB) failed (Chandra free tier quota, not bug), `indexPaper` BM25 stage gap → addressed in R142.


## [Round 138 — a + b1 + b2a + b2b (fix2..5)] - 2026-05-09

### Added — Phase B.3: Claude proxy + Tier 1 RAG with NotebookLM-style citations

**R138a — Claude proxy infrastructure** (`functions/src/handlers/claude-proxy.ts`):
- New Cloud Function `claudeProxy` (asia-southeast1, 540s timeout, 512MiB)
- Anthropic Messages API wrapper (raw fetch, no SDK)
- SSE stream normalization: `data: {"text":"..."}`, `data: {"toolUse":{id,name,input}}`, terminal `[DONE]`
- Tool format translation (Anthropic `input_schema` ↔ internal Gemini-shaped tool defs)
- Models supported: `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5-20251001`
- `NO_SAMPLING_PARAMS_MODELS` gate for Opus 4.7 (drops `temperature` for that model)
- **R138a-fix**: dropped `top_p` from request body (Anthropic mutual exclusion with `temperature`)
- ANTHROPIC_API_KEY secret created, IAM allUsers invoker policy applied
- Cost pricing added in `cost-calculator.ts`: Sonnet $3/$15, Opus $5/$25, Haiku $1/$5 per 1M tokens

**R138b1 — searchPapers tool integration** (`functions/src/tools/papers.ts`):
- New tool wrapping R137b SearchEngine + R137c1 reranker DIRECTLY (no HTTP roundtrip)
- 1-indexed `position` field for `[N]` citation marker support
- Hybrid mode default; reranker optional via config
- VOYAGE_API_KEY wired into `toolExecutor` secrets array
- **R138b1-fix**: corrected interface usage — `SearchEngineContext = {embed, firestore}`,
  `engine.search(query: SearchQuery, ctx)` (object args), `VoyageReranker(opts)`,
  `reranker.rerank(input)`. Initial implementation guessed wrong shapes.
- **R138b1-fix2**: `enrichTitles()` switched from Firestore lookup to RTDB
  `aiPapers/_shared/{paperId}/title` (matches R136a/R137b pattern in production search-papers.ts)
- System prompt updated (`src/ts/ai/llm/system-prompt.ts`):
  - searchPapers added to READ TOOLS list with usage examples
  - Citation rules: AI must cite `[position]` after scientific claims, never invent positions

**R138b2a — Tier 1 RAG verified end-to-end**:
- No code changes — gemini-client.ts already had R112 tool execution loop
- Adding searchPapers to registry was sufficient → AI auto-calls tool → response cites `[1]` `[2]`
- Verified: Gemini Flash + searchPapers tool returns response with markdown citations

**R138b2b — NotebookLM-style citation chips** (`src/ts/ai/ui/citation-popover.ts`):
- Backend embeds `<!--AI_CITATIONS:base64-->` marker after searchPapers tool execution
  (parallel pattern to R115b `<!--AI_DRAFT:-->` marker)
- Frontend extracts marker, stores citations keyed by message ID
- DOM post-process: `[N]` text nodes → `<span class="citation-chip">` cyan pill
- Click chip → modal popover with paper title, section path, full chunk text, rerank score
- ESC / outside click / × button → close popover; dark mode aware

**R138b2b sub-fixes** (5 iterations to ship):
- **fix2**: corrected message-bubble.ts indentation anchors (production uses 2-space, not 4)
- **fix3**: appended missing CSS for chip + popover styles (~120 lines in `ai-chat.css`)
- **fix4**: `migrateCitations(from, to)` helper — streaming bubble has no msgId initially,
  citations stored under `""` key during stream, migrated to real msgId via `onComplete`
  callback after `appendMessage` returns the persistent ID
- **fix5**: regex updated to match combined citations like `[2, 4]` or `[1, 2, 3]`,
  rendering as multiple chips `[2][4]` side-by-side (single citation `[1]` still works)

### Modified
- `functions/src/handlers/tool-executor.ts` — declared VOYAGE_API_KEY secret
- `functions/src/tools/registry.ts` — searchPapers tool definition (Gemini + Anthropic shapes)
- `functions/src/index.ts` — exported claudeProxy
- `functions/src/observability/cost-calculator.ts` — Claude pricing tiers
- `src/ts/ai/llm/gemini-client.ts` — embed AI_CITATIONS marker for searchPapers tool result
- `src/ts/ai/llm/system-prompt.ts` — searchPapers usage + citation rules + 2 examples
- `src/ts/ai/ui/message-bubble.ts` — preprocess citations BEFORE markdown, attach chips AFTER
- `src/ts/ai/ui/message-handler.ts` — onComplete migrates citations from `""` → real msgId
- `src/css/ai-chat.css` — citation chip + popover styles (~120 lines)

### Files NEW
- `functions/src/handlers/claude-proxy.ts` (~340 LOC)
- `functions/src/tools/papers.ts` (~210 LOC)
- `src/ts/ai/ui/citation-popover.ts` (~290 LOC)

### Lessons
- Anthropic API rejects requests with both `temperature` and `top_p` set; drop `top_p`
- Tool result handlers MUST follow exact existing interface contracts (R137b shapes); guessing
  field names from memory fails. Read source first, code second.
- Streaming bubbles have no msgId until `appendMessage` saves to RTDB. Citation storage must
  use placeholder key during stream + migrate on completion.
- AI cites combined positions `[2, 4]` even when system prompt says separate; regex must
  handle both forms.
- Production indentation is 2-space across most TS files (verified via `cat -A`); `cat -n`
  output's line-number prefix can be misread as indent. Use raw bytes for anchor checks.

### Cost (verified runtime)
- searchPapers tool: ~600ms warm, ~5s cold (mostly Voyage rerank API latency)
- Claude proxy not yet wired into AI Chat (Tier 2/3 deferred to R138b2c)
- Tier 1 RAG (Gemini Flash + searchPapers): essentially free (Voyage trial credits + Gemini free tier)

---

## [Round 137c — c1 + c1-fix + c2] - 2026-05-08

### Added — Voyage rerank-2.5 + frontend confidence UI

**R137c1 — Backend rerank**:
- `Reranker` interface (`functions/src/search/reranker.ts`) — commercial-ready abstraction
- `VoyageReranker` implementation hitting `/v1/rerank` (rerank-2.5)
- `NoopReranker` for testing / disabled state
- Pipeline: hybrid → top-30 candidates → Voyage rerank → top-K final
- Per-request toggle: `body.rerank: false` to disable; default `true` from config
- Graceful failure: network/API error logs warning, returns original ranking
- Cost tracked via tracer (`recordCost(model, tokens, "rerank")`)
- New `rerankScore?: number` in `SearchResult`
- Config additions: `rerankerEnabled`, `rerankerModel` (default `rerank-2.5`), `rerankerCandidates` (default 30)

**R137c1-fix**: removed unused `NoopReranker` import (TS strict `noUnusedLocals`)

**R137c2 — Frontend UI** (`src/ts/ai/papers/paper-search.ts`):
- Confidence badges from `rerankScore`:
  - ≥ 0.85: "Rất phù hợp" (green)
  - 0.65-0.85: "Phù hợp" (blue)
  - 0.4-0.65: "Có thể phù hợp" (yellow)
  - < 0.4: "Yếu" (gray)
- Latency display in meta line (`Kết quả: 10 · 539 ms`)
- Inline CSS injection (no separate CSS file changes)
- Backward-compat: falls back to `vectorScore` if rerank not present

### Modified
- `functions/src/search/config.ts` — rerank fields
- `functions/src/search/types.ts` — `rerankScore` field
- `functions/src/handlers/search-papers.ts` — wire reranker, span tracking, response field

### Lessons
- Default `rerank: true` adds ~400ms warm latency vs ~80ms BM25-only — acceptable for search UX
- Voyage `relevance_score` is **relative within query**, not absolute — don't compare cross-query

---

## [Round 137b-eval+obs] - 2026-05-08

### Added — RAG evaluation framework + LLM observability

**Observability (`functions/src/observability/`)**:
- `Trace`, `Span`, `CostBreakdown` types
- `Tracer` class: `tracer.span(name, fn)` wraps async ops with timing + status
- `TraceSink` interface; `FirestoreTraceSink` implementation (writes to `aiTraces` collection)
- `NoopTraceSink` for tests
- Cost calculator: Voyage embed/rerank + Gemini Flash/Pro pricing per 1M tokens
- Privacy: queries logged as preview (100 chars) + sha256 hash, never full text

**Eval framework (`functions/src/eval/`)**:
- `GroundTruthQuery`, `QueryEvalResult`, `EvalRunSummary` types
- Pure-function metrics: `mrr`, `precisionAtK`, `ndcgAtK`
- Seed dataset: 10 queries (5 EN + 3 mixed VI/EN + 2 pure VI) — covers CV, POM, DFT papers
- `runEvalDataset()` runner: executes dataset across requested modes, aggregates per-mode metrics

**HTTPS handler `runEval`**:
- Superadmin only
- Body: `{ modes?: ["vector"|"bm25"|"hybrid"], limit?: 10 }`
- Persists run summary to `aiEvalRuns/{runId}` + per-query results to subcollection

**Tracer integration in `searchPapers`**:
- Spans: `embed`, `{mode}_search`, `rerank` (R137c1), `enrich_titles`
- Response now includes `traceId` for debugging

### Baseline metrics (10 seed queries, 678 chunks)
- Vector: MRR=1.0, P@10=0.95, NDCG=0.99, latency 527ms
- BM25: MRR=0.8, P@10=0.7, NDCG=0.79, latency 741ms (2 VI queries fail — expected, BM25 cross-language limit)
- Hybrid: MRR=1.0, P@10=0.95, NDCG=0.99, latency 524ms

### Modified
- `functions/src/handlers/search-papers.ts` — tracer integration
- `functions/src/index.ts` — export `runEval`

### Lessons
- Privacy log queries as preview + hash, not full text
- Tracer fire-and-forget: sink swallows errors so observability never breaks business logic
- `Promise.allSettled` for parallel engines lets one fail without blocking the other

---

## [Round 137b — b + b-fix] - 2026-05-08

### Added — Hybrid Search Engine (Vector + BM25 + RRF)

**SearchEngine architecture** (`functions/src/search/`):
- `SearchEngine` interface, `SearchMode = "vector" | "bm25" | "hybrid"`
- `VectorEngine` — extracts R136a Voyage embed + Firestore findNearest into reusable engine
- `BM25Engine` — Option A retrieval (top-30 IDF tokens via array-contains-any → in-memory BM25 score)
- `HybridEngine` — runs Vector + BM25 in parallel via `Promise.allSettled`, merges via RRF
- `rrfMerge()` — Reciprocal Rank Fusion (k=60, Cormack et al. 2009 standard)
- `createSearchEngine(mode, config)` factory

**Centralized config** (`config.ts`):
- BM25 hyperparams (k1=1.5, b=0.75)
- Per-engine retrieval depths (30/30 default)
- RRF k constant (60)
- Limit caps (defaultLimit=10, maxLimit=50)
- **Multi-tenant ready**: `defaultTenantId: "default"` field; queries optionally filter

**searchPapers handler**:
- New optional request fields: `mode`, `retrievalDepth`
- Default mode `hybrid`, default rerank ON (after R137c1)
- Response shape preserved + adds `mode`, `searchMs`, optional score breakdown per result

**R137b-fix**: trim results to caller's `limit` after engine.search() returns pool size

### Modified
- `functions/src/handlers/search-papers.ts` — full rewrite using engine factory

### Lessons
- Engine returns pool size (e.g. 30 for hybrid merge); caller trims to `limit`
- `array-contains-any` Firestore limit = 30 values per query → top-30 IDF tokens by query is ceiling
- Hybrid `Promise.allSettled` lets one engine fail without blocking the other

---

## [Round 137a — a + a-fix] - 2026-05-08

### Added — BM25 inverted index foundation

**BM25 module** (`functions/src/bm25/`):
- `tokenizer.ts` — multi-language with chemistry-aware patterns
  - Preserves chemistry tokens as-is: empirical formulas (LiFePO4, Ni(OH)2), acronyms (CV, EIS, XRD), units (mV, mA, °C), ions (Cu2+)
  - Snowball Porter v2 stemmer for English (via `natural` package)
  - No stemming for Vietnamese (no robust open-source stemmer)
- `stopwords.ts` — English (stopwords-iso, 179 words) + Vietnamese (50 manual) + chemistry whitelist
- `chemistry-patterns.ts` — regex for formulas, acronyms, ions, units
- `stemmer.ts` — wrapper with chemistry bypass logic
- `corpus-stats.ts` — DF/IDF tracker with sharding guard (1MB Firestore doc limit)
- `types.ts` — `TOKENIZER_VERSION` for safe iteration

**Integration**:
- `chunkPaperCore()` tokenizes inline, writes `bm25Tokens`, `bm25TokenFreq`, `bm25DocLength`, `bm25Language`, `bm25TokenizerVersion`, `bm25TokenizedAt` to each chunk
- Corpus stats updated incrementally via Firestore transaction (avoids lost writes on parallel chunks)

**Backfill HTTPS function** (`backfillBM25`):
- Idempotent (skips chunks with current tokenizerVersion)
- Force-rerun support
- Dry-run mode for safety
- Rebuilds corpus stats from scratch after re-tokenize
- Persists to `aiCorpusStats/global`

**R137a-fix — noise filter**:
- Bumped `TOKENIZER_VERSION` 1 → 2 (forces re-tokenize)
- `rawSplit`: treat pipe `|` as whitespace (markdown table syntax)
- `processToken`: reject all-dash tokens (`---`), pure numbers from table cells (`33`, `66`), tokens with no letter (`2-3` ranges)

### Schema
- `aiChunks/{id}.bm25Tokens: string[]` (for `array-contains-any` query)
- `aiChunks/{id}.bm25TokenFreq: Record<string, number>` (for TF scoring)
- `aiChunks/{id}.bm25DocLength: number`
- `aiChunks/{id}.bm25Language: "en" | "vi" | "mixed"`
- `aiCorpusStats/global` (sharded if vocab > ~50K tokens)

### Modified
- `functions/src/handlers/chunk-paper.ts` — tokenize inline before Firestore write
- `functions/src/index.ts` — export `backfillBM25`
- `functions/package.json` — `natural@^8.0.0`, `stopwords-iso@^1.1.0`
- `firestore.indexes.json` — composite indexes for BM25 queries

### Lessons
- Markdown table separators (`---`) leak through tokenizer if you preserve `-` for compound words; need explicit reject
- Pipe `|` in markdown tables wraps numbers; strip pipe before tokenize, then re-check `isPureNumber` after inner-strip
- Tokenizer versioning lets you ship breaking tokenization changes without breaking the index — bump version, re-backfill

---

## [Round 136 — a + b + c-fix] - 2026-05-08

### Added — RAG vector search backend + frontend

- **Backend `searchPapers`** (R136a) — Voyage embed query → Firestore `findNearest` cosine, returns top-K chunks with paper title enrichment
- **Frontend** (R136b) — search bar in Library tab → calls `searchPapers` → renders chunks with paperTitle, sectionPath, query highlighting
- **R136c-fix**: `marked-katex-extension` `nonStandard: true` for Gemini outputs without surrounding spaces in `$...$`

### Modified
- `functions/src/handlers/search-papers.ts` — new HTTPS handler
- `src/ts/ai/papers/paper-search.ts` — new search UI module
- `firestore.indexes.json` — vector index (1024 dim flat)

---

## [Round 135 — + fix] - 2026-05-08

### Added — Voyage embeddings via Pub/Sub chain

- `paperPipelineRouter` Pub/Sub trigger handles "chunked" event → calls embedding subroutine
- `voyage-3-large` model via secret `VOYAGE_API_KEY`
- Persists embedding to `aiChunks/{id}.embedding` as `FieldValue.vector()`
- RTDB rules whitelist extended with `numEmbedded`, `embeddingModel`, `embeddedAt`, `embeddingTokens`

### R135-fix
- Voyage API: `/v1/embeddings` accepts voyage-3-large/3.5/3.5-lite. `/v1/contextualizedembeddings` is a different API (voyage-context-3) — not used here.

---

## [Round 134 — a + b + b-fix] - 2026-05-08

### Added — Section-aware chunking + Pub/Sub event chain

- **Chunking** (`chunk-paper.ts`): parses markdown headings → sections, splits oversized sections by paragraph with 50-token overlap
- **Pub/Sub topic `paper-pipeline`** + **`paperPipelineRouter`** subscriber routes events by stage (extracted | chunked | embedded | indexed)
- Stage transition: extracted → publishes "extracted" → router calls chunking → publishes "chunked" → router calls embedding (R135)

### R134b-fix
- Firebase Admin SDK named DB pattern: `getFirestore("labbook")` is the only correct API. `(admin.firestore as any)(...)` does not exist.

---

## [Round 133 — a + b + b-fix] - 2026-05-08

### Added — Chandra OCR integration

- **`chandraProxy`** Cloud Function — uploads PDF to datalab.to Chandra API, polls until complete, downloads markdown + images, persists to Firebase Storage
- **Auto-trigger** on paper upload (R133b): paper status `uploaded` → triggers Chandra OCR → status transitions to `extracted`
- **R133b-fix**: extended RTDB rules whitelist with extraction metadata fields

### Cost
- Free tier credits at datalab.to (~$5 budget)

---

## [Round 132 — a + b + b-fix] - 2026-05-08

### Added — Paper Library upload + list

- Upload UI in AI Tools tab → Library sub-tab
- File validation: 100MB max, PDF only
- SHA-256 dedup (don't re-upload same file)
- Persists to Firebase Storage + `aiPapers/_shared/{paperId}` RTDB metadata

### R132b-fix
- Boundary patches must check `cat -A` for whitespace differences

---

## [Round 131 — a-v3 + b-fix] - 2026-05-08

### Added — AI Tools sidetab UI shell

- Right-side sidetab (similar to AI Chat sidetab from R108) with 5 sub-tabs:
  - Library (papers, R132+)
  - Search (R136+)
  - Chat with papers (deferred to later round)
  - Eval (R137b-eval)
  - Settings (placeholder)
- Draggable resize handle (left edge)

### R131a v1→v3 iteration
- v1: layout broken on small screens
- v2: tab indicator misaligned
- v3: final polish

---

## [Round 130] - 2026-05-08

### Added — Sidebar item AI Tools

- New sidebar item "AI Tools" visible to superadmin only
- Click → opens AI Tools sidetab (R131+)

---

## [Round 129a-c] - 2026-05-08

### Added — recordExperimentResultDraft (4th action tool)
**Use case**: User báo "EC-1778... đo xong, eta10=280, tafel=65" → AI tự gọi tool → confirmation card với diff visualization → user confirm → DB update + audit log.

- **Backend (R129a)**: New `recordExperimentResultDraft` function trong `actions.ts`
  - Detect category từ code prefix (HT- → hydro, EC- → electrochem)
  - Search record by `code` field, build partial payload + diff preview
  - `commitDraft` case mới: `db.ref(targetPath).update()` (NOT push - update existing record)
  - Tool def trong `registry.ts` với 11 params: code, status enum, note, hydro fields (yield_mass, color), electrochem metrics (eta10, tafel, j0, rs, rct, ecsa)
- **Backend (R129a-fix)**: Extend `confirm-action.ts` whitelist `validTypes` thêm "experiment-result-draft"
- **Frontend (R129b)**: New card type "experiment-result-draft" trong `confirmation-card.ts`
  - Title "Cập nhật kết quả Thủy nhiệt/Điện hóa" với icon 📊
  - Body: 4-column diff grid (label | old | → | new)
  - Old values gray + line-through, new values bold + JetBrains Mono, arrow cyan
- **Frontend (R129b-fix)**: Boundary blank line fix trong patch script
- **System prompt (R129c)**: Tool 4 description + 3 examples (EC success, HT success, missing-code handling)

### Modified
- `functions/src/tools/actions.ts` — interface ExperimentResultDraft, function recordExperimentResultDraft, commitDraft case (~120 LOC added)
- `functions/src/tools/registry.ts` — import + tool def (~50 LOC)
- `functions/src/handlers/confirm-action.ts` — validTypes array (1 line)
- `src/ts/ai/ui/confirmation-card.ts` — 4th card template (~30 LOC)
- `src/css/ai-chat.css` — `.ai-confirm-card__diff-table` styles (~30 LOC)
- `src/ts/ai/llm/system-prompt.ts` — tool description + examples

### Tools ecosystem (post R129)
- **6 read tools**: searchChemicals, searchEquipment, searchExperiments, getBookings, listMembers, getCurrentDate
- **4 action tools**: createExperimentDraft, updateChemicalStockDraft, createBookingDraft, **recordExperimentResultDraft** (mới)
- Total: **10 tools** dispatched qua Cloud Function `toolExecutor`

### Lessons learned
- **Khi add action tool mới, phải update HAI files**: `actions.ts` (commitDraft case) **VÀ** `confirm-action.ts` (validTypes whitelist). R129a chỉ update file đầu → R129a-fix bổ sung.
- **Boundary patches phải kiểm `cat -A` trước**: blank lines trong source không match boundary string viết liền nhau (R129b → R129b-fix iteration).
- **Test sub-rounds riêng**: backend test direct via DevTools fetch (verify schema) → frontend test card render (verify CSS) → end-to-end qua chat. Test bundled gây khó debug.


## [Round 126] - 2026-05-08

### Added — Resizable AI sidetab
- **Drag handle** ở mép trái sidetab AI: 6px wide, cyan accent on hover/active
- **CSS var driven** (`--ai-sidetab-width`): inner content tự co dãn theo
- **Pointer events** (mouse/touch/pen): pointerdown → drag → release với `pointermove`/`pointerup`
- **Persist** vào `localStorage[ai-chat-sidetab-width]`, restore khi mount
- **Clamp**: min 320px, max 85vw, auto re-clamp khi window resize
- **Keyboard a11y**: Arrow Left/Right (Shift = step 50px) khi handle focused
- **Mobile**: handle ẩn (<480px, sidetab full width)

### Modified
- `index.html` — `<div class="ai-sidetab__resizer">` ở đầu sidetab
- `src/css/ai-chat.css` — `.ai-sidetab__resizer` + `body.ai-sidetab-resizing` rules
- `src/ts/ai/ui/chat-sidetab.ts` — `initSidetabResize()` cùng `initFabDrag()`

## [Round 125] - 2026-05-08

### Fixed — Console cleanup (cosmetic, not functional)
- **PWA meta deprecated**: thêm `<meta name="mobile-web-app-capable">` cạnh `apple-mobile-web-app-capable` (giữ cả 2 cho Safari cũ)
- **ServiceWorker MIME error ở dev**: wrap register trong `import.meta.env.PROD` — Vite dev không generate `sw.js` → request fallback `index.html` → MIME error
- **Password field warning**: wrap `#admin-pw` trong `<form>` với `name="password"` + `autocomplete="current-password"`. CSP strict → dùng `data-noop-submit="1"` thay `onsubmit="return false"` inline. Bind global submit handler trong `global-delegation.ts`.

### Modified
- `index.html`, `src/ts/main.ts`, `src/ts/services/global-delegation.ts`

## [Round 124] - 2026-05-08

### Fixed — UI/UX
- **Bug E**: Menu "Nhập/xuất dữ liệu" giờ chỉ admin/superadmin. CSS hide trigger `[data-action="exp-actions-menu"]` cho `body.{member|viewer|pending|rejected}-mode` + JS gate ở action handler (defense-in-depth).
- **Bug F**: File picker không trigger được khi click "Chọn file". Root cause: `<input type="file" hidden>` HTML5 attribute → 1 số browser không trigger picker qua label association. Fix: thay `hidden` bằng visually-hidden CSS + thêm explicit click handler trên label làm fallback.
- **Bug G**: Print window QR labels và confirm dialog thiếu dấu Vietnamese (`Dong`, `nhan QR`, `Tai PDF`...). Fix toàn bộ thành chữ có dấu.

### Modified
- `src/css/main.css` (CSS hide rule), `src/ts/pages/experiments.ts` (JS gate), `src/ts/services/qr-labels.ts`, `src/ts/ui/attachments-panel.ts`

## [Round 123] - 2026-05-08

### Fixed — Members KPI card scroll
- Card "Thành viên lab" trên dashboard hardcode `slice(0, 4)` → khi tăng thành viên thì card cao bất thường (xấu vs neighbors).
- Bỏ slice → render tất cả members → wrap trong `dash-scroll` div với `max-height: 104px` (2 hàng × 52px). Dùng class `dash-scroll` đã có sẵn (booking card cùng card row).

### Modified
- `src/ts/pages/dashboard.ts`

## [Round 122] - 2026-05-08

### Added — Notification security overhaul + migration script + lock cleanup

**Bug 13 — Notification schema flat → nested per-user:**
- R121 unblock bell empty bằng cách relax rules cho `notifications` flat. Trade-off: mọi member đọc được mọi notification.
- R122 fix proper: schema `notifications/{uid}/{notifId}` (nested per-user) + `_admin` fallback bucket.
- **`createNotification` fan-out**: target cụ thể → 1 write. Broadcast admin → fetch admin list từ `cache.users` → multi-write per admin. Fallback: `notifications/_admin/{notifId}` nếu member không có quyền đọc users.
- **Listeners**: per-user listen `notifications/{myUid}` thay vì full `notifications`. Admin/superadmin listen thêm `notifications/_admin`.
- **Rules strict**: `auth.uid === $uid || $uid === '_admin'`. `.write` cho member+ ghi mọi path (cần cho fan-out — trade-off thấp với 50-user app).

**Bug 14 — Stale lock cleanup (R119 edge case):**
- `cleanupStaleLocks()`: throttled 5min, admin-only, fire-and-forget từ `renderBooking`
- Drops `tmp_*` slots > 60s, removes slots cho bookings không tồn tại, syncs status mismatch

**Migration script (`scripts/migrate-notifications-r122.mjs`):**
- One-shot Node.js script với `firebase-admin` SDK
- Backup tự động → in plan → hỏi `yes/no` → atomic apply
- Idempotent: phân biệt flat vs nested entries qua heuristic
- 111 flat notifications migrated (26 direct + 85 broadcast × 1 admin = 111 entries)

### Modified
- `database.rules.json`, `src/ts/services/notifications.ts`, `src/ts/services/listeners.ts`, `src/ts/pages/booking.ts`
- New: `scripts/migrate-notifications-r122.mjs`, `package.json` (firebase-admin devDep + `migrate:notifications` script)
- `.gitignore` — exclude `serviceAccountKey.json`, `backup-notifications-*.json`

### Deploy notes
- Migration phải chạy **TRƯỚC** deploy code mới (code mới chỉ đọc nested path — flat data vô hình)
- Workflow: `npm run migrate:notifications` → `npm run build && firebase deploy --only hosting,database` → push

## [Round 121] - 2026-05-08

### Fixed — UI/UX bugs

- **Bug A — Search box stuck expand sau navigate**: `closeDropdown` dùng `removeProperty` xóa inline styles → element không có width inline → render kì lạ. `mouseleave` collapse có check `if (i.value)` skip nếu input còn value → stuck.
  - Fix: `closeDropdown` set explicit `width:40px; border-radius:50%`. `showPage` reset search box state mỗi navigate (clear value, blur, collapse).
- **Bug B — Bulk select missing**:
  - Booking: `<tr>` không có `data-key`. Member viewing booking không phải của mình → action cell rỗng → bulk-actions không tìm được key.
  - Ink: dùng `data-ink-action`/`data-ink-key` (custom) không phải `data-action`/`data-key`.
  - Fix: thêm `data-key="${r._key}"` vào `<tr>` cả 2 file.
- **Bug C — Member card del-btn position varied**: card không có flex column → del button cao theo content. Fix: `.member-card { display: flex; flex-direction: column; height: 100% }` + `.member-del-btn { margin-top: auto; align-self: flex-end }`.
- **Bug D — Bell empty (notifications schema mismatch)**: code `fbPush('notifications', notif)` push flat path, rules expect nested → silent deny. Quick fix R121: relax rules cho flat path. **Trade-off security**: refactor proper trong R122.

### Modified
- `src/ts/services/global-search.ts`, `src/ts/ui/navigation.ts`, `src/ts/pages/booking.ts`, `src/ts/pages/ink.ts`, `src/css/main.css`, `database.rules.json`

## [Round 120] - 2026-05-08

### Fixed — Booking race condition (drag/drop + resize)
Bug 3 continued — R119 fix saveBooking, R120 mở rộng cho drag/drop + resize:

- **Helper mới `tryReserveSlotForUpdate(eqKey, oldDate, newDate, newStart, newEnd, bookingKey)`**:
  - Atomic transaction trên `booking_locks/{eqKey}_{newDate}`
  - Cùng date (chỉ đổi giờ): xóa slot cũ + thêm slot mới trong cùng 1 transaction → no race window
  - Đổi date: thêm slot mới ở date mới (slot cũ ở date cũ release riêng sau)
- `calOnDrop` (drag/drop): atomic reserve trước khi update record, rollback slot mới nếu push fail, release slot cũ nếu đổi date
- `dayOnResizeEnd` (resize): atomic reserve cùng date với self-exclusion, rollback slot nếu push fail

**Behavior change**: Admin không còn force-override conflict được. Server enforces no overlap.

### Modified
- `src/ts/pages/booking.ts`

## [Round 119] - 2026-05-08

### Fixed — Booking race condition (saveBooking)
Bug 3 — `saveBooking` cache-only check + non-atomic push → 2 user concurrent đặt cùng giờ → silent duplicate.

**Architecture**: New path `booking_locks/{equipmentKey}_{date}` với `slots: [{start, end, bookingKey, status}]` array.

- **`tryReserveSlot(eqKey, date, start, end, tempId)`**: `runTransaction` với overlap check trên slots active (pending/approved/in-use). Trả `{ok, conflict?, lockKey}`.
- **`updateSlotStatus(eqKey, date, bookingKey, newStatus, matchTempId?)`**: cleanup khi reject/cancel/complete (remove slot).
- **Flow saveBooking**: tryReserveSlot với tempId → fbPush booking → updateSlotStatus(tempId → realKey).
- **Status handlers cleanup slot**: confirmRejectBooking, cancelBooking, checkInBooking, checkOutBooking, deleteBooking, autoCancelOverdueBookings.

### Modified
- `src/ts/pages/booking.ts`, `database.rules.json` (thêm `booking_locks` rule)

## [Round 118] - 2026-05-08

### Fixed — Stock race + image bloat

- **Bug 10 — Stock race (saveHydro/saveElectrode)**: Read `cache.chemicals[X].stock`, compute `newStock = curStock - delta`, write. 2 user concurrent consume cùng hóa chất → lost data (vd 100g - 50g - 30g concurrent → kết quả 70g thay vì 20g).
- **Bug 11 — Stock leak (delItem)**: refund stock sequentially with `await update` per chemical → fail mid-loop + retry → double refund.
- **Fix cả 2**: helper `incrementStock(chemKey, delta, precision)` trong `firebase.ts` dùng `runTransaction` (atomic server-side read-modify-write). Replace 4 sites trong save-handlers + 2 sites trong duplicate-delete (delete + undo).

- **Bug 12 — Image upload size**: 7 image upload handlers no size check → user push 10MB+ base64 vào RTDB. Fix: helper `validateImageFile(file)` (max 800KB raw, MIME check) wired into ink/electrode/hydro/chemical drop-cell/chemical-upload/equipment-preview/equipment-drop-cell.

### Modified
- `src/ts/firebase.ts`, `src/ts/services/save-handlers.ts`, `src/ts/services/duplicate-delete.ts`, `src/ts/services/image-handlers.ts`

## [Round 117] - 2026-05-08

### Fixed — Storage cleanup + recall rule + escapeJs XSS

- **Bug 7 — Orphan storage**: `uploadAttachment` post-upload steps (getDownloadURL, fbSet) có thể fail → file kẹt trong Storage làm bloat 5GB Spark quota. Fix: wrap fbSet trong try/catch với `deleteObject` rollback.
- **Bug 8 — Chat message recall rule**: rule `hasChildren(['uid','ts','text']) && uid === auth.uid` block recall (text=null fail hasChildren) và superadmin moderation (uid mismatch). Relax thành `hasChildren(['uid','ts']) && (recalled === true || text valid) && (uid === auth.uid || data.exists())`.
- **Bug 9 — escapeJs XSS**: không escape `"` → XSS qua `data-name="${escapeJs(member.name)}"` ở 3 sites delete buttons. Add `.replace(/"/g, '&quot;')`.

### Modified
- `src/ts/utils/format.ts`, `src/ts/services/attachments.ts`, `database.rules.json`, `src/ts/utils/format.test.ts`

## [Round 116] - 2026-05-08

### Fixed — Listener leak, presence stuck, XSS edit modals

- **Bug 1 — `loadUserRole` listener leak**: `onValue` không unsubscribe → leak khi logout/relogin, có thể overwrite `currentAuth.role` cross-user. Fix: track `_roleUnsub` + add `stopRoleListener()`.
- **Bug 2 — Presence stuck online**: `stopPresence()` gọi SAU `signOut(auth)` → rule `auth.uid === $uid` deny write → presence stuck `online: true`. Fix: move `stopPresence()` TRƯỚC `signOut()` trong logout.
- **Bug 4 — XSS edit modal**: `editHydro`/`editInk` rows interpolate `chem.name`/`s.name`/`l.name` vào `value="..."` không escape. Fix: wrap 3 sites với `escapeHtml()`.

### Modified
- `src/ts/auth.ts`, `src/ts/services/edit-handlers.ts`

## [Round 115a-d] - 2026-05-08

### Added — Action Tools với Confirm UI Pattern
- **3 write tools** (superadmin only):
  - `createExperimentDraft` (hydro + electrochem categories)
  - `updateChemicalStockDraft` (search by name/CAS/formula, calculate new value)
  - `createBookingDraft` (search equipment, validate time slots)
- **Draft confirmation pattern**: Tool returns `DRAFT` (NOT write DB) → frontend renders inline confirmation card → user click "Xác nhận" → POST `/confirmAction` commits to RTDB + audit log
- **NEW Cloud Function**: `confirmAction` (asia-southeast1, superadmin verify)
- **NEW files**:
  - `functions/src/handlers/confirm-action.ts`
  - `functions/src/tools/actions.ts` (4 functions: 3 draft generators + commitDraft)
  - `src/ts/ai/ui/confirmation-card.ts` (~250 lines, render + handlers)
- **Audit log**: `actionAudit/{ts}` với uid, action, targetPath, resultKey

### Modified
- `functions/src/tools/registry.ts` — refactored `executeTool(name, args, context: {uid})`, added 3 action tools, exported `ACTION_TOOL_NAMES`
- `functions/src/handlers/tool-executor.ts` — split role check (action tools require superadmin)
- `src/ts/ai/llm/system-prompt.ts` — added "ACTION TOOLS" section với trigger keywords + examples + anti-refusal directive
- `src/ts/ai/llm/gemini-client.ts` — embed `<!--AI_DRAFT:base64-->` marker khi tool returns draft
- `src/ts/ai/ui/markdown-render.ts` — extract markers → span placeholder → DOMPurify sanitize → re-inject card HTML (bypass sanitize for trusted content)
- `src/ts/services/global-delegation.ts` — handle `ai-confirm-action`, `ai-cancel-action`
- `src/css/ai-chat.css` — confirmation card styles (cyan theme, 3 states: pending/confirmed/cancelled)

### Fixed (R115a2, R115b-fix, R115d-v2/v3/v4)
- `TOOL_NAMES` order: `Object.keys(TOOLS)` computed BEFORE action tools merged → fixed với `TOOL_NAMES.push(...)` after assign
- R115b boundary mismatch (file thực tế có blank lines giữa blocks)
- DOMPurify strip card HTML: thử nhiều placeholder formats (`__FOO__` → markdown parse `<strong>`, HTML comment → strip, finally span + data-idx)

### Permission
- Chỉ **superadmin** dùng được action tools
- Backend: `tool-executor.ts` pre-check `ACTION_TOOL_NAMES.includes(name)` → require superadmin
- `confirmAction` endpoint: separate verify

## [Round 114a-b3] - 2026-05-07

### Added — Voice STT/TTS (Phase A item D)
- **Backend**: `speechProxy` Cloud Function (asia-southeast1)
  - Forward audio to Google Cloud Speech v2 với Chirp 2 model
  - Single language `vi-VN` (asia-southeast1 không support multi-lang recognition)
  - Default service account: `478810777276-compute@developer.gserviceaccount.com`
- **Frontend voice module**: `src/ts/ai/voice/`
  - `speech-recorder.ts` — MediaRecorder wrapper, max 30s, blob → base64 → speechProxy
  - `text-to-speech.ts` — Browser native `speechSynthesis` với vi-VN voice priority
  - `types.ts` — TypeScript interfaces
- **UI buttons**:
  - Mic button trong input area (cyan, pulse red khi record, yellow khi processing)
  - Speaker button trong assistant message bubble (đọc to bằng vi-VN voice)

### Modified
- `firebase.json` — `Permissions-Policy: microphone=(self)` (default deny → allow same-origin)
- `index.html` — added mic button HTML
- `src/css/ai-chat.css` — mic + speaker animations (pulse keyframes)
- `src/ts/ai/ui/message-bubble.ts` — added speaker button trong `ai-msg__actions`
- `src/ts/ai/ui/chat-sidetab.ts` — `onAiMicToggle` + `onAiMsgSpeak` handlers
- `src/ts/services/global-delegation.ts` — `ai-mic-toggle` + `ai-msg-speak` routes

### Manual setup required (1 lần)
- Enable `speech.googleapis.com` API
- Grant **Cloud Speech Client** role to compute service account

## [Round 113a-b3] - 2026-05-07

### Added — UI Polish + Reliability
- **Stop button** ⏹ — `AbortController` save partial response với `_(Đã dừng)_`
- **Regenerate button** 🔄 — delete last assistant message + re-stream với history
- **Auto-rename conversation** — `title-generator.ts` background gen 3-6 word Vietnamese title sau message đầu
- **Better error toasts** — parse HTTP 429/401/500 → friendly Vietnamese messages

### Fixed (R113a/a2/a3)
- **Duplicate assistant bubble race condition**: chunk 1 await `appendMessageToDom` (slow markdown), chunk 2 fires DURING await → `assistantMsgEl=null` → tạo bubble nữa. Fix: sync flag `creatingBubble` locks immediately
- **Streaming stuck bug** (R113a2): `creatingBubble` blocks chunks 2-N during chunk 1 await, no catch-up after. Fix: `latestAccumulated` tracker + sync after bubble ready
- **CSP block KaTeX/highlight CSS** từ `cdn.jsdelivr.net`: added vào `style-src` + `style-src-elem` + `font-src` (R113a3)

### Modified
- `src/ts/ai/ui/message-handler.ts`, `message-bubble.ts`, `chat-sidetab.ts`
- `src/ts/ai/memory/conversation-store.ts`
- `src/ts/services/global-delegation.ts`
- `firebase.json` — CSP additions

## [Round 112+112b+112c] - 2026-05-06

### Added — Backend-side Tool Calling (Phase A item B+C)
- **6 read tools** via Cloud Function `toolExecutor`:
  - `searchChemicals` (name/CAS/formula, low_stock filter)
  - `searchEquipment` (status, location)
  - `searchExperiments` (4 categories: hydro/electrode/electrochem/ink)
  - `getBookings` (date filter)
  - `listMembers` (role filter)
  - `getCurrentDate` (VN timezone)
- **Function calling loop** trong `gemini-client.ts` (max 5 iterations)
- **Tool registry** `functions/src/tools/registry.ts` với JSON Schema definitions
- **System prompt** dạy AI khi nào gọi tool

### Fixed
- R112b: `normalizeDate` signature accept undefined
- R112c: removed visual marker for cleaner UX

## [Round 111+111b] - 2026-05-05

### Added — Real Gemini Flash Streaming
- **Cloud Function `geminiProxy`** (asia-southeast1, SSE streaming)
- **Secret manager**: `GEMINI_API_KEY` (Default Gemini Project Free tier key)
- **CSP**: added `*.cloudfunctions.net` vào `connect-src`

## [Round 109-110] - 2026-05-04

### Added — Chat Foundation
- **Conversation persistence**: `aiConversations/{uid}/{convId}` trong RTDB với role gate
- **Markdown rendering**: marked + KaTeX + highlight.js (lazy-loaded), DOMPurify sanitize
- **Message bubbles**: 4 styles (user/assistant/system/error)
- **Mock streaming** (placeholder before R111)

## [Round 108+108b] - 2026-05-03

### Added — AI Chat Sidetab UI Shell
- **Slide-out sidetab** (right side, 380px width, ⌘J toggle)
- **Draggable FAB** button (default bottom-right)
- **Conversation list** UI shell

## [Round 105] - 2026-05-02

### Added — AI Module Foundation
- **`src/ts/ai/`** skeleton: 38 folders, 50+ TypeScript stub files
- **Foundation docs**: `AI_ARCHITECTURE.md`, `DESIGN.md`, `WORKFLOW.md` (root)
- **`docs/ai/*`** + **`docs/design/*`** index files

### Modified
- `.env.example`, `.gitignore`, `CLAUDE.md`, `ROADMAP.md` (extended Phase A-E plan)

## [Round 104] - 2026-05-01

### Added — Claude Code System
- **`CLAUDE.md`** entry point cho AI agents
- **`ROADMAP.md`** future plans
- **`CHANGELOG.md`** version history
- **`.claude/`** (gitignored): config + memory + skills markdown files

## [Round 103a-b] - 2026-04-30

### Performance — Bundle Optimization
- Lazy-load jspdf + qrcode trong `qr-labels.ts`
- Removed unused `html2canvas` dep
- Vite `target: es2022` aligned với tsconfig
- `manualChunks` vendor-firebase chunk for long-term cache
- Rejected: lightningcss (no gain), SVG sprite (5KB saving not worth)
- **Lighthouse Mobile**: Performance 93, Accessibility 95, Best Practices 100, SEO 100

## [Round 95-102] - 2026-04-25 → 04-29

### Added — Origin Lab Integration
- Web "Mở bằng Origin" button generates `.ogs` LabTalk script
- Custom URL protocol `labbook-origin://` registered via `install.bat`
- Wrapper batch copies script to Origin User Files Folder (UFF)
- Origin executes via `-rs run.section(file.ogs, Main)`
- R102: replaced batch echo+escape with PowerShell template fill (avoid escape hell)

## [Round 91-94] - 2026-04-20 → 04-24

### Refactored
- R91: Folder rename `src/js/` → `src/ts/`
- R92-93: closePreview empty state restore + saved PNG matches preview
- R94: Tick padding clear of marks + handleFiles state='preview' + CSP frame-src blob

## [Round 71-72] - 2026-04-10

### Refactored — TypeScript Migration Complete
- All `.js` → `.ts` (300+ files)
- 24 large files với `@ts-nocheck`
- Strict mode partial: `noImplicitAny`, `strictNullChecks`, `noUnusedLocals/Parameters`
- AGENTS.md tracked in repo

## [Round 55-58e] - 2026-04-01 → 04-05

### Security — CSP Hardening
- All ~480 inline events removed (global delegation architecture)
- 2 inline scripts extracted (`threads-bg.js`, `mobile-sidebar.js`)
- Strict CSP applied
- **Mozilla Observatory**: 125/100 Grade A+
- `style-src` kept `'unsafe-inline'` (437 inline styles, separate phase)
