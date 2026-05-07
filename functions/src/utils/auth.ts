/**
 * Firebase Auth verification middleware.
 *
 * Used by AI proxy functions to ensure caller is authenticated and
 * has appropriate role (superadmin for Phase A).
 *
 * @see /AI_ARCHITECTURE.md Section 15 (Security & Privacy)
 */

import * as admin from "firebase-admin";
import { Request } from "firebase-functions/v2/https";
import { logger } from "./logger";

export interface AuthContext {
  uid: string;
  email: string | undefined;
  role: string;
}

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Verify Firebase ID token from Authorization header.
 * Returns decoded user info + role from RTDB.
 *
 * Throws AuthError if token invalid, missing, or role insufficient.
 */
export async function verifyAuth(
  req: Request,
  requiredRole: "superadmin" | "admin" | "member" | "viewer" = "superadmin"
): Promise<AuthContext> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError(401, "Missing or invalid Authorization header");
  }

  const idToken = authHeader.substring(7);

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    logger.warn("Invalid ID token", { error: e });
    throw new AuthError(401, "Invalid or expired ID token");
  }

  // Fetch role from RTDB (path: users/{uid}/role)
  const roleSnap = await admin
    .database()
    .ref(`users/${decodedToken.uid}/role`)
    .once("value");
  const role = (roleSnap.val() as string | null) ?? "pending";

  // Check role hierarchy
  const roleHierarchy: Record<string, number> = {
    superadmin: 4,
    admin: 3,
    member: 2,
    viewer: 1,
    pending: 0,
    rejected: -1,
  };

  if ((roleHierarchy[role] ?? 0) < (roleHierarchy[requiredRole] ?? 0)) {
    logger.warn("Insufficient role", {
      uid: decodedToken.uid,
      userRole: role,
      requiredRole,
    });
    throw new AuthError(403, `Requires role: ${requiredRole}, got: ${role}`);
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    role,
  };
}
