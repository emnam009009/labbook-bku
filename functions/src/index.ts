/**
 * Cloud Functions entry point for LabBook BKU AI module.
 *
 * All functions are exported from this file. Each function is in its own
 * file under src/handlers/ for organization.
 *
 * @see /AI_ARCHITECTURE.md Section 3 (Hybrid TS + Python Architecture)
 */

import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK (auto-uses service account in deployed env)
admin.initializeApp();

// ============================================================
// AI Proxies (Round 106c+)
// ============================================================

// Hello-world for verification (Round 106c)
export { hello } from "./handlers/hello";
export { secretTest } from "./handlers/secret-test";

// LLM proxies — uncomment as implemented:
// export { claudeProxy } from "./handlers/claude-proxy";    // Round 111+
export { geminiProxy } from "./handlers/gemini-proxy";    // Round 111+
export { speechProxy } from "./handlers/speech-proxy";    // Round 114+
// export { voyageProxy } from "./handlers/voyage-proxy";    // Round 121+
export { chandraProxy } from "./handlers/chandra-proxy";  // Round 133a (R117 originally planned, deferred to R133)
export { chunkPaper } from "./handlers/chunk-paper";  // Round 134a
export { paperPipelineRouter } from "./triggers/paper-pipeline-router";  // Round 134b
export { searchPapers } from "./handlers/search-papers";  // Round 136a
export { backfillBM25 } from "./handlers/backfill-bm25";  // Round 137a
export { runEval } from "./handlers/run-eval";  // Round 137b-eval+obs

// Python service bridge (Round 107+)
export { pythonBridge } from "./handlers/python-bridge";

// AI tool execution (Round 112+)
export { toolExecutor } from "./handlers/tool-executor";  // Round 112+

// Round 115a: AI action confirmation endpoint
export { confirmAction } from "./handlers/confirm-action";
