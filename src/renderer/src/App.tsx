import { useEffect } from 'react'
import { TabBar } from './components/TabBar'
import { ConfirmModal } from './components/ConfirmModal'
import { Editor } from './components/Editor'
import { useTabs } from './stores/tabs'
import { useUi } from './stores/ui'
import { api } from './lib/api'
import { saveScheduler } from './lib/saveScheduler'
import { editors } from './lib/editorRegistry'
import { s } from './strings'

export function App() {
  const tabs = useTabs((st) => st.tabs)
  const activeIndex = useTabs((st) => st.activeIndex)
  const setActive = useTabs((st) => st.setActive)
  const notify = useUi((st) => st.notify)

  // 保存管线：防抖/flush → 读 vditor 内容 → 写盘 → 清脏标记
  useEffect(() => {
    saveScheduler.setSaver(async (tabId) => {
      const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
      const vd = editors.get(tabId)
      if (!tab || !vd) return
      if (tab.path === null || tab.deleted) return // 未命名/已删除标签等待 ⌘S 另存为
      try {
        await api.writeFile(tab.path, vd.getValue())
        useTabs.getState().setDirty(tabId, false)
      } catch {
        notify(s.toast.saveFailed)
        throw new Error('save-failed')
      }
    })
  }, [notify])

  // 窗口失焦 flush
  useEffect(() => {
    const onBlur = (): void => {
      void saveScheduler.flushAll()
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  // 输入 → 脏标记 + 防抖保存
  const handleInput = (tabId: number): void => {
    const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
    if (tab && !tab.dirty) useTabs.getState().setDirty(tabId, true)
    saveScheduler.schedule(tabId)
  }

  // 关闭标签：脏则确认（保存→flush 后关 / 不保存→cancel 后关）
  const handleClose = (index: number): void => {
    const tab = tabs[index]
    if (!tab) return
    if (!tab.dirty) {
      useTabs.getState().close(index)
      return
    }
    useUi.getState().askConfirm({
      title: s.confirm.closeDirtyTitle,
      text: s.confirm.closeDirtyText(tab.title),
      confirmText: s.confirm.save,
      onConfirm: () => {
        void (async () => {
          await saveScheduler.flushOne(tab.id).catch(() => undefined)
          useTabs.getState().close(index)
        })()
      },
      onCancel: () => {
        saveScheduler.cancel(tab.id)
        useTabs.getState().close(index)
      }
    })
  }

  return (
    <div className="app">
      {tabs.length > 0 ? (
        <>
          <TabBar
            tabs={tabs}
            activeIndex={activeIndex}
            onSelect={setActive}
            onClose={handleClose}
            onNew={() => useTabs.getState().openUntitled()}
          />
          <div className="editors">
            {tabs.map((t, i) => (
              <Editor key={t.id} tabId={t.id} initial={t.initialContent} active={i === activeIndex} onInput={handleInput} />
            ))}
          </div>
        </>
      ) : null}
      <ConfirmModal />
    </div>
  )
}
