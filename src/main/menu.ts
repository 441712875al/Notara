import { Menu, app, BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { createWindow } from './window'

function sendFocused(action: string): void {
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('main:event', { type: 'menu:action', action })
}

export function installMenu(): void {
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '文件',
      submenu: [
        { label: '新建文件', accelerator: 'CmdOrCtrl+N', click: () => sendFocused('new-file') },
        { label: '新建窗口', accelerator: 'CmdOrCtrl+Shift+N', click: () => void createWindow() },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendFocused('open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendFocused('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendFocused('save-as') },
        { type: 'separator' },
        { label: '导出 PDF', accelerator: 'CmdOrCtrl+E', click: () => sendFocused('export-pdf') },
        { label: '导出 HTML', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendFocused('export-html') },
        { type: 'separator' },
        { label: '关闭标签', accelerator: 'CmdOrCtrl+W', click: () => sendFocused('close-tab') },
        { role: 'close' }
      ]
    },
    { role: 'editMenu', label: '编辑' },
    {
      label: '格式',
      submenu: [
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: () => sendFocused('format-bold') },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: () => sendFocused('format-italic') },
        { label: '行内代码', accelerator: 'CmdOrCtrl+Shift+K', click: () => sendFocused('format-code') },
        { label: '链接', accelerator: 'CmdOrCtrl+K', click: () => sendFocused('format-link') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧边栏', accelerator: 'CmdOrCtrl+\\', click: () => sendFocused('toggle-sidebar') },
        { label: '切换大纲', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendFocused('toggle-outline') },
        ...(isDev ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }] : [])
      ]
    },
    { role: 'windowMenu', label: '窗口' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
