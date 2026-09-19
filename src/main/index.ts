import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerAllIpc } from './ipc'
import { installMenu } from './menu'
import { stopAll } from './services/watchService'

// 启动参数：--open <path> 或环境变量 NOTARA_OPEN（E2E 使用）
let launchOpen: string | null = null
{
  const i = process.argv.indexOf('--open')
  if (i >= 0 && process.argv[i + 1]) launchOpen = process.argv[i + 1]
  else if (process.env['NOTARA_OPEN']) launchOpen = process.env['NOTARA_OPEN']
}
export function consumeLaunchOpen(): string | null {
  const v = launchOpen
  launchOpen = null
  return v
}

app.whenReady().then(() => {
  registerAllIpc()
  void installMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 退出前关闭所有 fs watcher，避免残留句柄
app.on('will-quit', () => stopAll())
