import { dialog, BrowserWindow } from 'electron'
import { Channels, registerIpc, broadcast } from './index'
import {
  readFileSafe, writeFileAtomic, createEntry, renamePath, deleteToTrash
} from '../services/fileService'
import { ensureDirWatched } from '../services/watchService'
import * as nodePath from 'node:path'

export function registerFilesIpc(): void {
  registerIpc(Channels.FilesRead, async (p: { path: string }) => {
    ensureDirWatched(nodePath.dirname(p.path))
    return readFileSafe(p.path)
  })

  registerIpc(Channels.FilesWrite, async (p: { path: string; content: string }) =>
    writeFileAtomic(p.path, p.content)
  )

  registerIpc(Channels.FilesCreate, async (p: { dir: string; name: string; kind: 'file' | 'directory' }) =>
    createEntry(p.dir, p.name, p.kind)
  )

  registerIpc(Channels.FilesRename, async (p: { oldPath: string; newPath: string }) => {
    const r = await renamePath(p.oldPath, p.newPath)
    broadcast({ type: 'file:renamed', oldPath: p.oldPath, newPath: p.newPath })
    return r
  })

  registerIpc(Channels.FilesDelete, async (p: { path: string }) => deleteToTrash(p.path))

  registerIpc(Channels.FilesSaveAs, async (p: { suggestedName: string; content: string }) => {
    const win = BrowserWindow.getFocusedWindow()
    const options = {
      defaultPath: p.suggestedName,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    }
    const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (r.canceled || !r.filePath) return null
    await writeFileAtomic(r.filePath, p.content)
    return { path: r.filePath }
  })
}
