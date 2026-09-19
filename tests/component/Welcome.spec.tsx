import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Welcome } from '../../src/renderer/src/components/Welcome'

const recents = [
  { root: '/Users/logan/notes', lastOpenedAt: 1 },
  { root: '/tmp/工作区', lastOpenedAt: 2 }
]

describe('Welcome', () => {
  it('列出最近工作区（名称+路径）并触发打开', () => {
    const onOpenRecent = vi.fn()
    const onOpenFolder = vi.fn()
    const onNewFile = vi.fn()
    render(
      <Welcome
        recents={recents}
        onOpenFolder={onOpenFolder}
        onNewFile={onNewFile}
        onOpenRecent={onOpenRecent}
      />
    )
    expect(screen.getByTestId('recent-notes')).toHaveTextContent('notes')
    expect(screen.getByTestId('recent-notes')).toHaveTextContent('/Users/logan/notes')
    fireEvent.click(screen.getByTestId('recent-工作区'))
    expect(onOpenRecent).toHaveBeenCalledWith('/tmp/工作区')
    fireEvent.click(screen.getByTestId('welcome-open-folder'))
    expect(onOpenFolder).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('welcome-new-file'))
    expect(onNewFile).toHaveBeenCalled()
  })

  it('无最近时显示空态', () => {
    render(
      <Welcome recents={[]} onOpenFolder={() => {}} onNewFile={() => {}} onOpenRecent={() => {}} />
    )
    expect(screen.getByText('还没有最近的工作区')).toBeInTheDocument()
  })

  it('root 含空格时 testid 原样拼入并回传原路径', () => {
    const onOpenRecent = vi.fn()
    render(
      <Welcome
        recents={[{ root: '/tmp/my notes', lastOpenedAt: 3 }]}
        onOpenFolder={() => {}}
        onNewFile={() => {}}
        onOpenRecent={onOpenRecent}
      />
    )
    const item = screen.getByTestId('recent-my notes')
    expect(item).toBeInTheDocument()
    fireEvent.click(item)
    expect(onOpenRecent).toHaveBeenCalledWith('/tmp/my notes')
  })
})
