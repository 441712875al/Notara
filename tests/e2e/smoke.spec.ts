import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** preload contextBridge 暴露的最小面（e2e 不在 tsc 工程内，此处自声明避免依赖全局 env.d.ts） */
interface NotaraShape {
  exportHtml: (sourcePath: string, html: string) => Promise<{ htmlPath: string }>
  createEntry: (dir: string, name: string, kind: 'file' | 'directory') => Promise<{ path: string }>
}

// 本仓库 package.json 无 "type": "module"，Playwright 将 .ts 转译为 CJS，
// 故用 __dirname（import.meta 在 CJS 下不可用，Playwright 不做改写）
const repoRoot = join(__dirname, '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')

test('打开工作区 → 编辑 → 自动保存 → 导出 HTML', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })

  const app: ElectronApplication = await _electron.launch({
    // --user-data-dir：把 userData（recent.json / window-state.json / themes 等）
    // 隔离进本次 temp 工作区，避免污染开发者真实 ~/Library/Application Support/notara
    args: [join(repoRoot, '.'), `--user-data-dir=${join(ws, '.userdata')}`],
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page: Page = await app.firstWindow()

  // 文件树出现并打开 README.md
  await expect(page.getByTestId(`tree-node-${join(ws, 'README.md')}`)).toBeVisible({
    timeout: 10_000
  })
  await page.getByTestId(`tree-node-${join(ws, 'README.md')}`).click()

  // 等 vditor IR 真正初始化（内容渲染出来）再交互：
  // .vditor 容器先于 vditor 异步 init 可见，过早点击会落在未就绪的编辑区导致按键丢失
  const ir = page.locator('.vditor-ir > pre')
  await expect(ir).toBeVisible()
  await expect(ir).toContainText('E2E 工作区')

  // 编辑（末尾追加一行）
  await ir.click()
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.type('E2E-EDIT-MARK')

  // 自动保存：App 侧 500ms 防抖，叠加 vditor IR 对 input 回调自身的防抖，实测落盘约 1.4s。
  // 用 expect.poll 轮询读盘，避免写死等待时长带来的偶发失败
  await expect
    .poll(() => readFile(join(ws, 'README.md'), 'utf8'), { timeout: 5_000 })
    .toContain('E2E-EDIT-MARK')

  // 通过暴露的 API 直接导出 HTML（绕过菜单）。
  // 注意：preload 已解包 IpcResult 信封，成功时直接返回 value（失败则 throw）
  const r = await page.evaluate(
    (src) => (window as unknown as NotaraShape).notara.exportHtml(src, '<h1>导出</h1>'),
    join(ws, 'README.md')
  )
  expect(r.htmlPath).toBe(join(ws, 'README.html'))
  const exported = await readFile(join(ws, 'README.html'), 'utf8')
  expect(exported).toContain('<h1>导出</h1>')
  expect(exported).toContain('<title>README</title>')

  // 错误码跨 contextBridge 会丢自定义属性（实测仅克隆 stack/message），
  // preload 改把码编码进 message 前缀（`[code] message`）；对已存在的 README.md
  // 调 createEntry 应 reject，且 message 带 `[target-exists] ` 前缀供渲染侧解回。
  const dupMessage = await page.evaluate(async (wsDir) => {
    try {
      await (window as unknown as NotaraShape).notara.createEntry(wsDir, 'README.md', 'file')
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, ws)
  expect(dupMessage).toMatch(/^\[target-exists\] /)

  // 退出（flush 握手路径）
  await app.close()
  await rm(ws, { recursive: true, force: true })
})
