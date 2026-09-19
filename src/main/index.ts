import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerAllIpc } from './ipc'

app.whenReady().then(() => {
  registerAllIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
