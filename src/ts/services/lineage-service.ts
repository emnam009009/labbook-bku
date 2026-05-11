/**
 * lineage-service.ts — Build lineage graph data for a single experiment.
 *
 * Returns nodes + edges in D3-friendly format.
 *
 * Node types: 'material' | 'sample' | 'experiment' | 'dataasset'
 * Edge types: 'composed_of' | 'parent' | 'input' | 'output' | 'attached'
 *
 * Round R154-1 — Phase B.5
 */

import {
  collection, doc, getDoc, getDocs, query, where,
} from "firebase/firestore";
import { fdb } from "../firebase.js";
import { listByExperiment } from "./data-assets.js";
import type { Experiment, Sample, Material, DataAsset } from "@/shared/domain";

export type LineageNodeType = 'material' | 'sample' | 'experiment' | 'dataasset';
export type LineageEdgeType = 'composed_of' | 'parent' | 'input' | 'output' | 'attached';

export interface LineageNode {
  id: string;        // unique node ID (prefix-uuid for namespacing)
  refId: string;     // actual entity ID for click navigation
  type: LineageNodeType;
  label: string;
  sublabel?: string;
  isCenter?: boolean; // The experiment being viewed (highlight)
}

export interface LineageEdge {
  source: string;
  target: string;
  type: LineageEdgeType;
  label?: string;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

const TENANT_ID = "default";

// R154-1-fix1: Session-level cache (in-memory, persists during page session)
const _sampleCache = new Map<string, Sample | null>();
const _materialCache = new Map<string, Material | null>();

async function fetchSample(sampleId: string): Promise<Sample | null> {
  if (_sampleCache.has(sampleId)) return _sampleCache.get(sampleId)!;
  try {
    const snap = await getDoc(doc(fdb, "samples", sampleId));
    const result = snap.exists() ? ({ id: snap.id, ...snap.data() } as Sample) : null;
    _sampleCache.set(sampleId, result);
    return result;
  } catch (err) {
    console.warn('[lineage] fetchSample failed', sampleId, err);
    _sampleCache.set(sampleId, null);
    return null;
  }
}

async function fetchMaterial(materialId: string): Promise<Material | null> {
  if (_materialCache.has(materialId)) return _materialCache.get(materialId)!;
  try {
    const snap = await getDoc(doc(fdb, "materials", materialId));
    const result = snap.exists() ? ({ id: snap.id, ...snap.data() } as Material) : null;
    _materialCache.set(materialId, result);
    return result;
  } catch (err) {
    console.warn('[lineage] fetchMaterial failed', materialId, err);
    _materialCache.set(materialId, null);
    return null;
  }
}

/**
 * Public API to clear cache (e.g., after entity edits).
 */
export function clearLineageCache(): void {
  _sampleCache.clear();
  _materialCache.clear();
}

/**
 * Fetch samples produced by an experiment (synthesisExperimentRef points back).
 */
async function fetchOutputSamples(experimentId: string): Promise<Sample[]> {
  try {
    const q = query(
      collection(fdb, "samples"),
      where("tenantId", "==", TENANT_ID),
      where("synthesisExperimentRef", "==", experimentId),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Sample));
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('NOT_FOUND')) return [];
    console.warn('[lineage] fetchOutputSamples failed', err);
    return [];
  }
}

/**
 * Build graph from an experiment.
 * Includes: experiment center node, input samples + their materials + their parents (1 hop),
 * output samples (derived experiments not included), dataAssets attached.
 */
export async function buildLineageGraph(experiment: Experiment): Promise<LineageGraph> {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const seenNodes = new Set<string>();

  function addNode(n: LineageNode): void {
    if (seenNodes.has(n.id)) return;
    seenNodes.add(n.id);
    nodes.push(n);
  }

  // 1. Center experiment node
  const expNodeId = `exp:${experiment.id}`;
  addNode({
    id: expNodeId,
    refId: experiment.id,
    type: 'experiment',
    label: experiment.code || experiment.id,
    sublabel: experiment.type,
    isCenter: true,
  });

  // 2. Input samples (parallel fetch + their materials + 1-hop parent samples)
  const inputIds = experiment.inputSamples || [];
  const inputSamples = await Promise.all(inputIds.map(fetchSample));
  const validInputs = inputSamples.filter((s): s is Sample => s != null);

  // Collect all material + parent sample IDs to fetch in parallel
  const materialIds = new Set<string>();
  const parentIds = new Set<string>();
  for (const s of validInputs) {
    if (s.materialRef) materialIds.add(s.materialRef);
    for (const pid of (s.parents || []).slice(0, 3)) parentIds.add(pid);
  }

  // Fetch all in parallel
  const [materialMap, parentMap] = await Promise.all([
    Promise.all([...materialIds].map(async id => [id, await fetchMaterial(id)] as const))
      .then(arr => new Map(arr)),
    Promise.all([...parentIds].map(async id => [id, await fetchSample(id)] as const))
      .then(arr => new Map(arr)),
  ]);

  for (const s of validInputs) {
    const sId = `smp:${s.id}`;
    addNode({
      id: sId,
      refId: s.id,
      type: 'sample',
      label: s.shortCode || s.name || s.id.slice(0, 8),
      sublabel: s.composition,
    });
    edges.push({ source: sId, target: expNodeId, type: 'input' });

    if (s.materialRef) {
      const m = materialMap.get(s.materialRef);
      if (m) {
        const mId = `mat:${m.id}`;
        addNode({
          id: mId,
          refId: m.id,
          type: 'material',
          label: m.formula || m.id.slice(0, 8),
          sublabel: m.formula,
        });
        edges.push({ source: mId, target: sId, type: 'composed_of' });
      }
    }

    for (const pid of (s.parents || []).slice(0, 3)) {
      const p = parentMap.get(pid);
      if (!p) continue;
      const pId = `smp:${p.id}`;
      addNode({
        id: pId,
        refId: p.id,
        type: 'sample',
        label: p.shortCode || p.name || p.id.slice(0, 8),
        sublabel: p.composition,
      });
      edges.push({ source: pId, target: sId, type: 'parent' });
    }
  }

  // 3. Output samples (produced by this experiment, parallel fetch)
  const outputSamples = await fetchOutputSamples(experiment.id);
  const fetchedOutputIds = new Set(outputSamples.map(s => s.id));
  const missingOutputIds = (experiment.outputSamples || []).filter(id => !fetchedOutputIds.has(id));
  if (missingOutputIds.length > 0) {
    const missingSamples = await Promise.all(missingOutputIds.map(fetchSample));
    for (const s of missingSamples) if (s) outputSamples.push(s);
  }
  for (const s of outputSamples) {
    const sId = `smp:${s.id}`;
    addNode({
      id: sId,
      refId: s.id,
      type: 'sample',
      label: s.shortCode || s.name || s.id.slice(0, 8),
      sublabel: s.composition,
    });
    edges.push({ source: expNodeId, target: sId, type: 'output' });
  }

  // 4. DataAssets attached
  const dataAssets: DataAsset[] = await listByExperiment(experiment.id);
  for (const da of dataAssets) {
    const daId = `da:${da.id}`;
    addNode({
      id: daId,
      refId: da.id,
      type: 'dataasset',
      label: da.fileName.length > 25 ? da.fileName.slice(0, 22) + '...' : da.fileName,
      sublabel: da.type,
    });
    edges.push({ source: expNodeId, target: daId, type: 'attached' });
  }

  return { nodes, edges };
}


// ═══════════════════════════════════════════════════════════
// R154-2a — Full lab lineage (all entities)
// ═══════════════════════════════════════════════════════════

/**
 * Build a complete lineage graph for the whole tenant: all materials,
 * samples, experiments, and dataAssets with their relationships.
 *
 * Performance: 1 query per collection (4 queries total).
 * Each entity becomes a node; edges are derived from foreign keys.
 *
 * For lab BKU scale (~10-100 entities), this is instant.
 * For commercial scale (>1000), use buildFilteredLineageGraph (R154-2b).
 */
export async function buildFullLineageGraph(): Promise<LineageGraph> {
  const nodes: LineageNode[] = [];
  const edges: LineageEdge[] = [];
  const seenNodes = new Set<string>();

  function addNode(n: LineageNode): void {
    if (seenNodes.has(n.id)) return;
    seenNodes.add(n.id);
    nodes.push(n);
  }

  // Fetch all 4 collections in parallel
  const [matSnap, smpSnap, expSnap, daSnap] = await Promise.all([
    getDocs(query(collection(fdb, "materials"), where("tenantId", "==", TENANT_ID))).catch(() => null),
    getDocs(query(collection(fdb, "samples"), where("tenantId", "==", TENANT_ID))).catch(() => null),
    getDocs(query(collection(fdb, "experiments"), where("tenantId", "==", TENANT_ID))).catch(() => null),
    getDocs(query(collection(fdb, "dataAssets"), where("tenantId", "==", TENANT_ID))).catch(() => null),
  ]);

  const materials = matSnap ? matSnap.docs.map(d => ({ id: d.id, ...d.data() } as Material)) : [];
  const samples = smpSnap ? smpSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sample)) : [];
  const experiments = expSnap ? expSnap.docs.map(d => ({ id: d.id, ...d.data() } as Experiment)) : [];
  const dataAssets = daSnap ? daSnap.docs.map(d => ({ id: d.id, ...d.data() } as DataAsset)) : [];

  // 1. Material nodes
  for (const m of materials) {
    addNode({
      id: `mat:${m.id}`,
      refId: m.id,
      type: 'material',
      label: m.formula || m.id.slice(0, 8),
      sublabel: m.formula,
    });
  }

  // 2. Sample nodes + composed_of edges
  for (const s of samples) {
    const sId = `smp:${s.id}`;
    addNode({
      id: sId,
      refId: s.id,
      type: 'sample',
      label: s.shortCode || s.name || s.id.slice(0, 8),
      sublabel: s.composition,
    });
    // Material → Sample edge
    if (s.materialRef && seenNodes.has(`mat:${s.materialRef}`)) {
      edges.push({ source: `mat:${s.materialRef}`, target: sId, type: 'composed_of' });
    }
    // Parent samples
    for (const pid of s.parents || []) {
      if (seenNodes.has(`smp:${pid}`)) {
        edges.push({ source: `smp:${pid}`, target: sId, type: 'parent' });
      }
    }
  }

  // 3. Experiment nodes + input/output edges
  for (const e of experiments) {
    const eId = `exp:${e.id}`;
    addNode({
      id: eId,
      refId: e.id,
      type: 'experiment',
      label: e.code || e.id.slice(0, 8),
      sublabel: e.type,
    });
    for (const sid of e.inputSamples || []) {
      if (seenNodes.has(`smp:${sid}`)) {
        edges.push({ source: `smp:${sid}`, target: eId, type: 'input' });
      }
    }
    for (const sid of e.outputSamples || []) {
      if (seenNodes.has(`smp:${sid}`)) {
        edges.push({ source: eId, target: `smp:${sid}`, type: 'output' });
      }
    }
  }

  // 4. DataAsset nodes + attached edges
  for (const da of dataAssets) {
    const daId = `da:${da.id}`;
    addNode({
      id: daId,
      refId: da.id,
      type: 'dataasset',
      label: da.fileName.length > 25 ? da.fileName.slice(0, 22) + '...' : da.fileName,
      sublabel: da.type,
    });
    if (seenNodes.has(`exp:${da.experimentId}`)) {
      edges.push({ source: `exp:${da.experimentId}`, target: daId, type: 'attached' });
    }
  }

  return { nodes, edges };
}
