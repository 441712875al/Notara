import type Vditor from 'vditor'

/** 用指定标记包裹当前选中文本；link 生成 [text](url)；无选中则插入空标记 */
export function applyWrap(vditor: Vditor, mark: string): void {
  const sel = vditor.getSelection() ?? ''
  if (mark === 'link') {
    vditor.insertValue(`[${sel || 'url'}](url)`)
    return
  }
  vditor.insertValue(`${mark}${sel}${mark}`)
}
