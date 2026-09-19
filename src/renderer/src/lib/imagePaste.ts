import type Vditor from 'vditor'
import { api } from './api'
import { parseIpcError } from './ipcError'
import { editors } from './editorRegistry'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'
import { s } from '../strings'

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/')
}

// 显式映射表：正则无法正确处理 image/svg+xml（会捕获成 svg+xml）
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp'
}

/** MIME → 扩展名；未知图片类型兜底 png（vditor 与浏览器都能识别） */
export function extFromMime(type: string): string {
  return MIME_EXT[type.toLowerCase()] ?? 'png'
}

/** 从剪贴板/拖拽的 DataTransfer 中挑出图片文件（其余交给默认行为） */
export function collectImageFiles(dt: DataTransfer): File[] {
  const out: File[] = []
  if (dt.files) {
    for (const f of Array.from(dt.files)) {
      if (isImageFile(f)) out.push(f)
    }
  }
  return out
}

/**
 * 保存图片到「该标签笔记所在目录」的 assets/ 并插入相对路径引用。
 * 用 tabId 定位目录（而非激活标签），保证粘贴目标始终是触发事件的编辑器实例。
 * 返回 false 表示非图片，交回默认处理；true 表示已消费（含失败与未保存场景）。
 */
export async function insertImageFromFile(vd: Vditor, file: File, tabId: number): Promise<boolean> {
  if (!isImageFile(file)) return false
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
  const refDir = tab?.path ? tab.path.slice(0, tab.path.lastIndexOf('/')) : null
  if (!refDir) {
    useUi.getState().notify(s.toast.saveImageFirst)
    return true // 拦截：无目录可写，避免 vditor 默认行为插入 base64
  }
  try {
    const data = await file.arrayBuffer()
    const { relativePath } = await api.saveImage(refDir, data, file.name, extFromMime(file.type))
    // 两次 await（arrayBuffer + IPC）期间标签可能已关闭：销毁后 insertValue 写入脱挂 DOM 属幽灵写入，直接跳过
    if (editors.get(tabId) !== vd) return true
    // 按段百分号编码：含空格/括号/#/中文等路径在 Lute 中不编码则不渲染；每段单独编码后用 / 重连，分隔符不转义
    const encoded = relativePath.split('/').map(encodeURIComponent).join('/')
    vd.insertValue(`\n![](${encoded})\n`)
    return true
  } catch (e) {
    useUi.getState().notify(s.toast.imageSaveFailed(parseIpcError(e).message))
    return true // 已消费：失败也拦截，插入占位无意义
  }
}

/**
 * 在编辑器宿主元素上挂 paste/drop/dragover 监听，返回解绑函数。
 * paste/drop 走 capture 阶段，先于 vditor 自身处理，确保图片被我们落盘而非转 base64。
 */
export function attachImageHandlers(vd: Vditor, host: HTMLElement, tabId: number): () => void {
  const consume = (e: ClipboardEvent | DragEvent, dt: DataTransfer | null): void => {
    const imgs = dt ? collectImageFiles(dt) : []
    if (imgs.length === 0) return // 非图片：不拦截，走默认粘贴/拖拽
    e.preventDefault()
    e.stopPropagation()
    // 顺序执行：并发 IPC 完成顺序不定会导致多图插入乱序
    void (async () => {
      for (const f of imgs) await insertImageFromFile(vd, f, tabId)
    })()
  }
  const onPaste = (e: ClipboardEvent): void => consume(e, e.clipboardData)
  const onDrop = (e: DragEvent): void => consume(e, e.dataTransfer)
  const onDragOver = (e: DragEvent): void => {
    // 拖拽文件时才允许 drop（否则 vditor 区域不接受文件投放）
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  }

  host.addEventListener('paste', onPaste, true)
  host.addEventListener('drop', onDrop, true)
  host.addEventListener('dragover', onDragOver, false)
  return () => {
    host.removeEventListener('paste', onPaste, true)
    host.removeEventListener('drop', onDrop, true)
    host.removeEventListener('dragover', onDragOver, false)
  }
}
