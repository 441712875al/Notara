import { describe, expect, it } from 'vitest'
import { resolveCreateEntry } from '../../src/renderer/src/lib/treeActions'

describe('resolveCreateEntry', () => {
  it('file 意图且无 .md/.markdown 扩展名：自动补 .md', () => {
    expect(resolveCreateEntry('笔记', 'file')).toEqual({ name: '笔记.md', kind: 'file' })
  })

  it('file 意图且已有 .md/.markdown（大小写不敏感）：原样不补', () => {
    expect(resolveCreateEntry('a.md', 'file')).toEqual({ name: 'a.md', kind: 'file' })
    expect(resolveCreateEntry('b.markdown', 'file')).toEqual({ name: 'b.markdown', kind: 'file' })
    expect(resolveCreateEntry('c.MD', 'file')).toEqual({ name: 'c.MD', kind: 'file' })
  })

  it('directory 意图且无扩展名：原样建目录', () => {
    expect(resolveCreateEntry('归档', 'directory')).toEqual({ name: '归档', kind: 'directory' })
  })

  it('directory 意图且名称形似 md 文件：仍按目录原样，不补不改', () => {
    expect(resolveCreateEntry('x.md', 'directory')).toEqual({ name: 'x.md', kind: 'directory' })
  })
})
