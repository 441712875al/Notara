import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMenuAction, saveTabAs } from '../../src/renderer/src/lib/menuActions'
import { useTabs } from '../../src/renderer/src/stores/tabs'
import { useUi } from '../../src/renderer/src/stores/ui'
import { saveScheduler } from '../../src/renderer/src/lib/saveScheduler'
import { editors } from '../../src/renderer/src/lib/editorRegistry'

vi.mock('../../src/renderer/src/lib/api', () => ({
  api: {
    saveFileAs: vi.fn(),
    createEntry: vi.fn(),
    readFile: vi.fn()
  }
}))
import { api } from '../../src/renderer/src/lib/api'

describe('handleMenuAction', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    editors.clear()
    vi.clearAllMocks()
  })

  it('save：无脏标签时不触发写盘', async () => {
    useTabs.getState().openFile('/w/a.md', 'x')
    useTabs.getState().setDirty(useTabs.getState().tabs[0].id, false)
    const spy = vi.spyOn(saveScheduler, 'flushOne').mockResolvedValue()
    await handleMenuAction('save')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('save：脏标签触发 flushOne', async () => {
    useTabs.getState().openFile('/w/a.md', 'x')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    const spy = vi.spyOn(saveScheduler, 'flushOne').mockResolvedValue()
    await handleMenuAction('save')
    expect(spy).toHaveBeenCalledWith(id)
    spy.mockRestore()
  })

  it('save：未命名标签走 save-as 对话框路径', async () => {
    useTabs.getState().openUntitled()
    const asSave = vi.mocked(api.saveFileAs).mockResolvedValue({ path: '/w/new.md' })
    const vd = { getValue: () => '内容' } as never
    editors.set(useTabs.getState().tabs[0].id, vd as never)
    await handleMenuAction('save')
    expect(asSave).toHaveBeenCalledWith('未命名.md', '内容')
    expect(useTabs.getState().tabs[0].path).toBe('/w/new.md')
    editors.clear()
  })

  it('new-file：无工作区时开未命名标签', async () => {
    await handleMenuAction('new-file')
    expect(useTabs.getState().tabs[0].path).toBeNull()
  })
})

describe('saveTabAs', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    editors.clear()
    vi.clearAllMocks()
  })

  it('未命名标签另存为成功：setSaved 生效，path 更新', async () => {
    useTabs.getState().openUntitled()
    const tab = useTabs.getState().tabs[0]
    editors.set(tab.id, { getValue: () => '正文' } as never)
    vi.mocked(api.saveFileAs).mockResolvedValue({ path: '/w/新文档.md' })

    const r = await saveTabAs(tab)
    expect(r).toBe('saved')
    expect(api.saveFileAs).toHaveBeenCalledWith('未命名.md', '正文')
    expect(useTabs.getState().tabs[0].path).toBe('/w/新文档.md')
    expect(useTabs.getState().tabs[0].dirty).toBe(false)
  })

  it('用户取消（api 返回 null）：返回 cancelled 且 path 仍为 null', async () => {
    useTabs.getState().openUntitled()
    const tab = useTabs.getState().tabs[0]
    editors.set(tab.id, { getValue: () => '正文' } as never)
    vi.mocked(api.saveFileAs).mockResolvedValue(null)

    const r = await saveTabAs(tab)
    expect(r).toBe('cancelled')
    expect(useTabs.getState().tabs[0].path).toBeNull()
  })

  it('编辑器实例未就绪：返回 failed', async () => {
    useTabs.getState().openUntitled()
    const tab = useTabs.getState().tabs[0]
    // 未注册 editors[tab.id]
    const r = await saveTabAs(tab)
    expect(r).toBe('failed')
    expect(api.saveFileAs).not.toHaveBeenCalled()
  })

  it('写盘抛错：返回 failed 并 toast 提示', async () => {
    useTabs.getState().openUntitled()
    const tab = useTabs.getState().tabs[0]
    editors.set(tab.id, { getValue: () => '正文' } as never)
    vi.mocked(api.saveFileAs).mockRejectedValue(new Error('boom'))
    const notify = vi.spyOn(useUi.getState(), 'notify').mockImplementation(() => undefined)

    const r = await saveTabAs(tab)
    expect(r).toBe('failed')
    expect(notify).toHaveBeenCalledTimes(1)
    notify.mockRestore()
  })
})
