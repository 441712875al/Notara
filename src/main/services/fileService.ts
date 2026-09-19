import { promises as fs } from 'node:fs'
import { shell } from 'electron'
import * as path from 'node:path'
import { ErrorCodes, NotaraError } from '@shared/errors'
import type { ReadResult, WriteResult } from '@shared/types'

// 打开中文件的最后已知 mtime（自写过滤与外部变更判断共用，Task 9 使用）
const openFiles = new Map<string, number>()

function toCode(e: unknown): string {
  return (e as NodeJS.ErrnoException).code ?? 'unknown'
}

export async function readFileSafe(filePath: string): Promise<ReadResult> {
  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch (e) {
    if (toCode(e) === 'ENOENT') throw new NotaraError(ErrorCodes.NotFound, `文件不存在: ${filePath}`)
    if (toCode(e) === 'EISDIR') throw new NotaraError(ErrorCodes.InvalidName, '不能读取目录')
    throw new NotaraError(ErrorCodes.Unknown, `读取失败: ${String(e)}`)
  }
  // 前 8KB 出现 \0 视为二进制（UTF-8 文本不可能含 \0）
  if (buf.subarray(0, 8192).includes(0)) {
    throw new NotaraError(ErrorCodes.BinaryFile, '不是文本文件，无法打开')
  }
  const mtime = (await fs.stat(filePath)).mtimeMs
  trackOpen(filePath, mtime)
  return { content: buf.toString('utf8'), mtime }
}

export async function writeFileAtomic(filePath: string, content: string): Promise<WriteResult> {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(tmp, content, 'utf8')
    await fs.rename(tmp, filePath) // 同卷 rename 原子覆盖
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw new NotaraError(ErrorCodes.WriteFailed, `保存失败: ${String(e)}`)
  }
  const mtime = (await fs.stat(filePath)).mtimeMs
  trackOpen(filePath, mtime)
  return { mtime }
}

const NAME_RE = /^[\w一-龥][\w一-龥 .()-]*$/u

export async function createEntry(
  dir: string,
  name: string,
  kind: 'file' | 'directory'
): Promise<{ path: string }> {
  if (!NAME_RE.test(name)) {
    throw new NotaraError(ErrorCodes.InvalidName, `非法名称: ${name}`)
  }
  const target = path.join(dir, name)
  if (await fs.access(target).then(() => true, () => false)) {
    throw new NotaraError(ErrorCodes.TargetExists, `已存在: ${name}`)
  }
  if (kind === 'file') await fs.writeFile(target, '', 'utf8')
  else await fs.mkdir(target)
  return { path: target }
}

export async function renamePath(oldPath: string, newPath: string): Promise<{ path: string }> {
  try {
    await fs.rename(oldPath, newPath)
  } catch (e) {
    throw new NotaraError(ErrorCodes.Unknown, `重命名失败: ${String(e)}`)
  }
  const mtime = openFiles.get(oldPath)
  openFiles.delete(oldPath)
  if (mtime !== undefined) trackOpen(newPath, mtime)
  return { path: newPath }
}

export async function deleteToTrash(p: string): Promise<void> {
  try {
    await shell.trashItem(p)
  } catch (e) {
    throw new NotaraError(ErrorCodes.Unknown, `移入废纸篓失败: ${String(e)}`)
  }
  openFiles.delete(p)
}

export function trackOpen(p: string, mtime: number): void {
  openFiles.set(p, mtime)
}
export function knownMtime(p: string): number | undefined {
  return openFiles.get(p)
}
export function clearTracked(p: string): void {
  openFiles.delete(p)
}
