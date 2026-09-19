import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveImage, imageFileName } from '../../src/main/services/imageService'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'notara-img-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('imageFileName', () => {
  it('原名 + 时间戳 + 4 位随机 + 扩展名', () => {
    const n = imageFileName('屏幕截图.png', 'png')
    expect(n).toMatch(/^屏幕截图-\d+-[a-z0-9]{4}\.png$/)
  })
  it('无原名退化为 image', () => {
    expect(imageFileName('', 'jpeg')).toMatch(/^image-\d+-[a-z0-9]{4}\.jpeg$/)
  })
  it('原名含扩展名时去掉原扩展', () => {
    const n = imageFileName('a.png', 'png')
    expect(n.startsWith('a-')).toBe(true)
  })
})

describe('saveImage', () => {
  it('写入 refDir/assets/ 并返回相对路径（POSIX 风格）', async () => {
    const rel = await saveImage(dir, Buffer.from('fakepng'), 'photo.png', 'png')
    expect(rel.startsWith('assets/')).toBe(true)
    expect(rel.endsWith('.png')).toBe(true)
    const files = await readdir(join(dir, 'assets'))
    expect(files).toHaveLength(1)
    expect((await readFile(join(dir, rel))).toString()).toBe('fakepng')
  })

  it('同名两次保存生成不同文件', async () => {
    const r1 = await saveImage(dir, Buffer.from('a'), 'x.png', 'png')
    const r2 = await saveImage(dir, Buffer.from('b'), 'x.png', 'png')
    expect(r1).not.toBe(r2)
    expect(await readdir(join(dir, 'assets'))).toHaveLength(2)
  })

  it('assets 目录不存在时自动创建（含嵌套 refDir）', async () => {
    const sub = join(dir, 'docs')
    const rel = await saveImage(sub, Buffer.from('c'), 'y.png', 'png')
    expect(rel).toMatch(/^assets\/y-\d+-[a-z0-9]{4}\.png$/)
  })
})
