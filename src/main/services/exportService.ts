import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, Notification, shell } from 'electron'
import exportCss from '../resources/export.css?raw'
import { ErrorCodes, NotaraError } from '@shared/errors'

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * 组装独立的离线 HTML 文档：内联 export.css（含 KaTeX 字体）保证断网可看。
 * body 带 .vditor-reset 类，命中 vditor 的 Markdown 排版样式。
 * baseHref 用于 PDF 场景——临时 HTML 位于 tmpdir 时，凭它解析笔记目录下的相对图片。
 */
export function buildHtmlDocument(
  title: string,
  bodyHtml: string,
  css: string,
  baseHref?: string
): string {
  const base = baseHref ? `<base href="${escapeHtml(baseHref)}">\n` : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${base}<title>${escapeHtml(title)}</title>
<style>
${css}
body { max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
</style>
</head>
<body class="vditor-reset">
${bodyHtml}
</body>
</html>`
}

export function replaceTargetExt(sourcePath: string, ext: 'html' | 'pdf'): string {
  return sourcePath.replace(/\.(md|markdown)$/i, '') + '.' + ext
}

/** 通知正文：导出文件的绝对路径（点击通知可在访达中定位） */
export function notificationBody(p: string): string {
  return p
}

function noteTitle(sourcePath: string): string {
  return path.basename(sourcePath).replace(/\.(md|markdown)$/i, '')
}

function notifyExported(p: string): void {
  try {
    const n = new Notification({ title: '导出完成', body: notificationBody(p) })
    n.on('click', () => shell.showItemInFolder(p))
    n.show()
  } catch {
    /* 通知失败不影响导出结果 */
  }
}

export async function exportHtml(sourcePath: string, html: string): Promise<{ htmlPath: string }> {
  const doc = buildHtmlDocument(noteTitle(sourcePath), html, exportCss)
  const htmlPath = replaceTargetExt(sourcePath, 'html')
  try {
    await fs.writeFile(htmlPath, doc, 'utf8')
  } catch (e) {
    throw new NotaraError(ErrorCodes.WriteFailed, `导出失败: ${String(e)}`)
  }
  notifyExported(htmlPath)
  return { htmlPath }
}

export async function exportPdf(sourcePath: string, html: string): Promise<{ pdfPath: string }> {
  // 临时 HTML 落在 tmpdir，故注入 <base> 让笔记目录下的相对图片（assets/...）仍能解析
  const baseHref = pathToFileURL(path.dirname(sourcePath)).href + '/'
  const doc = buildHtmlDocument(noteTitle(sourcePath), html, exportCss, baseHref)
  const tmpHtml = path.join(os.tmpdir(), `notara-export-${Date.now()}.html`)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await fs.writeFile(tmpHtml, doc, 'utf8')
    await win.loadFile(tmpHtml)
    await new Promise((r) => setTimeout(r, 200)) // 等字体/SVG 首帧渲染
    const pdfBuf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4'
    })
    const pdfPath = replaceTargetExt(sourcePath, 'pdf')
    await fs.writeFile(pdfPath, pdfBuf)
    notifyExported(pdfPath)
    return { pdfPath }
  } catch (e) {
    throw new NotaraError(ErrorCodes.WriteFailed, `导出 PDF 失败: ${String(e)}`)
  } finally {
    win.destroy()
    await fs.rm(tmpHtml, { force: true })
  }
}
