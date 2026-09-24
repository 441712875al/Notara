import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 本仓库 package.json 无 "type": "module"，Playwright 将 .ts 转译为 CJS，
// 故用 __dirname（import.meta 在 CJS 下不可用，Playwright 不做改写）
const repoRoot = join(__dirname, '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')

test('代码块复制按钮：CSP 拦截内联 onclick，事件委托接管后点击可复制且不误展开', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })

  const app: ElectronApplication = await _electron.launch({
    args: [join(repoRoot, '.'), `--user-data-dir=${join(ws, '.userdata')}`],
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page: Page = await app.firstWindow()

  await expect(page.getByTestId(`tree-node-${join(ws, 'code.md')}`)).toBeVisible({ timeout: 10_000 })
  await page.getByTestId(`tree-node-${join(ws, 'code.md')}`).click()

  // 折叠态悬停渲染代码块 → 复制按钮出现
  const preview = page.locator('.vditor-ir__node[data-type="code-block"] .vditor-ir__preview')
  await expect(preview).toBeVisible({ timeout: 10_000 })
  await preview.hover()
  const copyBtn = page.locator('.vditor-copy span')
  await expect(copyBtn).toBeVisible()

  await copyBtn.click()

  // 1) 反馈「已复制」；2) 剪贴板为代码内容；3) 未触发「点击展开代码块」
  await expect(copyBtn).toHaveAttribute('aria-label', '已复制')
  const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clipboardText).toContain('const a = 1;')
  expect(clipboardText).toContain('const b = 2;')
  await expect(page.locator('.vditor-ir__node--expand[data-type="code-block"]')).toHaveCount(0)

  await app.close()
  await rm(ws, { recursive: true, force: true })
})
