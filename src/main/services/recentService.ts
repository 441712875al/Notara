import { promises as fs } from 'node:fs'
import { app } from 'electron'
import * as path from 'node:path'
import type { RecentWorkspace } from '@shared/types'

function file(): string {
  return path.join(app.getPath('userData'), 'recent.json')
}

export async function listRecent(): Promise<RecentWorkspace[]> {
  try {
    const raw = JSON.parse(await fs.readFile(file(), 'utf8')) as RecentWorkspace[]
    return [...raw].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 10)
  } catch {
    return []
  }
}

export async function touchRecent(root: string): Promise<void> {
  const list = await listRecent().then((l) => l.filter((r) => r.root !== root))
  list.push({ root, lastOpenedAt: Date.now() })
  const top = list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 10)
  await fs.mkdir(path.dirname(file()), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(top, null, 2), 'utf8')
}

export async function removeRecent(root: string): Promise<void> {
  const list = (await listRecent()).filter((r) => r.root !== root)
  await fs.writeFile(file(), JSON.stringify(list, null, 2), 'utf8')
}
