import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { FileTree } from './FileTree'
import { useWorkspace } from '../stores/workspace'
import { useUi, SIDEBAR_MAX } from '../stores/ui'
import type { TreeNode } from '@shared/types'
import { s } from '../strings'

interface SidebarProps {
  onOpenFile: (path: string) => void
  onContext: (e: MouseEvent, node: TreeNode) => void
}

/** 拖动位移超过这么多像素才算「拖」，否则算「点」——手抖不该把侧栏收起来 */
const DRAG_THRESHOLD = 3
/** 键盘调节步长 */
const KEY_STEP = 16

export function Sidebar({ onOpenFile, onContext }: SidebarProps) {
  const root = useWorkspace((st) => st.root)
  const children = useWorkspace((st) => st.children)
  const loadChildren = useWorkspace((st) => st.loadChildren)
  const width = useUi((st) => st.sidebarWidth)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (dir: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) {
        next.delete(dir)
      } else {
        next.add(dir)
        void loadChildren(dir)
      }
      return next
    })
  }

  if (!root) return null
  return (
    <>
      {/* 收起态不卸载：宽度归零即可，文件树的展开集合是组件局部 state，卸载会丢 */}
      <aside className="sidebar" data-testid="sidebar" style={{ width }}>
        <div className="sidebar-title">
          <span className="sidebar-title-name" title={root}>
            {root.split('/').pop()}
          </span>
          <button
            className="sidebar-toggle"
            data-testid="sidebar-collapse"
            type="button"
            title={s.sidebar.collapse}
            aria-label={s.sidebar.collapse}
            onClick={() => useUi.getState().toggleSidebar()}
          >
            «
          </button>
        </div>
        <FileTree
          nodes={children.get(root) ?? []}
          children={children}
          expanded={expanded}
          onToggle={toggle}
          onOpenFile={onOpenFile}
          onContext={onContext}
        />
      </aside>
      <SidebarResizer collapsed={width === 0} />
    </>
  )
}

/**
 * 侧栏与正文之间的分界线，兼三职：拖动改宽、双击收起/展开、收起态点击展开。
 * 命中区 5px 而占位仅 1px（左右各 -2px 外边距），视觉上仍是原来那条发丝线。
 */
function SidebarResizer({ collapsed }: { collapsed: boolean }): ReactNode {
  const width = useUi((st) => st.sidebarWidth)
  const drag = useRef<{ startX: number; startWidth: number; moved: boolean } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startWidth: useUi.getState().sidebarWidth, moved: false }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      d.moved = true
      // 拖动期间全局压住光标与选区，指针掠出 5px 命中区也不闪
      document.documentElement.dataset.resizing = 'true'
    }
    useUi.getState().setSidebarWidth(d.startWidth + dx)
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    drag.current = null
    delete document.documentElement.dataset.resizing
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    // 只点击未拖动：收起态点一下展开。展开态不响应单击——拖动落空手一抖就会收起太烦，
    // 收起请走标题栏按钮、双击或 ⌘\
    if (d && !d.moved && collapsed) useUi.getState().toggleSidebar()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (dir === 0) return
    e.preventDefault()
    const st = useUi.getState()
    // 收起态按右键即展开：+16 落在下限之下会被折回 0，故直接还原记忆宽度
    if (st.sidebarWidth === 0) {
      if (dir > 0) st.toggleSidebar()
      return
    }
    // 展开态按左键缩到下限之下即收起
    st.setSidebarWidth(st.sidebarWidth + dir * KEY_STEP)
  }

  return (
    <div
      className="sidebar-resizer"
      data-testid="sidebar-resizer"
      data-collapsed={collapsed || undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={s.sidebar.resize}
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      title={collapsed ? s.sidebar.expand : s.sidebar.resize}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => useUi.getState().toggleSidebar()}
      onKeyDown={onKeyDown}
    >
      {/* 收起态无控件可依，靠这枚悬停才现的箭头指路 */}
      <span className="sidebar-grip" aria-hidden="true">
        »
      </span>
    </div>
  )
}
