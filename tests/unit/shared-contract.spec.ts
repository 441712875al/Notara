import { describe, expect, it } from 'vitest'
import type { IpcResult, MainEvent, NotaraApi } from '@shared/types'
import { ErrorCodes, NotaraError } from '@shared/errors'

describe('IPC 契约', () => {
  it('IpcResult 错误分支携带 code 与 message', () => {
    const r: IpcResult<never> = { ok: false, error: { code: ErrorCodes.NotFound, message: 'x' } }
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('not-found')
  })

  it('NotaraApi 类型可被结构化引用（编译期自检）', () => {
    const probes: Array<keyof NotaraApi> = [
      'openDialog', 'readFile', 'writeFile', 'createEntry', 'renameEntry', 'deleteEntry',
      'saveFileAs', 'openWorkspace', 'listChildren', 'saveImage', 'exportHtml', 'exportPdf',
      'listRecent', 'getTheme', 'setTheme', 'flushDone', 'allowClose',
      'getWindowState', 'saveWindowState', 'onEvent', 'getLaunchOpen'
    ]
    expect(probes.length).toBe(21)
  })

  it('MainEvent 判别联合可穷尽 switch', () => {
    const e: MainEvent = { type: 'file:renamed', oldPath: 'a', newPath: 'b' }
    const kinds: string[] = []
    switch (e.type) {
      case 'workspace:tree-changed':
      case 'file:external-change':
      case 'file:external-delete':
      case 'file:renamed':
      case 'app:flush-before-quit':
      case 'app:close-requested':
      case 'theme:system-changed':
      case 'menu:action':
        kinds.push(e.type)
    }
    expect(kinds).toEqual(['file:renamed'])
  })

  it('NotaraError 携带错误码', () => {
    expect(new NotaraError(ErrorCodes.Cancelled, '用户取消').code).toBe('cancelled')
  })
})
