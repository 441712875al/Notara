// 将 vditor 的 dist 拷贝到渲染进程 public 目录，供运行时 cdn:'./vditor' 加载
// （vditor 会按需懒加载 prism/mermaid/katex 等子资源，必须随应用分发）
import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url)) + '/..'
const src = join(root, 'node_modules/vditor/dist')
const dest = join(root, 'src/renderer/public/vditor/dist')

rmSync(join(root, 'src/renderer/public/vditor'), { recursive: true, force: true })
if (!existsSync(src)) {
  console.log('[copy-vditor] node_modules/vditor/dist 不存在，跳过（先 npm install）')
  process.exit(0)
}
mkdirSync(dirname(dest), { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('[copy-vditor] 已拷贝到 src/renderer/public/vditor/dist')
