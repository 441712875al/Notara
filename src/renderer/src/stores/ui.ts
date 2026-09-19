import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
}

export interface ConfirmRequest {
  title: string
  text: string
  confirmText: string
  danger?: boolean
  onConfirm: () => void
  onCancel?: () => void
}

interface UiState {
  toasts: Toast[]
  notify: (text: string) => void
  dismissToast: (id: number) => void
  confirm: ConfirmRequest | null
  askConfirm: (req: ConfirmRequest) => void
  resolveConfirm: (ok: boolean) => void
  sidebarVisible: boolean
  toggleSidebar: () => void
  outlineVisible: boolean
  toggleOutline: () => void
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
  sidebarVisible: true,
  toggleSidebar() {
    set((st) => ({ sidebarVisible: !st.sidebarVisible }))
  },
  outlineVisible: true,
  toggleOutline() {
    set((st) => ({ outlineVisible: !st.outlineVisible }))
  }
}))
