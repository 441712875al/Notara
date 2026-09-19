import { useState, type MouseEvent } from 'react'
import { FileTree } from './FileTree'
import { useWorkspace } from '../stores/workspace'
import type { TreeNode } from '@shared/types'

interface SidebarProps {
  onOpenFile: (path: string) => void
  onContext: (e: MouseEvent, node: TreeNode) => void
}

export function Sidebar({ onOpenFile, onContext }: SidebarProps) {
  const root = useWorkspace((st) => st.root)
  const children = useWorkspace((st) => st.children)
  const loadChildren = useWorkspace((st) => st.loadChildren)
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
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-title">{root.split('/').pop()}</div>
      <FileTree
        nodes={children.get(root) ?? []}
        children={children}
        expanded={expanded}
        onToggle={toggle}
        onOpenFile={onOpenFile}
        onContext={onContext}
      />
    </aside>
  )
}
