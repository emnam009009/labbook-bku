/**
 * tests/services/samples.test.ts — R151b
 *
 * Mock strategy: vi.mock("firebase/firestore") + vi.mock("../../src/ts/firebase")
 * (parallel materials.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type StoredDoc = { id: string; data: Record<string, any> };
let mockDocs: StoredDoc[] = [];

beforeEach(() => {
  mockDocs = [];
});

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
      const filters = q.__filters || [];
      let results = [...mockDocs];
      for (const f of filters) {
        if (f.type === "where") {
          if (f.op === "array-contains") {
            results = results.filter((d) =>
              Array.isArray(d.data[f.field]) && d.data[f.field].includes(f.value),
            );
          } else {
            results = results.filter((d) => d.data[f.field] === f.value);
          }
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
        docs: results.map((r) => ({ id: r.id, data: () => r.data })),
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
    where: vi.fn((field: string, op: string, value: any) => ({
      type: "where",
      field,
      op,
      value,
    })),
    orderBy: vi.fn((field: string, dir: "asc" | "desc" = "asc") => ({
      type: "orderBy",
      field,
      dir,
    })),
    limit: vi.fn((value: number) => ({ type: "limit", value })),
    serverTimestamp: vi.fn(() => Date.now()),
    Timestamp: { now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }) },
    connectFirestoreEmulator: vi.fn(),
  };
});

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

import {
  getSample,
  listSamples,
  listSamplesByRootMaterial,
  searchSamples,
  createSample,
  updateSample,
  setSampleStatus,
} from "../../src/ts/services/samples";

function seedSample(overrides: Partial<any> = {}): any {
  const base = {
    id: `smp-${Math.random().toString(36).slice(2, 8)}`,
    name: "MoS2-batch-2026-05-10-001",
    composition: "MoS2",
    isComposite: false,
    parents: [],
    rootMaterials: ["mat-MoS2"],
    generation: 0,
    status: "available",
    tags: [],
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

describe("getSample", () => {
  it("returns sample with matching tenantId", async () => {
    seedSample({ id: "smp-1", tenantId: "default" });
    const got = await getSample("smp-1", "default");
    expect(got).not.toBeNull();
    expect(got?.composition).toBe("MoS2");
  });

  it("returns null cross-tenant", async () => {
    seedSample({ id: "smp-1", tenantId: "tenant-A" });
    expect(await getSample("smp-1", "tenant-B")).toBeNull();
  });

  it("returns null for empty id", async () => {
    expect(await getSample("", "default")).toBeNull();
  });
});

describe("listSamples", () => {
  it("returns only matching tenant", async () => {
    seedSample({ tenantId: "default" });
    seedSample({ tenantId: "default" });
    seedSample({ tenantId: "other" });
    const got = await listSamples({ tenantId: "default" });
    expect(got).toHaveLength(2);
  });

  it("filters by status", async () => {
    seedSample({ status: "available" });
    seedSample({ status: "consumed" });
    const got = await listSamples({ status: "available" });
    expect(got).toHaveLength(1);
    expect(got[0].status).toBe("available");
  });

  it("filters by materialRef", async () => {
    seedSample({ materialRef: "mat-MoS2" });
    seedSample({ materialRef: "mat-WO3" });
    const got = await listSamples({ materialRef: "mat-MoS2" });
    expect(got).toHaveLength(1);
  });
});

describe("listSamplesByRootMaterial", () => {
  it("finds samples derived from root material", async () => {
    seedSample({ rootMaterials: ["mat-MoS2"] });
    seedSample({ rootMaterials: ["mat-MoS2", "mat-WO3"] });
    seedSample({ rootMaterials: ["mat-WO3"] });
    const got = await listSamplesByRootMaterial("mat-MoS2");
    expect(got).toHaveLength(2);
  });

  it("returns empty for missing material", async () => {
    seedSample({ rootMaterials: ["mat-MoS2"] });
    expect(await listSamplesByRootMaterial("mat-XYZ")).toHaveLength(0);
  });

  it("returns empty for empty id", async () => {
    expect(await listSamplesByRootMaterial("")).toEqual([]);
  });
});

describe("searchSamples", () => {
  it("matches by name", async () => {
    seedSample({ name: "MoS2-batch-001", composition: "MoS2" });
    seedSample({ name: "WS2-batch-001", composition: "WS2" });
    const got = await searchSamples("mos2");
    expect(got).toHaveLength(1);
    expect(got[0].composition).toBe("MoS2");
  });

  it("matches by shortCode", async () => {
    seedSample({ shortCode: "MS-007", name: "X", composition: "MoS2" });
    const got = await searchSamples("ms-007");
    expect(got).toHaveLength(1);
  });

  it("matches by tag", async () => {
    seedSample({ tags: ["catalyst-test"], composition: "MoS2" });
    const got = await searchSamples("catalyst");
    expect(got).toHaveLength(1);
  });

  it("returns empty for empty query", async () => {
    seedSample({ composition: "MoS2" });
    expect(await searchSamples("")).toEqual([]);
  });
});

describe("createSample", () => {
  it("creates with auto-generated name when not provided", async () => {
    const id = await createSample(
      { composition: "MoS2", materialRef: "mat-MoS2" },
      "uid-creator",
      "default",
    );
    const got = await getSample(id, "default");
    expect(got?.name).toMatch(/MoS2-batch-/);
    expect(got?.rootMaterials).toEqual(["mat-MoS2"]);
    expect(got?.status).toBe("available");
  });

  it("creates with explicit name", async () => {
    const id = await createSample(
      { name: "custom-name", composition: "WO3" },
      "uid-creator",
    );
    const got = await getSample(id);
    expect(got?.name).toBe("custom-name");
  });

  it("rejects when composition missing", async () => {
    await expect(
      createSample({ composition: "" } as any, "uid"),
    ).rejects.toThrow(/composition/);
  });

  it("rejects when uid missing", async () => {
    await expect(
      createSample({ composition: "X" }, ""),
    ).rejects.toThrow(/uid/);
  });
});

describe("updateSample", () => {
  it("updates patch fields + audit", async () => {
    seedSample({ id: "smp-1", notes: "old" });
    await updateSample("smp-1", { notes: "new" }, "uid-editor");
    const got = await getSample("smp-1");
    expect(got?.notes).toBe("new");
    expect(got?.updatedBy).toBe("uid-editor");
  });

  it("rejects when id missing", async () => {
    await expect(updateSample("", { notes: "x" }, "uid")).rejects.toThrow(/id/);
  });
});

describe("setSampleStatus", () => {
  it("changes status", async () => {
    seedSample({ id: "smp-1", status: "available" });
    await setSampleStatus("smp-1", "consumed", "uid");
    const got = await getSample("smp-1");
    expect(got?.status).toBe("consumed");
  });
});
