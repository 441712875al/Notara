import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { TabBar } from './components/TabBar'
import { ConfirmModal } from './components/ConfirmModal'
import { ConflictModal } from './components/ConflictModal'
import { Editor } from './components/Editor'
import { Sidebar } from './components/Sidebar'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { NamePromptModal } from './components/NamePromptModal'
import { Welcome } from './components/Welcome'
import { useTabs } from './stores/tabs'
import { useUi } from './stores/ui'
import { useWorkspace } from './stores/workspace'
import { useThemeStore } from './stores/theme'
import { api } from './lib/api'
import { saveScheduler } from './lib/saveScheduler'
import { editors } from './lib/editorRegistry'
import { handleMenuAction, saveTabAs } from './lib/menuActions'
import { openPath } from './lib/openFile'
import { parseIpcError } from './lib/ipcError'
import { handleExternalChange, handleExternalDelete } from './lib/externalChanges'
import { resolveCreateEntry } from './lib/treeActions'
import type { MainEvent, RecentWorkspace, TreeNode } from '@shared/types'
import { s } from './strings'

/** 持久化窗口状态（工作区 + 已命名标签路径 + 激活项）：定时保存与退出/关闭握手共用 */
function persistWindowState(): void {
  const ws = useWorkspace.getState()
  const tabs = useTabs.getState()
  // close 路径 persist 后立即 allowClose 销毁窗口，invoke 的 reject 属预期，吞掉防 unhandled rejection
  void api.saveWindowState({
    workspaceRoot: ws.root,
    // 已删除标签的文件已进废纸篓（deleted 标记），不该在下次启动时恢复
    tabPaths: tabs.tabs
      .filter((t) => !t.deleted)
      .map((t) => t.path)
      .filter((p): p is string => p !== null),
    activeIndex: tabs.activeIndex
  }).catch(() => {})
}

/**
 * 退出/关闭共用的未保存确认流程（调用方已完成一次 flushAll 且判定存在脏标签）。
 * - finish：用户选择「保存」且全部落盘成功、或显式选择「不保存」后执行
 *   （quit 路径 = 持久化 + flushDone；close 路径 = 持久化 + allowClose）
 * - abort：保存失败 / 用户取消导致中止时执行
 *   （quit 路径 = 撤销退出；close 路径 = 保持窗口打开，不发任何 IPC）
 * 「不保存」为显式选择，直接 finish（允许丢失）；「取消」走 abort。
 */
function confirmDirtyExit(finish: () => void, abort: () => void): void {
  const dirty = useTabs.getState().tabs.filter((t) => t.dirty)
  useUi.getState().askConfirm({
    title: s.confirm.closeDirtyTitle,
    text: s.confirm.closeManyText(dirty.length),
    confirmText: s.confirm.save,
    discard: { text: s.confirm.discard, onDiscard: finish },
    onConfirm: () => {
      void (async () => {
        // 弹窗模态不拦截原生菜单加速键（⌘N），期间可能新增未命名脏标签——点击时实时取
        const cur = useTabs.getState().tabs.filter((t) => t.dirty)
        // 未命名/已删除标签（无落盘路径）逐个另存为；任一取消或失败即中止
        // （失败 toast 已由 saveTabAs 自身发出，此处不重复提示）
        for (const t of cur.filter((t) => t.path === null || t.deleted)) {
          const r = await saveTabAs(t)
          if (r !== 'saved') return abort()
        }
        await saveScheduler.flushAll() // 已命名脏标签落盘（单个失败不阻断其余）
        // 写盘复查：成功路径下 saveTabAs 已清脏、flush 已清脏；任何仍脏 = 落盘失败，不得放行
        if (useTabs.getState().tabs.some((t) => t.dirty)) return abort()
        finish()
      })()
    },
    // 「取消」按钮走 abort（quit 路径撤销退出；close 路径不发 IPC 保持窗口打开）
    onCancel: abort
  })
}

export function App() {
  const tabs = useTabs((st) => st.tabs)
  const activeIndex = useTabs((st) => st.activeIndex)
  const setActive = useTabs((st) => st.setActive)
  const notify = useUi((st) => st.notify)
  const sidebarVisible = useUi((st) => st.sidebarVisible)
  const outlineVisible = useUi((st) => st.outlineVisible)
  const confirm = useUi((st) => st.confirm)
  const toasts = useUi((st) => st.toasts)
  const root = useWorkspace((st) => st.root)

  // 最近工作区：启动加载；每次成功打开工作区后重查（主进程在该 IPC 里 touchRecent）
  const [recents, setRecents] = useState<RecentWorkspace[]>([])
  const refreshRecents = (): void => void api.listRecent().then(setRecents)

  useEffect(() => {
    refreshRecents()
  }, [])

  // 欢迎页「打开文件夹」与菜单 File>Open 共用：对话框选中文件夹后重查最近列表
  const openFolder = async (): Promise<void> => {
    await handleMenuAction('open')
    refreshRecents()
  }

  // 欢迎页点击最近项：open 已自带失败 toast 与回滚，成功后重查以刷新排序
  const openRecent = async (r: string): Promise<void> => {
    await useWorkspace.getState().open(r)
    refreshRecents()
  }

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

  // 窗口状态定时保存（1s；读取 store 实时状态，写一份小 JSON）
  useEffect(() => {
    const t = setInterval(persistWindowState, 1000)
    return () => clearInterval(t)
  }, [])

  // 退出/关闭握手（主进程广播 → 渲染侧落盘/确认 → ack/allowClose）
  useEffect(() => {
    const off = api.onEvent((event: MainEvent) => {
      if (event.type === 'app:flush-before-quit') {
        // ⌘Q：立即撤销主进程 3s 强退兜底、改挂 60s 等待用户；慢盘上 flushAll 超 3s 会被中途强退，
        // 故必须先武装计时再落盘。随后静默落盘已命名标签，仍有脏标签则弹确认
        void (async () => {
          // 忽略失败：主进程超时兜底仍会退出
          await api.quitPending().catch(() => {})
          await saveScheduler.flushAll()
          const dirty = useTabs.getState().tabs.filter((t) => t.dirty)
          if (dirty.length === 0) {
            persistWindowState()
            void api.flushDone().catch(() => {})
            return
          }
          confirmDirtyExit(
            () => {
              persistWindowState()
              void api.flushDone().catch(() => {})
            },
            () => {
              // 中止退出：应用继续运行
              void api.quitCancel().catch(() => {})
            }
          )
        })()
        return
      }
      if (event.type === 'app:close-requested') {
        void (async () => {
          await saveScheduler.flushAll()
          const dirty = useTabs.getState().tabs.filter((t) => t.dirty)
          if (dirty.length === 0) {
            persistWindowState()
            void api.allowClose().catch(() => {})
            return
          }
          confirmDirtyExit(
            () => {
              persistWindowState()
              void api.allowClose().catch(() => {})
            },
            () => {
              // 中止关闭：close 已被 preventDefault，窗口保持打开，不发任何 IPC
            }
          )
        })()
        return
      }
    })
    return off
  }, [])

  // 标签快捷键：⌘⇧[ / ⌘⇧] 循环切换，⌘1..9 直达第 N 个
  // 注：macOS US 布局下 Shift+[ 的 e.key 是 '{'（非 '['），故同时比对 e.code（布局/修饰键无关）
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const st = useTabs.getState()
      const prev = e.code === 'BracketLeft' || e.key === '[' || e.key === '{'
      const next = e.code === 'BracketRight' || e.key === ']' || e.key === '}'
      if (e.metaKey && e.shiftKey && (prev || next)) {
        if (st.tabs.length === 0) return
        e.preventDefault()
        const n = st.tabs.length
        const i = next ? (st.activeIndex + 1) % n : (st.activeIndex - 1 + n) % n
        st.setActive(i)
        return
      }
      if (e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
        const digit = m ? m[1] : /^[1-9]$/.test(e.key) ? e.key : null
        if (!digit) return
        const i = Number(digit) - 1
        if (i >= st.tabs.length) return
        e.preventDefault()
        st.setActive(i)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // 订阅主进程事件（菜单动作 + 工作区树变更 + 重命名同步）
  useEffect(() => {
    const off = api.onEvent((event: MainEvent) => {
      if (event.type === 'menu:action') {
        // File>Open 选中文件夹会打开工作区并 touchRecent：走 openFolder 以便成功后重查
        if (event.action === 'open') void openFolder()
        else void handleMenuAction(event.action)
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
      } else if (event.type === 'theme:system-changed') {
        // 系统外观变化：仅「跟随系统」生效；本地推导避免一次 IPC 往返（无自定义 CSS）
        if (useThemeStore.getState().setting === 'system') {
          useThemeStore.getState().apply({
            setting: 'system',
            effective: event.dark ? 'dark' : 'light',
            customCss: null,
            customThemes: []
          })
        }
      }
    })
    return off
  }, [])

  // 主题：启动时从主进程读取设置并落到 DOM
  useEffect(() => {
    void useThemeStore.getState().init()
  }, [])

  // 启动恢复：命令行参数（--open / NOTARA_OPEN）优先；无参数则恢复上次窗口状态（工作区 + 标签 + 激活项）。
  // getLaunchOpen 为一次性消费（主进程读后即清），因此两条流程必须在此同一 effect 内串行判断，
  // 拆成两个 effect 会因消费顺序导致命令行打开被吞掉。
  // restoredRef 防重入：dev StrictMode 下 effect 双跑，第二次会因 launchOpen 已被消费而误走恢复分支、重复开标签。
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    void (async () => {
      const launch = await api.getLaunchOpen()
      if (launch) {
        const stat = await api.readFile(launch).then(
          () => 'file' as const,
          () => 'folder' as const
        )
        if (stat === 'file') await openPath(launch)
        else {
          await useWorkspace.getState().open(launch)
          refreshRecents()
        }
        return
      }
      const st = await api.getWindowState()
      if (!st?.payload.workspaceRoot) return
      await useWorkspace.getState().open(st.payload.workspaceRoot)
      // 打开失败（已 toast 并回滚 root）：不再恢复标签，避免留下无工作区的游离标签
      if (useWorkspace.getState().root === null) return
      refreshRecents() // 恢复工作区同样是一次「打开」，重查最近列表以刷新排序
      // 静默恢复：上次会话中已删除的文件逐个弹「打开失败」会打扰用户，失败仅跳过该标签
      for (const tp of st.payload.tabPaths) await openPath(tp, { silent: true })
      const n = useTabs.getState().tabs.length
      if (st.payload.activeIndex >= 0 && n > 0) {
        useTabs.getState().setActive(Math.min(st.payload.activeIndex, n - 1))
      }
    })()
  }, [])

  // 大纲显隐联动：写入 <html> dataset，由 global.css 控制 vditor 大纲面板的显隐
  useEffect(() => {
    if (outlineVisible) delete document.documentElement.dataset.outlineHidden
    else document.documentElement.dataset.outlineHidden = 'true'
  }, [outlineVisible])

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
          // 弹窗存续期间列表可能已变，按 tab.id 重新定位再关（与 onConfirm 对称）
          const cur = useTabs.getState().tabs.findIndex((t) => t.id === tab.id)
          if (cur >= 0) useTabs.getState().close(cur)
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
      notify(parseIpcError(e).message)
    }
  }

  // 重命名：主进程落盘后广播 file:renamed，标签同步在上面的事件订阅里处理
  const renameNode = async (node: TreeNode, name: string): Promise<void> => {
    if (name === node.name) return
    try {
      const dir = node.path.slice(0, node.path.lastIndexOf('/'))
      await api.renameEntry(node.path, `${dir}/${name}`)
    } catch (e) {
      notify(parseIpcError(e).message)
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
        void api.deleteEntry(node.path).catch((e) => notify(parseIpcError(e).message))
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
      ) : (
        <Welcome
          recents={recents}
          onOpenFolder={() => void openFolder()}
          onNewFile={() => void handleMenuAction('new-file')}
          onOpenRecent={(r) => void openRecent(r)}
        />
      )}
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
      {/* 提示栈：ui store 的 notify() 唯一渲染出口（4s 自动消失，点击可提前关闭） */}
      {toasts.length > 0 ? (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="toast"
              role="status"
              onClick={() => useUi.getState().dismissToast(t.id)}
            >
              {t.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
