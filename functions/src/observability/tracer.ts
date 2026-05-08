/**
 * Tracer — request lifecycle instrumentation
 * Round 137b-eval+obs
 *
 * Usage:
 *   const tracer = createTracer({ endpoint: "searchPapers", userId, ... });
 *   tracer.setQuery("cyclic voltammetry");
 *   await tracer.span("embed", async () => { ... });
 *   tracer.recordCost("voyage-3-large", { inputTokens: 5 });
 *   await tracer.finish(sink, { status: "ok" });
 *
 * Spans run inline; no async overhead until finish().
 */

import { createHash, randomUUID } from "crypto";
import type { Trace, Span, SpanStatus, CostBreakdown } from "./types";
import type { TraceSink } from "./trace-sink";
import { computeCost, type ModelId } from "./cost-calculator";

export interface TracerInit {
  endpoint: string;
  userId: string;
  tenantId?: string;
  attributes?: Record<string, unknown>;
}

export class Tracer {
  readonly traceId: string;
  private startedAt: number;
  private spans: Span[] = [];
  private cost: CostBreakdown = {
    embedTokens: 0, embedUsd: 0,
    llmInputTokens: 0, llmOutputTokens: 0, llmUsd: 0,
    rerankTokens: 0, rerankUsd: 0,
    totalUsd: 0,
  };
  private queryPreview = "";
  private queryHash = "";
  private finished = false;

  constructor(private init: TracerInit) {
    // ULID-style: timestamp prefix (sortable) + random suffix
    const ts = Date.now().toString(36).padStart(10, "0");
    const rand = randomUUID().replace(/-/g, "").slice(0, 12);
    this.traceId = `${ts}-${rand}`;
    this.startedAt = Date.now();
  }

  /**
   * Record query for tracing. Stores preview + hash, never full text.
   */
  setQuery(query: string): void {
    this.queryPreview = query.slice(0, 100);
    this.queryHash = "sha256:" + createHash("sha256").update(query).digest("hex").slice(0, 16);
  }

  /**
   * Wrap an async operation in a span.
   * Captures duration, success/failure, and optional metadata.
   */
  async span<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const startMs = Date.now() - this.startedAt;
    try {
      const result = await fn();
      const durMs = Date.now() - this.startedAt - startMs;
      this.spans.push({ name, startMs, durMs, status: "ok", metadata });
      return result;
    } catch (e: any) {
      const durMs = Date.now() - this.startedAt - startMs;
      this.spans.push({
        name, startMs, durMs, status: "error",
        metadata,
        errorMessage: String(e?.message || e).slice(0, 200),
      });
      throw e;
    }
  }

  /**
   * Record a span manually (when fn-wrapping isn't ergonomic).
   */
  recordSpan(name: string, durMs: number, status: SpanStatus = "ok", metadata?: Record<string, unknown>): void {
    const startMs = Date.now() - this.startedAt - durMs;
    this.spans.push({ name, startMs: Math.max(0, startMs), durMs, status, metadata });
  }

  /**
   * Track cost from a model invocation. Aggregates into total.
   */
  recordCost(
    model: ModelId,
    tokens: { inputTokens: number; outputTokens?: number },
    category: "embed" | "llm" | "rerank" = "llm",
  ): void {
    const cost = computeCost(model, tokens.inputTokens, tokens.outputTokens || 0);
    if (category === "embed") {
      this.cost.embedTokens += tokens.inputTokens;
      this.cost.embedUsd += cost.totalUsd;
    } else if (category === "rerank") {
      this.cost.rerankTokens += tokens.inputTokens;
      this.cost.rerankUsd += cost.totalUsd;
    } else {
      this.cost.llmInputTokens += tokens.inputTokens;
      this.cost.llmOutputTokens += tokens.outputTokens || 0;
      this.cost.llmUsd += cost.totalUsd;
    }
    this.cost.totalUsd += cost.totalUsd;
  }

  /**
   * Finalize trace and persist via sink.
   * Idempotent — safe to call multiple times (no-op after first).
   * Fire-and-forget at sink level (sink swallows write errors).
   */
  async finish(
    sink: TraceSink,
    opts: { status: SpanStatus; errorMessage?: string } = { status: "ok" },
  ): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const trace: Trace = {
      traceId: this.traceId,
      endpoint: this.init.endpoint,
      userId: this.init.userId,
      tenantId: this.init.tenantId || "default",
      queryPreview: this.queryPreview,
      queryHash: this.queryHash,
      attributes: this.init.attributes || {},
      totalMs: Date.now() - this.startedAt,
      status: opts.status,
      spans: this.spans,
      cost: this.cost,
      errorMessage: opts.errorMessage,
      createdAt: Date.now(),
    };
    await sink.write(trace);
  }
}

export function createTracer(init: TracerInit): Tracer {
  return new Tracer(init);
}
