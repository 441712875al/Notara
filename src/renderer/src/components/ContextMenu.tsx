import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  // 点击菜单外部或窗口失焦即关闭
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      // 菜单内部的 mousedown 不关闭：否则菜单项还没收到 click 就被卸载，回调丢失
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      onClose()
    }
    const onBlur = (): void => onClose()
    // Escape 关闭菜单
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }} role="menu">
      {items.map((it) => (
        <button
          key={it.label}
          className={`context-menu-item ${it.danger ? 'danger' : ''}`}
          role="menuitem"
          onClick={() => {
            it.onClick()
            onClose()
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
