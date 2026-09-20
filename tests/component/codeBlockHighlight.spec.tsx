import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  escapeHtml,
  pickHighlightLanguage,
  renderOverlayHtml,
  syncOverlays
} from '../../src/renderer/src/lib/codeBlockHighlight'

/** 构造一个 IR 代码块 node 的最小 DOM（结构对齐 Lute Md2VditorIRDOM 输出） */
function makeCodeBlock(host: HTMLElement, expanded: boolean, lang: string, code: string): void {
  const node = document.createElement('div')
  node.dataset.block = '0'
  node.dataset.type = 'code-block'
  node.className = expanded ? 'vditor-ir__node vditor-ir__node--expand' : 'vditor-ir__node'
  node.innerHTML =
    `<span data-type="code-block-open-marker">\`\`\`</span>` +
    `<span class="vditor-ir__marker vditor-ir__marker--info" data-type="code-block-info">​${lang}</span>` +
    `<pre class="vditor-ir__marker--pre vditor-ir__marker"><code class="language-${lang}">${code}</code></pre>` +
    `<pre class="vditor-ir__preview" data-render="2"><code class="language-${lang}">${code}</code></pre>` +
    `<span data-type="code-block-close-marker">\`\`\`</span>`
  host.appendChild(node)
}

describe('pickHighlightLanguage', () => {
  it('从 language- 类名解析语言', () => {
    ;(window as { hljs?: unknown }).hljs = { getLanguage: () => true }
    expect(pickHighlightLanguage('language-js')).toBe('js')
    expect(pickHighlightLanguage('code language-typescript something')).toBe('typescript')
  })

  it('图形/公式类语言与未知语言回落 plaintext', () => {
    ;(window as { hljs?: unknown }).hljs = { getLanguage: () => true }
    expect(pickHighlightLanguage('language-mermaid')).toBe('plaintext')
    expect(pickHighlightLanguage('language-math')).toBe('plaintext')
    expect(pickHighlightLanguage('')).toBe('plaintext')
  })

  it('hljs 未加载或不认识该语言时回落 plaintext', () => {
    delete (window as { hljs?: unknown }).hljs
    expect(pickHighlightLanguage('language-js')).toBe('plaintext')
    ;(window as { hljs?: unknown }).hljs = { getLanguage: () => false }
    expect(pickHighlightLanguage('language-js')).toBe('plaintext')
  })
})

describe('escapeHtml', () => {
  it('转义五个敏感字符', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
})

describe('renderOverlayHtml', () => {
  afterEach(() => {
    delete (window as { hljs?: unknown }).hljs
  })

  it('hljs 可用时产出带语言类的高亮 HTML', () => {
    ;(window as { hljs?: unknown }).hljs = {
      getLanguage: () => true,
      highlight: (code: string, opts: { language: string }) => ({
        value: `<span class="hljs-keyword" data-lang="${opts.language}">${code}</span>`
      })
    }
    const el = document.createElement('code')
    el.className = 'language-js'
    el.textContent = 'const a = 1'
    const html = renderOverlayHtml(el)
    expect(html).toBe(
      '<code class="hljs language-js"><span class="hljs-keyword" data-lang="js">const a = 1</span></code>'
    )
  })

  it('hljs 抛错时回落转义纯文本', () => {
    ;(window as { hljs?: unknown }).hljs = {
      getLanguage: () => true,
      highlight: () => {
        throw new Error('boom')
      }
    }
    const el = document.createElement('code')
    el.className = 'language-js'
    el.textContent = 'a < b'
    expect(renderOverlayHtml(el)).toBe('<code class="hljs">a &lt; b</code>')
  })

  it('无 language 类时产出转义纯文本', () => {
    const el = document.createElement('code')
    el.textContent = 'x & y'
    expect(renderOverlayHtml(el)).toBe('<code class="hljs">x &amp; y</code>')
  })
})

describe('syncOverlays', () => {
  let host: HTMLElement

  beforeEach(() => {
    ;(window as { hljs?: unknown }).hljs = {
      getLanguage: () => true,
      highlight: (code: string) => ({ value: code })
    }
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
    delete (window as { hljs?: unknown }).hljs
  })

  it('展开态代码块挂载 overlay（aria-hidden、位于源码 pre 内、code 的兄弟）', () => {
    makeCodeBlock(host, true, 'js', 'const a = 1')
    syncOverlays(host)
    const overlay = host.querySelector('.notara-code-overlay')
    expect(overlay).not.toBeNull()
    expect(overlay!.getAttribute('aria-hidden')).toBe('true')
    const srcCode = host.querySelector('.vditor-ir__marker--pre > code')!
    expect(overlay!.parentElement).toBe(srcCode.parentElement) // 同在 marker--pre 内
    expect(overlay!.previousElementSibling).toBe(srcCode)
    expect(overlay!.querySelector('code')!.className).toBe('hljs language-js')
  })

  it('折叠态代码块不挂载 overlay', () => {
    makeCodeBlock(host, false, 'js', 'const a = 1')
    syncOverlays(host)
    expect(host.querySelector('.notara-code-overlay')).toBeNull()
  })

  it('孤儿 overlay（所属块不再展开）被清理', () => {
    makeCodeBlock(host, true, 'js', 'const a = 1')
    syncOverlays(host)
    expect(host.querySelector('.notara-code-overlay')).not.toBeNull()
    host.querySelector('.vditor-ir__node')!.classList.remove('vditor-ir__node--expand')
    syncOverlays(host)
    expect(host.querySelector('.notara-code-overlay')).toBeNull()
  })

  it('源码内容变化时 overlay 更新；未变化时不重写（签名短路）', () => {
    makeCodeBlock(host, true, 'js', 'const a = 1')
    syncOverlays(host)
    const overlay = host.querySelector('.notara-code-overlay')!
    const codeEl = overlay.querySelector('code')!
    codeEl.textContent = 'SENTINEL'
    syncOverlays(host) // 内容未变，签名命中，innerHTML 不重写
    expect(overlay.querySelector('code')!.textContent).toBe('SENTINEL')
    host.querySelector('.vditor-ir__marker--pre code')!.textContent = 'const b = 2'
    syncOverlays(host) // 源码变了，重写
    expect(overlay.querySelector('code')!.textContent).toBe('const b = 2')
  })

  it('幂等：连续同步两次不产生重复 overlay', () => {
    makeCodeBlock(host, true, 'js', 'x')
    syncOverlays(host)
    syncOverlays(host)
    expect(host.querySelectorAll('.notara-code-overlay')).toHaveLength(1)
  })
})
