// services/member-filter.ts — Member filter cho Hydro/Electrode/Electrochem
// Replace nút "Chỉ của tôi" thành dropdown chọn member

const PAGES = ['hydro', 'electrode', 'ec'] as const;

interface MemberRecord {
  name?: string;
  uid?: string;
  [key: string]: unknown;
}

// State filter: 'all' | 'me' | '<TênMember>'
(window as any)._memberFilter = (window as any)._memberFilter || { hydro: 'all', electrode: 'all', ec: 'all' };

// Backward compat: nếu code cũ vẫn check _mineFilter, derive từ _memberFilter
(window as any)._mineFilter = new Proxy({}, {
  get(_, page: string) {
    return (window as any)._memberFilter[page] === 'me';
  }
});

/**
 * Lấy danh sách members đã link account (có user trong _users với displayName trùng member.name)
 */
function getLinkedMembers(): MemberRecord[] {
  const cache = window.cache as any;
  if (!cache?.members) return [];

  // Lấy displayName của tất cả users chưa deleted
  const linkedNames = new Set<string>();
  if (cache._users) {
    Object.values(cache._users).forEach((u: any) => {
      if (u && !u.deleted && u.displayName) {
        linkedNames.add(String(u.displayName).trim());
      }
    });
  }

  // Filter members có name trùng với 1 displayName
  // Dedup theo name (chỉ giữ 1 member cho mỗi tên unique)
  const seenNames = new Set<string>();
  const members: MemberRecord[] = (Object.values(cache.members) as MemberRecord[])
    .filter((m): m is MemberRecord => {
      if (!m || !m.name) return false;
      const name = m.name.trim();
      if (!linkedNames.has(name)) return false;
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

  return members;
}

/**
 * Lấy tên người dùng hiện tại từ currentAuth.displayName
 */
function getMyName(): string | null {
  return (window.currentAuth as any)?.displayName || null;
}

/**
 * Tạo HTML options cho dropdown 1 page
 */
function buildOptions(page: string): string {
  const myName = getMyName();
  const members = getLinkedMembers();
  const current = (window as any)._memberFilter[page] || 'all';

  let opts = `<option value="all" ${current === 'all' ? 'selected' : ''}>Tất cả</option>`;

  if (myName) {
    opts += `<option value="me" ${current === 'me' ? 'selected' : ''}>Chỉ của tôi</option>`;
  }


  members.forEach(m => {
    // Skip current user (đã có "Chỉ của tôi")
    if (m.name === myName) return;
    opts += `<option value="${escapeAttr(m.name!)}" ${current === m.name ? 'selected' : ''}>${escapeHtml(m.name!)}</option>`;
  });

  return opts;
}

function escapeHtml(s: unknown): string {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]!));
}
function escapeAttr(s: unknown): string {
  return escapeHtml(s);
}

/**
 * Populate dropdown của 1 page
 */
function populatePageDropdown(page: string): void {
  const sel = document.getElementById(`${page}-member-filter`) as HTMLSelectElement | null;
  if (!sel) return;

  sel.innerHTML = buildOptions(page);

  // Rebuild custom filter wrap (đẹp đồng bộ các filter khác)
  if (typeof (window as any).rebuildCustomFilter === 'function') {
    (window as any).rebuildCustomFilter(sel);
  }
}

/**
 * Set filter và re-render
 */
window.setMemberFilter = function(page: string, value: string): void {
  (window as any)._memberFilter[page] = value;

  // Re-render trang tương ứng
  if (page === 'hydro' && window.renderHydro) window.renderHydro();
  else if (page === 'electrode' && window.renderElectrode) window.renderElectrode();
  else if (page === 'ec' && window.renderElectrochem) window.renderElectrochem();
};

/**
 * Helper cho experiments.js: check xem row có pass filter không
 * Replace logic cũ: !window._mineFilter?.[page] || r.person === myName
 */
(window as any).passMemberFilter = function(page: string, person: string): boolean {
  const f = (window as any)._memberFilter[page] || 'all';
  if (f === 'all') return true;
  if (f === 'me') {
    const myName = getMyName();
    return person === myName;
  }
  // f là tên member
  return person === f;
};

/**
 * Init: populate dropdown khi members data có sẵn
 */
export function initMemberFilter(): void {
  // Populate ban đầu
  PAGES.forEach(p => populatePageDropdown(p));

  // Re-populate khi members hoặc _users data thay đổi
  window.addEventListener('cache-update', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.col === 'members' || detail?.col === '_users') {
      PAGES.forEach(p => populatePageDropdown(p));
    }
  });

  // Cũng re-populate khi auth state thay đổi (login/logout)
  window.addEventListener('auth-change', () => {
    PAGES.forEach(p => populatePageDropdown(p));
  });
}

// Expose
(window as any).populateMemberFilters = () => PAGES.forEach(p => populatePageDropdown(p));
