import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// node 测试环境无 electron：整体 stub，并捕获 before-quit handler / app.exit / 窗口列表
const h = vi.hoisted(() => {
  type Win = { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }
  const handlers = new Map<string, (e: { preventDefault: () => void }) => void>()
  const state = { windows: [] as Win[] }
  return {
    handlers,
    state,
    exit: vi.fn(),
    setWindows: (w: Win[]): void => {
      state.windows = w
    }
  }
})

vi.mock('electron', () => ({
  app: {
    on: (name: string, cb: (e: { preventDefault: () => void }) => void): void => {
      h.handlers.set(name, cb)
    },
    exit: h.exit
  },
  BrowserWindow: { getAllWindows: (): unknown[] => h.state.windows }
}))

vi.mock('../../src/main/services/watchService', () => ({ stopAll: vi.fn() }))

import {
  ackFlushDone,
  cancelQuit,
  installQuitHandshake,
  quitPendingDialog
} from '../../src/main/quit'
import { stopAll } from '../../src/main/services/watchService'

const stopAllMock = vi.mocked(stopAll)

function makeWin() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

/** 触发已注册的 before-quit handler，返回事件对象以便断言 preventDefault */
function fireBeforeQuit(): { preventDefault: ReturnType<typeof vi.fn> } {
  const e = { preventDefault: vi.fn() }
  h.handlers.get('before-quit')?.(e)
  return e
}

beforeEach(() => {
  vi.useFakeTimers()
  cancelQuit() // 清理上一用例可能残留的握手状态（无握手中为幂等空操作）
  h.handlers.clear()
  h.exit.mockClear()
  stopAllMock.mockClear()
  h.setWindows([])
  installQuitHandshake()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('quit 握手', () => {
  it('单窗口 ack 后 app.exit(0) 恰一次且 stopAll 被调用', () => {
    const w = makeWin()
    h.setWindows([w])
    const e = fireBeforeQuit()
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(w.webContents.send).toHaveBeenCalledWith('main:event', { type: 'app:flush-before-quit' })

    ackFlushDone(1)
    expect(h.exit).toHaveBeenCalledTimes(1)
    expect(h.exit).toHaveBeenCalledWith(0)
    expect(stopAllMock).toHaveBeenCalledTimes(1)
  })

  it('渲染侧不 ack 时 3s 超时强制退出', () => {
    h.setWindows([makeWin()])
    fireBeforeQuit()
    vi.advanceTimersByTime(2999)
    expect(h.exit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(h.exit).toHaveBeenCalledTimes(1)
    expect(h.exit).toHaveBeenCalledWith(0)
  })

  it('quitPendingDialog 撤销 3s 强退，改 60s 等待用户后强制退出', () => {
    h.setWindows([makeWin()])
    fireBeforeQuit()
    quitPendingDialog()
    vi.advanceTimersByTime(3000) // 原 3s 兜底已撤销
    expect(h.exit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(57_000) // 累计到 60s
    expect(h.exit).toHaveBeenCalledTimes(1)
    expect(h.exit).toHaveBeenCalledWith(0)
  })

  it('cancelQuit 后超时不退出；再次 before-quit 可重建握手并正常退出', () => {
    h.setWindows([makeWin()])
    fireBeforeQuit()
    quitPendingDialog()
    cancelQuit()
    vi.advanceTimersByTime(120_000)
    expect(h.exit).not.toHaveBeenCalled()

    fireBeforeQuit() // 握手可重建
    ackFlushDone(1)
    expect(h.exit).toHaveBeenCalledTimes(1)
    expect(h.exit).toHaveBeenCalledWith(0)
  })

  it('多窗口需全部 ack 才退出', () => {
    h.setWindows([makeWin(), makeWin()])
    fireBeforeQuit()
    ackFlushDone(1)
    expect(h.exit).not.toHaveBeenCalled()
    ackFlushDone(2)
    expect(h.exit).toHaveBeenCalledTimes(1)
    expect(h.exit).toHaveBeenCalledWith(0)
  })

  it('同窗口重复 ack 只计一次', () => {
    h.setWindows([makeWin(), makeWin()])
    fireBeforeQuit()
    ackFlushDone(1)
    ackFlushDone(1) // 重复：不应被当作第二个窗口
    expect(h.exit).not.toHaveBeenCalled()
    ackFlushDone(2)
    expect(h.exit).toHaveBeenCalledTimes(1)
  })

  it('cancelQuit 后迟到的 ackFlushDone 被忽略（握手已复位，无 timer 武装）', () => {
    h.setWindows([makeWin()])
    fireBeforeQuit()
    quitPendingDialog()
    cancelQuit()
    ackFlushDone(1) // 迟到 ack：ack 已置 null，应被忽略而非触发 exit
    // 推进超过 60s 的弹窗兜底上限：若 cancelQuit 未清 timer，此处置身会被强退捕获
    vi.advanceTimersByTime(65_000)
    expect(h.exit).not.toHaveBeenCalled()
  })

  it('quitPendingDialog 在非 quitting 时空操作（不武装任何 timer）', () => {
    quitPendingDialog() // 无 before-quit：quitting=false，应直接返回
    vi.advanceTimersByTime(65_000) // 覆盖 3s 与 60s 两档兜底，任一被武装都会被捕获
    expect(h.exit).not.toHaveBeenCalled()
  })
})
