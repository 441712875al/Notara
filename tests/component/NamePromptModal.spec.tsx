import { act, render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NamePromptModal } from '../../src/renderer/src/components/NamePromptModal'
import { useUi } from '../../src/renderer/src/stores/ui'

describe('NamePromptModal', () => {
  beforeEach(() => {
    useUi.setState({ namePrompt: null })
  })

  it('打开时以 initial 预填；提交调用 onSubmit 并关闭', () => {
    const onSubmit = vi.fn()
    useUi.getState().openNamePrompt({ title: '新名称', initial: 'a.md', placeholder: 'x', onSubmit })
    render(<NamePromptModal />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('a.md')
    fireEvent.change(input, { target: { value: 'b.md' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onSubmit).toHaveBeenCalledWith('b.md')
    expect(useUi.getState().namePrompt).toBeNull()
  })

  it('再次打开重置为新的 initial，不残留上次输入（回归）', () => {
    useUi.getState().openNamePrompt({ title: '新建', initial: '', placeholder: 'p', onSubmit: vi.fn() })
    render(<NamePromptModal />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '残留内容' } })
    expect(input.value).toBe('残留内容')

    // 关闭后重新打开：组件常驻，value 必须重置为新 initial
    act(() => {
      useUi.getState().closeNamePrompt()
    })
    act(() => {
      useUi
        .getState()
        .openNamePrompt({ title: '重命名', initial: 'fresh.md', placeholder: 'p', onSubmit: vi.fn() })
    })
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('fresh.md')
  })

  it('空白名称：保存禁用且 Enter 不提交', () => {
    const onSubmit = vi.fn()
    useUi.getState().openNamePrompt({ title: 't', initial: '', placeholder: 'p', onSubmit })
    render(<NamePromptModal />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(screen.getByText('保存')).toBeDisabled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(useUi.getState().namePrompt).not.toBeNull()
  })

  it('无 namePrompt 时不渲染', () => {
    const { container } = render(<NamePromptModal />)
    expect(container).toBeEmptyDOMElement()
  })
})
