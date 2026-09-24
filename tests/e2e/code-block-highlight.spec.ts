import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { cp, mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 本仓库 package.json 无 "type": "module"，Playwright 将 .ts 转译为 CJS，
// 故用 __dirname（import.meta 在 CJS 下不可用，Playwright 不做改写）
const repoRoot = join(__dirname, '..', '..')
const fixture = join(repoRoot, 'tests/fixtures/e2e-workspace')

test('代码块就地高亮：展开出高亮副本、输入后重挂、落盘干净、离开后移除', async () => {
  const ws = await mkdtemp(join(tmpdir(), 'notara-e2e-'))
  await cp(fixture, ws, { recursive: true })

  const app: ElectronApplication = await _electron.launch({
    args: [join(repoRoot, '.'), `--user-data-dir=${join(ws, '.userdata')}`],
    env: { ...process.env, NOTARA_OPEN: ws }
  })
  const page: Page = await app.firstWindow()

  await expect(page.getByTestId(`tree-node-${join(ws, 'code.md')}`)).toBeVisible({ timeout: 10_000 })
  await page.getByTestId(`tree-node-${join(ws, 'code.md')}`).click()

  // 等 vditor IR 初始化完成（代码块渲染态可见）
  const preview = page.locator('.vditor-ir__node[data-type="code-block"] .vditor-ir__preview')
  await expect(preview).toBeVisible({ timeout: 10_000 })
  await expect(preview).toContainText('const a = 1')

  // 点击代码块（preview 区域在展开前是可见的点击目标）→ 进入就地编辑
  await preview.click()

  const node = page.locator('.vditor-ir__node--expand[data-type="code-block"]')
  await expect(node).toBeVisible()

  // 1) overlay 挂载：aria-hidden、js 高亮 span 出现（hljs 为懒加载，expect 自动重试）
  const overlay = node.locator('.notara-code-overlay')
  await expect(overlay).toBeAttached()
  await expect(overlay).toHaveAttribute('aria-hidden', 'true')
  await expect(overlay.locator('code.hljs.language-js')).toBeAttached()
  await expect(overlay.locator('.hljs-keyword').first()).toContainText('const')

  // 2) 观感前提：围栏与并排渲染已隐藏，源码 pre 承载同一底板
  await expect(node.locator('.vditor-ir__preview')).toBeHidden()
  // 2b) 源码层字形必须透明（否则与高亮副本重叠成「两层显示」；回归：主题注入同选择器 color 顶掉透明）
  const srcColor = await node
    .locator('.vditor-ir__marker--pre > code')
    .evaluate((el) => getComputedStyle(el).color)
  expect(srcColor).toBe('rgba(0, 0, 0, 0)')

  // 3) 逐像素对齐：整体盒 + 首字符盒 + 行数。
  //    （不能用 Range.getClientRects 逐行比：overlay 的高亮 span 会让 Range
  //    产生碎片化行盒，行数不可比；整体盒 + 首字符 + 行高推算行数是等价证据）
  const aligned = await node.evaluate((el) => {
    const metrics = (code: Element | null) => {
      if (!code) return null
      const r = document.createRange()
      r.selectNodeContents(code)
      const b = r.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(code).lineHeight)
      // 首个文本节点的前两个字符的精确盒
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
      const first = walker.nextNode()
      let fc: { top: number; left: number; height: number } | null = null
      if (first && first.textContent) {
        const r2 = document.createRange()
        r2.setStart(first, 0)
        r2.setEnd(first, Math.min(2, first.textContent.length))
        const f = r2.getBoundingClientRect()
        fc = { top: f.top, left: f.left, height: f.height }
      }
      return {
        top: b.top,
        left: b.left,
        height: b.height,
        lines: lh > 0 ? Math.round(b.height / lh) : -1,
        fc
      }
    }
    const src = metrics(el.querySelector(':scope > .vditor-ir__marker--pre > code'))
    const hi = metrics(el.querySelector(':scope > .vditor-ir__marker--pre > .notara-code-overlay > code'))
    if (!src || !hi) return { ok: false, reason: '缺层' }
    const cmp = (label: string, a: number, b: number) => {
      if (Math.abs(a - b) > 1) return `${label}: ${a} vs ${b}`
      return null
    }
    const diffs = [
      cmp('整体 top', src.top, hi.top),
      cmp('整体 left', src.left, hi.left),
      cmp('整体 height', src.height, hi.height),
      cmp('行数', src.lines, hi.lines),
      src.fc && hi.fc ? cmp('首字符 top', src.fc.top, hi.fc.top) : '缺首字符',
      src.fc && hi.fc ? cmp('首字符 left', src.fc.left, hi.fc.left) : null
    ].filter(Boolean)
    return diffs.length ? { ok: false, reason: diffs.join('; ') } : { ok: true, reason: `${src.lines} 行对齐` }
  })
  expect(aligned.ok, aligned.reason).toBe(true)

  // 4) 输入路径：每次输入 Lute Spin 会剥离 overlay，observer 必须重挂且内容更新
  //    （> code 只指源码层——overlay 的 code 也在 pre 内，不能裸 code；
  //     点右下角把 caret 确定性地放到末行行尾，再 End 归一）
  const srcCode = node.locator('.vditor-ir__marker--pre > code')
  const box = await srcCode.boundingBox()
  await srcCode.click({ position: { x: box!.width - 8, y: box!.height - 4 } })
  await page.keyboard.press('End')
  await page.keyboard.type(' // done')
  await expect(overlay.locator('code.hljs')).toContainText('// done')
  await expect(overlay.locator('.hljs-comment')).toContainText('// done')

  // 5) 落盘干净：围栏与内容完整，overlay/高亮类不泄入 markdown
  await expect
    .poll(() => readFile(join(ws, 'code.md'), 'utf8'), { timeout: 5_000 })
    .toContain('```js\nconst a = 1;\nconst b = 2; // done\n```')
  const saved = await readFile(join(ws, 'code.md'), 'utf8')
  expect(saved).not.toContain('hljs')
  expect(saved).not.toContain('notara-code-overlay')

  // 6) 光标离开代码块 → 折叠回渲染态，overlay 移除
  await page.getByText('收尾段落。').click()
  await expect(node).toBeHidden()
  await expect(page.locator('.notara-code-overlay')).toHaveCount(0)

  await app.close()
  await rm(ws, { recursive: true, force: true })
})
