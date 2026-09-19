import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUi } from '../../src/renderer/src/stores/ui'

describe('ui store confirm 状态机', () => {
  beforeEach(() => {
    useUi.setState({ confirm: null })
  })

  it('askConfirm 写入 confirm；resolveConfirm(true) 清空并调 onConfirm', () => {
    const onConfirm = vi.fn()
    useUi.getState().askConfirm({ title: 't', text: 'x', confirmText: 'ok', onConfirm })
    expect(useUi.getState().confirm).not.toBeNull()
    useUi.getState().resolveConfirm(true)
    expect(useUi.getState().confirm).toBeNull()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('resolveConfirm(false) 清空并调 onCancel；未传 onCancel 则安全不抛错', () => {
    const onCancel = vi.fn()
    useUi
      .getState()
      .askConfirm({ title: 't', text: 'x', confirmText: 'ok', onConfirm: () => {}, onCancel })
    useUi.getState().resolveConfirm(false)
    expect(useUi.getState().confirm).toBeNull()
    expect(onCancel).toHaveBeenCalledTimes(1)

    // 未传 onCancel：清空但仍不抛错
    useUi.getState().askConfirm({ title: 't', text: 'x', confirmText: 'ok', onConfirm: () => {} })
    expect(() => useUi.getState().resolveConfirm(false)).not.toThrow()
    expect(useUi.getState().confirm).toBeNull()
  })

  it('resolveDiscard 清空 confirm 并调 onDiscard（先清空再回调）', () => {
    // 回调内断言 confirm 已被清空，验证「先 set 清空再回调」的时序
    const onDiscard = vi.fn(() => {
      expect(useUi.getState().confirm).toBeNull()
    })
    useUi.getState().askConfirm({
      title: 't',
      text: 'x',
      confirmText: 'ok',
      onConfirm: () => {},
      discard: { text: '不保存', onDiscard }
    })
    useUi.getState().resolveDiscard()
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(useUi.getState().confirm).toBeNull()
  })

  it('无 confirm 时 resolveConfirm / resolveDiscard 均安全', () => {
    expect(() => useUi.getState().resolveConfirm(true)).not.toThrow()
    expect(() => useUi.getState().resolveDiscard()).not.toThrow()
  })
})
