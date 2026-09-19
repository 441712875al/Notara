import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { ErrorCodes, NotaraError } from '@shared/errors'

/** 原名去扩展 + 时间戳 + 4 位随机 + 目标扩展名（同名不覆盖） */
export function imageFileName(originalName: string, ext: string): string {
  const base = originalName.replace(/\.[^.]*$/, '') || 'image'
  const rand = Math.random().toString(36).slice(2, 6)
  return `${base}-${Date.now()}-${rand}.${ext}`
}

/**
 * 将图片写入 refDir/assets/，返回相对 refDir 的 POSIX 风格路径（如 assets/截图-...-ab12.png）。
 * 目录不存在时自动创建；文件名带时间戳与随机串，重复保存不覆盖。
 */
export async function saveImage(
  refDir: string,
  data: Buffer,
  originalName: string,
  ext: string
): Promise<string> {
  const assetsDir = path.join(refDir, 'assets')
  try {
    await fs.mkdir(assetsDir, { recursive: true })
    const name = imageFileName(originalName, ext)
    await fs.writeFile(path.join(assetsDir, name), data)
    return path.relative(refDir, path.join(assetsDir, name)).split(path.sep).join('/')
  } catch (e) {
    throw new NotaraError(ErrorCodes.WriteFailed, `图片保存失败: ${String(e)}`)
  }
}
