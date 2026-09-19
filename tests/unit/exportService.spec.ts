import { describe, expect, it, vi } from 'vitest'

// electron 在 node 测试环境下不可加载：exportService 顶层 import { BrowserWindow, Notification, shell }，
// 必须先整体 stub 掉，否则 import 即崩（纯函数测试不会触碰这些 stub 的行为）
vi.mock('electron', () => ({
  BrowserWindow: class {
    loadFile(): Promise<void> {
      return Promise.resolve()
    }
    destroy(): void {}
  },
  Notification: class {
    on(): void {}
    show(): void {}
  },
  shell: { showItemInFolder: vi.fn() }
}))

import {
  buildHtmlDocument,
  replaceTargetExt,
  notificationBody
} from '../../src/main/services/exportService'

describe('buildHtmlDocument', () => {
  it('完整文档：charset/title 转义/CSS 内联/正文', () => {
    const doc = buildHtmlDocument('笔记<1>', '<h1>hi</h1>', 'p{color:red}')
    expect(doc).toContain('<!DOCTYPE html>')
    expect(doc).toContain('<meta charset="utf-8">')
    expect(doc).toContain('<title>笔记&lt;1&gt;</title>')
    expect(doc).toContain('<style>')
    expect(doc).toContain('p{color:red}')
    expect(doc).toContain('<h1>hi</h1>')
    expect(doc).toContain('lang="zh-CN"')
  })

  it('带 baseHref 时注入 <base>（PDF 临时文件下相对图片仍能解析）', () => {
    const doc = buildHtmlDocument('t', '<p>x</p>', 'p{}', 'file:///w/docs/')
    expect(doc).toContain('<base href="file:///w/docs/">')
  })

  it('不带 baseHref 时不注入 <base>', () => {
    expect(buildHtmlDocument('t', '<p>x</p>', 'p{}')).not.toContain('<base')
  })
})

describe('replaceTargetExt', () => {
  it('.md → .html/.pdf，保留路径', () => {
    expect(replaceTargetExt('/w/a.md', 'html')).toBe('/w/a.html')
    expect(replaceTargetExt('/w/b.markdown', 'pdf')).toBe('/w/b.pdf')
  })
  it('无扩展名时追加', () => {
    expect(replaceTargetExt('/w/untitled', 'html')).toBe('/w/untitled.html')
  })
})

describe('notificationBody', () => {
  it('返回导出文件路径', () => {
    expect(notificationBody('/w/a.pdf')).toBe('/w/a.pdf')
  })
})
