/**
 * services/sticky-header.js
 *
 * Tự động wrap "page header" (title row + toolbar row) của các page
 * vào 1 div .page-sticky-header → CSS làm sticky.
 *
 * Pages áp dụng:
 *   - hydrothermal, electrode, electrochemistry
 *   - chemicals, equipment, members
 *   - booking, users, history
 *
 * KHÔNG áp dụng cho: dashboard (đã ẩn sticky qua CSS), settings, chat.
 *
 * Pattern HTML các page (ví dụ hydrothermal):
 *   <div class="page" id="page-hydrothermal">
 *     <div class="flex items-start justify-between mb-6 ...">  ← ROW 1: title + button "Thêm"
 *       <div>
 *         <h1 class="page-title page-title-dark">...</h1>
 *         <p class="page-subtitle">...</p>
 *       </div>
 *       <button class="btn btn-primary ...">Thêm ...</button>
 *     </div>
 *     <div class="flex gap-2 mb-4 flex-wrap items-center btn-action-mt"> ← ROW 2: search + filters
 *       ...
 *     </div>
 *     <div class="table-wrap"> ... </div>     ← Bảng (scroll content)
 *   </div>
 *
 * Sau khi wrap:
 *   <div class="page" id="page-hydrothermal">
 *     <div class="page-sticky-header">
 *       <div class="flex items-start ...">title row</div>
 *       <div class="flex gap-2 ...">toolbar row</div>
 *     </div>
 *     <div class="table-wrap"> ... </div>
 *   </div>
 */

const PAGES_WITH_STICKY = [
  'page-hydrothermal',
  'page-electrode',
  'page-electrochemistry',
  'page-chemicals',
  'page-equipment',
  'page-members',
  'page-booking',
  'page-users',
  'page-history',
]

const SENTINEL_ATTR = 'data-sticky-wrapped'

/**
 * Wrap N div đầu của 1 page vào .page-sticky-header.
 * Idempotent: chạy lại không hỏng (check sentinel).
 *
 * Với electrode page có tab-bar giữa, wrap 3 phần đầu:
 *   row 1 (title) + row 2 (tab-bar) + LƯU Ý: search bar nằm trong
 *   tab-content nên không sticky được bằng cách này.
 *
 * Default cho các page khác: wrap 2 phần đầu (title + toolbar).
 */
function wrapPageHeader(pageEl) {
  if (!pageEl) return
  if (pageEl.getAttribute(SENTINEL_ATTR)) return // đã wrap rồi

  const children = Array.from(pageEl.children)
  if (children.length < 2) return // page không có đủ 2 row đầu

  // Special case: electrode có tab-bar ở row 2, search ở row 3 (trong tab-content)
  // → chỉ wrap row 1 (title) + row 2 (tab-bar) làm sticky.
  // Search bar ở electrode sẽ scroll bình thường.
  const isElectrode = pageEl.id === 'page-electrode'
  const wrapCount = isElectrode ? 2 : 2 // hiện tại đều = 2; future-proof

  // Lấy N div đầu
  const rowsToWrap = children.slice(0, wrapCount)
  if (rowsToWrap.some((r) => r.tagName !== 'DIV')) return

  // Heuristic check row 2: phải là toolbar (flex/search/filter/btn-action-mt)
  // hoặc tab-bar. Nếu không, có thể page có structure khác → skip.
  const row2Class = rowsToWrap[1].className || ''
  const hasToolbarHint = /flex|search|filter|btn-action-mt|tab-bar/.test(row2Class)
  if (!hasToolbarHint) return

  // Tạo wrapper
  const wrapper = document.createElement('div')
  wrapper.className = 'page-sticky-header'

  // Insert wrapper trước row đầu
  pageEl.insertBefore(wrapper, rowsToWrap[0])

  // Move các row đã chọn vào wrapper
  rowsToWrap.forEach((row) => wrapper.appendChild(row))

  // Mark page đã wrap
  pageEl.setAttribute(SENTINEL_ATTR, '1')
}

/**
 * IntersectionObserver-based detection:
 *   khi sticky element bắt đầu "stuck" ở top → add class .is-stuck
 *   để CSS thêm shadow và blur.
 *
 * Trick dùng sentinel: tạo 1 div invisible 1px ở phía trên wrapper.
 * Khi sentinel cuộn ra khỏi viewport (intersection ratio = 0)
 *   → wrapper đã stuck.
 */
function attachStuckDetector(wrapper) {
  if (!wrapper || wrapper.getAttribute('data-stuck-attached')) return
  wrapper.setAttribute('data-stuck-attached', '1')

  // Create sentinel
  const sentinel = document.createElement('div')
  sentinel.style.cssText = 'height:1px;margin-top:-1px;pointer-events:none'
  sentinel.setAttribute('data-stuck-sentinel', '1')
  wrapper.parentNode.insertBefore(sentinel, wrapper)

  if (!('IntersectionObserver' in window)) {
    // Fallback: luôn show stuck shadow
    wrapper.classList.add('is-stuck')
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        wrapper.classList.remove('is-stuck')
      } else {
        wrapper.classList.add('is-stuck')
      }
    },
    { threshold: [0], rootMargin: '0px 0px 0px 0px' }
  )
  observer.observe(sentinel)
}

/**
 * Đo chiều cao của sticky bar và set CSS variable --sticky-bar-h
 * để thead có thể sticky ngay dưới nó.
 *
 * Re-measure khi:
 *   - DOM ready
 *   - Window resize (sticky bar có thể wrap khác nhau)
 *   - Page change (sidebar click)
 */
function updateStickyBarHeight() {
  const activePages = document.querySelectorAll('.page.active .page-sticky-header')
  activePages.forEach((bar) => {
    const h = bar.getBoundingClientRect().height
    if (h > 0) {
      // Set vào root để thead có thể tham chiếu
      document.documentElement.style.setProperty('--sticky-bar-h', h + 'px')
    }
  })
}

/**
 * Init: wrap tất cả page có trong PAGES_WITH_STICKY.
 * Gọi 1 lần khi DOMContentLoaded.
 */
export function initStickyHeaders() {
  PAGES_WITH_STICKY.forEach((pageId) => {
    const pageEl = document.getElementById(pageId)
    if (!pageEl) return
    wrapPageHeader(pageEl)
    const wrapper = pageEl.querySelector('.page-sticky-header')
    if (wrapper) attachStuckDetector(wrapper)
  })
  console.log('[sticky-header] initialized for', PAGES_WITH_STICKY.length, 'pages')

  // Đo chiều cao sau khi wrap xong
  setTimeout(updateStickyBarHeight, 50)
  setTimeout(updateStickyBarHeight, 300) // phòng trường hợp font chưa load

  // Re-measure khi resize window
  let resizeTimer = null
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(updateStickyBarHeight, 150)
  })

  // Re-measure khi user navigate sang page khác
  // (showPage được gọi qua sidebar click) — dùng MutationObserver
  // theo dõi class .active thay đổi
  const siteMain = document.querySelector('.site-main')
  if (siteMain) {
    const observer = new MutationObserver(() => {
      setTimeout(updateStickyBarHeight, 50)
    })
    observer.observe(siteMain, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
  }
}

// Auto-init khi script được import (chạy sau DOMContentLoaded vì main.js
// import vào sau khi body parsed)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStickyHeaders)
} else {
  // DOM đã ready
  initStickyHeaders()
}
