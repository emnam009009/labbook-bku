/**
 * BM25 — Corpus stats updater
 * Round 137a
 *
 * Stores corpus-wide statistics for BM25 scoring at runtime:
 * - totalDocs, avgDocLength
 * - documentFrequency map (token → # docs containing it)
 *
 * Sharding:
 *   Firestore doc max 1MB. With vocab ~50K words × ~30 bytes = 1.5MB,
 *   we may exceed. Strategy:
 *   - Try to fit in single global doc.
 *   - If size > 800KB, shard df map across df-shard-{N} sub-docs.
 *
 * For R137a we keep simple: single doc. Sharding TODO when corpus grows.
 *
 * Concurrency:
 *   Stats updates use Firestore transactions to avoid lost writes
 *   when multiple chunks tokenize in parallel.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { CorpusStats, TokenizeResult, Language } from "./types";
import {
  CORPUS_STATS_COLLECTION,
  CORPUS_STATS_DOC,
  TOKENIZER_VERSION,
  DEFAULT_K1,
  DEFAULT_B,
} from "./types";

function emptyStats(): CorpusStats {
  return {
    totalDocs: 0,
    totalDocsByLanguage: { en: 0, vi: 0, mixed: 0 },
    avgDocLength: 0,
    avgDocLengthByLanguage: { en: 0, vi: 0, mixed: 0 },
    vocabularySize: 0,
    documentFrequency: {},
    k1: DEFAULT_K1,
    b: DEFAULT_B,
    lastUpdatedAt: 0,
    tokenizerVersion: TOKENIZER_VERSION,
    dfSharded: false,
    dfShardCount: 0,
    synonymDictVersion: 0,
  };
}

/**
 * Apply a batch of tokenize results to corpus stats in a transaction.
 *
 * @param db        Firestore instance
 * @param results   List of TokenizeResult from tokenized chunks
 * @param mode      "add" → new chunks; "remove" → deleted chunks
 *                  "replace" → re-tokenized (caller passes both old & new)
 *
 * For replace mode, pass both `removed` (old tokenize results) and `results`.
 */
export async function updateCorpusStats(
  db: Firestore,
  results: TokenizeResult[],
  mode: "add" | "remove" = "add",
): Promise<void> {
  if (results.length === 0) return;

  const ref = db.collection(CORPUS_STATS_COLLECTION).doc(CORPUS_STATS_DOC);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stats: CorpusStats = snap.exists ? (snap.data() as CorpusStats) : emptyStats();

    const sign = mode === "add" ? 1 : -1;
    let totalLengthDelta = 0;
    const lengthByLang: Record<Language, number> = { en: 0, vi: 0, mixed: 0 };
    const docsByLang: Record<Language, number> = { en: 0, vi: 0, mixed: 0 };

    for (const r of results) {
      stats.totalDocs += sign * 1;
      totalLengthDelta += sign * r.docLength;
      lengthByLang[r.language] += sign * r.docLength;
      docsByLang[r.language] += sign * 1;
      stats.totalDocsByLanguage[r.language] =
        (stats.totalDocsByLanguage[r.language] || 0) + sign * 1;

      // DF update — token appears in this doc once for DF purposes
      for (const token of r.tokens) {
        const cur = stats.documentFrequency[token] || 0;
        const next = cur + sign * 1;
        if (next <= 0) {
          delete stats.documentFrequency[token];
        } else {
          stats.documentFrequency[token] = next;
        }
      }
    }

    // Recompute avgDocLength from running totals
    // Strategy: store sum, derive avg. We do it via incremental tracking:
    //   newSum = oldSum + delta
    //   newAvg = newSum / newTotal
    // We don't persist the sum, so we reconstruct: oldSum = oldAvg * oldTotal
    const prevTotal = stats.totalDocs - results.length * sign;
    const prevSum = (stats.avgDocLength || 0) * prevTotal;
    const newSum = prevSum + totalLengthDelta;
    stats.avgDocLength = stats.totalDocs > 0 ? newSum / stats.totalDocs : 0;

    // Same for per-language averages
    for (const lang of ["en", "vi", "mixed"] as Language[]) {
      const prevLangTotal = stats.totalDocsByLanguage[lang] - docsByLang[lang];
      const prevLangSum = (stats.avgDocLengthByLanguage[lang] || 0) * prevLangTotal;
      const newLangSum = prevLangSum + lengthByLang[lang];
      stats.avgDocLengthByLanguage[lang] =
        stats.totalDocsByLanguage[lang] > 0
          ? newLangSum / stats.totalDocsByLanguage[lang]
          : 0;
    }

    stats.vocabularySize = Object.keys(stats.documentFrequency).length;
    stats.lastUpdatedAt = Date.now();
    stats.tokenizerVersion = TOKENIZER_VERSION;

    // Size guard — warn if approaching 800KB (sharding threshold)
    const sizeEstimate = JSON.stringify(stats).length;
    if (sizeEstimate > 800_000) {
      // eslint-disable-next-line no-console
      console.warn(`[BM25] corpus stats doc ~${sizeEstimate} bytes — sharding required soon`);
    }

    tx.set(ref, stats);
  });
}

/**
 * Read current corpus stats. Returns empty stats if not yet initialized.
 */
export async function getCorpusStats(db: Firestore): Promise<CorpusStats> {
  const snap = await db.collection(CORPUS_STATS_COLLECTION).doc(CORPUS_STATS_DOC).get();
  if (!snap.exists) return emptyStats();
  return snap.data() as CorpusStats;
}

/**
 * Reset corpus stats to empty.
 * USE WITH CAUTION — only for full re-index scenarios.
 */
export async function resetCorpusStats(db: Firestore): Promise<void> {
  const ref = db.collection(CORPUS_STATS_COLLECTION).doc(CORPUS_STATS_DOC);
  await ref.set(emptyStats());
}
