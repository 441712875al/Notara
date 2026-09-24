import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useUi,
  clampSidebarWidth,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN
} from '../../src/renderer/src/stores/ui'

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

describe('ui store 侧栏宽度', () => {
  beforeEach(() => {
    // unit 工程跑在 node 环境，没有 window：视口宽度按用例自设
    vi.stubGlobal('window', { innerWidth: 1200 })
    useUi.setState({ sidebarWidth: SIDEBAR_DEFAULT, sidebarRestoreWidth: SIDEBAR_DEFAULT })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('夹进 [下限, 上限]', () => {
    useUi.getState().setSidebarWidth(300)
    expect(useUi.getState().sidebarWidth).toBe(300)
    useUi.getState().setSidebarWidth(SIDEBAR_MAX + 999)
    expect(useUi.getState().sidebarWidth).toBe(SIDEBAR_MAX)
    // 小数取整，避免留下 219.5 这种把文件树压出半像素缝的宽度
    useUi.getState().setSidebarWidth(219.5)
    expect(useUi.getState().sidebarWidth).toBe(220)
  })

  it('窄于下限即收起为 0，而不是挤成一条缝', () => {
    useUi.getState().setSidebarWidth(SIDEBAR_MIN - 1)
    expect(useUi.getState().sidebarWidth).toBe(0)
    // 非法值同样收起，不让 NaN 漏进 style
    useUi.getState().setSidebarWidth(Number.NaN)
    expect(useUi.getState().sidebarWidth).toBe(0)
  })

  it('上限随窗口变窄而收，给正文留位', () => {
    vi.stubGlobal('window', { innerWidth: 600 })
    expect(clampSidebarWidth(999)).toBe(240) // 600 - 360
    // 窄到下限都放不下时仍保底给下限宽，不至于算出 < 下限 的自相矛盾值
    vi.stubGlobal('window', { innerWidth: 200 })
    expect(clampSidebarWidth(999)).toBe(SIDEBAR_MIN)
  })

  it('toggleSidebar 收起后按记忆宽度展开，记忆宽度不被 0 覆盖', () => {
    useUi.getState().setSidebarWidth(340)
    useUi.getState().toggleSidebar()
    expect(useUi.getState().sidebarWidth).toBe(0)
    expect(useUi.getState().sidebarRestoreWidth).toBe(340)
    useUi.getState().toggleSidebar()
    expect(useUi.getState().sidebarWidth).toBe(340)
  })

  it('展开时记忆宽度按当前窗口重新夹一次', () => {
    useUi.getState().setSidebarWidth(500)
    useUi.getState().toggleSidebar() // 收起
    vi.stubGlobal('window', { innerWidth: 700 }) // 窗口变窄：上限降到 340
    useUi.getState().toggleSidebar()
    expect(useUi.getState().sidebarWidth).toBe(340)
  })
})
