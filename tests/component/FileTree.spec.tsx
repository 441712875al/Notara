import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileTree } from '../../src/renderer/src/components/FileTree'
import type { TreeNode } from '../../src/shared/types'

const nodes: TreeNode[] = [
  { name: 'docs', path: '/w/docs', isDir: true },
  { name: 'a.md', path: '/w/a.md', isDir: false }
]
const childNodes: TreeNode[] = [{ name: 'note.md', path: '/w/docs/note.md', isDir: false }]

describe('FileTree', () => {
  it('渲染目录与文件；未展开时不渲染子级', () => {
    render(
      <FileTree
        nodes={nodes}
        children={new Map([['/w/docs', childNodes]])}
        expanded={new Set()}
        onToggle={() => {}}
        onOpenFile={() => {}}
        onContext={() => {}}
      />
    )
    expect(screen.getByTestId('tree-node-/w/docs')).toBeInTheDocument()
    expect(screen.getByTestId('tree-node-/w/a.md')).toBeInTheDocument()
    expect(screen.queryByTestId('tree-node-/w/docs/note.md')).not.toBeInTheDocument()
  })

  it('展开目录显示子级，点击目录切换、点击文件打开', () => {
    const onToggle = vi.fn()
    const onOpenFile = vi.fn()
    render(
      <FileTree
        nodes={nodes}
        children={new Map([['/w/docs', childNodes]])}
        expanded={new Set(['/w/docs'])}
        onToggle={onToggle}
        onOpenFile={onOpenFile}
        onContext={() => {}}
      />
    )
    expect(screen.getByTestId('tree-node-/w/docs/note.md')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tree-node-/w/docs'))
    expect(onToggle).toHaveBeenCalledWith('/w/docs')
    fireEvent.click(screen.getByTestId('tree-node-/w/a.md'))
    expect(onOpenFile).toHaveBeenCalledWith('/w/a.md')
  })

  it('右键触发 onContext', () => {
    const onContext = vi.fn()
    render(
      <FileTree
        nodes={nodes}
        children={new Map()}
        expanded={new Set()}
        onToggle={() => {}}
        onOpenFile={() => {}}
        onContext={onContext}
      />
    )
    fireEvent.contextMenu(screen.getByTestId('tree-node-/w/a.md'))
    expect(onContext).toHaveBeenCalledWith(expect.anything(), nodes[1])
  })
})
