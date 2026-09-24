import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Sidebar } from '../../src/renderer/src/components/Sidebar'
import { useUi, SIDEBAR_DEFAULT } from '../../src/renderer/src/stores/ui'
import { useWorkspace } from '../../src/renderer/src/stores/workspace'
import type { TreeNode } from '../../src/shared/types'

const nodes: TreeNode[] = [
  { name: 'docs', path: '/w/docs', isDir: true },
  { name: 'a.md', path: '/w/a.md', isDir: false }
]

/** jsdom 无布局，分界线的拖动按 clientX 位移算，故坐标只需自洽 */
function setup(): HTMLElement {
  const rz = screen.getByTestId('sidebar-resizer')
  fireEvent.pointerDown(rz, { pointerId: 1, clientX: 220 })
  return rz
}

beforeEach(() => {
  useWorkspace.setState({ root: '/w', children: new Map([['/w', nodes]]) })
  useUi.setState({ sidebarWidth: SIDEBAR_DEFAULT, sidebarRestoreWidth: SIDEBAR_DEFAULT })
})

describe('Sidebar 宽度与收起', () => {
  it('标题栏显示工作区名，宽度落到侧栏内联样式上', () => {
    render(<Sidebar onOpenFile={() => {}} onContext={() => {}} />)
    expect(screen.getByText('w')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '220px' })
  })

  it('点标题栏 « 一键收起；再点分界线展开回原宽', () => {
    render(<Sidebar onOpenFile={() => {}} onContext={() => {}} />)
    fireEvent.click(screen.getByTestId('sidebar-collapse'))
    expect(useUi.getState().sidebarWidth).toBe(0)
    // 收起不卸载：侧栏还在，只是宽度归零（文件树的展开态因此得以保留）
    expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '0px' })
    expect(screen.getByTestId('sidebar-resizer')).toHaveAttribute('data-collapsed')

    const rz = screen.getByTestId('sidebar-resizer')
    fireEvent.pointerDown(rz, { pointerId: 1, clientX: 0 })
    fireEvent.pointerUp(rz, { pointerId: 1, clientX: 0 })
    expect(useUi.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT)
  })

  it('拖动分界线按位移改宽，拖到下限以下即收起', () => {
    render(<Sidebar onOpenFile={() => {}} onContext={() => {}} />)
    const rz = setup()
    fireEvent.pointerMove(rz, { pointerId: 1, clientX: 300 })
    expect(useUi.getState().sidebarWidth).toBe(300)
    fireEvent.pointerMove(rz, { pointerId: 1, clientX: 20 }) // 220 - 200
    expect(useUi.getState().sidebarWidth).toBe(0)
    fireEvent.pointerUp(rz, { pointerId: 1, clientX: 20 })
  })

  it('位移不足阈值只当点击：展开态单击不收起（拖动落空不该把侧栏弄没）', () => {
    render(<Sidebar onOpenFile={() => {}} onContext={() => {}} />)
    const rz = setup()
    fireEvent.pointerMove(rz, { pointerId: 1, clientX: 222 })
    expect(useUi.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT)
    fireEvent.pointerUp(rz, { pointerId: 1, clientX: 222 })
    expect(useUi.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT)
  })

  it('双击分界线切换收起/展开', () => {
    render(<Sidebar onOpenFile={() => {}} onContext={() => {}} />)
    fireEvent.doubleClick(screen.getByTestId('sidebar-resizer'))
    expect(useUi.getState().sidebarWidth).toBe(0)
    fireEvent.doubleClick(screen.getByTestId('sidebar-resizer'))
    expect(useUi.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT)
  })

  it('键盘左右键按步长调节宽度，缩到下限之下即收起', () => {
    render(<Sidebar onOpenFile={() => {}} onContext={() => {}} />)
    const rz = screen.getByTestId('sidebar-resizer')
    fireEvent.keyDown(rz, { key: 'ArrowRight' })
    expect(useUi.getState().sidebarWidth).toBe(236)
    fireEvent.keyDown(rz, { key: 'ArrowLeft' })
    expect(useUi.getState().sidebarWidth).toBe(220)
    for (let i = 0; i < 4; i++) fireEvent.keyDown(rz, { key: 'ArrowLeft' })
    expect(useUi.getState().sidebarWidth).toBe(0) // 220 → … → 156 < 下限
  })

  it('收起态按右键展开回记忆宽度', () => {
    render(<Sidebar onOpenFile={() => {}} onContext={() => {}} />)
    fireEvent.click(screen.getByTestId('sidebar-collapse'))
    fireEvent.keyDown(screen.getByTestId('sidebar-resizer'), { key: 'ArrowRight' })
    expect(useUi.getState().sidebarWidth).toBe(SIDEBAR_DEFAULT)
  })
})
