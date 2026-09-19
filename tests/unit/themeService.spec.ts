import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// electron 的 app/nativeTheme 用 stub（纯逻辑测试）
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn() }
}))
import { createThemeService } from '../../src/main/services/themeService'

let userData: string
let svc: ReturnType<typeof createThemeService>

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'notara-theme-'))
  svc = createThemeService(() => userData)
})

describe('themeService', () => {
  it('默认 system/light，无自定义主题', async () => {
    const info = await svc.getThemeInfo()
    expect(info.setting).toBe('system')
    expect(info.effective).toBe('light')
    expect(info.customThemes).toEqual([])
    expect(info.customCss).toBeNull()
  })

  it('set 持久化并可读回', async () => {
    await svc.setThemeSetting('dark')
    expect((await svc.getThemeInfo()).setting).toBe('dark')
  })

  it('自定义主题：扫描 themes/*.css，选中返回内容', async () => {
    const dir = join(userData, 'themes')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'my.css'), ':root{--accent:red}', 'utf8')
    const info = await svc.getThemeInfo()
    expect(info.customThemes).toEqual([{ name: 'my' }])
    const applied = await svc.setThemeSetting('my')
    expect(applied.customCss).toBe(':root{--accent:red}')
    expect(applied.effective).toBe('light')
  })

  it('选中的自定义主题文件被删除后回落 system', async () => {
    const dir = join(userData, 'themes')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'x.css'), 'a', 'utf8')
    await svc.setThemeSetting('x')
    await rm(join(dir, 'x.css'))
    const info = await svc.getThemeInfo()
    expect(info.setting).toBe('system')
  })

  it('内置保留名（dark/light/system）同名 css 不列入自定义主题', async () => {
    const dir = join(userData, 'themes')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'dark.css'), ':root{}', 'utf8')
    await writeFile(join(dir, 'light.css'), ':root{}', 'utf8')
    await writeFile(join(dir, 'system.css'), ':root{}', 'utf8')
    await writeFile(join(dir, 'brand.css'), ':root{}', 'utf8')
    const info = await svc.getThemeInfo()
    expect(info.customThemes).toEqual([{ name: 'brand' }])
  })
})
