import { create } from 'zustand'
import { s } from '../strings'

export interface TabMeta {
  id: number
  path: string | null
  title: string
  dirty: boolean
  deleted: boolean
  initialContent: string
}

interface TabsState {
  tabs: TabMeta[]
  activeIndex: number
  openFile: (path: string, content: string) => void
  openUntitled: () => void
  close: (index: number) => void
  setActive: (index: number) => void
  setDirty: (id: number, dirty: boolean) => void
  setSaved: (id: number, path: string | null) => void
  markDeleted: (path: string) => void
  renamePath: (oldPath: string, newPath: string) => void
}

let nextId = 1

export function titleOf(path: string | null): string {
  if (!path) return s.tab.untitled
  const base = path.split('/').pop() ?? path
  return base.replace(/\.(md|markdown)$/i, '')
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeIndex: -1,

  openFile(path, content) {
    const i = get().tabs.findIndex((t) => t.path === path)
    if (i >= 0) {
      set({ activeIndex: i })
      return
    }
    const tab: TabMeta = {
      id: nextId++,
      path,
      title: titleOf(path),
      dirty: false,
      deleted: false,
      initialContent: content
    }
    set((st) => ({ tabs: [...st.tabs, tab], activeIndex: st.tabs.length }))
  },

  openUntitled() {
    const tab: TabMeta = {
      id: nextId++,
      path: null,
      title: s.tab.untitled,
      dirty: true, // 未保存过，视为脏
      deleted: false,
      initialContent: ''
    }
    set((st) => ({ tabs: [...st.tabs, tab], activeIndex: st.tabs.length }))
  },

  close(index) {
    set((st) => {
      const tabs = st.tabs.filter((_, i) => i !== index)
      let activeIndex = st.activeIndex
      // 关闭位于当前激活项之前的标签：激活项左移一位（须先左移再回退，否则末尾回退会二次扣减）
      if (index < activeIndex) activeIndex -= 1
      // 关闭的正是末尾激活项（或其后无标签）：回退到新的末尾
      if (activeIndex >= tabs.length) activeIndex = tabs.length - 1
      return { tabs, activeIndex }
    })
  },

  setActive(index) {
    set({ activeIndex: index })
  },

  setDirty(id, dirty) {
    set((st) => ({
      tabs: st.tabs.map((t) => (t.id === id ? { ...t, dirty } : t))
    }))
  },

  setSaved(id, path) {
    set((st) => ({
      tabs: st.tabs.map((t) =>
        t.id === id ? { ...t, dirty: false, deleted: false, path, title: titleOf(path) } : t
      )
    }))
  },

  markDeleted(path) {
    set((st) => ({
      tabs: st.tabs.map((t) => (t.path === path ? { ...t, deleted: true } : t))
    }))
  },

  renamePath(oldPath, newPath) {
    set((st) => ({
      tabs: st.tabs.map((t) =>
        t.path === oldPath
          ? { ...t, path: newPath, title: titleOf(newPath), deleted: false }
          : t
      )
    }))
  }
}))

// 便捷选择器
export const activeTab = (st: TabsState): TabMeta | null => st.tabs[st.activeIndex] ?? null
