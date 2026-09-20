import { Menu, app, BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { createWindow } from './window'
import { themeService } from './services/themeService'

function sendFocused(action: string): void {
  const win = BrowserWindow.getFocusedWindow()
  win?.webContents.send('main:event', { type: 'menu:action', action })
}

export async function installMenu(): Promise<void> {
  const isDev = !app.isPackaged

  // 主题子菜单：每次重建时读取当前设置（radio 勾选）与自定义主题列表
  const themeInfo = await themeService.getThemeInfo()
  const radio = (label: string, value: string): MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: themeInfo.setting === value,
    click: () => sendFocused(`set-theme:${value}`)
  })
  const themeItems: MenuItemConstructorOptions[] = [
    radio('跟随系统', 'system'),
    radio('亮色', 'light'),
    radio('暗色', 'dark')
  ]
  if (themeInfo.customThemes.length > 0) {
    themeItems.push({ type: 'separator' })
    for (const t of themeInfo.customThemes) themeItems.push(radio(t.name, t.name))
  }
  themeItems.push(
    { type: 'separator' },
    { label: '导入 Typora 主题…', click: () => sendFocused('import-typora-theme') }
  )

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
        { label: '主题', submenu: themeItems },
        ...(isDev ? [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }] : [])
      ]
    },
    { role: 'windowMenu', label: '窗口' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
