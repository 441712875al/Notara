import { create } from 'zustand'
import type { ThemeSetting } from '@shared/types'

// Task 15 将完整化（真实主题加载/IPC/自定义主题/DOM 应用）；本任务仅提供
// menuActions 的 set-theme 默认分支所需的最小形态，避免提前引入类型依赖。
interface ThemeStore {
  setting: ThemeSetting
  set: (setting: ThemeSetting) => Promise<void>
}

export const useThemeStore = create<ThemeStore>(() => ({
  setting: 'system',
  async set() {
    /* Task 15 接入真实主题切换 */
  }
}))
