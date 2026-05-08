/**
 * Cost calculator — token → USD
 * Round 137b-eval+obs
 *
 * Pricing as of May 2026. Update when vendors change rates.
 * Centralized here so swapping models / changing prices is 1 file.
 */

export const PRICING = {
  // Voyage AI (https://docs.voyageai.com/docs/pricing)
  "voyage-3-large":    { inputPer1M: 0.18 },
  "voyage-3.5":        { inputPer1M: 0.06 },
  "voyage-3.5-lite":   { inputPer1M: 0.02 },
  "rerank-2.5":        { inputPer1M: 0.05 },
  "rerank-2.5-lite":   { inputPer1M: 0.02 },
  // Google Gemini (https://ai.google.dev/pricing)
  "gemini-2.0-flash":  { inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-2.5-flash":  { inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-2.5-pro":    { inputPer1M: 1.25,  outputPer1M: 5.00 },
} as const;

export type ModelId = keyof typeof PRICING;

export interface ModelCost {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
}

/**
 * Compute USD cost for a model invocation.
 * outputTokens is optional for embedding models.
 */
export function computeCost(
  model: ModelId,
  inputTokens: number,
  outputTokens: number = 0,
): ModelCost {
  const p: any = PRICING[model];
  const inputUsd = (inputTokens / 1_000_000) * (p.inputPer1M || 0);
  const outputUsd = (outputTokens / 1_000_000) * (p.outputPer1M || 0);
  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  };
}
