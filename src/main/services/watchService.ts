import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { MainEvent } from '@shared/types'
import { knownMtime, trackOpen } from './fileService'

type Notifier = (e: MainEvent) => void

const watchers = new Map<string, { w: FSWatcher; recursive: boolean }>()
let notify: Notifier = () => {}

// 自写抑制：writeFileAtomic 完成后立即更新 fileService 的 knownMtime，
// watcher 事件（防抖后）比对一致则视为自写，跳过 external-change
const TREE_DEBOUNCE = 300
const FILE_DEBOUNCE = 250

export function setNotifier(fn: Notifier): void {
  notify = fn
}

interface PendingEvent {
  treeTimer?: ReturnType<typeof setTimeout>
  fileTimers: Map<string, ReturnType<typeof setTimeout>>
}

const pending = new Map<string, PendingEvent>()

function getPending(dir: string): PendingEvent {
  let p = pending.get(dir)
  if (!p) {
    p = { fileTimers: new Map() }
    pending.set(dir, p)
  }
  return p
}

function handleDirEvent(dir: string, recursive: boolean, changedPath: string): void {
  const p = getPending(dir)
  // 1) tree 变更统一防抖
  if (!p.treeTimer) {
    p.treeTimer = setTimeout(() => {
      p.treeTimer = undefined
      notify({ type: 'workspace:tree-changed', root: dir })
    }, TREE_DEBOUNCE)
  }
  // 2) 对已跟踪（打开中）的文件判断外部修改/删除
  const t = p.fileTimers.get(changedPath)
  if (t) clearTimeout(t)
  p.fileTimers.set(
    changedPath,
    setTimeout(async () => {
      p.fileTimers.delete(changedPath)
      try {
        const mtime = (await stat(changedPath)).mtimeMs
        const known = knownMtime(changedPath)
        if (known !== undefined && mtime !== known) {
          trackOpen(changedPath, mtime) // 更新已知值，避免重复提示
          notify({ type: 'file:external-change', path: changedPath, mtime })
        }
      } catch {
        notify({ type: 'file:external-delete', path: changedPath })
      }
    }, FILE_DEBOUNCE)
  )
}

export function watchRoot(dir: string): void {
  if (watchers.has(dir)) return
  const w = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    handleDirEvent(dir, true, joinPath(dir, String(filename)))
  })
  w.on('error', () => unwatchRoot(dir))
  watchers.set(dir, { w, recursive: true })
}

export function ensureDirWatched(dir: string): void {
  if (watchers.has(dir)) return
  const w = watch(dir, { persistent: false }, (_event, filename) => {
    if (!filename) return
    handleDirEvent(dir, false, joinPath(dir, String(filename)))
  })
  w.on('error', () => unwatchRoot(dir))
  watchers.set(dir, { w, recursive: false })
}

export function unwatchRoot(dir: string): void {
  const e = watchers.get(dir)
  if (!e) return
  e.w.close()
  watchers.delete(dir)
  pending.delete(dir)
}

export function stopAll(): void {
  for (const dir of [...watchers.keys()]) unwatchRoot(dir)
}

function joinPath(dir: string, rel: string): string {
  // fs.watch 回调的 filename 依平台可能带平台分隔符
  const parts = rel.split(/[/\\]/)
  return [dir, ...parts].join('/')
}
