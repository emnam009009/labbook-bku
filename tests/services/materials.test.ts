/**
 * tests/services/materials.test.ts
 * Round 150b — Materials CRUD service unit tests.
 *
 * Strategy: vi.mock("firebase/firestore") at module level. Both this
 * test file and src/ts/services/materials.ts resolve the package from
 * root node_modules/firebase, so vi.mock intercepts both — unlike the
 * R145b case where functions/node_modules caused mock bypass.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────────────────────────────────────────────────────────
// Mock state — controlled per test
// ────────────────────────────────────────────────────────────
type StoredDoc = { id: string; data: Record<string, any> };
let mockDocs: StoredDoc[] = [];
let mockServerTimestamp: number = 0;

beforeEach(() => {
  mockDocs = [];
  mockServerTimestamp = Date.now();
});

// ────────────────────────────────────────────────────────────
// Mock firebase/firestore — must be declared before importing service
// ────────────────────────────────────────────────────────────
vi.mock("firebase/firestore", () => {
  return {
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn((_db: any, name: string) => ({ __collection: name })),
    doc: vi.fn((_db: any, _col: string, id?: string) => ({
      __id: id ?? `auto-${Math.random().toString(36).slice(2)}`,
    })),
    getDoc: vi.fn(async (ref: any) => {
      const found = mockDocs.find((d) => d.id === ref.__id);
      return {
        exists: () => !!found,
        data: () => (found ? found.data : undefined),
        id: ref.__id,
      };
    }),
    getDocs: vi.fn(async (q: any) => {
      // q is the query result of fsQuery() below — has filters attached
      const filters = q.__filters || [];
      let results = [...mockDocs];
      for (const f of filters) {
        if (f.type === "where") {
          results = results.filter((d) => d.data[f.field] === f.value);
        } else if (f.type === "limit") {
          results = results.slice(0, f.value);
        } else if (f.type === "orderBy") {
          results.sort((a, b) => {
            const av = a.data[f.field];
            const bv = b.data[f.field];
            if (av < bv) return f.dir === "desc" ? 1 : -1;
            if (av > bv) return f.dir === "desc" ? -1 : 1;
            return 0;
          });
        }
      }
      return {
        empty: results.length === 0,
        docs: results.map((r) => ({
          id: r.id,
          data: () => r.data,
        })),
      };
    }),
    setDoc: vi.fn(async (ref: any, data: any) => {
      mockDocs.push({ id: ref.__id, data });
    }),
    updateDoc: vi.fn(async (ref: any, patch: any) => {
      const found = mockDocs.find((d) => d.id === ref.__id);
      if (found) Object.assign(found.data, patch);
    }),
    query: vi.fn((col: any, ...constraints: any[]) => ({
      __collection: col.__collection,
      __filters: constraints,
    })),
    where: vi.fn((field: string, _op: string, value: any) => ({
      type: "where",
      field,
      value,
    })),
    orderBy: vi.fn((field: string, dir: "asc" | "desc" = "asc") => ({
      type: "orderBy",
      field,
      dir,
    })),
    limit: vi.fn((value: number) => ({ type: "limit", value })),
    serverTimestamp: vi.fn(() => mockServerTimestamp),
    Timestamp: { now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }) },
    connectFirestoreEmulator: vi.fn(),
  };
});

// Mock the firebase wrapper to skip its initializeApp side effects.
// Re-exports just delegate to firebase/firestore (which is mocked above).
vi.mock("../../src/ts/firebase", async () => {
  const fs = await import("firebase/firestore");
  return {
    fdb: {},
    collection: fs.collection,
    doc: fs.doc,
    getDoc: fs.getDoc,
    getDocs: fs.getDocs,
    setDoc: fs.setDoc,
    updateDoc: fs.updateDoc,
    fsQuery: (fs as any).query,
    where: fs.where,
    orderBy: fs.orderBy,
    fsLimit: (fs as any).limit,
    fsServerTimestamp: fs.serverTimestamp,
  };
});

// Import service AFTER mocks
import {
  getMaterial,
  listMaterials,
  searchMaterials,
  createMaterial,
  updateMaterial,
  checkFormulaExists,
} from "../../src/ts/domains/materials/service";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function seedMaterial(overrides: Partial<any> = {}): any {
  const base = {
    id: `mat-${Math.random().toString(36).slice(2, 8)}`,
    formula: "MoS2",
    name: "Molybdenum disulfide",
    aliases: [],  // R150b-fix1: was ["MoS₂"] — leaked into other materials
                  // when not overridden, causing search false-positives.
                  // Tests needing aliases must pass them explicitly.
    category: "TMD",
    knownProperties: { bandgap: 1.8 },
    references: [],
    tenantId: "default",
    createdAt: 0,
    createdBy: "uid-seed",
    updatedAt: 0,
    updatedBy: "uid-seed",
    ...overrides,
  };
  mockDocs.push({ id: base.id, data: base });
  return base;
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe("getMaterial", () => {
  it("returns material when id matches and tenantId matches", async () => {
    const seeded = seedMaterial({ id: "mat-MoS2", tenantId: "default" });
    const got = await getMaterial("mat-MoS2", "default");
    expect(got).not.toBeNull();
    expect(got?.formula).toBe(seeded.formula);
  });

  it("returns null for cross-tenant access (defense-in-depth)", async () => {
    seedMaterial({ id: "mat-MoS2", tenantId: "tenant-A" });
    const got = await getMaterial("mat-MoS2", "tenant-B");
    expect(got).toBeNull();
  });

  it("returns null when id missing or empty", async () => {
    expect(await getMaterial("", "default")).toBeNull();
  });
});

describe("listMaterials", () => {
  it("returns only materials for the given tenant", async () => {
    seedMaterial({ formula: "MoS2", tenantId: "default" });
    seedMaterial({ formula: "WS2", tenantId: "default" });
    seedMaterial({ formula: "WO3", tenantId: "other" });
    const got = await listMaterials({ tenantId: "default" });
    expect(got).toHaveLength(2);
    expect(got.every((m) => m.tenantId === "default")).toBe(true);
  });

  it("filters by category when provided", async () => {
    seedMaterial({ formula: "MoS2", category: "TMD", tenantId: "default" });
    seedMaterial({ formula: "WO3", category: "oxide", tenantId: "default" });
    const got = await listMaterials({ tenantId: "default", category: "TMD" });
    expect(got).toHaveLength(1);
    expect(got[0].formula).toBe("MoS2");
  });

  it("respects limit option", async () => {
    seedMaterial({ formula: "A1", tenantId: "default" });
    seedMaterial({ formula: "A2", tenantId: "default" });
    seedMaterial({ formula: "A3", tenantId: "default" });
    const got = await listMaterials({ tenantId: "default", limit: 2 });
    expect(got).toHaveLength(2);
  });
});

describe("searchMaterials", () => {
  it("matches by formula substring (case-insensitive)", async () => {
    seedMaterial({ formula: "MoS2", name: "Molybdenum disulfide", tenantId: "default" });
    seedMaterial({ formula: "WS2", name: "Tungsten disulfide", tenantId: "default" });
    const got = await searchMaterials("mos", { tenantId: "default" });
    expect(got.map((m) => m.formula)).toContain("MoS2");
    expect(got.map((m) => m.formula)).not.toContain("WS2");
  });

  it("matches by name", async () => {
    seedMaterial({ formula: "MoS2", name: "Molybdenum disulfide", tenantId: "default" });
    const got = await searchMaterials("molybdenum", { tenantId: "default" });
    expect(got).toHaveLength(1);
  });

  it("matches by alias", async () => {
    seedMaterial({
      formula: "MoS2",
      name: "Molybdenum disulfide",
      aliases: ["Molybdenite"],
      tenantId: "default",
    });
    const got = await searchMaterials("molybdenite", { tenantId: "default" });
    expect(got).toHaveLength(1);
  });

  it("returns empty array for empty query", async () => {
    seedMaterial({ formula: "MoS2", tenantId: "default" });
    const got = await searchMaterials("", { tenantId: "default" });
    expect(got).toEqual([]);
  });
});

describe("createMaterial", () => {
  it("creates with required fields and returns doc id", async () => {
    const id = await createMaterial(
      {
        formula: "WO3",
        name: "Tungsten trioxide",
        category: "oxide",
      },
      "uid-creator",
      "default",
    );
    expect(id).toMatch(/^mat-WO3-\d+$/);

    const got = await getMaterial(id, "default");
    expect(got?.formula).toBe("WO3");
    expect(got?.createdBy).toBe("uid-creator");
    expect(got?.tenantId).toBe("default");
  });

  it("rejects when formula is missing", async () => {
    await expect(
      createMaterial(
        { formula: "", name: "X", category: "other" },
        "uid",
        "default",
      ),
    ).rejects.toThrow(/formula and name/);
  });

  it("rejects when uid is missing", async () => {
    await expect(
      createMaterial(
        { formula: "X", name: "Y", category: "other" },
        "",
        "default",
      ),
    ).rejects.toThrow(/authenticated uid/);
  });
});

describe("updateMaterial", () => {
  it("updates patch fields + refreshes updatedAt and updatedBy", async () => {
    seedMaterial({ id: "mat-WO3", name: "Old", tenantId: "default" });
    await updateMaterial("mat-WO3", { name: "New name" }, "uid-editor");
    const got = await getMaterial("mat-WO3", "default");
    expect(got?.name).toBe("New name");
    expect(got?.updatedBy).toBe("uid-editor");
  });

  it("rejects when id missing", async () => {
    await expect(updateMaterial("", { name: "X" }, "uid")).rejects.toThrow(/id/);
  });
});

describe("checkFormulaExists", () => {
  it("returns true when formula exists for tenant", async () => {
    seedMaterial({ formula: "MoS2", tenantId: "default" });
    expect(await checkFormulaExists("MoS2", "default")).toBe(true);
  });

  it("returns false when formula doesn't exist", async () => {
    seedMaterial({ formula: "MoS2", tenantId: "default" });
    expect(await checkFormulaExists("NbSe2", "default")).toBe(false);
  });

  it("returns false when formula exists in different tenant", async () => {
    seedMaterial({ formula: "MoS2", tenantId: "tenant-A" });
    expect(await checkFormulaExists("MoS2", "tenant-B")).toBe(false);
  });

  it("returns false for empty formula", async () => {
    expect(await checkFormulaExists("", "default")).toBe(false);
  });
});
