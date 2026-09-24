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

/** 侧栏宽度下限：窄于此则判为「要收起」，而不是挤成一条读不了的缝 */
export const SIDEBAR_MIN = 160
/** 侧栏宽度上限 */
export const SIDEBAR_MAX = 520
/** 侧栏默认宽度 */
export const SIDEBAR_DEFAULT = 220
/** 侧栏再宽也要给正文留出的最小宽度（窄窗口里限制拖动上限） */
const CONTENT_MIN = 360

/** 当前窗口换算出的侧栏上限：窗口越窄上限越低，免得侧栏把正文挤没 */
function sidebarMaxWidth(): number {
  // 无 window 的环境（单测的 node 环境）取最大上限
  const viewport = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, viewport - CONTENT_MIN))
}

/**
 * 归一化侧栏宽度：小于下限一律折成 0（收起），否则夹进 [下限, 上限]。
 * 「拖到最窄之外即收起」由这里统一决定，拖动、键盘、恢复都共用同一条规则。
 */
export function clampSidebarWidth(w: number): number {
  if (!Number.isFinite(w) || w < SIDEBAR_MIN) return 0
  return Math.min(Math.round(w), sidebarMaxWidth())
}

interface UiState {
  toasts: Toast[]
  notify: (text: string) => void
  dismissToast: (id: number) => void
  confirm: ConfirmRequest | null
  askConfirm: (req: ConfirmRequest) => void
  resolveConfirm: (ok: boolean) => void
  resolveDiscard: () => void
  /** 侧栏宽度（px）；0 = 已收起。侧栏常驻挂载，收起与否只改宽度，文件树的展开态因此不会丢 */
  sidebarWidth: number
  /** 收起前的宽度，供 toggleSidebar 再次展开时还原 */
  sidebarRestoreWidth: number
  setSidebarWidth: (w: number) => void
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
    // 单槽位：新请求顶替旧请求。旧请求未获用户裁决即被顶替，按「取消」收尾，
    // 否则其 onCancel 闭包会随引用覆盖而静默丢失（如退出握手弹窗被红绿灯/⌘W 的
    // 关闭确认顶替后，唯一会调 quitCancel 的 abort 闭包消失，60s 后强退丢内容）。
    // 先 set 再回调：onCancel 内若同步读 state 应拿到新值而非被顶替的旧值。
    const prev = get().confirm
    set({ confirm: req })
    prev?.onCancel?.() // 无 onCancel 的旧请求为无操作；有 onCancel 的（如外部冲突弹窗
    // 的二次确认链）会在新槽位上再弹一次，链深有界（≤2），无无限递归
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
  sidebarWidth: SIDEBAR_DEFAULT,
  sidebarRestoreWidth: SIDEBAR_DEFAULT,
  setSidebarWidth(w) {
    const width = clampSidebarWidth(w)
    // 只在展开态更新记忆宽度：收起（0）不该把自己的记忆抹掉，否则 ⌘\ 展不回来
    set((st) => ({
      sidebarWidth: width,
      sidebarRestoreWidth: width > 0 ? width : st.sidebarRestoreWidth
    }))
  },
  toggleSidebar() {
    set((st) => ({
      sidebarWidth: st.sidebarWidth > 0 ? 0 : clampSidebarWidth(st.sidebarRestoreWidth)
    }))
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
