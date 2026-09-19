import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleExternalChange, handleExternalDelete } from '../../src/renderer/src/lib/externalChanges'
import { useTabs } from '../../src/renderer/src/stores/tabs'
import { useUi } from '../../src/renderer/src/stores/ui'
import { saveScheduler } from '../../src/renderer/src/lib/saveScheduler'
import { editors } from '../../src/renderer/src/lib/editorRegistry'
import { api } from '../../src/renderer/src/lib/api'

vi.mock('../../src/renderer/src/lib/api', () => ({
  api: { readFile: vi.fn(), writeFile: vi.fn() }
}))

describe('handleExternalChange', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    useUi.setState({ toasts: [], confirm: null })
  })

  it('净标签静默重载内容', async () => {
    useTabs.getState().openFile('/w/a.md', 'old')
    const id = useTabs.getState().tabs[0].id
    const setValue = vi.fn()
    const focus = vi.fn()
    editors.set(id, { setValue, focus, getValue: () => '' } as never)
    vi.mocked(api.readFile).mockResolvedValue({ content: 'new', mtime: 2 })
    await handleExternalChange('/w/a.md')
    expect(api.readFile).toHaveBeenCalledWith('/w/a.md')
    expect(setValue).toHaveBeenCalledWith('new')
    expect(useUi.getState().confirm).toBeNull()
    editors.clear()
  })

  it('脏标签弹冲突确认', async () => {
    useTabs.getState().openFile('/w/b.md', 'old')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    editors.set(id, { setValue: vi.fn(), getValue: () => 'mine' } as never)
    await handleExternalChange('/w/b.md')
    const c = useUi.getState().confirm
    expect(c).not.toBeNull()
    expect(c?.text).toContain('/w/b.md')
    // 模拟「保留我的版本」：立即写盘
    const onConfirm = c!.onConfirm
    await onConfirm()
    expect(api.writeFile).toHaveBeenCalledWith('/w/b.md', 'mine')
    expect(useTabs.getState().tabs[0].dirty).toBe(false)
    editors.clear()
  })

  it('自动保存 pending 中忽略外部变更（自写事件兜底）', async () => {
    useTabs.getState().openFile('/w/c.md', 'x')
    const id = useTabs.getState().tabs[0].id
    useTabs.getState().setDirty(id, true)
    saveScheduler.schedule(id)
    await handleExternalChange('/w/c.md')
    expect(useUi.getState().confirm).toBeNull()
    saveScheduler.cancel(id)
  })

  it('readFile 挂起期间标签变脏则放弃重载（不覆盖用户输入）', async () => {
    useTabs.getState().openFile('/w/d.md', 'old')
    const id = useTabs.getState().tabs[0].id
    const setValue = vi.fn()
    editors.set(id, { setValue, getValue: () => '' } as never)

    let resolveRead!: (v: { content: string; mtime: number }) => void
    vi.mocked(api.readFile).mockReturnValue(
      new Promise<{ content: string; mtime: number }>((res) => {
        resolveRead = res
      })
    )

    const pending = handleExternalChange('/w/d.md')
    // 挂起期间用户开始输入：标签置脏并调度保存
    useTabs.getState().setDirty(id, true)
    resolveRead({ content: 'disk', mtime: 3 })
    await pending
    expect(setValue).not.toHaveBeenCalled()
    editors.clear()
  })
})

describe('handleExternalDelete', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    useUi.setState({ toasts: [], confirm: null })
  })

  it('标记 deleted 并 toast', () => {
    useTabs.getState().openFile('/w/a.md', 'x')
    handleExternalDelete('/w/a.md')
    expect(useTabs.getState().tabs[0].deleted).toBe(true)
    expect(useUi.getState().toasts[0]?.text).toContain('删除')
  })

  it('未打开的 path 被删：不 toast 也不改 tabs', () => {
    useTabs.getState().openFile('/w/a.md', 'x')
    handleExternalDelete('/w/other.md')
    expect(useUi.getState().toasts).toHaveLength(0)
    expect(useTabs.getState().tabs).toHaveLength(1)
    expect(useTabs.getState().tabs[0].deleted).toBe(false)
  })
})
