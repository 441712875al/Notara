import { afterEach, describe, expect, it } from 'vitest'
import { applyThemeToDom } from '../../src/renderer/src/stores/theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.getElementById('custom-theme-style')?.remove()
})

describe('applyThemeToDom', () => {
  it('亮暗写入 data-theme，移除旧自定义样式', () => {
    applyThemeToDom({ setting: 'dark', effective: 'dark', customCss: null, customThemes: [] })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('自定义 CSS 注入 <style id=custom-theme-style>', () => {
    applyThemeToDom({ setting: 'my', effective: 'light', customCss: ':root{}', customThemes: [{ name: 'my' }] })
    const el = document.getElementById('custom-theme-style') as HTMLStyleElement
    expect(el).not.toBeNull()
    expect(el.textContent).toBe(':root{}')
    // 再切换到 dark 时移除
    applyThemeToDom({ setting: 'dark', effective: 'dark', customCss: null, customThemes: [] })
    expect(document.getElementById('custom-theme-style')).toBeNull()
  })
})
