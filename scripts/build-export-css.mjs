// 将 vditor 的 Markdown 排版样式 + 代码高亮主题 + KaTeX CSS（字体内联为 data URI）
// 合并为单一 export.css，保证导出的 HTML/PDF 完全离线可看。
//
// 用法：node scripts/build-export-css.mjs
// 生成物 src/main/resources/export.css 提交入库，随源码分发（prebuild 不含此步骤）。
//
// 说明：当前 vditor（3.11.x）的 dist 里没有独立的 content-theme/typo.css，
// Markdown 正文排版位于 index.css 的 .vditor-reset 作用域下，配色微调在
// css/content-theme/light.css；vditor 默认高亮主题为 github（HLJS_OPTIONS.style）。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vditor = (p) => join(root, 'node_modules/vditor/dist', p)

function mustRead(p, label) {
  if (!existsSync(p)) {
    console.error(`[export-css] 缺少 ${label}: ${p}\n  先执行 npm install`)
    process.exit(1)
  }
  return readFile(p, 'utf8')
}

// 1) vditor 正文排版（.vditor-reset）+ 亮色内容主题 + 代码高亮（github）
const typo = await mustRead(vditor('index.css'), 'vditor index.css')
const contentTheme = await mustRead(vditor('css/content-theme/light.css'), 'vditor light.css')
const hljsTheme = await mustRead(vditor('js/highlight.js/styles/github.min.css'), 'hljs github 主题')
let katexCss = await mustRead(vditor('js/katex/katex.min.css'), 'katex.min.css')

// 2) 内联 KaTeX 字体（只保留 woff2：Chromium/Safari/Firefox 全支持，体积约为 woff+ttf 的 1/3）
//    注意：String.replace 的 replacer 是同步回调，await 在其中不生效，须 matchAll 逐个替换
const fontDir = vditor('js/katex/fonts')
const fontRe = /url\(fonts\/(KaTeX_[A-Za-z0-9_-]+\.woff2)\)/g
for (const m of katexCss.matchAll(fontRe)) {
  const buf = await readFile(join(fontDir, m[1]))
  katexCss = katexCss.split(m[0]).join(`url(data:font/woff2;base64,${buf.toString('base64')})`)
}
// 去掉 woff/ttf 回退项（指向的 fonts/ 相对路径在导出目录中不存在，保留会白请求 404）
katexCss = katexCss.replace(
  /,url\(fonts\/[^)]+\) format\("(?:woff|truetype)"\)/g,
  ''
)
if (katexCss.includes('url(fonts/')) {
  console.error('[export-css] KaTeX 仍有未内联的字体引用，请检查脚本')
  process.exit(1)
}

const header = '/* 由 scripts/build-export-css.mjs 生成，勿手改 */\n'
// hljs 的 github 主题给 .hljs 白底，导出的代码块会与正文融为一体；
// 这里补一层浅灰底色，贴近 vditor 编辑器内代码块的观感（也便于 PDF 中区分分页）
const exportExtras = `
/* 导出补充样式 */
.vditor-reset pre > code.hljs { background-color: #f6f8fa; }
`
const out = `${header}${typo}\n${contentTheme}\n${hljsTheme}\n${katexCss}\n${exportExtras}`

const dest = join(root, 'src/main/resources/export.css')
await mkdir(dirname(dest), { recursive: true })
await writeFile(dest, out, 'utf8')
console.log(
  `[export-css] 已生成 ${dest}（${(Buffer.byteLength(out) / 1024).toFixed(1)} KB）`
)
