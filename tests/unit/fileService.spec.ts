import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readFileSafe, writeFileAtomic, createEntry, renamePath, deleteToTrash, trackOpen, knownMtime
} from '../../src/main/services/fileService'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'notara-test-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readFileSafe', () => {
  it('读取 UTF-8 文本并返回 mtime', async () => {
    const p = join(dir, 'a.md')
    await writeFile(p, '# 你好', 'utf8')
    const r = await readFileSafe(p)
    expect(r.content).toBe('# 你好')
    expect(r.mtime).toBeGreaterThan(0)
  })

  it('拒绝二进制文件（含 \\0 字节）', async () => {
    const p = join(dir, 'bin.md')
    await writeFile(p, Buffer.from([0x61, 0x00, 0x62]))
    await expect(readFileSafe(p)).rejects.toMatchObject({ code: 'binary-file' })
  })

  it('不存在的文件抛 not-found', async () => {
    await expect(readFileSafe(join(dir, 'nope.md'))).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('writeFileAtomic', () => {
  it('写入后内容与 mtime 正确且无残留 tmp 文件', async () => {
    const p = join(dir, 'b.md')
    const r = await writeFileAtomic(p, '内容1')
    expect((await stat(p)).mtimeMs).toBe(r.mtime)
    expect(r.mtime).toBeGreaterThan(0)
    const again = await writeFileAtomic(p, '内容2')
    expect(again.mtime).toBeGreaterThanOrEqual(r.mtime)
    const files = await (await import('node:fs/promises')).readdir(dir)
    expect(files).toEqual(['b.md'])
  })

  it('覆盖已有文件保留其他文件', async () => {
    await writeFile(join(dir, 'c.md'), 'old', 'utf8')
    await writeFileAtomic(join(dir, 'c.md'), 'new')
    const r = await readFileSafe(join(dir, 'c.md'))
    expect(r.content).toBe('new')
  })
})

describe('createEntry / renamePath / deleteToTrash', () => {
  it('创建文件与目录，重名抛 target-exists', async () => {
    const f = await createEntry(dir, 'x.md', 'file')
    expect(f.path).toBe(join(dir, 'x.md'))
    await expect(createEntry(dir, 'x.md', 'file')).rejects.toMatchObject({ code: 'target-exists' })
    const d = await createEntry(dir, 'sub', 'directory')
    expect(d.path).toBe(join(dir, 'sub'))
  })

  it('非法名字抛 invalid-name', async () => {
    await expect(createEntry(dir, '../evil.md', 'file')).rejects.toMatchObject({ code: 'invalid-name' })
    await expect(createEntry(dir, '', 'file')).rejects.toMatchObject({ code: 'invalid-name' })
    await expect(createEntry(dir, 'a/b.md', 'file')).rejects.toMatchObject({ code: 'invalid-name' })
  })

  it('重命名并跟踪 mtime 迁移', async () => {
    await writeFile(join(dir, 'o.md'), 'v', 'utf8')
    trackOpen(join(dir, 'o.md'), (await stat(join(dir, 'o.md'))).mtimeMs)
    const r = await renamePath(join(dir, 'o.md'), join(dir, 'n.md'))
    expect(r.path).toBe(join(dir, 'n.md'))
    expect(knownMtime(join(dir, 'n.md'))).toBeGreaterThan(0)
    expect(knownMtime(join(dir, 'o.md'))).toBeUndefined()
  })
})
