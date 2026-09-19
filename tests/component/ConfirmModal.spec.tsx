import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmModal } from '../../src/renderer/src/components/ConfirmModal'
import { useUi } from '../../src/renderer/src/stores/ui'

describe('ConfirmModal', () => {
  beforeEach(() => {
    useUi.setState({ confirm: null })
  })

  it('带 discard：渲染三按钮，discard 在最左且 btn-danger；点击后清空并回调', () => {
    const onDiscard = vi.fn()
    useUi.getState().askConfirm({
      title: '未保存的修改',
      text: '内容',
      confirmText: '保存',
      onConfirm: () => {},
      discard: { text: '不保存', onDiscard }
    })
    render(<ConfirmModal />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toHaveTextContent('不保存')
    expect(buttons[0]).toHaveClass('btn-danger')
    fireEvent.click(buttons[0])
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(useUi.getState().confirm).toBeNull()
  })

  it('带 cancelText：取消按钮文案为 cancelText；点击走 resolveConfirm(false) → onCancel', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    useUi.getState().askConfirm({
      title: 't',
      text: 'x',
      confirmText: '确定',
      cancelText: '稍后',
      onConfirm,
      onCancel
    })
    render(<ConfirmModal />)
    // 无 discard 时按钮顺序为 [取消, 确认]
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    const cancelBtn = screen.getByText('稍后')
    expect(cancelBtn).toBeInTheDocument()
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(useUi.getState().confirm).toBeNull()
  })

  it('无 discard：不渲染 discard 按钮', () => {
    useUi.getState().askConfirm({ title: 't', text: 'x', confirmText: '好', onConfirm: () => {} })
    render(<ConfirmModal />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons.map((b) => b.textContent)).not.toContain('不保存')
  })

  it('无 confirm 时不渲染内容', () => {
    const { container } = render(<ConfirmModal />)
    expect(container).toBeEmptyDOMElement()
  })
})
