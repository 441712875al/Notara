import { dialog, BrowserWindow } from 'electron'
import { registerIpc, Channels } from './index'
import { consumeLaunchOpen } from '../index'
import { installMenu } from '../menu'
import { stateService } from '../window'
import { ackFlushDone, cancelQuit, quitPendingDialog } from '../quit'
import { themeService } from '../services/themeService'
import { typoraImporter } from '../services/typoraImportService'
import type { OpenDialogResult, ThemeSetting, WindowStatePayload } from '@shared/types'

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

  // Typora 主题导入：sourcePath 缺省时主进程弹选择框（取消返回 null）；
  // 成功后重建菜单让新主题出现在主题列表里
  registerIpc(Channels.ThemeImportTypora, async (p: { sourcePath?: string }) => {
    const result = await typoraImporter(p?.sourcePath)
    if (result) void installMenu()
    return result
  })

  // 退出握手：渲染侧 flush 完成后 ack，主进程在收齐（或超时）后退出
  registerIpc(Channels.AppFlushDone, async (_p: unknown, event) => {
    ackFlushDone(event.sender.id)
    return null
  })

  // 退出握手：渲染侧将弹未保存确认框 → 撤销 3s 强退兜底，改 60s 等待用户
  registerIpc(Channels.AppQuitPending, async () => {
    quitPendingDialog()
    return null
  })

  // 退出握手：用户取消退出 → 中止本次退出，应用保持运行
  registerIpc(Channels.AppQuitCancel, async () => {
    cancelQuit()
    return null
  })

  // 关闭握手：渲染侧确认完毕，置放行标记并销毁该窗口（destroy 不触发 close，避免再次拦截）
  registerIpc(Channels.AppAllowClose, async (_p: unknown, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      ;(win as BrowserWindow & { __allowedClose?: boolean }).__allowedClose = true
      win.destroy()
    }
    return null
  })

  // 窗口状态读写（保存取发起窗口的 bounds，多窗口下各存各的）
  registerIpc(Channels.AppGetWindowState, async () => stateService.load())
  registerIpc(Channels.AppSaveWindowState, async (p: { state: WindowStatePayload }, event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    if (win && !win.isDestroyed()) await stateService.save(win.getBounds(), p.state)
    return null
  })
}
