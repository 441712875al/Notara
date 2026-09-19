import { create } from 'zustand'

// Task 8 将完整化（文件树、最近工作区、IPC 接线）；本任务仅提供 menuActions 所需的最小形态
interface WorkspaceState {
  root: string | null
  open: (root: string) => Promise<void>
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  root: null,
  async open(root) {
    set({ root })
  }
}))
