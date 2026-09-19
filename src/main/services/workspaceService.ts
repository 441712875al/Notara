import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { ErrorCodes, NotaraError } from '@shared/errors'
import type { TreeNode } from '@shared/types'

export const IGNORED_DIRS = new Set(['.git', 'node_modules'])

export function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name)
}

export async function listChildren(dir: string): Promise<TreeNode[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new NotaraError(ErrorCodes.NotFound, `目录不存在: ${dir}`)
    if (code === 'ENOTDIR') throw new NotaraError(ErrorCodes.InvalidName, '不是目录')
    throw new NotaraError(ErrorCodes.Unknown, `读取目录失败: ${String(e)}`)
  }
  const nodes: TreeNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue // 隐藏文件/目录（含 .git）
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue
      nodes.push({ name: e.name, path: path.join(dir, e.name), isDir: true })
    } else if (e.isFile() && isMarkdownFile(e.name)) {
      nodes.push({ name: e.name, path: path.join(dir, e.name), isDir: false })
    }
  }
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' })
  })
  return nodes
}
