import { describe, expect, it } from 'vitest'
import { parseIpcError } from '../../src/renderer/src/lib/ipcError'

describe('parseIpcError', () => {
  it('解出 `[code] message` 前缀（编码格式）', () => {
    expect(parseIpcError(new Error('[target-exists] 已存在: README.md'))).toEqual({
      code: 'target-exists',
      message: '已存在: README.md'
    })
  })

  it('无前缀（纯渲染侧错误）原样返回：code 为 null、message 不变', () => {
    expect(parseIpcError(new Error('boom'))).toEqual({ code: null, message: 'boom' })
  })

  it('多行 message：/s 使 . 匹配换行，仅剥去首行前缀', () => {
    expect(parseIpcError(new Error('[write-failed] 保存失败\n底层: EACCES'))).toEqual({
      code: 'write-failed',
      message: '保存失败\n底层: EACCES'
    })
  })
})
