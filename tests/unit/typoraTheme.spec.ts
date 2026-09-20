import { describe, expect, it } from 'vitest'
import { convertTyporaTheme } from '../../src/shared/typoraTheme'
import type { TyporaAssetMapping } from '../../src/shared/types'

/**
 * 按 Typora 官方主题（Newsprint/Github 等）的真实特征构造样本：
 * :root 变量、body/#write 字面规则、.md-fences + .cm-s-inner token、
 * @font-face 相对资源、@include-when-export、@media print / prefers-color-scheme。
 */
const SAMPLE = `
/* 注释应被剥掉 */
@import 'base.css';

:root {
  --bg-color: #fff8e7;
  --side-bar-bg-color: #efe6d0;
  --text-color: #3f2f00;
  --primary-color: #a0522d;
  --select-text-bg-color: rgba(160, 82, 45, 0.25);
  --item-hover-bg-color: rgba(0, 0, 0, 0.06);
  --control-text-color: #7a6a4f;
  --monospace: 'Fira Mono', monospace;
  --serif: 'EB Garamond', serif;
  --active-file-bg-color: #123456;
}

body {
  background: #fffdf5;
  color: #3f2f00;
  font-family: var(--serif);
  font-size: 17px;
  line-height: 1.7;
  margin: 0;
}

#write {
  max-width: 900px;
  color: #3f2f00;
  line-height: 1.8;
}

#write h1 { font-size: 2.2em; margin: 1em 0 0.5em; }
#write h2 { border-bottom: 2px solid #d8c9a3; }
#write p { margin: 0 0 1.2em; }
#write blockquote {
  border-left: 4px solid #a0522d;
  background: #faf3e3;
  color: #6b5b3e;
  padding: 8px 16px;
}
#write a { color: #a0522d; }
#write a:hover { text-decoration: underline; }
#write ul li { margin: 0.3em 0; }

#write code { background: #f3ead6; font-family: var(--monospace); font-size: 0.9em; }
.md-fences {
  background: #f6efdc;
  border: 1px solid #d8c9a3;
  border-radius: 4px;
  padding: 14px 18px;
  font-family: var(--monospace);
  font-size: 0.88em;
  color: #3f2f00;
  width: 100%;
}
#write pre { background: #f6efdc; }

.cm-s-inner { background: #f6efdc; color: #3f2f00; }
.cm-s-inner .CodeMirror-lines { padding: 4px 0; }
.cm-s-inner .cm-keyword { color: #8b3a2f; font-weight: bold; }
.cm-s-inner .cm-string, .cm-s-inner .cm-string-2 { color: #6b8e23; }
.cm-s-inner .cm-comment { color: #b0a080; font-style: italic; }
.cm-s-inner span.cm-def { color: #a0522d; }
.cm-s-inner .cm-error { color: #ff0000; }

@font-face {
  font-family: 'Fira Mono';
  src: url('./assets/dummy.woff2') format('woff2');
  font-weight: normal;
}
@font-face {
  font-family: 'Missing';
  src: url('./nope.ttf');
}
@font-face {
  font-family: 'WebFont';
  src: url('https://fonts.example/x.woff2');
}

@media print { #write { max-width: 100%; } }
@include-when-export body { background: #ffffff; }
@media (prefers-color-scheme: dark) {
  body { background: #2a2a2a; color: #eee; }
  #write blockquote { border-left-color: #6b5b3e; }
}
.sidebar { background: #efe6d0; }
.md-toc { font-size: 14px; }
`

/** 记录调用并把相对 url 映射到假的复制落点 */
function makeResolver(copies: Record<string, string> = { './assets/dummy.woff2': '/themes/x.assets/dummy.woff2' }) {
  const calls: string[] = []
  const resolveAsset = (u: string): TyporaAssetMapping => {
    calls.push(u)
    const dest = copies[u]
    return dest
      ? { relativeUrl: u, emitUrl: `file://${dest}`, copyFrom: `/src/${u}`, destPath: dest }
      : { relativeUrl: u, emitUrl: u, copyFrom: null, destPath: null }
  }
  return { resolveAsset, calls }
}

/** 空白归一后断言（生成 CSS 的多选择器带换行） */
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

describe('convertTyporaTheme：变量桥接', () => {
  it(':root 变量映射到 Notara 变量，字面值优先', () => {
    const { css, report } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    // --bg：body 字面值 #fffdf5 优先于 --bg-color
    expect(norm(css)).toContain('--bg: #fffdf5;')
    expect(norm(css)).toContain('--accent: #a0522d;')
    expect(norm(css)).toContain('--selection: rgba(160, 82, 45, 0.25);')
    expect(norm(css)).toContain('--bg-elevated: #efe6d0;')
    expect(norm(css)).toContain('--fg-secondary: #7a6a4f;')
    // 正文字体：body font-family 的 var(--serif) 被解析
    expect(norm(css)).toContain("--font-prose: 'EB Garamond', serif;")
    // 等宽字体：--monospace 优先，fences 的同值不重复桥接
    expect(norm(css)).toContain("--font-mono: 'Fira Mono', monospace;")
    expect(report.varsBridged).toContain('--primary-color → --accent')
    expect(report.varsBridged).toContain('#write/body font-family → --font-prose')
    expect(report.varsBridged).not.toContain(".md-fences font-family → --font-mono") // 先到先得
  })

  it('亮暗钉同一份变量（单套配色）', () => {
    const { css } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(css).toContain("html[data-theme='dark']")
    expect(css.match(/--bg: #fffdf5;/g)).toHaveLength(2) // :root 与 dark 各一份
  })

  it('未消费的 :root 变量进 varsDropped', () => {
    const { report } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(report.varsDropped).toContain('--active-file-bg-color')
    expect(report.varsDropped).not.toContain('--serif')
  })
})

describe('convertTyporaTheme：选择器重写', () => {
  it('#write 元素规则映射到内容作用域，布局属性被丢弃', () => {
    const { css } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(norm(css)).toContain('.editors .vditor-reset h1 { font-size: 2.2em; margin: 1em 0 0.5em; }')
    expect(norm(css)).toContain('.editors .vditor-reset h2 { border-bottom: 2px solid #d8c9a3; }')
    expect(norm(css)).toContain('.editors .vditor-reset a:hover { text-decoration: underline; }')
    expect(norm(css)).toContain('.editors .vditor-reset ul li { margin: 0.3em 0; }')
    // blockquote 全套保留
    const bq = norm(css).match(/\.editors \.vditor-reset blockquote \{[^}]+\}/)![0]
    expect(bq).toContain('border-left: 4px solid #a0522d')
    expect(bq).toContain('background: #faf3e3')
    expect(bq).toContain('padding: 8px 16px')
    // #write 的几何属性不出现
    expect(css).not.toContain('max-width: 900px')
    // 正文层：body 的字号/行高与 #write 的行高各成一条（源序级联，后者胜）
    expect(norm(css)).toContain('.editors .vditor-ir pre.vditor-reset { font-size: 17px; line-height: 1.7; }')
    expect(norm(css)).toContain('.editors .vditor-ir pre.vditor-reset { line-height: 1.8; }')
  })

  it('代码块：底板/文字层/内距分面输出', () => {
    const { css } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    const flat = norm(css)
    // 底板：.md-fences、#write pre、.cm-s-inner 三处来源各一条（级联源序保留）
    const plates = flat.match(
      /pre\.vditor-ir__preview,\s*\.editors \.vditor-reset \.vditor-ir__node--expand pre\.vditor-ir__marker--pre \{[^}]+\}/g
    )!
    expect(plates).toHaveLength(3)
    expect(plates[0]).toContain('background: #f6efdc')
    expect(plates[0]).toContain('border: 1px solid #d8c9a3')
    expect(plates[0]).toContain('border-radius: 4px')
    // 文字层：字体/字号/墨色（.md-fences 来源）
    const layers = flat.match(
      /pre\.vditor-ir__preview code,\s*\.editors \.vditor-reset \.vditor-ir__node--expand pre\.vditor-ir__marker--pre > code,\s*\.editors \.notara-code-overlay code \{[^}]+\}/
    )!
    expect(layers[0]).toContain('font-size: 0.88em')
    expect(layers[0]).toContain('color: #3f2f00')
    expect(layers[0]).toContain("font-family: 'Fira Mono', monospace") // var(--monospace) 已就地解析
    // 内距走变量（两层对齐前提）
    expect(flat).toContain('.editors .vditor { --code-block-pad: 14px 18px; }')
    // fences 的 width 丢弃
    expect(css).not.toContain('width: 100%')
  })

  it('行内代码单独成规则', () => {
    const { css } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    const inline = norm(css).match(/span\.vditor-ir__node\[data-type='code'\] code \{[^}]+\}/)![0]
    expect(inline).toContain('background: #f3ead6')
    expect(inline).toContain('font-size: 0.9em')
  })

  it('.cm-* token 映射到 .hljs-*，多对一合并', () => {
    const { css, report } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(norm(css)).toContain('.editors .vditor-reset .hljs-keyword { color: #8b3a2f; font-weight: bold; }')
    expect(norm(css)).toContain('.editors .vditor-reset .hljs-comment { color: #b0a080; font-style: italic; }')
    // cm-string 与 cm-string-2 都并到 hljs-string，先到先得（同值）
    expect(css.match(/\.hljs-string \{/g)).toHaveLength(1)
    // 带 span 前缀的 token 选择器也能命中
    expect(norm(css)).toContain('.editors .vditor-reset .hljs-title.function_ { color: #a0522d; }')
    // 未映射 token（cm-error）记入报告
    expect(report.selectorsDropped.some((s) => s.includes('cm-error'))).toBe(true)
  })

  it('未映射选择器进报告：侧栏/toc 等', () => {
    const { report } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(report.selectorsDropped.some((s) => s.includes('.sidebar'))).toBe(true)
    expect(report.selectorsDropped.some((s) => s.includes('.md-toc'))).toBe(true)
  })
})

describe('convertTyporaTheme：资源与 at-rule', () => {
  it('@font-face 相对资源改写为解析器落点，远程与缺失各自记录', () => {
    const { css, report, assets } = convertTyporaTheme(SAMPLE, 'sample', {
      resolveAsset: makeResolver().resolveAsset
    })
    expect(css).toContain("url('file:///themes/x.assets/dummy.woff2')")
    expect(css).toContain("url('./nope.ttf')") // 缺失资源原样保留
    expect(report.assetsCopied).toBe(1)
    expect(report.missingAssets).toEqual(['./nope.ttf'])
    expect(assets).toHaveLength(2)
    // 远程字体被跳过改写但保留原值
    expect(css).toContain("url('https://fonts.example/x.woff2')")
    expect(report.notes.some((n) => n.includes('https://fonts.example/x.woff2'))).toBe(true)
  })

  it('同一资源多次引用只解析一次', () => {
    const { resolveAsset, calls } = makeResolver()
    const css2 = `@font-face { font-family: A; src: url('./a.woff2'); }\n@font-face { font-family: B; src: url('./a.woff2'); }`
    convertTyporaTheme(css2, 'sample', { resolveAsset })
    expect(calls).toHaveLength(1)
  })

  it('@media print 与 @include-when-export 跳过并记笔记', () => {
    const { css, report } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(css).not.toContain('@media print')
    expect(report.notes.some((n) => n.includes('@media print'))).toBe(true)
    expect(report.notes.some((n) => n.includes('@include-when-export'))).toBe(true)
  })

  it('@media prefers-color-scheme 内的元素规则保留，全局规则跳过', () => {
    const { css, report } = convertTyporaTheme(SAMPLE, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(norm(css)).toContain('.editors .vditor-reset blockquote { border-left-color: #6b5b3e; }')
    expect(report.notes.some((n) => n.includes('单套配色'))).toBe(true)
  })
})

describe('convertTyporaTheme：健壮性', () => {
  it('空串/纯注释产出空 CSS 与恒有笔记', () => {
    const { css, report } = convertTyporaTheme('/* nothing */', 'sample', {
      resolveAsset: makeResolver().resolveAsset
    })
    expect(css.trim()).toBe('')
    expect(report.rulesMapped).toBe(0)
    expect(report.notes.length).toBeGreaterThan(0)
  })

  it('值中的分号（data URI / 引号内分号）不切断声明', () => {
    const css2 = `#write h1 { background: url("data:image/svg+xml;utf8,<svg/>"); color: red; }`
    const { css } = convertTyporaTheme(css2, 'sample', { resolveAsset: makeResolver().resolveAsset })
    expect(norm(css)).toContain('background: url("data:image/svg+xml;utf8,<svg/>");')
    expect(norm(css)).toContain('color: red;')
  })
})
