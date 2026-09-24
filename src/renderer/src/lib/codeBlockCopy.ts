/**
 * 代码块复制按钮（CSP 兼容接管）。
 *
 * vditor 给渲染态代码块（pre.vditor-ir__preview）挂的复制按钮用内联 onclick 触发
 * `textarea.select() + document.execCommand('copy')`。但 index.html 的 CSP 是
 * script-src 'self'（不含 'unsafe-inline'），内联事件处理器被浏览器拒绝执行
 * （控制台报 Refused to execute inline event handler），按钮点了没反应。
 *
 * 这里用事件委托在捕获阶段接管 .vditor-copy 的点击：读其内部 textarea 的源码文本
 * 写剪贴板，并给出「已复制」反馈；同时接管 hover 复位提示文案（内联 onmouseover 同样被拦）。
 * addEventListener 属外链脚本行为，不受 script-src 'self' 限制。
 */
import type Vditor from 'vditor'

export function setupCodeBlockCopy(vd: Vditor): () => void {
  const host = vd.vditor.element

  const onClick = (e: MouseEvent): void => {
    const copy = (e.target as HTMLElement | null)?.closest?.('.vditor-copy')
    if (!copy) return
    // 抢在 vditor「点击代码块进入编辑」之前拦截，避免点复制把代码块展开
    e.stopPropagation()
    e.preventDefault()
    const textarea = copy.querySelector<HTMLTextAreaElement>('textarea')
    if (textarea) {
      textarea.select()
      document.execCommand('copy')
      textarea.blur()
    }
    copy.querySelector('span')?.setAttribute('aria-label', '已复制')
  }

  const onMouseover = (e: MouseEvent): void => {
    const copy = (e.target as HTMLElement | null)?.closest?.('.vditor-copy')
    if (!copy) return
    copy.querySelector('span')?.setAttribute('aria-label', '复制')
  }

  // 捕获阶段：内联 onclick 若存活是在冒泡阶段触发，此处捕获先到，稳定拦截
  host.addEventListener('click', onClick, true)
  host.addEventListener('mouseover', onMouseover, true)
  return () => {
    host.removeEventListener('click', onClick, true)
    host.removeEventListener('mouseover', onMouseover, true)
  }
}
