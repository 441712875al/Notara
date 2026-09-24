import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 本仓库 package.json 无 "type": "module"，Playwright 将 .ts 转译为 CJS，故用 __dirname
const repoRoot = join(__dirname, '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')

/** 起一个隔离了 userData 的实例（recent/window-state 都落进 temp，不碰开发者真实配置） */
async function launch(ws: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({
    args: [join(repoRoot, '.'), `--user-data-dir=${join(ws, '.userdata')}`],
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page = await app.firstWindow()
  // attached 而非 visible：收起态宽度为 0，侧栏在 DOM 里但不「可见」
  await page.getByTestId('sidebar').waitFor({ state: 'attached', timeout: 10_000 })
  return { app, page }
}

const sidebarWidth = (page: Page): Promise<number> =>
  page.evaluate(() => document.querySelector('.sidebar')!.getBoundingClientRect().width)

/** 按住分界线拖到目标 x（真实指针事件序列，非直接改 store） */
async function dragResizerTo(page: Page, targetX: number): Promise<void> {
  const box = (await page.getByTestId('sidebar-resizer').boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  // 分两步：先越过 3px 阈值进入拖动，再到位
  await page.mouse.move(box.x + box.width / 2 + 10, y)
  await page.mouse.move(targetX, y)
  await page.mouse.up()
}

test('侧栏可拖动改宽、可一键收起，宽度跨重启保留', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })
  await mkdir(join(ws, '.userdata'), { recursive: true })

  const { app, page } = await launch(ws)
  // 起点：默认宽 220（e2e 无 window-state.json，走默认值）
  expect(await sidebarWidth(page)).toBe(220)

  // 拖动到 320：宽度跟着指针走
  await dragResizerTo(page, 320)
  const widened = await sidebarWidth(page)
  expect(widened).toBeGreaterThan(300)
  expect(widened).toBeLessThan(340)

  // 一键收起：标题栏的按钮
  await page.getByTestId('sidebar-collapse').click()
  expect(await sidebarWidth(page)).toBe(0)
  // 收起后正文列接管整幅，窗口本身不出现横向溢出
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  )
  expect(noOverflow).toBe(true)

  // 收起态点分界线即展开，且回到收起前的宽度（不是 220）
  // 先验命中区本身：必须整条落在窗口内。曾把 5px 命中区居中跨在边界上，
  // 屏上只剩 3px，鼠标根本摸不到，收起后就成了死结
  const strip = (await page.getByTestId('sidebar-resizer').boundingBox())!
  expect(strip.x).toBeGreaterThanOrEqual(0)
  expect(strip.width).toBeGreaterThanOrEqual(6)

  // 悬停这条边即探出箭头路标；箭头一现，指针移到它身上（超出 6px）仍接得住
  await page.mouse.move(strip.x + 3, strip.y + strip.height / 2)
  await expect(page.locator('.sidebar-grip')).toBeVisible()
  await page.mouse.move(strip.x + 14, strip.y + strip.height / 2)
  await expect(page.locator('.sidebar-grip')).toBeVisible()

  const rz = (await page.getByTestId('sidebar-resizer').boundingBox())!
  await page.mouse.click(rz.x + rz.width / 2, rz.y + rz.height / 2)
  const restored = await sidebarWidth(page)
  expect(Math.abs(restored - widened)).toBeLessThan(4)

  // 等一次定时持久化（1s 间隔），再重启验证宽度被记住
  await page.waitForTimeout(1500)
  const persisted = JSON.parse(
    await readFile(join(ws, '.userdata', 'window-state.json'), 'utf8')
  ) as { payload: { sidebarWidth?: number } }
  expect(persisted.payload.sidebarWidth).toBeGreaterThan(300)
  await app.close()

  const again = await launch(ws)
  expect(await sidebarWidth(again.page)).toBeGreaterThan(300)
  await again.app.close()

  // 收起态同样跨重启保留（0 是合法宽度，不能被当成「无此字段」而回落到默认值）
  await writeFile(
    join(ws, '.userdata', 'window-state.json'),
    JSON.stringify({
      payload: { workspaceRoot: ws, tabPaths: [], activeIndex: -1, sidebarWidth: 0 }
    }),
    'utf8'
  )
  const collapsed = await launch(ws)
  expect(await sidebarWidth(collapsed.page)).toBe(0)
  await collapsed.app.close()

  await rm(ws, { recursive: true, force: true })
})
