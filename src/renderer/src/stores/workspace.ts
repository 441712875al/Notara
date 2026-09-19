import { create } from 'zustand'
import { api } from '../lib/api'
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
    await api.openWorkspace(root)
    await get().loadChildren(root)
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
