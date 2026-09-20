import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 本仓库 package.json 无 "type": "module"，Playwright 将 .ts 转译为 CJS，
// 故用 __dirname（import.meta 在 CJS 下不可用，Playwright 不做改写）
const repoRoot = join(__dirname, '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')
const themeCss = join(repoRoot, 'tests/fixtures/typora-theme/paper.css')

/** '#rrggbb' → 'rgb(r, g, b)'（computed style 的颜色串格式） */
const rgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

test('导入 Typora 主题：转换落盘、经菜单动作应用、内容样式生效', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })

  const app: ElectronApplication = await _electron.launch({
    args: [join(repoRoot, '.'), `--user-data-dir=${join(ws, '.userdata')}`],
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page: Page = await app.firstWindow()

  await expect(page.getByTestId(`tree-node-${join(ws, 'code.md')}`)).toBeVisible({ timeout: 10_000 })
  await page.getByTestId(`tree-node-${join(ws, 'code.md')}`).click()
  await expect(page.locator('.vditor-ir__preview')).toBeVisible({ timeout: 10_000 })

  // 1) 直接带路径调 IPC（跳过原生选择框，e2e 无法驱动系统对话框）
  const result = await page.evaluate(
    (p) => window.notara.importTyporaTheme(p),
    themeCss
  )
  expect(result).not.toBeNull()
  expect(result!.name).toBe('paper')
  expect(result!.rulesMapped).toBeGreaterThan(5)
  expect(result!.assetsCopied).toBe(1)
  expect(result!.missingAssets).toEqual([])

  // 2) 走真实渲染路径切换主题：主进程广播菜单动作 → store.set → customCss 注入
  await app.evaluate((a, action) => {
    const win = a.BrowserWindow.getAllWindows()[0]
    win?.webContents.send('main:event', { type: 'menu:action', action })
  }, 'set-theme:paper')
  // <style id="custom-theme-style"> 注入即应用完成
  await expect(page.locator('#custom-theme-style')).toBeAttached()
  await expect
    .poll(() => page.evaluate(() => window.notara.getTheme().then((i) => i.setting)))
    .toBe('paper')

  // 3) 变量桥接生效：主题底色/选区色
  const vars = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    selection: getComputedStyle(document.documentElement).getPropertyValue('--selection').trim()
  }))
  expect(vars.bg).toBe('#fbf3e4')
  expect(vars.selection).toBe('rgba(160, 82, 45, 0.25)')

  // 4) 选择器重写生效：代码块底板 + token 高亮（hljs 主题同特异性被后注入压过）
  await expect(page.locator('.vditor-ir__preview .hljs-keyword').first()).toBeAttached()
  const styles = await page.evaluate(() => {
    const fence = document.querySelector('.vditor-ir__preview')!
    const kw = document.querySelector('.vditor-ir__preview .hljs-keyword')!
    return {
      fenceBg: getComputedStyle(fence).backgroundColor,
      keywordColor: getComputedStyle(kw).color
    }
  })
  expect(styles.fenceBg).toBe(rgb('#f3e8d3'))
  expect(styles.keywordColor).toBe(rgb('#9a4f2f'))

  // 5) 落盘产物：主题 css 带头注释报告，字体资源已复制
  const themesDir = join(ws, '.userdata', 'themes')
  const files = await readdir(themesDir)
  expect(files).toContain('paper.css')
  expect(files).toContain('paper.assets')
  const written = await readFile(join(themesDir, 'paper.css'), 'utf8')
  expect(written).toContain('由 Typora 主题转换生成')
  expect(written).toContain('源文件')
  expect(written).toContain('--bg: #fbf3e4')
  expect(await readFile(join(themesDir, 'paper.assets', 'dummy.woff2'), 'utf8')).toBe('wOF2')

  // 6) 切回内置主题：customCss 注入被移除，恢复跟随内置变量
  await app.evaluate((a, action) => {
    const win = a.BrowserWindow.getAllWindows()[0]
    win?.webContents.send('main:event', { type: 'menu:action', action })
  }, 'set-theme:light')
  await expect(page.locator('#custom-theme-style')).toHaveCount(0)
  const bgAfter = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  )
  expect(bgAfter).not.toBe('#fbf3e4')

  await app.close()
  await rm(ws, { recursive: true, force: true })
})
