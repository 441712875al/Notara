import { create } from 'zustand'
import type { ThemeInfo, ThemeSetting } from '@shared/types'
import { api } from '../lib/api'

/**
 * 把主题信息落到 DOM：data-theme 交给 CSS 变量切换亮暗，
 * 自定义主题 CSS 以 <style id="custom-theme-style"> 注入（切走时移除）。
 */
export function applyThemeToDom(info: ThemeInfo): void {
  document.documentElement.dataset.theme = info.effective
  document.getElementById('custom-theme-style')?.remove()
  if (info.customCss) {
    const style = document.createElement('style')
    style.id = 'custom-theme-style'
    style.textContent = info.customCss
    document.head.appendChild(style)
  }
}

interface ThemeStore {
  setting: ThemeSetting
  effective: 'light' | 'dark'
  customCss?: string | null
  customThemes: { name: string }[]
  init: () => Promise<void>
  set: (setting: ThemeSetting) => Promise<void>
  apply: (info: ThemeInfo) => void
}

export const useThemeStore = create<ThemeStore>((zustandSet) => ({
  setting: 'system',
  effective: 'light',
  customCss: null,
  customThemes: [],
  async init() {
    const info = await api.getTheme()
    applyThemeToDom(info)
    zustandSet({
      setting: info.setting,
      effective: info.effective,
      customCss: info.customCss,
      customThemes: info.customThemes
    })
  },
  async set(setting) {
    const info = await api.setTheme(setting)
    applyThemeToDom(info)
    zustandSet({
      setting: info.setting,
      effective: info.effective,
      customCss: info.customCss,
      customThemes: info.customThemes
    })
  },
  // 仅用于「跟随系统」时的系统外观变化：setting/customThemes 不变，只刷新生效亮暗
  apply(info) {
    applyThemeToDom(info)
    zustandSet({ effective: info.effective, customCss: info.customCss })
  }
}))
