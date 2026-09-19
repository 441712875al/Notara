import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResult, MainEvent, NotaraApi } from '../shared/types'

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>
  if (!r.ok) {
    // contextBridge 不能跨桥传递 Error 子类属性，重建为普通错误对象
    throw Object.assign(new Error(r.error.message), { code: r.error.code })
  }
  return r.value
}

const EVENT_CHANNEL = 'main:event'

const api: NotaraApi = {
  openDialog: () => invoke('dialog:open'),
  getLaunchOpen: () => invoke('app:get-launch-open'),
  readFile: (path) => invoke('files:read', { path }),
  writeFile: (path, content) => invoke('files:write', { path, content }),
  createEntry: (dir, name, kind) => invoke('files:create', { dir, name, kind }),
  renameEntry: (oldPath, newPath) => invoke('files:rename', { oldPath, newPath }),
  deleteEntry: (path) => invoke('files:delete', { path }),
  saveFileAs: (suggestedName, content) => invoke('files:save-as', { suggestedName, content }),
  openWorkspace: (root) => invoke('workspace:open', { root }),
  listChildren: (dir) => invoke('workspace:children', { dir }),
  saveImage: (refDir, data, originalName, ext) =>
    invoke('images:save', { refDir, data, originalName, ext }),
  exportHtml: (sourcePath, html) => invoke('export:html', { sourcePath, html }),
  exportPdf: (sourcePath, html) => invoke('export:pdf', { sourcePath, html }),
  listRecent: () => invoke('recent:list'),
  getTheme: () => invoke('theme:get'),
  setTheme: (setting) => invoke('theme:set', { setting }),
  flushDone: () => invoke('app:flush-done'),
  allowClose: () => invoke('app:allow-close'),
  quitPending: () => invoke('app:quit-pending'),
  quitCancel: () => invoke('app:quit-cancel'),
  getWindowState: () => invoke('app:get-window-state'),
  saveWindowState: (state) => invoke('app:save-window-state', { state }),
  onEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, event: MainEvent): void => cb(event)
    ipcRenderer.on(EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  }
}

contextBridge.exposeInMainWorld('notara', api)
