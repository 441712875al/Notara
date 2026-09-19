import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
}

export interface ConfirmRequest {
  title: string
  text: string
  confirmText: string
  cancelText?: string
  danger?: boolean
  /** 第三态「不保存」：存在时 ConfirmModal 渲染三按钮（discard 在最左） */
  discard?: { text: string; onDiscard: () => void }
  onConfirm: () => void
  onCancel?: () => void
}

/** 名称输入弹窗（新建/重命名共用） */
export interface NamePromptRequest {
  title: string
  /** 打开时的预填值（新建为空串，重命名为当前名） */
  initial: string
  placeholder: string
  onSubmit: (name: string) => void
}

interface UiState {
  toasts: Toast[]
  notify: (text: string) => void
  dismissToast: (id: number) => void
  confirm: ConfirmRequest | null
  askConfirm: (req: ConfirmRequest) => void
  resolveConfirm: (ok: boolean) => void
  resolveDiscard: () => void
  sidebarVisible: boolean
  toggleSidebar: () => void
  outlineVisible: boolean
  toggleOutline: () => void
  namePrompt: NamePromptRequest | null
  openNamePrompt: (p: NamePromptRequest) => void
  closeNamePrompt: () => void
}

let toastId = 1

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  notify(text) {
    const id = toastId++
    set((st) => ({ toasts: [...st.toasts, { id, text }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast(id) {
    set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }))
  },
  confirm: null,
  askConfirm(req) {
    set({ confirm: req })
  },
  resolveConfirm(ok) {
    const c = get().confirm
    set({ confirm: null })
    if (!c) return
    if (ok) c.onConfirm()
    else c.onCancel?.()
  },
  resolveDiscard() {
    const c = get().confirm
    set({ confirm: null })
    c?.discard?.onDiscard()
  },
  sidebarVisible: true,
  toggleSidebar() {
    set((st) => ({ sidebarVisible: !st.sidebarVisible }))
  },
  outlineVisible: true,
  toggleOutline() {
    set((st) => ({ outlineVisible: !st.outlineVisible }))
  },
  namePrompt: null,
  openNamePrompt(p) {
    set({ namePrompt: p })
  },
  closeNamePrompt() {
    set({ namePrompt: null })
  }
}))
