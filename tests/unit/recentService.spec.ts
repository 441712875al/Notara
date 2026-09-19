import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => userData } }))
import { listRecent, touchRecent, removeRecent } from '../../src/main/services/recentService'

let userData: string

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'notara-recent-'))
})

describe('recentService', () => {
  it('touch 去重排序并截断到 10', async () => {
    for (let i = 0; i < 12; i++) {
      await touchRecent(`/w/${i}`)
    }
    await new Promise((r) => setTimeout(r, 5)) // 保证重 touch 的时间戳严格大于循环末项（Date.now 毫秒分辨率）
    await touchRecent('/w/5') // 提升优先级
    const list = await listRecent()
    expect(list).toHaveLength(10)
    expect(list[0].root).toBe('/w/5')
    expect(list.some((r) => r.root === '/w/0')).toBe(false) // 最旧的被挤出
  })

  it('removeRecent 移除指定项', async () => {
    await touchRecent('/a')
    await touchRecent('/b')
    await removeRecent('/a')
    expect((await listRecent()).map((r) => r.root)).toEqual(['/b'])
  })
})
