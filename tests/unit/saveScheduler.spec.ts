import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SaveScheduler } from '../../src/renderer/src/lib/saveScheduler'

describe('SaveScheduler', () => {
  beforeEach(() => vi.useFakeTimers())

  it('输入后 500ms 触发保存', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(1)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenCalledWith(1)
  })

  it('连续输入只保存最后一次（防抖）', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(1)
    await vi.advanceTimersByTimeAsync(300)
    s.schedule(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flushOne 立即保存并清除 pending', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(2)
    expect(s.isPending(2)).toBe(true)
    await s.flushOne(2)
    expect(save).toHaveBeenCalledWith(2)
    expect(s.isPending(2)).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancel 丢弃未触发的保存', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(3)
    s.cancel(3)
    expect(s.isPending(3)).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).not.toHaveBeenCalled()
  })

  it('flushAll 并发保存所有 pending', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(1)
    s.schedule(2)
    await s.flushAll()
    expect(new Set(save.mock.calls.map((c) => c[0]))).toEqual(new Set([1, 2]))
  })

  it('保存失败时保持 pending 以便重试', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk'))
    const s = new SaveScheduler(500)
    s.setSaver(save)
    s.schedule(4)
    await expect(s.flushOne(4)).rejects.toThrow('disk')
    expect(s.isPending(4)).toBe(true)
  })
})
