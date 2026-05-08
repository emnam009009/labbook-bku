/**
 * Trace sink — pluggable storage for traces
 * Round 137b-eval+obs
 *
 * Interface allows future migration to BigQuery (Option B) for SaaS scale
 * without changing tracer call sites.
 */

import type { Trace } from "./types";

export interface TraceSink {
  /**
   * Persist a completed trace. Should be fire-and-forget — caller awaits
   * but errors must NOT propagate (observability must never break business
   * logic). Implementation logs failures internally.
   */
  write(trace: Trace): Promise<void>;
}

const TRACES_COLLECTION = "aiTraces";

/**
 * Default implementation: writes to Firestore aiTraces collection.
 * Document ID = traceId (ULID-style, sortable).
 */
export class FirestoreTraceSink implements TraceSink {
  constructor(private firestore: any) {}

  async write(trace: Trace): Promise<void> {
    try {
      await this.firestore
        .collection(TRACES_COLLECTION)
        .doc(trace.traceId)
        .set(trace);
    } catch (e) {
      // Never let observability break the request
      // eslint-disable-next-line no-console
      console.warn(`[trace-sink] failed to persist trace ${trace.traceId}:`, String(e));
    }
  }
}

/**
 * No-op sink for testing / when sink unavailable.
 */
export class NoopTraceSink implements TraceSink {
  async write(_trace: Trace): Promise<void> { /* no-op */ }
}
