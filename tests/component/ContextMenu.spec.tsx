import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ContextMenu } from '../../src/renderer/src/components/ContextMenu'

describe('ContextMenu', () => {
  it('点击菜单项：按真实交互顺序（mousedown→mouseup→click）执行回调并关闭', () => {
    const onClick = vi.fn()
    const onClose = vi.fn()
    // 真实场景：onClose 会让父组件卸载菜单（等价于 App 的 setMenu(null)）
    function Harness() {
      const [open, setOpen] = useState(true)
      if (!open) return null
      return (
        <ContextMenu
          x={10}
          y={10}
          items={[{ label: '新建文件', onClick }]}
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        />
      )
    }
    render(<Harness />)
    const item = screen.getByRole('menuitem')
    fireEvent.mouseDown(item)
    fireEvent.mouseUp(item)
    fireEvent.click(item)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('点击菜单外部关闭，且不误伤项回调', () => {
    const onClick = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu x={0} y={0} items={[{ label: '删除', onClick, danger: true }]} onClose={onClose} />)
    expect(screen.getByRole('menuitem')).toHaveClass('danger')
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })
})
