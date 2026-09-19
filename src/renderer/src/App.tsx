import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { TabBar } from './components/TabBar'
import { ConfirmModal } from './components/ConfirmModal'
import { ConflictModal } from './components/ConflictModal'
import { Editor } from './components/Editor'
import { Sidebar } from './components/Sidebar'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { NamePromptModal } from './components/NamePromptModal'
import { useTabs } from './stores/tabs'
import { useUi } from './stores/ui'
import { useWorkspace } from './stores/workspace'
import { api } from './lib/api'
import { saveScheduler } from './lib/saveScheduler'
import { editors } from './lib/editorRegistry'
import { handleMenuAction, saveTabAs } from './lib/menuActions'
import { openPath } from './lib/openFile'
import { handleExternalChange, handleExternalDelete } from './lib/externalChanges'
import { resolveCreateEntry } from './lib/treeActions'
import type { MainEvent, TreeNode } from '@shared/types'
import { s } from './strings'

export function App() {
  const tabs = useTabs((st) => st.tabs)
  const activeIndex = useTabs((st) => st.activeIndex)
  const setActive = useTabs((st) => st.setActive)
  const notify = useUi((st) => st.notify)
  const sidebarVisible = useUi((st) => st.sidebarVisible)
  const confirm = useUi((st) => st.confirm)
  const root = useWorkspace((st) => st.root)

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

  // 订阅主进程事件（菜单动作 + 工作区树变更 + 重命名同步）
  useEffect(() => {
    const off = api.onEvent((event: MainEvent) => {
      if (event.type === 'menu:action') {
        void handleMenuAction(event.action)
      } else if (event.type === 'workspace:tree-changed') {
        // 外部/树内增删改：刷新已加载目录的缓存
        const ws = useWorkspace.getState()
        if (event.root === ws.root) {
          // 静默刷新：目录被外部删除时 listChildren 抛 NotFound，watcher 稍后会再发 tree-changed
          for (const dir of [...ws.children.keys()]) void ws.refresh(dir).catch(() => undefined)
        }
      } else if (event.type === 'file:renamed') {
        // 主进程在 renameEntry 后广播；同步已打开标签的路径与标题
        useTabs.getState().renamePath(event.oldPath, event.newPath)
      } else if (event.type === 'file:external-change') {
        // 外部修改：净标签静默重载，脏标签弹冲突确认
        void handleExternalChange(event.path)
      } else if (event.type === 'file:external-delete') {
        // 外部删除：标记标签删除并提示
        handleExternalDelete(event.path)
      }
      // theme 等由后续任务接入
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

  // 文件树右键菜单（坐标 + 目标节点）
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null)
  const openTreeContextMenu = (e: MouseEvent, node: TreeNode): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, node })
  }

  // 打开名称输入弹窗（新建/重命名共用）
  const askName = (title: string, initial: string, onSubmit: (name: string) => void): void => {
    useUi.getState().openNamePrompt({ title, initial, placeholder: title, onSubmit })
  }

  // 在目录内新建：按菜单意图决定类型（file 自动补 .md；directory 原样）
  const createInDir = async (
    dir: string,
    name: string,
    kind: 'file' | 'directory'
  ): Promise<void> => {
    try {
      const resolved = resolveCreateEntry(name, kind)
      const { path } = await api.createEntry(dir, resolved.name, resolved.kind)
      if (resolved.kind === 'file') await openPath(path)
    } catch (e) {
      notify((e as Error).message)
    }
  }

  // 重命名：主进程落盘后广播 file:renamed，标签同步在上面的事件订阅里处理
  const renameNode = async (node: TreeNode, name: string): Promise<void> => {
    if (name === node.name) return
    try {
      const dir = node.path.slice(0, node.path.lastIndexOf('/'))
      await api.renameEntry(node.path, `${dir}/${name}`)
    } catch (e) {
      notify((e as Error).message)
    }
  }

  // 删除：二次确认后移入废纸篓
  const askDelete = (node: TreeNode): void => {
    useUi.getState().askConfirm({
      title: s.confirm.deleteTitle,
      text: s.confirm.deleteText(node.name),
      confirmText: s.confirm.deleteTitle,
      danger: true,
      onConfirm: () => {
        void api.deleteEntry(node.path).catch((e) => notify((e as Error).message))
      }
    })
  }

  const treeMenuItems = (node: TreeNode): ContextMenuItem[] =>
    node.isDir
      ? [
          {
            label: s.tree.newFile,
            onClick: () =>
              askName(s.tree.namePrompt.file, '', (name) =>
                void createInDir(node.path, name, 'file')
              )
          },
          {
            label: s.tree.newFolder,
            onClick: () =>
              askName(s.tree.namePrompt.folder, '', (name) =>
                void createInDir(node.path, name, 'directory')
              )
          }
        ]
      : [
          {
            label: s.tree.rename,
            onClick: () =>
              askName(s.tree.namePrompt.rename, node.name, (name) => void renameNode(node, name))
          },
          { label: s.tree.del, danger: true, onClick: () => askDelete(node) }
        ]

  return (
    <div className="app">
      {tabs.length > 0 ? (
        <TabBar
          tabs={tabs}
          activeIndex={activeIndex}
          onSelect={setActive}
          onClose={handleClose}
          onNew={() => useTabs.getState().openUntitled()}
        />
      ) : null}
      <div className="main-area">
        {sidebarVisible && root !== null ? (
          <Sidebar onOpenFile={(p) => void openPath(p)} onContext={openTreeContextMenu} />
        ) : null}
        <div className="editors">
          {tabs.map((t, i) => (
            <Editor
              key={t.id}
              tabId={t.id}
              initial={t.initialContent}
              active={i === activeIndex}
              onInput={handleInput}
            />
          ))}
        </div>
      </div>
      <ConfirmModal />
      {confirm?.title === s.confirm.useDiskTitle ? (
        <ConflictModal
          path={confirm.text}
          onKeepMine={() => useUi.getState().resolveConfirm(true)}
          onUseDisk={() => useUi.getState().resolveConfirm(false)}
        />
      ) : null}
      <NamePromptModal />
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={treeMenuItems(menu.node)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}
