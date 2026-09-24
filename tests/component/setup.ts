import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom 未实现 PointerEvent：拖动分界线要靠 clientX/pointerId，用 MouseEvent 顶上
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}

// jsdom 未实现指针捕获（拖动要它把 pointermove 黏在命中元素上），补三个空实现
for (const m of ['setPointerCapture', 'releasePointerCapture'] as const) {
  Element.prototype[m] ??= () => {}
}
Element.prototype.hasPointerCapture ??= () => false

// 未启用 vitest globals 时 RTL 不会自动注册清理，需显式挂载 afterEach
afterEach(() => {
  cleanup()
})
