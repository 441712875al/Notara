import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  // load() 用 screen 校验 bounds 是否落在可见显示器内
  screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] }
}))
import { createWindowStateService } from '../../src/main/services/windowStateService'

let userData: string
let svc: ReturnType<typeof createWindowStateService>

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'notara-wstate-'))
  svc = createWindowStateService(() => userData)
})

describe('windowStateService', () => {
  it('保存后可读回（含 bounds 与 payload）', async () => {
    await svc.save({ x: 1, y: 2, width: 800, height: 600 }, {
      workspaceRoot: '/w', tabPaths: ['/w/a.md'], activeIndex: 0
    })
    const st = await svc.load()
    expect(st?.bounds).toEqual({ x: 1, y: 2, width: 800, height: 600 })
    expect(st?.payload.workspaceRoot).toBe('/w')
    expect(st?.payload.tabPaths).toEqual(['/w/a.md'])
  })

  it('无文件时返回 null（首启）', async () => {
    expect(await svc.load()).toBeNull()
  })

  it('超出屏幕的 bounds 被丢弃（防恢复到不可见位置）', async () => {
    await svc.save({ x: -99999, y: 99999, width: 800, height: 600 }, {
      workspaceRoot: null, tabPaths: [], activeIndex: -1
    })
    const st = await svc.load()
    expect(st?.bounds).toBeUndefined()
  })
})
