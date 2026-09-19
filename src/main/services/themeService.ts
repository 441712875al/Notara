import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { app, nativeTheme } from 'electron'
import type { ThemeInfo, ThemeSetting } from '@shared/types'

// 内置主题保留名：themes/ 下的同名 css 会被 buildInfo 视为内置而不读取，故不列入自定义主题
const RESERVED_THEME_NAMES = ['system', 'light', 'dark']

/**
 * 主题服务：设置持久化（userData/settings.json）+ 自定义主题扫描（userData/themes/*.css）。
 * 目录通过 dirProvider 注入，便于纯逻辑单测；应用内使用文件末尾的单例。
 */
export function createThemeService(userDataDir: () => string) {
  const settingsFile = (): string => path.join(userDataDir(), 'settings.json')
  const themesDir = (): string => path.join(userDataDir(), 'themes')

  async function readSettings(): Promise<Record<string, unknown>> {
    try {
      const raw = JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as unknown
      return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  async function readSetting(): Promise<ThemeSetting> {
    const s = (await readSettings()).theme
    return typeof s === 'string' ? s : 'system'
  }

  // 合并写：保留 settings.json 中其它键，避免覆盖未来新增的设置项
  async function writeSetting(setting: ThemeSetting): Promise<void> {
    const merged = { ...(await readSettings()), theme: setting }
    await fs.mkdir(path.dirname(settingsFile()), { recursive: true })
    await fs.writeFile(settingsFile(), JSON.stringify(merged, null, 2), 'utf8')
  }

  async function listCustomThemes(): Promise<{ name: string }[]> {
    try {
      const files = await fs.readdir(themesDir())
      return files
        .filter((f) => f.endsWith('.css'))
        .map((f) => ({ name: f.slice(0, -4) }))
        .filter((t) => !RESERVED_THEME_NAMES.includes(t.name))
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }

  async function readCustomCss(name: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(themesDir(), `${name}.css`), 'utf8')
    } catch {
      return null
    }
  }

  async function buildInfo(setting: ThemeSetting): Promise<ThemeInfo> {
    let s = setting
    const dark = nativeTheme.shouldUseDarkColors
    let customCss: string | null = null
    if (s !== 'system' && !RESERVED_THEME_NAMES.includes(s)) {
      customCss = await readCustomCss(s)
      if (customCss === null) {
        s = 'system' // 自定义主题文件丢失，回落跟随系统
        await writeSetting(s)
      }
    }
    const effective: 'light' | 'dark' =
      s === 'dark' ? 'dark' : s === 'light' ? 'light' : dark ? 'dark' : 'light'
    return { setting: s, effective, customCss, customThemes: await listCustomThemes() }
  }

  return {
    async getThemeInfo(): Promise<ThemeInfo> {
      return buildInfo(await readSetting())
    },
    async setThemeSetting(setting: ThemeSetting): Promise<ThemeInfo> {
      await writeSetting(setting)
      return buildInfo(setting)
    },
    onSystemThemeChanged(cb: (dark: boolean) => void): void {
      nativeTheme.on('updated', () => cb(nativeTheme.shouldUseDarkColors))
    }
  }
}

// 应用内单例（测试用 createThemeService 注入目录）
export const themeService = createThemeService(() => app.getPath('userData'))
