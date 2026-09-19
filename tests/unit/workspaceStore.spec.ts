import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspace } from '../../src/renderer/src/stores/workspace'
import { useUi } from '../../src/renderer/src/stores/ui'

const openWorkspaceMock = vi.fn()
const listChildrenMock = vi.fn()
vi.mock('../../src/renderer/src/lib/api', () => ({
  api: {
    openWorkspace: (...a: unknown[]) => openWorkspaceMock(...a),
    listChildren: (...a: unknown[]) => listChildrenMock(...a)
  }
}))

describe('useWorkspace.open', () => {
  beforeEach(() => {
    useWorkspace.setState({ root: null, children: new Map(), loading: new Map() })
    useUi.setState({ toasts: [] })
    openWorkspaceMock.mockReset()
    listChildrenMock.mockReset()
    listChildrenMock.mockResolvedValue([])
  })

  it('openWorkspace 失败：root 回滚为 null、缓存清空并 toast', async () => {
    openWorkspaceMock.mockRejectedValue(new Error('ENOENT: not found'))
    await useWorkspace.getState().open('/w/missing')
    const st = useWorkspace.getState()
    expect(st.root).toBeNull()
    expect(st.children.size).toBe(0)
    expect(st.loading.size).toBe(0)
    expect(useUi.getState().toasts[0]?.text).toContain('ENOENT')
  })
})
