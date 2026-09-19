import { create } from 'zustand'
import { api } from '../lib/api'
import { parseIpcError } from '../lib/ipcError'
import { useUi } from './ui'
import { s } from '../strings'
import type { TreeNode } from '@shared/types'

interface WorkspaceState {
  root: string | null
  /** 已展开目录 → 其子节点缓存 */
  children: Map<string, TreeNode[]>
  loading: Map<string, boolean>
  open: (root: string) => Promise<void>
  loadChildren: (dir: string) => Promise<void>
  refresh: (dir: string) => Promise<void>
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  root: null,
  children: new Map(),
  loading: new Map(),

  async open(root) {
    set({ root, children: new Map(), loading: new Map() })
    try {
      await api.openWorkspace(root)
      await get().loadChildren(root)
    } catch (e) {
      // 打开失败：回滚为无工作区，避免留下半初始化状态
      set({ root: null, children: new Map(), loading: new Map() })
      useUi.getState().notify(s.toast.openFailed(parseIpcError(e).message))
    }
  },

  async loadChildren(dir) {
    if (get().children.has(dir)) return
    set((st) => {
      const loading = new Map(st.loading)
      loading.set(dir, true)
      return { loading }
    })
    try {
      const nodes = await api.listChildren(dir)
      set((st) => {
        const children = new Map(st.children)
        children.set(dir, nodes)
        return { children }
      })
    } catch {
      // 静默失败：目录可能被外部删除，不缓存，watcher 会再发 tree-changed
    } finally {
      set((st) => {
        const loading = new Map(st.loading)
        loading.delete(dir)
        return { loading }
      })
    }
  },

  async refresh(dir) {
    const nodes = await api.listChildren(dir)
    set((st) => {
      const children = new Map(st.children)
      children.set(dir, nodes)
      return { children }
    })
  }
}))
