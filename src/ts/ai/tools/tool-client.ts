/**
 * Tool Client — Frontend caller cho Cloud Function /toolExecutor.
 *
 * Used by gemini-client.ts in function calling loop.
 */
// @ts-nocheck

const TOOL_EXECUTOR_URL =
  "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/toolExecutor";

export interface ToolResult {
  ok: boolean;
  result?: any;
  error?: string;
}

async function getIdToken(): Promise<string | null> {
  try {
    const auth = (window as any).currentAuth;
    const user = auth?.user;
    if (!user) return null;
    if (typeof user.getIdToken === "function") {
      return await user.getIdToken();
    }
    return user.accessToken || null;
  } catch (e) {
    console.error("[Tool client] Failed to get ID token", e);
    return null;
  }
}

/**
 * Execute a tool remotely via Cloud Function.
 */
export async function executeToolRemote(
  name: string,
  args: any
): Promise<ToolResult> {
  const idToken = await getIdToken();
  if (!idToken) {
    return { ok: false, error: "Not authenticated" };
  }

  try {
    const response = await fetch(TOOL_EXECUTOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ name, args }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        ok: false,
        error: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
      };
    }

    return (await response.json()) as ToolResult;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
