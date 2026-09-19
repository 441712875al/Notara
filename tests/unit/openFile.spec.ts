import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPath } from '../../src/renderer/src/lib/openFile'
import { useTabs } from '../../src/renderer/src/stores/tabs'
import { useUi } from '../../src/renderer/src/stores/ui'

const readFileMock = vi.fn()
vi.mock('../../src/renderer/src/lib/api', () => ({ api: { readFile: (...a: unknown[]) => readFileMock(...a) } }))

describe('openPath', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    useUi.setState({ toasts: [] })
    readFileMock.mockReset()
  })

  it('成功读取并打开标签', async () => {
    readFileMock.mockResolvedValue({ content: '# hi', mtime: 1 })
    await openPath('/w/a.md')
    expect(useTabs.getState().tabs[0].initialContent).toBe('# hi')
  })

  it('读取失败（如二进制）时 toast 且不开标签', async () => {
    readFileMock.mockRejectedValue(Object.assign(new Error('不是文本文件'), { code: 'binary-file' }))
    await openPath('/w/bin.md')
    expect(useTabs.getState().tabs).toHaveLength(0)
    expect(useUi.getState().toasts[0]?.text).toContain('文本')
  })
})
