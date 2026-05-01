/**
 * services/url-router.js
 * Handle URL parameters để deep-link tới detail của 1 record
 *
 * Hỗ trợ format: ?detail=<type>:<key>
 *   Ví dụ: ?detail=chem:abc123  → mở edit modal cho chemical abc123
 *          ?detail=equip:xyz789 → mở edit modal cho equipment xyz789
 *
 * Use case chính: QR code trên nhãn link tới đây
 */

// Init: gọi sau khi auth + listeners đã ready
export function initUrlRouter() {
  // Đợi cache có data trước khi xử lý URL
  // Listeners trigger 'cache-update' event lần đầu khi data về
  if (window.cache && (window.cache.chemicals || window.cache.equipment)) {
    handleUrlParams()
  } else {
    // Đợi cache-update event
    const handler = () => {
      window.removeEventListener('cache-update', handler)
      // Delay nhẹ để đảm bảo render xong
      setTimeout(handleUrlParams, 200)
    }
    window.addEventListener('cache-update', handler)
  }
}

function handleUrlParams() {
  const params = new URLSearchParams(window.location.search)
  const detail = params.get('detail')
  if (!detail) return

  // Format: type:key
  const colonIdx = detail.indexOf(':')
  if (colonIdx < 0) return
  const type = detail.slice(0, colonIdx)
  const key = detail.slice(colonIdx + 1)

  if (!type || !key) return

  // Map type → action
  switch (type) {
    case 'chem':
    case 'chemical':
      openChemicalDetail(key)
      break
    case 'equip':
    case 'equipment':
      openEquipmentDetail(key)
      break
    default:
      console.warn('[url-router] Unknown detail type:', type)
  }

  // Clean URL sau khi xử lý (không để dirty)
  if (window.history && window.history.replaceState) {
    const cleanUrl = window.location.pathname + window.location.hash
    window.history.replaceState({}, '', cleanUrl)
  }
}

function openChemicalDetail(key) {
  const cache = window.cache
  if (!cache?.chemicals?.[key]) {
    if (window.showToast) {
      window.showToast('Không tìm thấy hóa chất với mã ' + key, 'danger')
    }
    return
  }

  // Switch sang trang chemicals trước
  if (typeof window.showPage === 'function') {
    window.showPage('chemicals')
  }

  // Đợi page render xong rồi gọi edit modal
  setTimeout(() => {
    if (typeof window.editChemical === 'function') {
      window.editChemical(key)
    } else {
      console.warn('[url-router] window.editChemical không tồn tại')
    }
  }, 300)
}

function openEquipmentDetail(key) {
  const cache = window.cache
  if (!cache?.equipment?.[key]) {
    if (window.showToast) {
      window.showToast('Không tìm thấy thiết bị với mã ' + key, 'danger')
    }
    return
  }

  if (typeof window.showPage === 'function') {
    window.showPage('equipment')
  }

  setTimeout(() => {
    if (typeof window.editEquipment === 'function') {
      window.editEquipment(key)
    } else {
      console.warn('[url-router] window.editEquipment không tồn tại')
    }
  }, 300)
}
