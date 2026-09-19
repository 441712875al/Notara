import { Channels, registerIpc, broadcast } from './index'
import { listChildren } from '../services/workspaceService'
import { watchRoot } from '../services/watchService'
import { touchRecent, listRecent } from '../services/recentService'
import { ErrorCodes, NotaraError } from '@shared/errors'
import { promises as fs } from 'node:fs'

export function registerWorkspaceIpc(): void {
  registerIpc(Channels.WorkspaceChildren, async (p: { dir: string }) => listChildren(p.dir))

  registerIpc(Channels.RecentList, async () => listRecent())

  registerIpc(Channels.WorkspaceOpen, async (p: { root: string }) => {
    const st = await fs.stat(p.root).catch(() => null)
    if (!st?.isDirectory()) {
      throw new NotaraError(ErrorCodes.NotFound, `工作区不可用: ${p.root}`)
    }
    watchRoot(p.root)
    await touchRecent(p.root)
    broadcast({ type: 'workspace:tree-changed', root: p.root })
  })
}
