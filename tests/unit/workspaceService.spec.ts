import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listChildren, isMarkdownFile } from '../../src/main/services/workspaceService'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'notara-ws-'))
  // 目录结构：
  // root/ docs/ (含 note.md) | Assets/ | .git/ | node_modules/ | .hidden/
  // root/ Zeta.md | apple.md | README.markdown | 汉语笔记.md | image.png | a.txt
  await mkdir(join(root, 'docs'))
  await mkdir(join(root, 'Assets'))
  await mkdir(join(root, '.git'))
  await mkdir(join(root, 'node_modules'))
  await mkdir(join(root, '.hidden'))
  await writeFile(join(root, 'docs', 'note.md'), 'n', 'utf8')
  await writeFile(join(root, 'Zeta.md'), 'z', 'utf8')
  await writeFile(join(root, 'apple.md'), 'a', 'utf8')
  await writeFile(join(root, 'README.markdown'), 'r', 'utf8')
  await writeFile(join(root, '汉语笔记.md'), '汉', 'utf8')
  await writeFile(join(root, 'image.png'), 'p', 'utf8')
  await writeFile(join(root, 'a.txt'), 't', 'utf8')
  await writeFile(join(root, '.dotfile.md'), 'd', 'utf8')
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('listChildren', () => {
  it('只返回目录与 Markdown 文件，忽略 .git/node_modules/隐藏项', async () => {
    const nodes = await listChildren(root)
    // 注：本地 ICU（zh-Hans-CN collation）将汉语排于 ASCII 之前，以本地实际结果为准
    expect(nodes.map((n) => n.name)).toEqual(['Assets', 'docs', '汉语笔记.md', 'apple.md', 'README.markdown', 'Zeta.md'])
  })

  it('目录排在文件前、名称排序不区分大小写', async () => {
    const nodes = await listChildren(root)
    expect(nodes[0].isDir).toBe(true)
    const files = nodes.filter((n) => !n.isDir).map((n) => n.name)
    expect(files).toEqual(['汉语笔记.md', 'apple.md', 'README.markdown', 'Zeta.md'])
  })

  it('路径为绝对路径', async () => {
    const nodes = await listChildren(root)
    expect(nodes[0].path).toBe(join(root, nodes[0].name))
  })

  it('空目录返回空数组', async () => {
    expect(await listChildren(join(root, 'Assets'))).toEqual([])
  })
})

describe('isMarkdownFile', () => {
  it('匹配 .md/.markdown（大小写不敏感）', () => {
    expect(isMarkdownFile('a.md')).toBe(true)
    expect(isMarkdownFile('a.MARKDOWN')).toBe(true)
    expect(isMarkdownFile('a.mdx')).toBe(false)
    expect(isMarkdownFile('a.png')).toBe(false)
    expect(isMarkdownFile('md')).toBe(false)
  })
})
