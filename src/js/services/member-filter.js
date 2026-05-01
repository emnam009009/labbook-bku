// services/member-filter.js — Member filter cho Hydro/Electrode/Electrochem
// Replace nút "Chỉ của tôi" thành dropdown chọn member

const PAGES = ['hydro', 'electrode', 'ec'];

// State filter: 'all' | 'me' | '<TênMember>'
window._memberFilter = window._memberFilter || { hydro: 'all', electrode: 'all', ec: 'all' };

// Backward compat: nếu code cũ vẫn check _mineFilter, derive từ _memberFilter
window._mineFilter = new Proxy({}, {
  get(_, page) {
    return window._memberFilter[page] === 'me';
  }
});

/**
 * Lấy danh sách members đã link account (có user trong _users với displayName trùng member.name)
 */
function getLinkedMembers() {
  const cache = window.cache;
  if (!cache?.members) return [];
  
  // Lấy displayName của tất cả users chưa deleted
  const linkedNames = new Set();
  if (cache._users) {
    Object.values(cache._users).forEach(u => {
      if (u && !u.deleted && u.displayName) {
        linkedNames.add(u.displayName.trim());
      }
    });
  }
  
  // Filter members có name trùng với 1 displayName
  // Dedup theo name (chỉ giữ 1 member cho mỗi tên unique)
  const seenNames = new Set();
  const members = Object.values(cache.members)
    .filter(m => {
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
function getMyName() {
  return window.currentAuth?.displayName || null;
}

/**
 * Tạo HTML options cho dropdown 1 page
 */
function buildOptions(page) {
  const myName = getMyName();
  const members = getLinkedMembers();
  const current = window._memberFilter[page] || 'all';
  
  let opts = `<option value="all" ${current === 'all' ? 'selected' : ''}>Tất cả</option>`;
  
  if (myName) {
    opts += `<option value="me" ${current === 'me' ? 'selected' : ''}>Chỉ của tôi</option>`;
  }
  
  
  members.forEach(m => {
    // Skip current user (đã có "Chỉ của tôi")
    if (m.name === myName) return;
    opts += `<option value="${escapeAttr(m.name)}" ${current === m.name ? 'selected' : ''}>${escapeHtml(m.name)}</option>`;
  });
  
  return opts;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

/**
 * Populate dropdown của 1 page
 */
function populatePageDropdown(page) {
  const sel = document.getElementById(`${page}-member-filter`);
  if (!sel) return;
  
  sel.innerHTML = buildOptions(page);
  
  // Rebuild custom filter wrap (đẹp đồng bộ các filter khác)
  if (typeof window.rebuildCustomFilter === 'function') {
    window.rebuildCustomFilter(sel);
  }
}

/**
 * Set filter và re-render
 */
window.setMemberFilter = function(page, value) {
  window._memberFilter[page] = value;
  
  // Re-render trang tương ứng
  if (page === 'hydro' && window.renderHydro) window.renderHydro();
  else if (page === 'electrode' && window.renderElectrode) window.renderElectrode();
  else if (page === 'ec' && window.renderElectrochem) window.renderElectrochem();
};

/**
 * Helper cho experiments.js: check xem row có pass filter không
 * Replace logic cũ: !window._mineFilter?.[page] || r.person === myName
 */
window.passMemberFilter = function(page, person) {
  const f = window._memberFilter[page] || 'all';
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
export function initMemberFilter() {
  // Populate ban đầu
  PAGES.forEach(p => populatePageDropdown(p));
  
  // Re-populate khi members hoặc _users data thay đổi
  window.addEventListener('cache-update', (e) => {
    if (e.detail?.col === 'members' || e.detail?.col === '_users') {
      PAGES.forEach(p => populatePageDropdown(p));
    }
  });
  
  // Cũng re-populate khi auth state thay đổi (login/logout)
  window.addEventListener('auth-change', () => {
    PAGES.forEach(p => populatePageDropdown(p));
  });
}

// Expose
window.populateMemberFilters = () => PAGES.forEach(p => populatePageDropdown(p));
