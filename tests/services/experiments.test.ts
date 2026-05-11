/**
 * tests/services/experiments.test.ts — R152b
 *
 * Mock pattern: vi.mock("firebase/firestore") + vi.mock("../../src/ts/firebase")
 * Legacy RTDB adapter logic NOT covered by tests (defensive, manual smoke).
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
      type: "where", field, op, value,
    })),
    orderBy: vi.fn((field: string, dir: "asc" | "desc" = "asc") => ({
      type: "orderBy", field, dir,
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
    // Mock fbGet to always return null — legacy adapter not tested
    fbGet: vi.fn(async (_path: string) => null),
  };
});

import {
  getExperiment,
  listExperiments,
  listExperimentsBySample,
  getExperimentMerged,
  createExperiment,
  updateExperiment,
  setExperimentStatus,
} from "../../src/ts/domains/experiments/service";

function seedExperiment(overrides: Partial<any> = {}): any {
  const base = {
    id: `exp-${Math.random().toString(36).slice(2, 8)}`,
    code: "HT-2026-05-10-001",
    type: "hydrothermal",
    inputSamples: [],
    outputSamples: [],
    conditions: {},
    operatorId: "uid-seed",
    performedAt: 0,
    status: "completed",
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

describe("getExperiment", () => {
  it("returns matching tenantId", async () => {
    seedExperiment({ id: "exp-1", code: "HT-001" });
    const got = await getExperiment("exp-1", "default");
    expect(got).not.toBeNull();
    expect(got?.code).toBe("HT-001");
  });

  it("returns null cross-tenant", async () => {
    seedExperiment({ id: "exp-1", tenantId: "other" });
    expect(await getExperiment("exp-1", "default")).toBeNull();
  });

  it("returns null for empty id", async () => {
    expect(await getExperiment("", "default")).toBeNull();
  });
});

describe("listExperiments", () => {
  it("filters by tenant", async () => {
    seedExperiment({ tenantId: "default" });
    seedExperiment({ tenantId: "default" });
    seedExperiment({ tenantId: "other" });
    const got = await listExperiments({ tenantId: "default" });
    expect(got).toHaveLength(2);
  });

  it("filters by type", async () => {
    seedExperiment({ type: "hydrothermal" });
    seedExperiment({ type: "electrochemistry" });
    const got = await listExperiments({ type: "hydrothermal" });
    expect(got).toHaveLength(1);
  });

  it("filters by status", async () => {
    seedExperiment({ status: "completed" });
    seedExperiment({ status: "failed" });
    const got = await listExperiments({ status: "completed" });
    expect(got).toHaveLength(1);
  });

  it("filters by operatorId", async () => {
    seedExperiment({ operatorId: "uid-A" });
    seedExperiment({ operatorId: "uid-B" });
    const got = await listExperiments({ operatorId: "uid-A" });
    expect(got).toHaveLength(1);
  });
});

describe("listExperimentsBySample", () => {
  it("finds experiments with sample as input", async () => {
    seedExperiment({ id: "exp-1", inputSamples: ["smp-1"] });
    seedExperiment({ id: "exp-2", outputSamples: ["smp-1"] });
    seedExperiment({ id: "exp-3", inputSamples: ["smp-other"] });
    const got = await listExperimentsBySample("smp-1");
    expect(got).toHaveLength(2);
    expect(got.map((e) => e.id).sort()).toEqual(["exp-1", "exp-2"]);
  });

  it("returns empty for empty id", async () => {
    expect(await listExperimentsBySample("")).toEqual([]);
  });

  it("deduplicates if sample is both input and output (rare)", async () => {
    seedExperiment({ id: "exp-1", inputSamples: ["smp-1"], outputSamples: ["smp-1"] });
    const got = await listExperimentsBySample("smp-1");
    expect(got).toHaveLength(1);
  });
});

describe("getExperimentMerged (Firestore branch only)", () => {
  it("returns Firestore experiment when found", async () => {
    seedExperiment({ id: "exp-1", code: "HT-merged" });
    const got = await getExperimentMerged("exp-1", "default");
    expect(got).not.toBeNull();
    expect(got?.code).toBe("HT-merged");
    expect(got?.legacyRef).toBeUndefined();
  });

  it("returns null when not in Firestore (mock fbGet returns null)", async () => {
    expect(await getExperimentMerged("nonexistent", "default")).toBeNull();
  });
});

describe("createExperiment", () => {
  it("creates with auto-generated code", async () => {
    const id = await createExperiment(
      { type: "hydrothermal" },
      "uid-creator",
      "default",
    );
    const got = await getExperiment(id);
    expect(got?.type).toBe("hydrothermal");
    expect(got?.code).toMatch(/^HT-/);
    expect(got?.status).toBe("completed");
  });

  it("creates with explicit code", async () => {
    const id = await createExperiment(
      { type: "electrochemistry", code: "EC-CUSTOM-001" },
      "uid",
    );
    const got = await getExperiment(id);
    expect(got?.code).toBe("EC-CUSTOM-001");
  });

  it("rejects when type missing", async () => {
    await expect(
      createExperiment({} as any, "uid"),
    ).rejects.toThrow(/type/);
  });

  it("rejects when uid missing", async () => {
    await expect(
      createExperiment({ type: "hydrothermal" }, ""),
    ).rejects.toThrow(/uid/);
  });
});

describe("updateExperiment", () => {
  it("updates patch + audit", async () => {
    seedExperiment({ id: "exp-1", notes: "old" });
    await updateExperiment("exp-1", { notes: "new" }, "uid-editor");
    const got = await getExperiment("exp-1");
    expect(got?.notes).toBe("new");
    expect(got?.updatedBy).toBe("uid-editor");
  });

  it("rejects when id missing", async () => {
    await expect(updateExperiment("", { notes: "x" }, "uid")).rejects.toThrow(/id/);
  });
});

describe("setExperimentStatus", () => {
  it("changes status", async () => {
    seedExperiment({ id: "exp-1", status: "in-progress" });
    await setExperimentStatus("exp-1", "completed", "uid");
    const got = await getExperiment("exp-1");
    expect(got?.status).toBe("completed");
  });
});
