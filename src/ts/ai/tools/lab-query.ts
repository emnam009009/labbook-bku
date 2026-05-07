/**
 * Tier 1 tools — Round 112: now backend-side via tool-executor.
 *
 * Tool implementations live in:
 *   - functions/src/tools/  (handlers)
 *   - functions/src/handlers/tool-executor.ts  (Cloud Function)
 *
 * Frontend just calls executeToolRemote() from tool-client.ts.
 */
// @ts-nocheck
export { executeToolRemote } from "./tool-client";
export { TOOL_METADATA, getToolDisplayName } from "./tool-definitions";
