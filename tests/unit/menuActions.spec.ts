import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMenuAction } from '../../src/renderer/src/lib/menuActions'
import { useTabs } from '../../src/renderer/src/stores/tabs'
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
