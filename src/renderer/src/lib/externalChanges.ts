import { api } from './api'
import { saveScheduler } from './saveScheduler'
import { editors } from './editorRegistry'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'
import { s } from '../strings'

/** 文件被外部修改：净→静默重载；脏→冲突确认。自写事件兜底：pending 中忽略。 */
export async function handleExternalChange(path: string): Promise<void> {
  const tab = useTabs.getState().tabs.find((t) => t.path === path)
  if (!tab) return
  if (saveScheduler.isPending(tab.id)) return // 本应用自动保存引发的事件，忽略

  if (!tab.dirty) {
    // 净标签：直接静默重载磁盘内容
    try {
      const { content } = await api.readFile(path)
      // await 挂起期间用户可能已开始输入（置脏并调度保存）、标签被关闭或标记删除：
      // 此时若强行 setValue 会静默丢弃用户刚输入的字符。放弃本次重载，交由后续变更事件或保存对齐。
      const cur = useTabs.getState().tabs.find((t) => t.id === tab.id)
      if (!cur || cur.deleted || cur.dirty || saveScheduler.isPending(cur.id)) return
      editors.get(tab.id)?.setValue(content)
    } catch {
      /* 文件刚被删：随后会收到 external-delete */
    }
    return
  }

  // 脏标签：本地有未保存修改，弹冲突确认由用户裁决
  useUi.getState().askConfirm({
    title: s.confirm.useDiskTitle,
    text: path,
    confirmText: s.confirm.keepMine,
    onConfirm: () => {
      // 保留我的版本：立即写盘覆盖磁盘内容
      void (async () => {
        const vd = editors.get(tab.id)
        if (!vd) return
        try {
          await api.writeFile(path, vd.getValue())
          useTabs.getState().setDirty(tab.id, false)
        } catch {
          useUi.getState().notify(s.toast.saveFailed)
        }
      })()
    },
    onCancel: () => {
      // 加载磁盘版本会丢弃本地修改，先二次确认
      useUi.getState().askConfirm({
        title: s.confirm.discardLocalTitle,
        text: s.confirm.discardLocalText(tab.title),
        confirmText: s.confirm.discard,
        danger: true,
        onConfirm: () => {
          void (async () => {
            try {
              const { content } = await api.readFile(path)
              editors.get(tab.id)?.setValue(content)
              useTabs.getState().setDirty(tab.id, false)
            } catch {
              /* 忽略：文件可能已删除 */
            }
          })()
        }
        // 不传 onCancel → 「取消」= 保留本地修改，什么都不做
      })
    }
  })
}

/** 文件被外部删除：标记标签为已删除并提示，⌘S 时将走另存为。 */
export function handleExternalDelete(path: string): void {
  // 仅对已打开的标签处理：未打开的文件被删不应弹提示（markDeleted 也会是 no-op）
  const tab = useTabs.getState().tabs.find((t) => t.path === path)
  if (!tab) return
  useTabs.getState().markDeleted(path)
  useUi.getState().notify(s.toast.deletedFile)
}
