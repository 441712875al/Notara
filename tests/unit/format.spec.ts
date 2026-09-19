import { describe, expect, it, vi } from 'vitest'
import { applyWrap } from '../../src/renderer/src/lib/format'

function fakeVditor(sel: string) {
  return { getSelection: () => sel, insertValue: vi.fn() } as unknown as Parameters<typeof applyWrap>[0]
}

describe('applyWrap', () => {
  it('有选中文本时包裹', () => {
    const vd = fakeVditor('文本')
    applyWrap(vd, '**')
    expect(vd.insertValue).toHaveBeenCalledWith('**文本**')
  })
  it('无选中时插入空标记并光标居中（退化为插入）', () => {
    const vd = fakeVditor('')
    applyWrap(vd, '`')
    expect(vd.insertValue).toHaveBeenCalledWith('``')
  })
  it('链接格式特殊处理', () => {
    const vd = fakeVditor('选中文本')
    applyWrap(vd, 'link')
    expect(vd.insertValue).toHaveBeenCalledWith('[选中文本](url)')
  })
})
