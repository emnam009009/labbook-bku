/**
 * Tool: listMembers
 *
 * Liệt kê thành viên lab. Filter deleted=true.
 */
import { db, fuzzyMatch } from "./utils";

export interface MemberRecord {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  createdAt?: number | string;
}

export interface ListMembersArgs {
  role?: string;
  query?: string;
  limit?: number;
}

export interface ListMembersResult {
  total: number;
  returned: number;
  members: MemberRecord[];
  counts_by_role?: Record<string, number>;
  message?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const ROLE_ORDER = ["superadmin", "admin", "member", "viewer", "pending", "rejected"];

export async function listMembers(
  args: ListMembersArgs
): Promise<ListMembersResult> {
  const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

  const snap = await db().ref("users").once("value");
  const data = snap.val() || {};

  let results: MemberRecord[] = [];
  const counts: Record<string, number> = {};

  for (const [uid, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as any;

    // Filter deleted
    if (r.deleted === true) continue;

    const role = r.role || "pending";
    counts[role] = (counts[role] || 0) + 1;

    const record: MemberRecord = {
      uid,
      displayName: r.displayName || "",
      email: r.email || "",
      role,
      createdAt: r.createdAt,
    };

    // Filter by role
    if (args.role && !fuzzyMatch(role, args.role)) continue;

    // Filter by query (name/email)
    if (args.query) {
      const matched =
        fuzzyMatch(record.displayName, args.query) ||
        fuzzyMatch(record.email, args.query);
      if (!matched) continue;
    }

    results.push(record);
  }

  const total = results.length;

  // Sort by role priority then name
  results.sort((a, b) => {
    const ra = ROLE_ORDER.indexOf(a.role);
    const rb = ROLE_ORDER.indexOf(b.role);
    if (ra !== rb) return ra - rb;
    return (a.displayName || "").localeCompare(b.displayName || "", "vi");
  });

  const returned = results.slice(0, limit);

  return {
    total,
    returned: returned.length,
    members: returned,
    counts_by_role: counts,
    message:
      total === 0
        ? "Không có thành viên nào khớp với điều kiện."
        : undefined,
  };
}
