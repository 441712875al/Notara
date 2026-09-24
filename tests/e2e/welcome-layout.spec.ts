import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 本仓库 package.json 无 "type": "module"，Playwright 将 .ts 转译为 CJS，故用 __dirname
const repoRoot = join(__dirname, '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')

/**
 * 欢迎扉页与侧栏的版面关系。
 *
 * 回归点：`.welcome` 曾与 `.main-area` 平级同为 `.app` 的纵向子块，于是侧栏被扉页的高度
 * 顶到下方 —— 只剩左下角一截矮框（最近项多时甚至被压成 0 高、整页溢出窗口）。
 * 现在扉页收进正文列，两栏都必须贯满标题条下缘到窗口底。
 */
test('欢迎页：侧栏贯满整列，扉页在正文列内滚动，窗口不溢出', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })

  // --user-data-dir 隔离 userData；预置足量最近项，把「扉页比窗口还高」这一分支也覆盖到
  const userData = join(ws, '.userdata')
  await mkdir(userData, { recursive: true })
  const recents = Array.from({ length: 8 }, (_, i) => ({
    root: i === 0 ? ws : join(ws, `示例工作区-${i + 1}`),
    lastOpenedAt: Date.now() - i * 1000
  }))
  await writeFile(join(userData, 'recent.json'), JSON.stringify(recents, null, 2), 'utf8')

  const app: ElectronApplication = await _electron.launch({
    args: [join(repoRoot, '.'), `--user-data-dir=${userData}`],
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page: Page = await app.firstWindow()

  await expect(page.getByTestId('welcome')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('sidebar')).toBeVisible()

  const geom = await page.evaluate(() => {
    const box = (sel: string): { x: number; y: number; w: number; h: number } => {
      const r = document.querySelector(sel)!.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      sidebar: box('.sidebar'),
      content: box('.content'),
      welcome: box('.welcome')
    }
  })

  // 侧栏：贴左、正文列左边、贯到窗口底（不再被扉页挤成半截）
  expect(geom.sidebar.x).toBe(0)
  expect(geom.sidebar.h).toBeGreaterThan(geom.innerHeight * 0.8)
  expect(geom.sidebar.y + geom.sidebar.h).toBeCloseTo(geom.innerHeight, 0)
  // 正文列紧贴侧栏右侧（中间只隔那条 1px 占位的分界线），扉页占满正文列
  // （同样贯到底，自身滚动而非把整页撑高）
  expect(Math.abs(geom.content.x - (geom.sidebar.x + geom.sidebar.w))).toBeLessThanOrEqual(2)
  expect(Math.abs(geom.content.w + geom.sidebar.w - geom.innerWidth)).toBeLessThanOrEqual(2)
  expect(geom.welcome.x).toBeCloseTo(geom.content.x, 0)
  expect(geom.welcome.y + geom.welcome.h).toBeCloseTo(geom.innerHeight, 0)
  // 最近项多于一个屏时，滚的是扉页，窗口本身不出现溢出滚动
  expect(geom.scrollHeight).toBeLessThanOrEqual(geom.innerHeight + 1)

  await app.close()
  await rm(ws, { recursive: true, force: true })
})
