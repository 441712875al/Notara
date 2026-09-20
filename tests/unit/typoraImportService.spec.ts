import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// electron 的 app/nativeTheme 用 stub（单例只在导入时取 userData 路径）
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/notara-import-test' },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] }
}))
import { createTyporaImporter } from '../../src/main/services/typoraImportService'
import { NotaraError } from '../../src/shared/errors'

let userData: string
let themes: string
let existing: string[]
let picked: string | null
const importer = () =>
  createTyporaImporter({
    themesDir: () => themes,
    existingNames: async () => existing,
    pickCss: async () => picked
  })

const SAMPLE_CSS = `
:root { --primary-color: #a0522d; --monospace: 'Fira Mono', monospace; }
body { background: #fffdf5; color: #3f2f00; font-family: var(--monospace); }
#write h1 { font-size: 2.2em; }
.md-fences { background: #f6efdc; padding: 14px 18px; font-family: var(--monospace); }
.cm-s-inner .cm-keyword { color: #8b3a2f; }
@font-face { font-family: 'Fira Mono'; src: url('./assets/dummy.woff2') format('woff2'); }
@font-face { font-family: 'Missing'; src: url('./gone.ttf'); }
`

/** 在临时目录铺一个 Typora 主题包（css + assets/dummy.woff2） */
async function makeThemePackage(dir: string, css: string = SAMPLE_CSS): Promise<string> {
  await mkdir(join(dir, 'assets'), { recursive: true })
  await writeFile(join(dir, 'assets', 'dummy.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]))
  const cssPath = join(dir, 'sample-theme.css')
  await writeFile(cssPath, css, 'utf8')
  return cssPath
}

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'notara-import-'))
  themes = join(userData, 'themes')
  existing = []
  picked = null
})

describe('typoraImportService', () => {
  it('转换落盘：主题 css + 资源复制 + 头注释报告', async () => {
    const src = await makeThemePackage(await mkdtemp(join(tmpdir(), 'pkg-')))
    const r = await importer()(src)

    expect(r.name).toBe('sample-theme')
    const css = await readFile(join(themes, 'sample-theme.css'), 'utf8')
    // 头注释带源文件与报告
    expect(css).toContain('由 Typora 主题转换生成')
    expect(css).toContain(`源文件: ${src}`)
    expect(css).toContain('--primary-color → --accent')
    // 主题变量与内容规则（生成 CSS 为多行缩进格式，空白归一后断言）
    expect(css).toContain('--bg: #fffdf5')
    expect(css.replace(/\s+/g, ' ')).toContain('.editors .vditor-reset .hljs-keyword { color: #8b3a2f; }')
    expect(css).toContain('--code-block-pad: 14px 18px')
    // 字体资源复制并改写为 file:// 落点
    const fontBytes = await readFile(join(themes, 'sample-theme.assets', 'dummy.woff2'))
    expect([...fontBytes]).toEqual([0x77, 0x4f, 0x46, 0x32])
    expect(css).toContain(`url('file://${join(themes, 'sample-theme.assets', 'dummy.woff2')}')`)
    // 缺失资源：原样保留 + 报告
    expect(css).toContain("url('./gone.ttf')")
    expect(r.missingAssets).toEqual(['./gone.ttf'])
    expect(r.assetsCopied).toBe(1)
  })

  it('重名与保留名：自动加 -2 后缀', async () => {
    const pkg = await mkdtemp(join(tmpdir(), 'pkg-'))
    const src = await makeThemePackage(pkg)
    existing = ['system', 'sample-theme']
    const r = await importer()(src)
    expect(r.name).toBe('sample-theme-2')
    expect(await readdir(themes)).toContain('sample-theme-2.css')
  })

  it('pickCss 取消（null）→ 返回 null 不落盘', async () => {
    picked = null
    expect(await importer()()).toBeNull()
  })

  it('pickCss 提供路径时按其导入', async () => {
    const src = await makeThemePackage(await mkdtemp(join(tmpdir(), 'pkg-')))
    picked = src
    const r = await importer()()
    expect(r?.name).toBe('sample-theme')
  })

  it('读不到可转换规则的文件 → theme-import-failed', async () => {
    const pkg = await mkdtemp(join(tmpdir(), 'pkg-'))
    const src = await makeThemePackage(pkg, '.sidebar { color: red; } /* 无 #write/变量 */')
    await expect(importer()(src)).rejects.toMatchObject({
      code: 'theme-import-failed'
    } satisfies Partial<NotaraError>)
  })

  it('源文件不存在 → theme-import-failed', async () => {
    await expect(importer()(join(tmpdir(), 'nope.css'))).rejects.toMatchObject({
      code: 'theme-import-failed'
    } satisfies Partial<NotaraError>)
  })

  it('同名资源去重：不同目录的同名文件加序号', async () => {
    const pkg = await mkdtemp(join(tmpdir(), 'pkg-'))
    await mkdir(join(pkg, 'a'), { recursive: true })
    await mkdir(join(pkg, 'b'), { recursive: true })
    await writeFile(join(pkg, 'a', 'f.woff2'), 'A')
    await writeFile(join(pkg, 'b', 'f.woff2'), 'B')
    const css = [
      "@font-face { font-family: X; src: url('./a/f.woff2'); }",
      "@font-face { font-family: Y; src: url('./b/f.woff2'); }"
    ].join('\n')
    const src = await makeThemePackage(pkg, css)
    const r = await importer()(src)
    expect(r.assetsCopied).toBe(2)
    const files = await readdir(join(themes, `${r.name}.assets`))
    expect(files.sort()).toEqual(['f-2.woff2', 'f.woff2'])
  })
})
