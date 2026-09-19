import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConflictModal } from '../../src/renderer/src/components/ConflictModal'

describe('ConflictModal', () => {
  it('展示文件路径与两个动作', () => {
    const keep = vi.fn()
    const disk = vi.fn()
    render(<ConflictModal path="/w/a.md" onKeepMine={keep} onUseDisk={disk} />)
    expect(screen.getByText('/w/a.md')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('conflict-keep'))
    expect(keep).toHaveBeenCalled()
  })

  it('点击「使用磁盘版本」触发 onUseDisk', () => {
    const onUseDisk = vi.fn()
    render(<ConflictModal path="/w/a.md" onKeepMine={vi.fn()} onUseDisk={onUseDisk} />)
    fireEvent.click(screen.getByTestId('conflict-disk'))
    expect(onUseDisk).toHaveBeenCalledTimes(1)
  })
})
