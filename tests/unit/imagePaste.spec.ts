import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectImageFiles,
  extFromMime,
  insertImageFromFile
} from '../../src/renderer/src/lib/imagePaste'
import { useTabs } from '../../src/renderer/src/stores/tabs'
import { useUi } from '../../src/renderer/src/stores/ui'
import { s } from '../../src/renderer/src/strings'

vi.mock('../../src/renderer/src/lib/api', () => ({
  api: { saveImage: vi.fn() }
}))
import { api } from '../../src/renderer/src/lib/api'

function fakeDt(files: { name: string; type: string }[]): { files: unknown[]; items: { kind: string; type: string; getAsFile: () => unknown }[] } {
  const arr = files.map((f) => ({ ...f }))
  return {
    files: arr,
    items: arr.map((f) => ({ kind: 'file', type: (f as { type: string }).type, getAsFile: () => f }))
  } as never
}

/** 构造形状匹配 File 的最小对象：仅 name/type/arrayBuffer 被 insertImageFromFile 消费 */
function fakeFile(name: string, type: string, data = new ArrayBuffer(4)): File {
  return { name, type, arrayBuffer: async () => data } as unknown as File
}

function fakeVd(): { insertValue: ReturnType<typeof vi.fn> } {
  return { insertValue: vi.fn() }
}

/** 最后一次 toast 文案（未产出则为 undefined） */
function lastToast(): string | undefined {
  return useUi.getState().toasts.at(-1)?.text
}

describe('extFromMime', () => {
  it('常见图片 MIME 映射', () => {
    expect(extFromMime('image/png')).toBe('png')
    expect(extFromMime('image/jpeg')).toBe('jpeg')
    expect(extFromMime('image/gif')).toBe('gif')
    expect(extFromMime('image/svg+xml')).toBe('svg')
    expect(extFromMime('image/webp')).toBe('webp')
    expect(extFromMime('text/plain')).toBe('png') // 兜底
  })
})

describe('collectImageFiles', () => {
  it('只挑出 image/* 文件', () => {
    const dt = fakeDt([
      { name: 'a.png', type: 'image/png' },
      { name: 'b.txt', type: 'text/plain' }
    ])
    const imgs = collectImageFiles(dt as never)
    expect(imgs).toHaveLength(1)
    expect((imgs[0] as { name: string }).name).toBe('a.png')
  })
})

describe('insertImageFromFile', () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeIndex: -1 })
    useUi.setState({ toasts: [] })
    vi.clearAllMocks()
  })

  it('非图片文件：返回 false 且不调 IPC（交回默认行为）', async () => {
    const vd = fakeVd()
    const r = await insertImageFromFile(vd as never, fakeFile('a.txt', 'text/plain'), 1)
    expect(r).toBe(false)
    expect(api.saveImage).not.toHaveBeenCalled()
    expect(vd.insertValue).not.toHaveBeenCalled()
  })

  it('标签无 path（未保存）：toast 提示先保存，返回 true 且不调 IPC', async () => {
    useTabs.getState().openUntitled()
    const tabId = useTabs.getState().tabs[0].id
    const vd = fakeVd()
    const r = await insertImageFromFile(vd as never, fakeFile('a.png', 'image/png'), tabId)
    expect(r).toBe(true)
    expect(api.saveImage).not.toHaveBeenCalled()
    expect(vd.insertValue).not.toHaveBeenCalled()
    expect(lastToast()).toBe(s.toast.saveImageFirst)
  })

  it('正常保存：以正确参数调 IPC，并按换行包裹的相对路径插入', async () => {
    useTabs.getState().openFile('/w/notes/a.md', 'x')
    const tabId = useTabs.getState().tabs[0].id
    vi.mocked(api.saveImage).mockResolvedValue({ relativePath: 'assets/a-1-ab12.png' })
    const vd = fakeVd()
    const buf = new ArrayBuffer(4)
    const r = await insertImageFromFile(vd as never, fakeFile('a.png', 'image/png', buf), tabId)
    expect(r).toBe(true)
    expect(api.saveImage).toHaveBeenCalledWith('/w/notes', buf, 'a.png', 'png')
    expect(vd.insertValue).toHaveBeenCalledWith('\n![](assets/a-1-ab12.png)\n')
  })

  it('IPC 失败：toast 报错，返回 true 且不插入', async () => {
    useTabs.getState().openFile('/w/notes/a.md', 'x')
    const tabId = useTabs.getState().tabs[0].id
    vi.mocked(api.saveImage).mockRejectedValue(new Error('disk full'))
    const vd = fakeVd()
    const r = await insertImageFromFile(vd as never, fakeFile('a.png', 'image/png'), tabId)
    expect(r).toBe(true)
    expect(vd.insertValue).not.toHaveBeenCalled()
    expect(lastToast()).toBe(s.toast.imageSaveFailed('disk full'))
  })
})
