import { app, BrowserWindow } from 'electron'
import { stopAll } from './services/watchService'

/** 退出握手期间渲染侧 flush 完成的 ack 回调（由 ipc/app.ts 收到 AppFlushDone 时触发） */
let ack: ((senderId: number) => void) | null = null

/** 渲染侧报告 flush 完成（ipc 层转接；无握手进行中则忽略） */
export function ackFlushDone(senderId: number): void {
  ack?.(senderId)
}

/** 无响应兜底：渲染侧 3s 内未 ack 也强制退出 */
const QUIT_ACK_TIMEOUT_MS = 3000

/**
 * 安装退出握手：⌘Q / app.quit() 时先广播 `app:flush-before-quit`，
 * 等各窗口 flushDone ack 或超时后 `app.exit(0)`。
 *
 * 直接 app.exit 不触发窗口 close 事件，故退出路径不会弹脏标签确认框
 * （脏内容在渲染侧静默 flush；未命名标签的另存为只在关闭按钮路径处理）。
 * app.exit 亦跳过 will-quit，故收尾（关闭 fs watcher）在此显式执行。
 */
export function installQuitHandshake(): void {
  let quitting = false

  const exitNow = (): void => {
    ack = null
    stopAll()
    app.exit(0)
  }

  app.on('before-quit', (e) => {
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    if (wins.length === 0) return // 无窗口：放行正常退出
    e.preventDefault()
    if (quitting) return // 已在握手中：忽略重复触发（超时兜底保证终将退出）
    quitting = true

    const acked = new Set<number>()
    const total = wins.length
    const timer = setTimeout(exitNow, QUIT_ACK_TIMEOUT_MS)

    ack = (senderId) => {
      acked.add(senderId) // 同窗口重复 ack 只计一次
      if (acked.size < total) return
      clearTimeout(timer)
      exitNow()
    }

    for (const w of wins) w.webContents.send('main:event', { type: 'app:flush-before-quit' })
  })
}
