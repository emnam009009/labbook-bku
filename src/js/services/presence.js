/**
 * services/presence.js
 * Online/offline tracking dùng Firebase Realtime Database
 *
 * Cấu trúc DB:
 *   presence/{uid} = { online: true|false, lastSeen: <timestamp> }
 *
 * Cơ chế:
 *  - startPresence(uid): set online=true + đăng ký onDisconnect() để Firebase
 *    tự động ghi online=false khi client mất kết nối (đóng tab, mất mạng)
 *  - stopPresence(): manual offline khi logout, đồng thời cancel onDisconnect
 *  - Theo dõi /.info/connected để re-set khi reconnect
 *
 * Fix log:
 *  - Bug #2: cancel onDisconnect cũ trước khi đăng ký mới khi reconnect
 *  - Bug #4: cancel onDisconnect khi stopPresence để tránh ghi nhầm sau logout
 *  - Bug #1: dùng generation counter để tránh race khi switch uid nhanh
 */

import { db, ref, onValue, set, onDisconnect, serverTimestamp } from '../firebase.js'

let _currentUid = null;
let _connectedUnsub = null;
// Generation counter: tăng mỗi lần startPresence/stopPresence → callback cũ tự bỏ qua nếu hết hạn
let _gen = 0;

export function startPresence(uid) {
  if (!uid) return;
  if (_currentUid === uid && _connectedUnsub) return;

  // Bug #1 fix: nếu đang track uid khác, dọn dẹp ngay (không await — fire-and-forget)
  // nhưng tăng _gen để callback cũ tự ignore khi nó chạy xong
  if (_currentUid && _currentUid !== uid) {
    stopPresence().catch(() => {});
  }

  const myGen = ++_gen;
  _currentUid = uid;
  const presenceRef = ref(db, `presence/${uid}`);
  const connectedRef = ref(db, '.info/connected');

  _connectedUnsub = onValue(connectedRef, (snap) => {
    // Nếu đã có generation mới (uid khác đã start) → bỏ qua callback cũ
    if (myGen !== _gen) return;
    if (snap.val() === false) return;

    // Bug #2 fix: cancel onDisconnect cũ TRƯỚC khi đăng ký mới
    // (tránh accumulate N handlers sau N lần reconnect)
    onDisconnect(presenceRef).cancel()
      .catch(() => {}) // ignore: nếu chưa có handler thì cancel cũng OK
      .then(() => {
        if (myGen !== _gen) return; // re-check sau async
        return onDisconnect(presenceRef)
          .set({ online: false, lastSeen: serverTimestamp() });
      })
      .then(() => {
        if (myGen !== _gen) return;
        return set(presenceRef, { online: true, lastSeen: serverTimestamp() });
      })
      .catch((e) => console.warn('[presence] onDisconnect setup failed', e));
  });
}

export async function stopPresence() {
  if (!_currentUid) return;
  const uid = _currentUid;
  const presenceRef = ref(db, `presence/${uid}`);

  // Cleanup state TRƯỚC khi async để callback cũ check _gen sẽ bail out
  _gen++;
  _currentUid = null;
  if (_connectedUnsub) {
    try { _connectedUnsub(); } catch (e) {}
    _connectedUnsub = null;
  }

  // Bug #4 fix: cancel onDisconnect đã đăng ký với server
  // (tránh server tự ghi đè presence/{uid} sau khi user đã logout)
  try {
    await onDisconnect(presenceRef).cancel();
  } catch (e) {
    console.warn('[presence] cancel onDisconnect failed', e);
  }

  // Ghi offline ngay
  try {
    await set(presenceRef, { online: false, lastSeen: serverTimestamp() });
  } catch (e) {
    console.warn('[presence] stopPresence write failed', e);
  }
}
