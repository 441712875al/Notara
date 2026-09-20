import { promises as fs, existsSync } from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, dialog, BrowserWindow } from 'electron'
import { NotaraError, ErrorCodes } from '@shared/errors'
import { convertTyporaTheme } from '@shared/typoraTheme'
import type { TyporaAssetMapping, TyporaImportResult } from '@shared/types'
import { themeService } from './themeService'

/** 与 themeService 的保留名一致：system/light/dark 会被视为内置主题 */
const RESERVED_THEME_NAMES = ['system', 'light', 'dark']

/** 主题名来自源文件名：去路径分隔符等文件系统危险字符，限长 */
function sanitizeThemeName(raw: string): string {
  const cleaned = raw
    .replace(/[/\\:?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
  return cleaned || 'typora-theme'
}

/** 生成 CSS 的头注释：完整转换报告，用户可自查「为什么那条没生效」 */
function buildHeader(sourcePath: string, r: TyporaImportResult): string {
  const lines: string[] = [
    '/* ═══ Notara 主题：由 Typora 主题转换生成 ═══',
    ` * 源文件: ${sourcePath}`,
    ` * 导入时间: ${new Date().toISOString()}`,
    ' *',
    ' * 说明：本主题为单套配色，不随系统亮暗切换；',
    ' *       导出 HTML/PDF 使用 Notara 内置排版，不应用本主题。',
    ' *',
    ' * 转换报告：'
  ]
  lines.push(` * - 变量映射（${r.varsBridged.length} 项）: ${r.varsBridged.join('；') || '无'}`)
  lines.push(` * - 未映射变量: ${r.varsDropped.join('、') || '无'}`)
  lines.push(` * - 转换规则: ${r.rulesMapped} 条`)
  lines.push(
    ` * - 未映射选择器: ${r.selectorsDropped.join('、') || '无'}${r.selectorsDropped.length >= 30 ? '（至多列 30 项）' : ''}`
  )
  lines.push(
    ` * - 资源: 复制 ${r.assetsCopied} 个${r.missingAssets.length ? `；缺失 ${r.missingAssets.join('、')}` : ''}`
  )
  if (r.notes.length > 0) {
    lines.push(' * - 备注:')
    for (const n of r.notes) lines.push(` *   - ${n}`)
  }
  lines.push(' */')
  return lines.join('\n')
}

export interface TyporaImporterDeps {
  /** userData/themes 目录 */
  themesDir: () => string
  /** 现有主题名（含保留名）——重名时自动加 -2/-3 后缀 */
  existingNames: () => Promise<string[]>
  /** 弹原生文件选择框；用户取消返回 null */
  pickCss: () => Promise<string | null>
}

/**
 * Typora 主题导入：读源 CSS → convertTyporaTheme 转换 → 相对资源复制到
 * <themes>/<name>.assets/ → 生成主题落盘 <themes>/<name>.css（头注释带完整报告）。
 * 落盘后走既有主题机制（listCustomThemes 扫描 + 菜单切换），导入服务自身零状态。
 */
export function createTyporaImporter(deps: TyporaImporterDeps) {
  return async function importTyporaTheme(sourcePath?: string): Promise<TyporaImportResult | null> {
    const src = sourcePath ?? (await deps.pickCss())
    if (!src) return null // 用户取消

    let css: string
    try {
      css = await fs.readFile(src, 'utf8')
    } catch (e) {
      throw new NotaraError(
        ErrorCodes.ThemeImportFailed,
        `Failed to read theme file: ${e instanceof Error ? e.message : String(e)}`
      )
    }

    // 主题名：源文件名去扩展，避开保留名与既有主题
    const base = sanitizeThemeName(path.basename(src, path.extname(src) || '.css'))
    const taken = new Set((await deps.existingNames()).map((n) => n.toLowerCase()))
    let name = base
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}-${n}`

    // 资源解析：相对引用以源文件所在目录为基准，存在则复制到主题资源目录。
    // 同名资源（fonts/x.woff2 与 fonts2/x.woff2）加序号前缀去重。
    const assetsDir = path.join(deps.themesDir(), `${name}.assets`)
    const srcDir = path.dirname(src)
    const takenBasenames = new Set<string>()
    const resolveAsset = (relativeUrl: string): TyporaAssetMapping => {
      const clean = relativeUrl.split(/[?#]/)[0]
      const abs = path.resolve(srcDir, clean)
      if (!existsSync(abs)) return { relativeUrl, emitUrl: relativeUrl, copyFrom: null, destPath: null }
      let stem = path.basename(clean, path.extname(clean)).replace(/[/\\:?"<>|]/g, '-')
      let ext = path.extname(clean)
      let key = `${stem}${ext}`.toLowerCase()
      for (let n = 2; takenBasenames.has(key); n++) {
        stem = `${path.basename(clean, ext).replace(/[/\\:?"<>|]/g, '-')}-${n}`
        key = `${stem}${ext}`.toLowerCase()
      }
      takenBasenames.add(key)
      const dest = path.join(assetsDir, `${stem}${ext}`)
      return { relativeUrl, emitUrl: pathToFileURL(dest).href, copyFrom: abs, destPath: dest }
    }

    const { css: converted, report, assets } = convertTyporaTheme(css, name, { resolveAsset })

    // 空转换防御：随便挑个 css 也能「成功」，但产物是空壳——宁可报错让用户换文件
    if (report.rulesMapped === 0 && report.varsBridged.length === 0) {
      throw new NotaraError(
        ErrorCodes.ThemeImportFailed,
        'No convertible Typora theme rules found in this file'
      )
    }

    // 复制资源（失败即整体失败：缺字体的主题是坏的）
    const toCopy = assets.filter((a): a is TyporaAssetMapping & { copyFrom: string; destPath: string } => !!a.copyFrom)
    if (toCopy.length > 0) {
      try {
        await fs.mkdir(assetsDir, { recursive: true })
        for (const a of toCopy) await fs.copyFile(a.copyFrom, a.destPath)
      } catch (e) {
        throw new NotaraError(
          ErrorCodes.ThemeImportFailed,
          `Failed to copy theme assets: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }

    try {
      await fs.mkdir(deps.themesDir(), { recursive: true })
      await fs.writeFile(path.join(deps.themesDir(), `${name}.css`), `${buildHeader(src, report)}\n\n${converted}`, 'utf8')
    } catch (e) {
      throw new NotaraError(
        ErrorCodes.ThemeImportFailed,
        `Failed to write theme file: ${e instanceof Error ? e.message : String(e)}`
      )
    }
    return report
  }
}

// 应用内单例（测试用 createTyporaImporter 注入依赖）
export const typoraImporter = createTyporaImporter({
  themesDir: () => path.join(app.getPath('userData'), 'themes'),
  existingNames: async () => [
    ...RESERVED_THEME_NAMES,
    ...(await themeService.getThemeInfo()).customThemes.map((t) => t.name)
  ],
  pickCss: async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options = {
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'Typora 主题 (.css)', extensions: ['css'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return r.filePaths[0] ?? null
  }
})
