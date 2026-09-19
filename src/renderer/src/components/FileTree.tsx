import type { MouseEvent, ReactNode } from 'react'
import type { TreeNode } from '@shared/types'

interface FileTreeProps {
  nodes: TreeNode[]
  /** 目录绝对路径 → 子节点缓存（来自 workspace store） */
  children: Map<string, TreeNode[]>
  expanded: Set<string>
  onToggle: (dir: string) => void
  onOpenFile: (path: string) => void
  onContext: (e: MouseEvent, node: TreeNode) => void
}

function Chevron({ open }: { open: boolean }): ReactNode {
  return <span className={`chevron ${open ? 'open' : ''}`}>▸</span>
}

export function FileTree({
  nodes,
  children,
  expanded,
  onToggle,
  onOpenFile,
  onContext
}: FileTreeProps) {
  const renderNodes = (list: TreeNode[], depth: number): ReactNode =>
    list.map((n) => (
      <div key={n.path}>
        <div
          data-testid={`tree-node-${n.path}`}
          className={`tree-node ${n.isDir ? 'dir' : 'file'}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => (n.isDir ? onToggle(n.path) : onOpenFile(n.path))}
          onContextMenu={(e) => onContext(e, n)}
        >
          {n.isDir ? <Chevron open={expanded.has(n.path)} /> : <span className="file-icon">📄</span>}
          <span className="tree-node-name">{n.name}</span>
        </div>
        {n.isDir && expanded.has(n.path) && renderNodes(children.get(n.path) ?? [], depth + 1)}
      </div>
    ))

  return <div className="filetree">{renderNodes(nodes, 0)}</div>
}
