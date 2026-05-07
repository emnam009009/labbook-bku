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
// export { chandraProxy } from "./handlers/chandra-proxy";  // Round 117+

// Python service bridge (Round 107+)
export { pythonBridge } from "./handlers/python-bridge";

// AI tool execution (Round 112+)
export { toolExecutor } from "./handlers/tool-executor";  // Round 112+
