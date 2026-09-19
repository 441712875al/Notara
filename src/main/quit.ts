import { app, BrowserWindow } from 'electron'
import { stopAll } from './services/watchService'

/** 退出握手期间渲染侧 flush 完成的 ack 回调（由 ipc/app.ts 收到 AppFlushDone 时触发） */
let ack: ((senderId: number) => void) | null = null

/** 握手进行中标记；quitPendingDialog / cancelQuit 据此判断是否需要介入 */
let quitting = false

/** 当前握手的兜底定时器（3s 强退 / 弹窗期间 60s 等待用户） */
let timer: ReturnType<typeof setTimeout> | null = null

/** 渲染侧报告 flush 完成（ipc 层转接；无握手进行中则忽略） */
export function ackFlushDone(senderId: number): void {
  ack?.(senderId)
}

/** 无响应兜底：渲染侧 3s 内未 ack 也强制退出 */
const QUIT_ACK_TIMEOUT_MS = 3000

/** 弹确认框时的兜底：渲染侧将弹未保存确认，撤回 3s 强退改为等待用户；防渲染进程崩溃后永久挂起 */
const QUIT_DIALOG_TIMEOUT_MS = 60_000

function exitNow(): void {
  if (timer) clearTimeout(timer)
  timer = null
  ack = null
  quitting = false
  stopAll()
  app.exit(0)
}

/**
 * 渲染侧即将弹出未保存确认框：撤销 3s 强退兜底，改挂 60s 等待用户的兜底
 * （用户确认期间不得强制退出）。无握手进行中则忽略（例如取消退出后迟到的调用）。
 */
export function quitPendingDialog(): void {
  if (!quitting) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(exitNow, QUIT_DIALOG_TIMEOUT_MS)
}

/**
 * 用户取消退出：撤销兜底并清空握手状态，应用继续运行。
 * 迟到的 flushDone 因 ack 已置 null 而被忽略；下次 before-quit 可重建握手。
 */
export function cancelQuit(): void {
  if (!quitting) return
  if (timer) clearTimeout(timer)
  timer = null
  quitting = false
  ack = null
}

/**
 * 安装退出握手：⌘Q / app.quit() 时先广播 `app:flush-before-quit`，
 * 等各窗口 flushDone ack 或超时后 `app.exit(0)`。
 *
 * 渲染侧发现未保存标签时会先调 `app:quit-pending`（撤销 3s 强退、改 60s 等待用户），
 * 用户取消则调 `app:quit-cancel` 中止退出。app.exit 跳过 will-quit，
 * 故收尾（关闭 fs watcher）在 exitNow 内显式执行。
 */
export function installQuitHandshake(): void {
  app.on('before-quit', (e) => {
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    if (wins.length === 0) return // 无窗口：放行正常退出
    e.preventDefault()
    if (quitting) return // 已在握手中：忽略重复触发（超时兜底保证终将退出）
    quitting = true

    const acked = new Set<number>()
    const total = wins.length
    timer = setTimeout(exitNow, QUIT_ACK_TIMEOUT_MS)

    ack = (senderId) => {
      acked.add(senderId) // 同窗口重复 ack 只计一次
      if (acked.size < total) return
      exitNow()
    }

    for (const w of wins) w.webContents.send('main:event', { type: 'app:flush-before-quit' })
  })
}
