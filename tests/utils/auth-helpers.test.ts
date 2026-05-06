/**
 * Tests cho src/js/utils/auth-helpers.js
 *
 * File này phụ thuộc window.currentAuth và window.cache → cần setup/teardown.
 * Đây là pattern mock cho các module sử dụng global state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getPersonName,
  canDelete,
  canEdit,
  syncAuthState,
} from '../../src/js/utils/auth-helpers.js'

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers để setup/teardown window mocks
// ─────────────────────────────────────────────────────────────────────────────
function setAuth(auth) {
  globalThis.window = globalThis.window || {}
  globalThis.window.currentAuth = auth
}

function setCache(cache) {
  globalThis.window = globalThis.window || {}
  globalThis.window.cache = cache
}

beforeEach(() => {
  // Reset trước mỗi test để không bị nhiễm chéo
  globalThis.window = {}
})

afterEach(() => {
  // Cleanup global state
  delete globalThis.window
})

// ─────────────────────────────────────────────────────────────────────────────
//  getPersonName
// ─────────────────────────────────────────────────────────────────────────────
describe('getPersonName', () => {
  it('trả về name từ cache.members nếu match uid', () => {
    setAuth({ uid: 'u1', email: 'a@b.com', displayName: 'Display A' })
    setCache({
      members: {
        m1: { uid: 'u1', name: 'Member A Real Name' },
        m2: { uid: 'u2', name: 'Member B' },
      },
    })
    expect(getPersonName()).toBe('Member A Real Name')
  })

  it('fallback sang displayName khi không match member', () => {
    setAuth({ uid: 'u1', email: 'a@b.com', displayName: 'Display A' })
    setCache({ members: {} })
    expect(getPersonName()).toBe('Display A')
  })

  it('fallback sang email khi không có displayName', () => {
    setAuth({ uid: 'u1', email: 'a@b.com' })
    setCache({ members: {} })
    expect(getPersonName()).toBe('a@b.com')
  })

  it('return empty string khi không có auth', () => {
    setAuth(null)
    expect(getPersonName()).toBe('')
  })

  it('return displayName/email khi có auth nhưng không có uid', () => {
    setAuth({ displayName: 'Guest User' })
    expect(getPersonName()).toBe('Guest User')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  canDelete
// ─────────────────────────────────────────────────────────────────────────────
describe('canDelete', () => {
  it('admin xóa được tất cả', () => {
    setAuth({ uid: 'u1', isAdmin: true, isMember: true })
    setCache({ members: {} })
    expect(canDelete({ person: 'someone-else' })).toBe(true)
    expect(canDelete({ createdBy: 'other-uid' })).toBe(true)
  })

  it('member chỉ xóa được record của mình (theo person name)', () => {
    setAuth({ uid: 'u1', email: 'a@b.com', isMember: true, displayName: 'Member A' })
    setCache({ members: { m1: { uid: 'u1', name: 'Member A' } } })

    expect(canDelete({ person: 'Member A' })).toBe(true)
    expect(canDelete({ person: 'Member B' })).toBe(false)
  })

  it('member xóa được khi createdBy match uid hoặc email', () => {
    setAuth({ uid: 'u1', email: 'a@b.com', isMember: true, displayName: 'A' })
    setCache({ members: {} })

    expect(canDelete({ createdBy: 'u1' })).toBe(true)
    expect(canDelete({ createdBy: 'a@b.com' })).toBe(true)
    expect(canDelete({ createdBy: 'other' })).toBe(false)
  })

  it('viewer không xóa được gì', () => {
    setAuth({ uid: 'u1', isAdmin: false, isMember: false })
    setCache({ members: {} })
    expect(canDelete({ person: 'anyone' })).toBe(false)
  })

  it('return false khi record null hoặc auth null', () => {
    setAuth({ uid: 'u1', isAdmin: true })
    expect(canDelete(null)).toBe(false)

    setAuth(null)
    expect(canDelete({ person: 'A' })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  canEdit
// ─────────────────────────────────────────────────────────────────────────────
describe('canEdit', () => {
  it('admin sửa được tất cả', () => {
    setAuth({ uid: 'u1', isAdmin: true })
    expect(canEdit({ uid: 'other', createdBy: 'someone' })).toBe(true)
  })

  it('user thường sửa được record có uid match', () => {
    setAuth({ uid: 'u1', isAdmin: false, displayName: 'A', email: 'a@b.com' })
    expect(canEdit({ uid: 'u1' })).toBe(true)
    expect(canEdit({ uid: 'u2' })).toBe(false)
  })

  it('user thường sửa được record có createdBy/person/createdByName match name', () => {
    setAuth({ uid: 'u1', isAdmin: false, displayName: 'A', email: 'a@b.com' })

    expect(canEdit({ createdBy: 'A' })).toBe(true)
    expect(canEdit({ person: 'A' })).toBe(true)
    expect(canEdit({ createdByName: 'A' })).toBe(true)
    expect(canEdit({ createdBy: 'B' })).toBe(false)
  })

  it('return true khi record null (cho phép tạo mới)', () => {
    setAuth({ uid: 'u1' })
    expect(canEdit(null)).toBe(true)
    expect(canEdit(undefined)).toBe(true)
  })

  it('return false khi auth null', () => {
    setAuth(null)
    expect(canEdit({ uid: 'u1' })).toBe(false)
  })

  it('return false khi auth không có uid và không phải admin', () => {
    setAuth({ isAdmin: false })
    expect(canEdit({ uid: 'u1' })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  syncAuthState
// ─────────────────────────────────────────────────────────────────────────────
describe('syncAuthState', () => {
  it('sync window.isAdmin, currentUser, __currentUserUid từ currentAuth', () => {
    setAuth({
      uid: 'u1',
      email: 'a@b.com',
      displayName: 'Display A',
      isAdmin: true,
    })
    syncAuthState()
    expect(window.isAdmin).toBe(true)
    expect(window.currentUser).toBe('Display A')
    expect(window.__currentUserUid).toBe('u1')
  })

  it('fallback currentUser sang email nếu không có displayName', () => {
    setAuth({ uid: 'u1', email: 'a@b.com', isAdmin: false })
    syncAuthState()
    expect(window.currentUser).toBe('a@b.com')
  })

  it('fallback currentUser thành "Khách" nếu không có gì', () => {
    setAuth({ isAdmin: false })
    syncAuthState()
    expect(window.currentUser).toBe('Khách')
  })

  it('không làm gì khi currentAuth null', () => {
    setAuth(null)
    expect(() => syncAuthState()).not.toThrow()
    expect(window.isAdmin).toBeUndefined()
  })
})
