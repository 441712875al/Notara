import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from '../../src/renderer/src/components/TabBar'
import type { TabMeta } from '../../src/renderer/src/stores/tabs'

const tabs: TabMeta[] = [
  { id: 1, path: '/w/a.md', title: 'a', dirty: false, deleted: false, initialContent: '' },
  { id: 2, path: '/w/b.md', title: 'b', dirty: true, deleted: false, initialContent: '' },
  { id: 3, path: null, title: '未命名', dirty: true, deleted: true, initialContent: '' }
]

describe('TabBar', () => {
  it('渲染标签、脏圆点、已删除样式', () => {
    render(<TabBar tabs={tabs} activeIndex={0} onSelect={() => {}} onClose={() => {}} onNew={() => {}} />)
    expect(screen.getByTestId('tab-0')).toHaveTextContent('a')
    expect(screen.getByTestId('tab-1')).toHaveTextContent('b')
    expect(screen.getByTestId('tab-1').querySelector('.dirty-dot')).toBeInTheDocument()
    expect(screen.getByTestId('tab-2')).toHaveClass('deleted')
  })

  it('点击切换、点击 X 关闭、中键关闭、+ 新建', () => {
    const onSelect = vi.fn(); const onClose = vi.fn(); const onNew = vi.fn()
    render(<TabBar tabs={tabs} activeIndex={0} onSelect={onSelect} onClose={onClose} onNew={onNew} />)
    fireEvent.click(screen.getByTestId('tab-1'))
    expect(onSelect).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByTestId('tab-1-close'))
    expect(onClose).toHaveBeenCalledWith(1)
    fireEvent.mouseUp(screen.getByTestId('tab-2'), { button: 1 })
    expect(onClose).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByTestId('tab-new'))
    expect(onNew).toHaveBeenCalledTimes(1)
  })
})
