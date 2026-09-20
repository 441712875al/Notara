import { create } from 'zustand'
import type { ThemeInfo, ThemeSetting } from '@shared/types'
import { api } from '../lib/api'
import { editors } from '../lib/editorRegistry'

/**
 * 把主题信息落到 DOM：data-theme 交给 CSS 变量切换亮暗，
 * 自定义主题 CSS 以 <style id="custom-theme-style"> 注入（切走时移除）。
 */
export function applyThemeToDom(info: ThemeInfo): void {
  document.documentElement.dataset.theme = info.effective
  // 已就绪的编辑器实例走 vditor 官方 setTheme 一站式切换：
  // 暗色换 .vditor--dark（IR 标记/callout）+ content-theme dark.css + 高亮 github-dark.min.css
  // （亮色 github 的深蓝 token 在暗底上不可读）；亮色对应换回 classic/light/github。
  // content-theme 与 hljs 样式是 document 级共享 link（同 id），多实例幂等。
  const dark = info.effective === 'dark'
  editors.forEach((vd) => {
    vd.setTheme(dark ? 'dark' : 'classic', dark ? 'dark' : 'light', dark ? 'github-dark' : 'github')
  })
  // DOM 兜底：editors 只存 init 完成的实例，初始化竞态窗口内的容器仍以类切换保证不漏
  // （新开标签的补齐由 Editor 的 after 回调负责）
  document.querySelectorAll('.vditor').forEach((el) => el.classList.toggle('vditor--dark', dark))
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
  customCss: string | null
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
