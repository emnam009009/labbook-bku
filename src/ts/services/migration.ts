/**
 * R152d-2 — Migration service: wraps migrateLegacyExperiments function.
 *
 * Invokes Cloud Function HTTP endpoint with admin bearer token.
 * Used by settings page UI card.
 */

import { auth } from '../firebase.js';

const FUNCTION_URL =
  "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/migrateLegacyExperiments";

export interface PerCollectionResult {
  collection: "hydro" | "electrode" | "electrochem";
  totalRead: number;
  alreadyMigrated: number;
  willMigrate: number;
  migrated: number;
  errors: number;
  errorSamples: string[];
}

export interface MigrationResponse {
  mode: "dry-run" | "confirm";
  legacyCollectionRequested: string;
  totals: {
    totalRead: number;
    alreadyMigrated: number;
    willMigrate: number;
    migrated: number;
    errors: number;
  };
  perCollection: PerCollectionResult[];
  backupId?: string;
  durationMs: number;
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Chưa đăng nhập");
  return await user.getIdToken();
}

export async function callMigration(
  mode: "dry-run" | "confirm",
  legacyCollection: "hydro" | "electrode" | "electrochem" | "all" = "all",
): Promise<MigrationResponse> {
  const token = await getIdToken();
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode, legacyCollection }),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json.error || json.details || text;
    } catch { /* not json */ }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return await res.json();
}

export function isSuperadmin(): boolean {
  // App tracks role via body.classList (set by main.js role resolver).
  // 'superadmin-mode' is added when user has superadmin role claim.
  return document.body.classList.contains('superadmin-mode');
}
