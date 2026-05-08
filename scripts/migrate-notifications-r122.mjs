#!/usr/bin/env node
/**
 * scripts/migrate-notifications-r122.mjs
 *
 * Migration script một-shot: schema notifications flat → nested per-user.
 *
 * BEFORE (R121 và trước):
 *   notifications/{notifId} = { type, bookingKey, targetUid, title, message, ... }
 *
 * AFTER (R122):
 *   notifications/{uid}/{notifId} = { ... }
 *   notifications/_admin/{notifId} = { ... }   // broadcast bucket
 *
 * Logic migration:
 *   - Nếu notif có targetUid (string) → di chuyển vào notifications/{targetUid}/{notifId}
 *   - Nếu notif có targetUid = null (broadcast admin) → fan-out vào notifications/{adminUid}/{notifId}
 *     cho tất cả admin/superadmin hiện tại (đọc /users để lấy danh sách)
 *   - Notif đã có path nested (key không phải pushId chuẩn -L...) → skip
 *   - Sau khi đã ghi xong path mới → xóa path flat cũ
 *
 * USAGE:
 *   1. Tải Firebase service account key JSON từ Firebase Console:
 *      Project Settings → Service accounts → Generate new private key
 *      Lưu thành file (vd: serviceAccountKey.json) — KHÔNG commit lên git
 *   2. Set env var GOOGLE_APPLICATION_CREDENTIALS hoặc truyền path:
 *      GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrate-notifications-r122.mjs
 *   3. Script sẽ DRY-RUN trước (in ra plan), hỏi xác nhận, rồi mới ghi DB
 *
 * SAFETY:
 *   - Backup notifications cũ ra file backup-notifications-<ts>.json trước khi migrate
 *   - Idempotent: chạy lại 2 lần không double-migrate (skip notif đã ở path nested)
 *   - Atomic-ish: build full update map → 1 lần ref.update() (Firebase apply atomic)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://lab-manager-268a6-default-rtdb.firebaseio.com';
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, ans => { rl.close(); resolve(ans.trim()); }));
}

function isLikelyPushId(key) {
  // Firebase push id: starts với '-' + 19 chars
  return typeof key === 'string' && /^-[A-Za-z0-9_-]{19}$/.test(key);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Migration R122: notifications flat → nested per-user');
  console.log('═══════════════════════════════════════════════════════');

  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Service account file không tìm thấy: ${SERVICE_ACCOUNT_PATH}`);
    console.error('   Tải JSON key từ Firebase Console → Project Settings → Service accounts.');
    console.error('   Hoặc set env GOOGLE_APPLICATION_CREDENTIALS=<path>');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
  console.log(`✓ Connected to: ${DATABASE_URL}`);

  const db = getDatabase();

  // ─── Step 1: Đọc users để lấy admin list ───
  console.log('\n[1/4] Đọc danh sách users...');
  const usersSnap = await db.ref('users').once('value');
  const users = usersSnap.val() || {};
  const adminUids = [];
  let totalUsers = 0;
  for (const [uid, u] of Object.entries(users)) {
    totalUsers++;
    if (u && (u.role === 'admin' || u.role === 'superadmin')) adminUids.push(uid);
  }
  console.log(`   Tổng ${totalUsers} users, ${adminUids.length} admin/superadmin.`);
  if (adminUids.length === 0) {
    console.warn('   ⚠️  Không có admin nào — broadcast notifications sẽ vào _admin bucket.');
  }

  // ─── Step 2: Đọc notifications hiện tại ───
  console.log('\n[2/4] Đọc notifications hiện tại...');
  const notifSnap = await db.ref('notifications').once('value');
  const all = notifSnap.val() || {};

  // Phân loại: flat entries (key = pushId, value = notif object có 'type'/'createdAt')
  // vs nested entries (key = uid, value = { notifId: notif } map)
  const flatNotifs = {};   // { notifId: notif }
  const nestedBuckets = {}; // { uid: { notifId: notif } }
  const ALREADY_NESTED_KEY = '_admin'; // path đặc biệt từ R122 fallback

  for (const [k, v] of Object.entries(all)) {
    if (!v || typeof v !== 'object') continue;
    // Heuristic: notif object có field createdAt/type/title trực tiếp → flat
    // Map { notifId: notif } → nested
    const looksLikeNotif = ('createdAt' in v) || ('type' in v) || ('title' in v);
    if (looksLikeNotif) {
      flatNotifs[k] = v;
    } else {
      // Là bucket — uid hoặc _admin
      nestedBuckets[k] = v;
    }
  }
  const flatCount = Object.keys(flatNotifs).length;
  const nestedCount = Object.keys(nestedBuckets).length;
  console.log(`   Flat notifications: ${flatCount}`);
  console.log(`   Nested buckets đã có: ${nestedCount} (uid hoặc _admin)`);

  if (flatCount === 0) {
    console.log('\n✓ Không có flat notifications — không cần migrate. Done.');
    process.exit(0);
  }

  // ─── Step 3: Build migration plan ───
  console.log('\n[3/4] Tạo migration plan...');
  const updates = {};   // multi-path update payload
  const stats = { toSpecificUser: 0, broadcastFanOut: 0, fallbackAdmin: 0, skipped: 0 };

  for (const [notifId, notif] of Object.entries(flatNotifs)) {
    const targetUid = notif.targetUid;

    if (typeof targetUid === 'string' && targetUid.length > 0) {
      // Direct: di chuyển vào notifications/{targetUid}/{notifId}
      updates[`notifications/${targetUid}/${notifId}`] = notif;
      stats.toSpecificUser++;
    } else {
      // Broadcast: fan-out cho admins
      if (adminUids.length > 0) {
        for (const adminUid of adminUids) {
          // Mỗi admin nhận notification với key riêng để tránh collision khi
          // có nhiều admin (push fresh keys). Dùng pushId mới hay re-use notifId?
          // Re-use: tiết kiệm space (1 notif duplicate N lần là chuyện thường
          // trong fan-out per-user). Nhưng nếu 1 admin xóa notifId, các admin
          // khác vẫn còn notifId cùng tên ở bucket khác → OK (path tách rời).
          updates[`notifications/${adminUid}/${notifId}`] = notif;
        }
        stats.broadcastFanOut++;
      } else {
        // Không có admin → đặt vào _admin bucket (R122 fallback path)
        updates[`notifications/_admin/${notifId}`] = notif;
        stats.fallbackAdmin++;
      }
    }
    // Đánh dấu xóa flat entry
    updates[`notifications/${notifId}`] = null;
  }

  console.log(`   • Direct (targetUid cụ thể): ${stats.toSpecificUser}`);
  console.log(`   • Broadcast fan-out (× ${adminUids.length} admin): ${stats.broadcastFanOut}`);
  console.log(`   • Fallback _admin bucket: ${stats.fallbackAdmin}`);
  console.log(`   • Tổng path-update operations: ${Object.keys(updates).length}`);

  // ─── Step 4: Backup + apply ───
  console.log('\n[4/4] Sẵn sàng migrate.');
  const backupPath = `backup-notifications-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(all, null, 2), 'utf8');
  console.log(`   ✓ Backup notifications hiện tại → ${backupPath}`);

  const ans = await ask('\n   Tiếp tục apply migration? [yes/no]: ');
  if (ans.toLowerCase() !== 'yes' && ans.toLowerCase() !== 'y') {
    console.log('   Hủy. Không có gì thay đổi trong DB.');
    process.exit(0);
  }

  console.log('\n   Đang apply...');
  await db.ref().update(updates);
  console.log('   ✓ Migration hoàn tất!');
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Backup: ${backupPath} (giữ lại để rollback nếu cần)`);
  console.log('  Để rollback: Firebase Console → import file backup vào path /notifications');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Migration error:', err);
  process.exit(1);
});
