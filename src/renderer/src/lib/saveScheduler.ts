type Saver = (tabId: number) => Promise<void>

/**
 * 每标签页独立的防抖保存调度。
 * - schedule: 标记 pending 并（重）启动 500ms 定时器
 * - flushOne/flushAll: 绕过定时器立即保存（切标签/关标签/失焦/退出）
 * - 保存失败时保持 pending，下次输入或 flush 重试
 */
export class SaveScheduler {
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  private pending = new Set<number>()
  private saver: Saver | null = null

  constructor(private delayMs: number) {}

  setSaver(fn: Saver): void {
    this.saver = fn
  }

  schedule(tabId: number): void {
    this.pending.add(tabId)
    const old = this.timers.get(tabId)
    if (old) clearTimeout(old)
    this.timers.set(
      tabId,
      setTimeout(() => {
        this.timers.delete(tabId)
        void this.flushOne(tabId)
      }, this.delayMs)
    )
  }

  cancel(tabId: number): void {
    const t = this.timers.get(tabId)
    if (t) clearTimeout(t)
    this.timers.delete(tabId)
    this.pending.delete(tabId)
  }

  isPending(tabId: number): boolean {
    return this.pending.has(tabId)
  }

  async flushOne(tabId: number): Promise<void> {
    this.cancel(tabId)
    if (!this.saver) return
    try {
      await this.saver(tabId)
    } catch (e) {
      this.pending.add(tabId) // 失败保留，等待重试
      throw e
    }
  }

  async flushAll(): Promise<void> {
    const ids = [...this.pending]
    await Promise.all(
      ids.map((id) =>
        this.flushOne(id).catch(() => {
          /* flushAll 用于退出路径，单个失败不阻断其余 */
        })
      )
    )
  }
}

export const saveScheduler = new SaveScheduler(500)
