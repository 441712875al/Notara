import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTabs, titleOf } from '../../src/renderer/src/stores/tabs'

vi.mock('../../src/renderer/src/lib/api', () => ({
  api: { readFile: vi.fn(), writeFile: vi.fn() }
}))

describe('tabs store', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
  })

  it('openFile 新开标签并激活；重复打开仅激活', () => {
    const { openFile } = useTabs.getState()
    openFile('/w/a.md', '# a')
    openFile('/w/b.md', '# b')
    expect(useTabs.getState().tabs.map((t) => t.title)).toEqual(['a', 'b'])
    expect(useTabs.getState().activeIndex).toBe(1)
    openFile('/w/a.md', '# a')
    expect(useTabs.getState().tabs).toHaveLength(2)
    expect(useTabs.getState().activeIndex).toBe(0)
  })

  it('openUntitled 生成无路径标签', () => {
    useTabs.getState().openUntitled()
    const t = useTabs.getState().tabs[0]
    expect(t.path).toBeNull()
    expect(t.title).toBe('未命名')
    expect(t.dirty).toBe(true)
  })

  it('close 关闭并修正 activeIndex', () => {
    const { openFile } = useTabs.getState()
    openFile('/w/a.md', '1'); openFile('/w/b.md', '2'); openFile('/w/c.md', '3')
    useTabs.getState().close(1)
    expect(useTabs.getState().tabs.map((t) => t.title)).toEqual(['a', 'c'])
    expect(useTabs.getState().activeIndex).toBe(1)
  })

  it('markDeleted / renamePath / setDirty / setSaved', () => {
    useTabs.getState().openFile('/w/a.md', '1')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    expect(useTabs.getState().tabs[0].dirty).toBe(true)
    useTabs.getState().markDeleted('/w/a.md')
    expect(useTabs.getState().tabs[0].deleted).toBe(true)
    useTabs.getState().renamePath('/w/a.md', '/w/z.md')
    expect(useTabs.getState().tabs[0].path).toBe('/w/z.md')
    expect(useTabs.getState().tabs[0].title).toBe('z')
    expect(useTabs.getState().tabs[0].deleted).toBe(false)
    useTabs.getState().setSaved(id, '/w/z2.md')
    expect(useTabs.getState().tabs[0].path).toBe('/w/z2.md')
    expect(useTabs.getState().tabs[0].dirty).toBe(false)
  })

  it('titleOf 处理 null / 扩展名 / 子目录', () => {
    expect(titleOf(null)).toBe('未命名')
    expect(titleOf('/w/docs/note.markdown')).toBe('note')
    expect(titleOf('/w/README.md')).toBe('README')
  })
})
