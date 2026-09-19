import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { IpcResult, MainEvent, NotaraErrorShape } from '@shared/types'
import { NotaraError } from '@shared/errors'

type Handler = (payload: any, event: IpcMainInvokeEvent) => Promise<unknown>

// 所有已注册通道集中声明（防止字符串散落）
export const Channels = {
  DialogOpen: 'dialog:open',
  FilesRead: 'files:read',
  FilesWrite: 'files:write',
  FilesCreate: 'files:create',
  FilesRename: 'files:rename',
  FilesDelete: 'files:delete',
  FilesSaveAs: 'files:save-as',
  WorkspaceOpen: 'workspace:open',
  WorkspaceChildren: 'workspace:children',
  ImagesSave: 'images:save',
  ExportHtml: 'export:html',
  ExportPdf: 'export:pdf',
  RecentList: 'recent:list',
  ThemeGet: 'theme:get',
  ThemeSet: 'theme:set',
  AppFlushDone: 'app:flush-done',
  AppAllowClose: 'app:allow-close',
  AppGetLaunchOpen: 'app:get-launch-open',
  AppGetWindowState: 'app:get-window-state',
  AppSaveWindowState: 'app:save-window-state'
} as const

export function registerIpc(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (event, payload): Promise<IpcResult<unknown>> => {
    try {
      return { ok: true, value: await handler(payload, event) }
    } catch (e) {
      const shape: NotaraErrorShape =
        e instanceof NotaraError
          ? { code: e.code, message: e.message }
          : { code: 'unknown', message: e instanceof Error ? e.message : String(e) }
      return { ok: false, error: shape }
    }
  })
}

export function broadcast(event: MainEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('main:event', event)
  }
}

export function registerAllIpc(): void {
  registerAppIpc()
}

// 占位导入放文件末尾避免循环依赖问题
import { registerAppIpc } from './app'
