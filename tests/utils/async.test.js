/**
 * Tests cho src/js/utils/async.js
 *
 * safeAsync wrap async function và toast lỗi nếu có.
 * Cần mock window.showToast để verify nó được gọi đúng.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { safeAsync } from '../../src/js/utils/async.js'

beforeEach(() => {
  globalThis.window = {}
  // Mock console.error để không spam test output
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete globalThis.window
  vi.restoreAllMocks()
})

describe('safeAsync', () => {
  it('return giá trị khi function thành công', async () => {
    const result = await safeAsync('test-op', async () => 42)
    expect(result).toBe(42)
  })

  it('return null khi function throw', async () => {
    const result = await safeAsync('test-op', async () => {
      throw new Error('boom')
    })
    expect(result).toBeNull()
  })

  it('log error vào console', async () => {
    await safeAsync('my-label', async () => {
      throw new Error('boom')
    })
    expect(console.error).toHaveBeenCalledWith(
      '[my-label]',
      expect.any(Error)
    )
  })

  it('gọi window.showToast với message error', async () => {
    const toastSpy = vi.fn()
    window.showToast = toastSpy

    await safeAsync('save-data', async () => {
      throw new Error('Permission denied')
    })

    expect(toastSpy).toHaveBeenCalledWith(
      'Lỗi save-data: Permission denied',
      'danger'
    )
  })

  it('không crash khi window.showToast không tồn tại', async () => {
    // window không có showToast
    const result = await safeAsync('test', async () => {
      throw new Error('error')
    })
    expect(result).toBeNull() // chỉ log + return null, không throw
  })

  it('xử lý error không phải Error object', async () => {
    const toastSpy = vi.fn()
    window.showToast = toastSpy

    await safeAsync('weird', async () => {
      throw 'string error'
    })

    expect(toastSpy).toHaveBeenCalledWith('Lỗi weird: string error', 'danger')
  })

  it('gọi function với arguments là async function', async () => {
    let called = false
    const fn = async () => { called = true; return 'done' }
    const result = await safeAsync('label', fn)
    expect(called).toBe(true)
    expect(result).toBe('done')
  })

  it('cũng work với function sync (không async)', async () => {
    const result = await safeAsync('sync-op', () => 'sync-result')
    expect(result).toBe('sync-result')
  })
})
