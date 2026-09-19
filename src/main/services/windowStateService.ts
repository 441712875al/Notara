import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { screen } from 'electron'
import type { WindowState, WindowStatePayload } from '@shared/types'

/**
 * 窗口状态持久化：窗口位置尺寸 + 会话负载（工作区/标签/激活项）。
 * - save：写出 `window-state.json`（覆盖式，非原子；崩溃时读侧有兜底）
 * - load：读回并校验 bounds 是否落在任一可见显示器内（外接屏拔除后不恢复不可见位置）
 */
export function createWindowStateService(userDataDir: () => string) {
  const file = (): string => path.join(userDataDir(), 'window-state.json')

  async function save(bounds: Electron.Rectangle, payload: WindowStatePayload): Promise<void> {
    await fs.mkdir(path.dirname(file()), { recursive: true })
    await fs.writeFile(file(), JSON.stringify({ bounds, payload }, null, 2), 'utf8')
  }

  async function load(): Promise<WindowState | null> {
    let raw: string
    try {
      raw = await fs.readFile(file(), 'utf8')
    } catch {
      return null // 首启：文件不存在
    }
    try {
      const st = JSON.parse(raw) as WindowState
      const out: WindowState = {
        payload: st.payload ?? { workspaceRoot: null, tabPaths: [], activeIndex: -1 }
      }
      if (st.bounds) {
        // bounds 需至少与任一显示器工作区有交集才恢复
        const b = st.bounds
        const visible = screen.getAllDisplays().some((d) => {
          const a = d.workArea
          return (
            b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
          )
        })
        if (visible) out.bounds = b
      }
      return out
    } catch {
      return null // 内容损坏：视为无状态
    }
  }

  return { save, load }
}
