import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { createWindowStateService } from './services/windowStateService'

export const stateService = createWindowStateService(() => app.getPath('userData'))

/** 关闭握手期间置位的标记：为 true 时 close 事件放行（由 allowClose IPC 设置） */
type CloseableWindow = BrowserWindow & { __allowedClose?: boolean }

export async function createWindow(): Promise<BrowserWindow> {
  // 恢复上次的窗口位置尺寸（不在可见显示器内时 service 已丢弃 bounds）
  const last = await stateService.load()
  const win = new BrowserWindow({
    width: last?.bounds?.width ?? 1200,
    height: last?.bounds?.height ?? 800,
    x: last?.bounds?.x,
    y: last?.bounds?.y,
    minWidth: 640,
    minHeight: 400,
    show: false,
    titleBarStyle: 'hiddenInset',
    // y=12：红绿灯（12px 高）在 36px 标签栏内垂直居中
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  // 外部链接一律走系统浏览器，禁止应用内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
  // 关闭握手：脏标签确认在渲染侧完成后 allowClose 才真正销毁；非关闭按钮路径（app.exit）不触发 close
  win.on('close', (e) => {
    if (!(win as CloseableWindow).__allowedClose) {
      e.preventDefault()
      win.webContents.send('main:event', { type: 'app:close-requested' })
    }
  })
  win.once('ready-to-show', () => win.show())
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
