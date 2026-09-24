/**
 * 代码块就地高亮（Typora 式编辑体验）。
 *
 * vditor IR 的代码块展开后是纯文本源码（无高亮），高亮只在渲染态 preview 里。
 * 本模块在展开的代码块源码 pre 内叠一层「高亮副本」：源码 code 文字透明
 * （光标/输入/撤销/序列化全部走 vditor 原生链路，不碰内部机制），
 * 副本用 hljs 渲染同样文本，观感即「边打字边高亮」。
 *
 * 数据安全（对 Lute 3.x 的 Node 实测）：
 * - VditorIRDOM2Md（getValue/落盘）对 <div> 副本完全忽略——<pre> 副本会把内容
 *   泄进代码块，不可用；
 * - SpinVditorIRDOM（每次输入的整块重整）会剥离副本 → MutationObserver 监听重挂。
 */
import type Vditor from 'vditor'

const OVERLAY_CLASS = 'notara-code-overlay'

/** 已高亮签名缓存：键为源码 code 元素，值为其 textContent。
 *  之前用 DOM 属性 data-sig 存整份高亮 HTML——大代码块时该属性可达数十 KB，
 *  每次输入 vditor 都会把 block 的 outerHTML（含该巨量属性）交给 Lute Spin 重解析，
 *  既拖慢输入又可能因属性含转义引号/尖括号导致解析异常（「错码」的诱因之一）。
 *  改用 JS 侧 WeakMap，不污染 DOM、随 Spin 重建的元素自动失效。 */
const highlightedSig = new WeakMap<Element, string>()

/** vditor highlightRender 同款：这些语言由各渲染器画成图/公式，不做语法高亮 */
const NO_HIGHLIGHT_LANGS = new Set([
  'mermaid',
  'flowchart',
  'echarts',
  'mindmap',
  'plantuml',
  'smiles',
  'abc',
  'graphviz',
  'math',
])

/** vditor 懒加载注入的全局 hljs（highlight.min.js），加载前运行时为 undefined；
 *  window.hljs 的类型来自 vditor dist/types（非可选声明），运行时用 ?. 兜底 */

/** 从源码 code 的 className（如 "language-js"）解析高亮语言，回落 plaintext */
export function pickHighlightLanguage(className: string): string {
  const m = className.match(/(?:^|\s)language-([\w+-]+)/)
  const lang = m ? m[1].toLowerCase() : ''
  if (!lang || NO_HIGHLIGHT_LANGS.has(lang)) return 'plaintext'
  if (!window.hljs?.getLanguage(lang)) return 'plaintext'
  return lang
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/**
 * 产出 overlay 的 innerHTML：一个 <code class="hljs language-x">。
 * 语义与 vditor highlightRender 一致（getLanguage 检查 + ignoreIllegals），
 * hljs 未加载或不认识语言时回落为转义后的纯文本（此时源码只是恢复可见色）。
 */
export function renderOverlayHtml(srcCode: Element): string {
  const text = srcCode.textContent ?? ''
  const lang = pickHighlightLanguage(srcCode.className)
  if (lang !== 'plaintext') {
    try {
      const { value } = window.hljs.highlight(text, { language: lang, ignoreIllegals: true })
      return `<code class="hljs language-${lang}">${value}</code>`
    } catch {
      // 极端语法下 hljs 仍可能抛错，回落纯文本
    }
  }
  return `<code class="hljs">${escapeHtml(text)}</code>`
}

/**
 * 把宿主内所有展开态代码块的 overlay 对齐到当前 DOM：
 * 清理不再展开的孤儿，为展开的挂载/更新副本。
 * 幂等：内容未变（签名相同）时不触碰 DOM，因此由自身改动触发的
 * MutationObserver 回调第二轮即收敛，不会振荡。
 */
export function syncOverlays(host: HTMLElement): void {
  host.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((el) => {
    const node = el.closest('.vditor-ir__node')
    if (!node?.classList.contains('vditor-ir__node--expand')) el.remove()
  })
  host.querySelectorAll(".vditor-ir__node--expand[data-type='code-block']").forEach((node) => {
    const srcCode = node.querySelector(':scope > .vditor-ir__marker--pre > code')
    if (!srcCode) return
    // overlay 挂在源码 pre 内部（code 的兄弟）：absolute 相对 pre（position:relative）定位，
    // inset:0 即重合 pre 的 padding box；Lute 实测序列化忽略 pre 内的 div、Spin 会剥离重挂
    const existing = srcCode.parentElement!.querySelector<HTMLDivElement>(
      `:scope > .${OVERLAY_CLASS}`
    )
    const text = srcCode.textContent ?? ''
    if (existing) {
      // 签名取 textContent：内容未变则跳过（幂等，避免无关 mutation 触发高亮重算与重写振荡）
      if (highlightedSig.get(srcCode) !== text) {
        highlightedSig.set(srcCode, text)
        existing.innerHTML = renderOverlayHtml(srcCode)
      }
      return
    }
    // 无副本则挂载：不依赖签名缓存——折叠→再展开时源码元素可能未重建（仅 class 切换），
    // 缓存仍在但副本已被折叠清理，必须无条件重建
    const overlay = document.createElement('div')
    overlay.className = OVERLAY_CLASS
    overlay.setAttribute('aria-hidden', 'true') // 视觉层，屏幕阅读器读源码 code 的真实文本
    overlay.innerHTML = renderOverlayHtml(srcCode)
    highlightedSig.set(srcCode, text)
    srcCode.insertAdjacentElement('afterend', overlay)
  })
}

/**
 * 在 Editor 宿主上启用就地高亮，返回卸载函数。
 * 挂宿主而非 ir.element：vditor init 异步，init 期间的 DOM 变化同样被
 * subtree 监听兜住；Spin 替换块、expandMarker 切换 --expand、撤销恢复
 * 都会触发一次幂等同步。
 */
export function setupCodeBlockHighlight(vd: Vditor): () => void {
  const host = vd.vditor.element
  // 除 childList（Spin 整块替换）外也监听 characterData：个别输入路径（如直接文本节点
  // 变更、未触发整块重整的局部编辑）只会产生文本突变，漏掉会导致 overlay 内容陈旧（错码）。
  const observer = new MutationObserver(() => syncOverlays(host))
  observer.observe(host, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    characterData: true
  })
  syncOverlays(host)
  return () => observer.disconnect()
}
