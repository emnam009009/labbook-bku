# Research Schema Design — Phase B.5 Foundation

> **Round**: R139 (design only, no code)
> **Status**: Draft for review
> **Last updated**: May 9 2026
> **Owner**: nAM
> **Implements**: Phase B.5 entity model — Sample, Material, Experiment, DataAsset, Instrument

---

## 1. Goal

Transition LabBook from **page/feature-driven** schema (current) to **entity-driven** schema (new) without breaking existing functionality.

**Current state**: data scattered across flat collections (`hydro/`, `electrode/`, `electrochem/`, `chemicals/`, etc.). No links between experiments. No Sample entity. No Material ontology. No lineage tracking.

**Target state**: unified entity graph where Samples link to Experiments link to DataAssets, with Materials as ontology backbone. Lineage queryable. Cross-experiment analytics enabled. AI can reason over the graph.

**Non-goals (R139)**:
- Migrating existing data (R145+)
- Implementing UI (R140-R144)
- Plugin parser system (Phase plugin, defer)
- Postgres migration (defer 12-18 months)

---

## 2. Storage layer decision

**Hybrid RTDB + Firestore named DB `labbook`**.

| Collection | Storage | Reason |
|---|---|---|
| `users/`, `presence/`, `chat/`, `notifications/`, `bookings/`, `aiConversations/`, etc. | RTDB | Realtime sync core, existing infra |
| `chemicals/`, `equipment/`, `ink/`, `members/` | RTDB | Existing app data, simple lookups |
| `hydro/`, `electrode/`, `electrochem/` | RTDB (legacy, read-only after migration) | Backward compat |
| `aiPapers/_shared/` | RTDB | Realtime upload progress UI |
| `paperChunks/`, `bm25Tokens/`, `aiTraces/`, `evalRuns/` | Firestore `labbook` | Phase B existing |
| **`samples/`** (R141) | **Firestore `labbook`** | Complex queries, lineage |
| **`materials/`** (R140) | **Firestore `labbook`** | Reference ontology |
| **`experiments/`** (R142) | **Firestore `labbook`** | Unified, parallel to legacy |
| **`dataAssets/`** (R143) | **Firestore `labbook`** | Cross-experiment query |
| **`instruments/`** (R144) | **Firestore `labbook`** | Optional, denormalized |

**Why Firestore for new entities**:
- Multi-field where queries (RTDB cannot)
- Composite indexes for "samples where category=X AND status=Y AND createdAt > Z"
- Subcollection support for lineage
- Aggregation native (count(), sum())
- Better scaling beyond 100K records per collection

**Why keep RTDB for app data**:
- Realtime listeners cheaper (RTDB bandwidth-based, Firestore read-counted)
- Lower latency for chat/presence (~50ms vs ~200ms)
- Existing patterns work (fbListen, fbSet)
- No migration cost

**Future Postgres path** (defer): when commercial scale demands cross-tenant analytics, BI dashboards, or complex SQL — add Postgres alongside via ETL pipeline. Not blocking for Phase B.5.

---

## 3. Entity model

### 3.1 Material

Ontology entity. Reference data. Many samples reference one material.

```typescript
interface Material {
  // Identity
  id: string;                          // Firestore auto-ID or "mat-MoS2"
  formula: string;                     // "MoS2" — primary key candidate, unique within tenant
  name: string;                        // "Molybdenum disulfide"
  aliases: string[];                   // ["MoS₂", "Molybdenite", "Moly disulfide"]

  // Classification
  category: MaterialCategory;          // see enum below
  subcategory?: string;                // free-text, e.g., "2D-TMD"

  // Known properties (from literature, optional)
  knownProperties: {
    structure?: string;                // "2H" | "1T" | "3R" for TMDs
    crystalSystem?: string;            // "hexagonal" | "cubic" | ...
    bandgap?: number;                  // eV
    bandgapType?: "direct" | "indirect";
    density?: number;                  // g/cm³
    moleculeMass?: number;             // g/mol
    [key: string]: any;                // extensible
  };

  // References
  references: string[];                // paperId list (link to aiPapers/_shared/)
  externalIds?: {
    materialsProjectId?: string;       // mp-1023923
    cod?: string;                      // Crystallography Open DB
    pubchem?: string;
    cas?: string;                      // for chemicals
  };

  // Audit
  tenantId: string;                    // commercial-ready
  createdAt: Timestamp;
  createdBy: string;                   // uid
  updatedAt: Timestamp;
  updatedBy: string;
}

type MaterialCategory =
  | "TMD"             // Transition Metal Dichalcogenide (MoS2, WS2, ...)
  | "oxide"           // ZnO, TiO2, WO3, ...
  | "perovskite"      // CaTiO3, MAPbI3, ...
  | "MOF"             // Metal-Organic Framework
  | "alloy"
  | "polymer"
  | "carbon"          // graphene, CNT, GO, rGO, ...
  | "salt"            // for precursors
  | "composite"       // explicitly composite
  | "other";
```

### 3.2 Sample

Core entity. Required for all experiments. Tracked through lifecycle.

```typescript
interface Sample {
  // Identity
  id: string;                          // Firestore auto-ID
  name: string;                        // "MoS2-batch-2026-05-09" auto-generated if missing
  shortCode?: string;                  // "MS-001" optional human-friendly

  // Composition
  materialRef?: string;                // FK → materials/{id} (preferred)
  composition: string;                 // "MoS2" (denormalized for display, fallback if no materialRef)
  isComposite: boolean;                // true if heterostructure/composite
  parents: string[];                   // sampleId[] — lineage (0 = synthesized fresh, 1 = derived, N = composite)

  // Lineage (denormalized for query speed)
  rootMaterials: string[];             // materialId[] — flatten parent chain to root materials
  generation: number;                  // 0 = fresh synthesis, 1 = derived once, N = N-th generation

  // Origin
  synthesisExperimentRef?: string;     // FK → experiments/{id} (the experiment that created this sample)
  synthesisMethod?: string;            // "hydrothermal" | "sol-gel" | "CVD" | "annealing" | ...
  synthesisDate?: Timestamp;

  // Lifecycle
  status: SampleStatus;
  amount?: { value: number; unit: string };  // current amount, e.g., {value: 50, unit: "mg"}
  initialAmount?: { value: number; unit: string };  // amount at creation
  storageLocation?: string;            // "Tủ A1, ngăn 3"

  // Annotations
  notes?: string;
  tags: string[];                      // ["catalyst-test", "publish-2026", ...]

  // Audit
  tenantId: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

type SampleStatus =
  | "available"      // in storage, can be used
  | "in-use"         // currently in an experiment
  | "consumed"       // used up
  | "archived"       // retired but kept for records
  | "discarded";     // physical sample destroyed
```

**Lineage notes**:
- `parents = []` → fresh synthesis from raw materials
- `parents = [sampleA]` → derived (e.g., annealed version of sampleA)
- `parents = [sampleA, sampleB]` → composite (e.g., MoS2/WO3 heterojunction)
- `rootMaterials` denormalized for fast "show all samples derived from MoS2" queries
- `generation` enables "show only fresh syntheses" filters

### 3.3 Experiment (unified)

Replaces flat `hydro/`, `electrode/`, `electrochem/` collections. Migration is non-breaking via adapter (see §6).

```typescript
interface Experiment {
  // Identity
  id: string;                          // Firestore auto-ID
  code: string;                        // "HT-2026-05-09-001" auto-generated, follows existing convention
  type: ExperimentType;

  // Lineage
  inputSamples: string[];              // sampleId[] — samples consumed by this experiment
  outputSamples: string[];             // sampleId[] — samples produced by this experiment
  parentExperiment?: string;           // optional FK → experiments/{id} for derived experiments

  // Conditions (typed by experiment type, see below)
  conditions: ExperimentConditions;

  // Operator
  operatorId: string;                  // uid
  collaborators?: string[];            // uid[]
  performedAt: Timestamp;              // when experiment ran
  duration?: number;                   // ms — total time

  // Status
  status: "planned" | "in-progress" | "completed" | "failed" | "abandoned";

  // Results (high-level summary; raw data in dataAssets)
  derivedMetrics?: {                   // extracted/computed metrics
    [key: string]: any;                // e.g., { eta10_HER: 280, tafelSlope: 45, ... }
  };
  conclusion?: string;                 // freeform text

  // Backward compat
  legacyRef?: {
    collection: "hydro" | "electrode" | "electrochem";
    id: string;
  };

  // Annotations
  notes?: string;
  tags: string[];

  // Audit
  tenantId: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

type ExperimentType =
  | "synthesis"           // generic synthesis (replaces hydrothermal alone — extensible)
  | "hydrothermal"
  | "sol-gel"
  | "cvd"
  | "annealing"
  | "electrode-prep"
  | "ink-formulation"
  | "measurement"          // generic measurement (XRD, Raman, ...)
  | "electrochemistry"     // CV/LSV/EIS/Tafel/GCD
  | "characterization"     // SEM/TEM/XPS/UV-Vis/PL/FTIR
  | "compute"              // simulation (DFT, MD)
  | "other";

type ExperimentConditions = {
  // Common
  temperature?: { value: number; unit: "K" | "°C" };
  duration?: { value: number; unit: "min" | "h" };
  pressure?: { value: number; unit: "Pa" | "atm" | "bar" };
  pH?: number;
  atmosphere?: string;                  // "Ar" | "air" | "N2" | "vacuum"

  // Type-specific (extensible)
  [key: string]: any;
};
```

**Convention notes**:
- `code` field follows existing prefix pattern (HT/E/EC/INK) for backward compat
- `legacyRef` enables adapter to fallback to old collection during migration period
- `derivedMetrics` is loose object — full structured metrics live in `dataAssets[].derivedMetrics`
- Existing collections are NOT deleted — keep read-only forever for audit trail

### 3.4 DataAsset

Every measurement file, processed file, image, or report is an entity with metadata + lineage.

```typescript
interface DataAsset {
  // Identity
  id: string;                          // Firestore auto-ID
  filename: string;
  fileSize: number;                    // bytes

  // Classification
  type: DataAssetType;
  format: DataAssetFormat;

  // Storage
  storageUrl: string;                  // Firebase Storage URL
  contentType: string;                 // MIME

  // Lineage
  experimentRef: string;               // FK → experiments/{id} (required)
  sampleRef?: string;                  // FK → samples/{id} (denormalized for fast filter)
  parentAssetRef?: string;             // FK → dataAssets/{id} for processed files

  // Metadata
  metadata: {
    instrument?: string;               // "Bruker D8 Advance" or instrumentRef
    instrumentRef?: string;            // FK → instruments/{id} preferred
    instrumentSettings?: Record<string, any>;  // {scanRange, stepSize, ...}
    calibration?: { date: Timestamp; certificate?: string };
    units?: Record<string, string>;    // {x: "2θ°", y: "counts"}
    operator?: string;                 // uid
    measuredAt?: Timestamp;
    [key: string]: any;
  };

  // Processing history (append-only)
  processingHistory: {
    step: string;                      // "baseline-correct" | "smooth" | "fit-Voigt" | ...
    params: Record<string, any>;
    timestamp: Timestamp;
    by: string;                        // uid or "ai" for AI processing
    softwareVersion?: string;          // "labbook-v1.2.3"
  }[];

  // Derived metrics (extractable insights)
  derivedMetrics?: {
    bandgap?: number;
    eta10?: number;
    crystalliteSize?: number;
    [key: string]: any;
  };

  // Annotations
  notes?: string;
  tags: string[];

  // Audit
  tenantId: string;
  createdAt: Timestamp;
  createdBy: string;
}

type DataAssetType =
  | "raw"              // direct from instrument
  | "processed"        // baseline-corrected, smoothed, fit
  | "report"           // PDF report, lab notebook export
  | "image"            // sample photo, equipment photo, microscopy
  | "annotation"       // mark-up overlay, ROI selection
  | "other";

type DataAssetFormat =
  // Spectroscopy
  | "xrd" | "raman" | "uv-vis" | "pl" | "ir" | "ftir" | "xps" | "edx" | "nmr"
  // Electrochemistry
  | "cv" | "lsv" | "eis" | "gcd" | "tafel" | "ocp"
  // Microscopy
  | "sem" | "tem" | "afm" | "stm" | "optical"
  // General
  | "image" | "pdf" | "csv" | "txt" | "binary"
  | "other";
```

**Cross-experiment query pattern**:
```typescript
// "Find all CV measurements on samples derived from MoS2"
const mosSubsamples = await db.collection("samples")
  .where("rootMaterials", "array-contains", "mat-MoS2")
  .get();
const sampleIds = mosSubsamples.docs.map(d => d.id);

const cvAssets = await db.collection("dataAssets")
  .where("format", "==", "cv")
  .where("sampleRef", "in", sampleIds.slice(0, 30))  // Firestore in-limit
  .get();
```

This is the **killer query** that justifies entity-driven schema.

### 3.5 Instrument

Optional. Denormalized in `dataAssets.metadata.instrument` until populated.

```typescript
interface Instrument {
  id: string;
  name: string;                        // "XRD-1"
  model: string;                       // "Bruker D8 Advance"
  manufacturer: string;
  type: InstrumentType;
  location?: string;                   // building/room

  // Link to existing equipment booking system
  equipmentRef?: string;               // FK → equipment/{id} in RTDB

  // Calibration & maintenance
  calibrations: {
    date: Timestamp;
    by: string;                        // uid
    parameters?: Record<string, any>;
    certificateUrl?: string;
    nextDue?: Timestamp;
  }[];

  maintenance: {
    date: Timestamp;
    type: "preventive" | "corrective" | "calibration";
    description: string;
    by: string;
  }[];

  // Capabilities
  exportedFormats: string[];           // ["xy", "raw", "uxd", "txt"]
  supportedMeasurements: string[];     // ["xrd-bragg-brentano", "xrd-grazing-incidence"]

  // Status
  status: "operational" | "maintenance" | "broken" | "decommissioned";

  // Audit
  tenantId: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

type InstrumentType =
  | "xrd" | "raman" | "uv-vis" | "pl" | "ftir" | "xps"
  | "potentiostat" | "impedance"
  | "sem" | "tem" | "afm"
  | "balance" | "centrifuge" | "furnace" | "autoclave"
  | "other";
```

---

## 4. Entity Relationship (text diagram)

```
┌─────────────────┐
│   Material      │  (ontology, reference data)
│   formula: MoS2 │
└────────┬────────┘
         │ materialRef (1:N)
         │
┌────────▼────────────────┐                ┌──────────────────┐
│       Sample            │◀───────────────│   Sample         │
│  - parents: []          │ parents (N:N)  │  (parent)        │
│  - rootMaterials: [MoS2]│                └──────────────────┘
│  - status: available    │
└────────┬────────────────┘
         │ inputSamples (N:N)
         │ outputSamples (N:N)
         │
┌────────▼────────────────┐                ┌──────────────────┐
│      Experiment         │◀───────────────│   Experiment     │
│  - type: hydrothermal   │ parentExp (1:1)│   (parent)       │
│  - conditions: {...}    │                └──────────────────┘
│  - operatorId: uid      │
└────────┬────────────────┘
         │ experimentRef (1:N)
         │
┌────────▼────────────────┐                ┌──────────────────┐
│      DataAsset          │◀───────────────│   DataAsset      │
│  - type: raw            │ parentAsset    │   (raw, before   │
│  - format: xrd          │ (1:1)          │    processing)   │
│  - sampleRef: ...       │                └──────────────────┘
│  - metadata: {...}      │
│  - derivedMetrics: {...}│
└────────┬────────────────┘
         │ instrumentRef (N:1)
         │
┌────────▼────────────────┐
│     Instrument          │
│  - name: XRD-1          │
│  - model: Bruker D8     │
└─────────────────────────┘
```

**Key relationships**:
- Sample has 0..N parents (composite/derived)
- Sample is referenced by 0..N experiments as input or output
- Experiment has 1+ inputSamples or outputSamples
- DataAsset belongs to exactly 1 Experiment
- DataAsset can have parent DataAsset (processing chain)
- DataAsset references Instrument (optional)

---

## 5. Indexes (Firestore composite)

Pre-defined in `firestore.indexes.json` to enable cross-entity queries:

```json
{
  "indexes": [
    {
      "collectionGroup": "samples",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tenantId", "order": "ASCENDING"},
        {"fieldPath": "rootMaterials", "arrayConfig": "CONTAINS"},
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "samples",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tenantId", "order": "ASCENDING"},
        {"fieldPath": "parents", "arrayConfig": "CONTAINS"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "experiments",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tenantId", "order": "ASCENDING"},
        {"fieldPath": "type", "order": "ASCENDING"},
        {"fieldPath": "performedAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "experiments",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tenantId", "order": "ASCENDING"},
        {"fieldPath": "inputSamples", "arrayConfig": "CONTAINS"},
        {"fieldPath": "performedAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "dataAssets",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tenantId", "order": "ASCENDING"},
        {"fieldPath": "format", "order": "ASCENDING"},
        {"fieldPath": "sampleRef", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "dataAssets",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tenantId", "order": "ASCENDING"},
        {"fieldPath": "experimentRef", "order": "ASCENDING"},
        {"fieldPath": "type", "order": "ASCENDING"}
      ]
    }
  ]
}
```

**Index cost**: each composite index ~$0.18/GiB/month + write cost. For 10K samples, ~negligible (<$1/month).

---

## 6. Migration strategy

### 6.1 Adapter pattern (lazy migration)

`src/ts/firebase.ts` adds entity-aware helpers:

```typescript
// Reads experiment from new schema first, falls back to legacy
export async function getExperiment(id: string): Promise<Experiment | null> {
  // Try Firestore experiments/{id}
  const newDoc = await firestoreDb.collection("experiments").doc(id).get();
  if (newDoc.exists) return newDoc.data() as Experiment;

  // Fallback: search legacy by id across hydro/electrode/electrochem
  for (const legacyCol of ["hydro", "electrode", "electrochem"]) {
    const snap = await fbGet(`${legacyCol}/${id}`);
    if (snap) {
      // Synthesize Experiment from legacy data + cache to Firestore (lazy migration)
      const synthesized = adaptLegacyExperiment(legacyCol, id, snap);
      await firestoreDb.collection("experiments").doc(id).set(synthesized);
      return synthesized;
    }
  }

  return null;
}
```

### 6.2 Bulk migration script (opt-in)

Admin-only Cloud Function `migrateLegacyExperiments`:
- Idempotent (skip if already migrated to Firestore)
- Backup-first (write JSON dump of legacy collection before write)
- Dry-run mode + confirmation
- Rate-limited (Firestore write quotas, batch sizes)
- Progress UI

### 6.3 Forever read both

Legacy collections (`hydro/`, `electrode/`, `electrochem/`) stay in RTDB **forever** (read-only after R145). Reasons:
- Audit trail
- Worst-case rollback
- Existing references in `actionAudit/` won't break

Only NEW writes go to `experiments/` Firestore. Old reads merge from both.

---

## 7. Security rules

### 7.1 Firestore rules (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/labbook/documents {

    // Helpers
    function isSignedIn() {
      return request.auth != null;
    }
    function tenantMatch() {
      return request.auth.token.tenantId == resource.data.tenantId
        || request.auth.token.tenantId == request.resource.data.tenantId;
    }
    function isMember() {
      return isSignedIn() && tenantMatch()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
           in ['superadmin', 'admin', 'member'];
    }
    function isAdmin() {
      return isSignedIn() && tenantMatch()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
           in ['superadmin', 'admin'];
    }
    function isViewer() {
      return isSignedIn() && tenantMatch();
    }

    // Materials — read-public-within-tenant, admin-write
    match /materials/{materialId} {
      allow read: if isViewer();
      allow create, update: if isAdmin();
      allow delete: if false; // never delete, mark as deprecated instead
    }

    // Samples — member can CRUD own + read all
    match /samples/{sampleId} {
      allow read: if isViewer();
      allow create: if isMember()
        && request.resource.data.createdBy == request.auth.uid;
      allow update: if isMember()
        && (resource.data.createdBy == request.auth.uid || isAdmin());
      allow delete: if isAdmin();
    }

    // Experiments — same as samples
    match /experiments/{expId} {
      allow read: if isViewer();
      allow create: if isMember()
        && request.resource.data.createdBy == request.auth.uid;
      allow update: if isMember()
        && (resource.data.createdBy == request.auth.uid || isAdmin());
      allow delete: if isAdmin();
    }

    // DataAssets — same
    match /dataAssets/{assetId} {
      allow read: if isViewer();
      allow create: if isMember()
        && request.resource.data.createdBy == request.auth.uid;
      allow update: if isMember()
        && (resource.data.createdBy == request.auth.uid || isAdmin());
      allow delete: if isAdmin();
    }

    // Instruments — admin only
    match /instruments/{instId} {
      allow read: if isViewer();
      allow create, update, delete: if isAdmin();
    }
  }
}
```

### 7.2 Tenant claim setup

`tenantId` stored in Firebase Auth custom claim:
```typescript
// Cloud Function on user creation
admin.auth().setCustomUserClaims(uid, {
  tenantId: "default" // or specific tenant for SaaS
});
```

For lab BKU phase, all users get `tenantId: "default"`. Commercial fork later assigns actual tenant IDs.

---

## 8. Frontend components (R150-R154)

Plans, not code:

### R150 — Materials Browser

- Page: `/#/materials`
- List view: card grid by category (TMD, oxide, ...)
- Detail page: formula, properties, references (link to aiPapers), samples derived
- CRUD modal (admin only)
- Search by formula/name/aliases
- Connect with chemicals (existing) via formula match

### R151 — Sample Manager (the big one)

- Page: `/#/samples`
- List view: table with filters (material, status, generation, date range)
- Detail page:
  - Header: name, shortCode, status, amount, location
  - Composition: link to material(s)
  - Lineage tree: parents (visual graph), children (samples derived from this one)
  - Experiments: list of experiments using this sample (input/output)
  - DataAssets: thumbnail grid of measurements
  - Notes, tags
- Sample picker component (used in experiment forms)
- Create form: auto-name generator based on material + date

### R152 — Unified Experiments Page

- Existing pages (`hydroPage`, `electrodePage`, `electrochemPage`) STAY (legacy mode)
- New `experimentsPage` consolidated view:
  - Tabs: All / Synthesis / Electrochem / Characterization
  - Filter by inputSamples (sample picker)
  - Filter by tag, status, date range
  - Table with type-specific columns
- Detail page:
  - Conditions (typed by experiment type)
  - Input/output samples with picker
  - Linked dataAssets thumbnail grid
  - Operator, performedAt
  - Derived metrics summary
- Create form: branches by `type`, with type-specific condition fields

### R153 — DataAssets Manager

- Page: `/#/data-assets` or embedded in experiment detail
- List view: grouped by sample, by format, by experiment
- Detail view:
  - Plot preview (XRD plot, Raman plot, CV plot inline)
  - Metadata panel
  - Processing history timeline
  - Derived metrics table
  - Download original / processed
- Upload modal: file → auto-detect format → metadata form
- Cross-experiment search: "all CV on samples derived from MoS2"

### R154 — Lineage UI

- Visual graph (e.g., d3.js or simple HTML/CSS tree)
- Embedded in Sample detail, Experiment detail, DataAsset detail
- Expandable nodes
- Click node → navigate to entity

### R155 — Backward compat audit + bulk migration

- Audit checklist: all existing pages still work
- Bulk migration script (opt-in)
- Documentation update

---

## 9. AI integration (Phase B.6 trigger)

Once schema is in place, AI gains powerful capabilities:

- **searchSamples tool**: filter by material, status, date, lineage
- **getExperimentLineage tool**: trace sample creation chain
- **searchDataAssets tool**: cross-experiment query
- **AI provenance reasoning**: cite specific samples/experiments in answers

System prompt update (R146+):
```
Available data tools:
- searchSamples(material?, status?, dateRange?) → samples matching filter
- getSampleLineage(sampleId) → full ancestry + descendants
- searchDataAssets(format?, sampleRef?, ...) → measurement files
- getExperimentMetrics(expId) → derived metrics summary

When answering, cite specific samples by name and experiments by code.
```

---

## 10. Cost projection

### Lab BKU scale (current)

Assume 1 lab, 50 users, ~3 years operation:
- Samples: 5,000
- Experiments: 10,000
- DataAssets: 50,000
- Materials: 200

Firestore cost estimate (per month):
- Storage: ~500 MB → $0.09/month
- Reads (50 users × 100 reads/day): 150K/day → 4.5M/month → $1.62
- Writes: ~10K/month → $0.18
- Indexes overhead: ~$0.50
- **Total: ~$2.4/month** (within free tier headroom typical month)

### Commercial scale (100 labs, 1 year out)

100 labs × above = 100x → ~$240/month for Firestore alone. Add Auth, Functions, Storage, Hosting, Cloud Run (Python service if added) → likely $500-1000/month total at 100 labs. Pricing tier should easily cover ($30/lab/month × 100 = $3000 revenue).

→ Hybrid RTDB + Firestore is **economically sound** for commercial scale up to ~1000 labs without architecture change.

---

## 11. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Adapter layer bugs leak legacy data | Medium | High | Comprehensive integration tests, manual QA per page R145 |
| Firestore index limits (200/db) | Low | Medium | Plan indexes carefully, document each. Currently 6 indexes for new entities, well within limit |
| Lineage cycles (sample A parent of B parent of A) | Low | Medium | Validation in `createSample()`: walk parents recursively, reject if id appears |
| User confusion: 2 schemas during migration | Medium | Medium | UI shows badge "Migrated" / "Legacy"; clear messaging; eventual full migration |
| Heterostructure parent count >2 confuses users | Low | Low | UI: limit input to 2 parents in form; allow N via API for power users |
| Material formula uniqueness collision | Low | Medium | Index on `formula` per tenant; surface conflicts in UI |
| Cross-tenant data leak via shared materials | Medium | High | `tenantId` enforced on every entity, security rules check |

---

## 12. Open questions (resolve before R150)

- [ ] **Naming auto-generator algorithm**: Sample default name `{materialFormula}-batch-{YYYY-MM-DD}-{counter}` — confirm or alternative?
- [ ] **Experiment code prefix**: Keep HT/E/EC/INK or unify to single `EXP-{YYYY}-{counter}`?
- [ ] **Sample shortCode**: optional vs required vs auto-generated?
- [ ] **Material `formula` uniqueness**: globally unique or per-tenant?
- [ ] **DataAsset processing history immutability**: append-only via Cloud Function? Or trust client?
- [ ] **Migration batch size**: 100? 500? 1000? Affects rate limit + UX time
- [ ] **Permission model**: per-sample owner restriction OR lab-wide read/write?

---

## 13. Round breakdown (Phase B.5: R150-R155)

| Round | Scope | Effort | Dependencies |
|---|---|---|---|
| **R150** | Materials ontology + Firestore setup + Materials browser page | 3-5 days | Firestore rules deployed |
| **R151** | Samples collection + CRUD + Sample picker component + Sample detail page | 7-10 days | R150 done |
| **R152** | Experiments unified collection + adapter layer + Experiments page | 7-10 days | R151 done |
| **R153** | DataAssets collection + upload flow rewrite + cross-experiment search | 5-7 days | R152 done |
| **R154** | Lineage UI (visual graph) + integrated into Sample/Experiment/DataAsset details | 5-7 days | R151-R153 done |
| **R155** | Backward compat audit + bulk migration script + docs update | 3-5 days | All above |

**Total**: 30-44 days realistic (calendar, not full-time). Spread over 8-12 weeks given other work.

**Critical path**: R150 → R151 → R152 → R153 (must be sequential). R154 can overlap with R153 end.

**Risk buffer**: +20% for unknowns. Expect 10-14 weeks total.

---

## 14. Success criteria

R145 done when:
- ✅ All 5 entity collections deployed (materials, samples, experiments, dataAssets, instruments)
- ✅ Cross-experiment query works: "all XRD on MoS2 derivatives" returns correct results in <500ms
- ✅ Lineage UI displays sample → experiment → dataAsset chain correctly
- ✅ Existing pages (hydro, electrode, electrochem) continue working in legacy mode
- ✅ Adapter layer handles both new + legacy reads transparently
- ✅ Bulk migration script tested on staging, ready for opt-in production run
- ✅ Documentation: ARCHITECTURE.md, AI_ARCHITECTURE.md updated with new schema
- ✅ Firestore rules tested for tenant isolation
- ✅ AI gains 3 new tools: searchSamples, getSampleLineage, searchDataAssets

---

## 15. Decision log

- **2026-05-09 (R139)**: Approved hybrid RTDB + Firestore. Defer Postgres 12-18 months.
- **2026-05-09 (R139)**: Sample required for all experiments. Auto-name generator if missing.
- **2026-05-09 (R139)**: Multi-parent lineage (heterostructure support). N-parents allowed.
- **2026-05-09 (R139)**: Material entity medium depth (formula + category + knownProperties + references).
- **2026-05-09 (R139)**: All measurement files become DataAsset entities (no exception for plain images).
- **2026-05-09 (R139)**: Lazy migration + opt-in bulk. Legacy collections forever read-only after R145.
- **2026-05-09 (R139)**: Naming convention camelCase (Firestore convention).
- **2026-05-09 (R139)**: tenantId field on every entity for commercial-readiness.

---

## 16. References

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — overall system, especially RTDB schema + Firestore schema sections
- [`AI_ARCHITECTURE.md`](../AI_ARCHITECTURE.md) — AI integration, especially Section 5 (Agentic RAG) + 5.4 (Reality)
- [`commercial-roadmap.md`](./commercial-roadmap.md) — commercial fork planning, multi-tenancy
- [`ROADMAP.md`](../ROADMAP.md) — phase plan, Phase B.5 placement
- [Firestore composite index docs](https://firebase.google.com/docs/firestore/query-data/index-overview)
- [Firestore security rules docs](https://firebase.google.com/docs/firestore/security/get-started)

---

*This is a living document. Updates as design evolves through R140-R145 implementation.*

---

## 17. Long-term context

> Added R143 (May 10 2026) — sync với strategic vision report.

This Phase B.5 spec implements **Priority 1 (Unified Research Schema) + Priority 2 (Experiment Lineage)** từ `Labbook_Bku_Long_Term_Platform_Roadmap_Report.pdf`. See `docs/long-term-roadmap.md` for:

- 3-phase strategic vision (5-10 năm): Scientific SaaS → Research OS → Scientific Platform
- Mapping report priorities ↔ rounds
- Other priorities NOT in this spec but planned later:
  - **Priority 3** (Event-driven Architecture) → Phase B.6+
  - **Priority 4** (Internal REST APIs) → Phase B.7+
  - **Priority 5** (Plugin Architecture) → Phase C+
- Architecture evolution: frontend, backend (hybrid PostgreSQL long-term), scientific compute (Python services), AI layer
- Cross-cutting concerns: metadata quality, versioning, provenance tracking, observability, security & compliance
- Test strategy: phase-end (cuối Phase B.5 = sau R155)

**Round numbering note (R143)**: Phase B.5 originally drafted as R140-R145 nhưng Phase B AI work đã ship R140-R142 (docs A2, Chandra fix, BM25 indexPaper) before this spec started → renumbered R150-R155 to avoid conflict. R143-R149 reserved cho Phase B closure (test backfill, eval expansion, Chandra resilience, etc.).

