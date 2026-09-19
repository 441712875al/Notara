import { useEffect, useRef } from 'react'
import { TabBar } from './components/TabBar'
import { ConfirmModal } from './components/ConfirmModal'
import { Editor } from './components/Editor'
import { useTabs } from './stores/tabs'
import { useUi } from './stores/ui'
import { useWorkspace } from './stores/workspace'
import { api } from './lib/api'
import { saveScheduler } from './lib/saveScheduler'
import { editors } from './lib/editorRegistry'
import { handleMenuAction, saveTabAs } from './lib/menuActions'
import { openPath } from './lib/openFile'
import type { MainEvent } from '@shared/types'
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

  // 订阅主进程事件（菜单动作 + 后续任务的外部变更等）
  useEffect(() => {
    const off = api.onEvent((event: MainEvent) => {
      if (event.type === 'menu:action') void handleMenuAction(event.action)
    })
    return off
  }, [])

  // 启动参数自动打开（--open / NOTARA_OPEN）
  useEffect(() => {
    void (async () => {
      const p = await api.getLaunchOpen()
      if (!p) return
      const stat = await api.readFile(p).then(
        () => 'file' as const,
        () => 'folder' as const
      )
      if (stat === 'file') await openPath(p)
      else await useWorkspace.getState().open(p)
    })()
  }, [])

  // 输入 → 脏标记 + 防抖保存
  const handleInput = (tabId: number): void => {
    const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
    if (tab && !tab.dirty) useTabs.getState().setDirty(tabId, true)
    saveScheduler.schedule(tabId)
  }

  // 关闭标签：脏则确认（保存→flush 后关 / 不保存→cancel 后关 / 取消→不关）
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
          if (tab.path !== null && !tab.deleted) {
            // 已命名标签：flush 成功才关；失败保留（saver 已 toast）
            try {
              await saveScheduler.flushOne(tab.id)
            } catch {
              return
            }
          } else {
            // 未命名/已删除标签：走另存为对话框，仅保存成功才关
            const r = await saveTabAs(tab)
            if (r !== 'saved') return
          }
          // 异步窗口期间标签列表可能已变，按 tab.id 重新定位再关
          const cur = useTabs.getState().tabs.findIndex((t) => t.id === tab.id)
          if (cur >= 0) useTabs.getState().close(cur)
        })()
      },
      discard: {
        text: s.confirm.discard,
        onDiscard: () => {
          saveScheduler.cancel(tab.id)
          useTabs.getState().close(index)
        }
      }
      // 不传 onCancel → 「取消」= 不关标签，什么都不做
    })
  }

  // 菜单 close-tab 经自定义事件转发到最新 handleClose（effect 依赖留空，靠 ref 取最新闭包）
  const closeRef = useRef(handleClose)
  closeRef.current = handleClose
  useEffect(() => {
    const h = (e: Event): void => {
      const idx = (e as CustomEvent<number>).detail
      closeRef.current(idx)
    }
    window.addEventListener('notara:close-tab', h)
    return () => window.removeEventListener('notara:close-tab', h)
  }, [])

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
