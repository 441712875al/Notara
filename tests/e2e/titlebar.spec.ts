import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 本仓库 package.json 无 "type": "module"，Playwright 将 .ts 转译为 CJS，
// 故用 __dirname（import.meta 在 CJS 下不可用，Playwright 不做改写）
const repoRoot = join(__dirname, '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')

test('顶栏拖拽区：标签容器不吃满整条，+ 按钮右侧留出可拖拽空隙', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })

  const app: ElectronApplication = await _electron.launch({
    args: [join(repoRoot, '.'), `--user-data-dir=${join(ws, '.userdata')}`],
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page: Page = await app.firstWindow()

  // 打开一个文件让 tabbar 渲染（零标签时是欢迎态的 ::before 拖拽条）
  await expect(page.getByTestId(`tree-node-${join(ws, 'code.md')}`)).toBeVisible({
    timeout: 10_000
  })
  await page.getByTestId(`tree-node-${join(ws, 'code.md')}`).click()
  await expect(page.getByTestId('tab-0')).toBeVisible({ timeout: 10_000 })

  // 标签容器 flex-grow 0（不吃满）、自身 no-drag（点击标签不被当作拖窗口），
  // + 按钮到顶栏右缘留有 >= 40px 空隙——这段空白是 .tabbar 的 drag 区，
  // 拖动窗口与双击缩放（macOS 系统行为）都依赖它存在
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.tabbar')!
    const tabs = document.querySelector('.tabbar-tabs')!
    const btn = document.querySelector('.tab-new')!
    const cs = getComputedStyle(tabs)
    return {
      flexGrow: cs.flexGrow,
      region: cs.getPropertyValue('-webkit-app-region').trim(),
      gapRight: bar.getBoundingClientRect().right - btn.getBoundingClientRect().right
    }
  })
  expect(m.flexGrow).toBe('0')
  expect(m.region).toBe('no-drag')
  expect(m.gapRight).toBeGreaterThanOrEqual(40)

  await app.close()
  await rm(ws, { recursive: true, force: true })
})
