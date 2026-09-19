import { dialog, BrowserWindow } from 'electron'
import { registerIpc, Channels } from './index'
import { consumeLaunchOpen } from '../index'
import { installMenu } from '../menu'
import { themeService } from '../services/themeService'
import type { OpenDialogResult, ThemeSetting } from '@shared/types'

export function registerAppIpc(): void {
  registerIpc(Channels.DialogOpen, async (): Promise<OpenDialogResult> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options = {
      properties: ['openFile', 'openDirectory'] as Array<'openFile' | 'openDirectory'>,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const p = r.filePaths[0]
    if (!p) return null
    return { type: (await import('node:fs')).statSync(p).isDirectory() ? 'folder' : 'file', path: p }
  })

  // 启动参数：一次性消费（读取后清空，避免窗口重载/新建窗口重复打开）
  registerIpc(Channels.AppGetLaunchOpen, async () => consumeLaunchOpen())

  // 主题：读取与切换；切换后重建菜单以同步 radio 勾选与自定义主题列表
  registerIpc(Channels.ThemeGet, async () => themeService.getThemeInfo())
  registerIpc(Channels.ThemeSet, async (p: { setting: ThemeSetting }) => {
    const info = await themeService.setThemeSetting(p.setting)
    void installMenu()
    return info
  })
}
